// The confirmation gate of the single MCP entry (mcp.js). A command the policy marks
// `confirmation_required` is held until the person at this device says yes, whoever asked:
// the assistant, a voice request, an alarm or another surface. The actor never confirms
// itself; only a decision given through the `ui` transport counts (architecture §6.1).
//
// UI-agnostic contract (the request panel comes in a later lot):
//   event  `mcp.confirmation.requested` (pushMcpEvent: squirrel:mcp, squirrel:mcp:ui) with
//          { confirmation_id, method, subject, actor_id, source_type, expires_at }
//   decideMcpConfirmation(id, approved, transport)  the person's yes / no (transport.source.type 'ui')
//   awaitMcpConfirmation(id, { signal })            resolves 'approved' | 'refused' | 'expired' | 'withdrawn'
//   event  `mcp.confirmation.decided` { confirmation_id, status } when it is answered or withdrawn
//   then the asker re-sends the same request with { confirmed: true, confirmation_id }.
// A request is waited on 5 minutes at most (user decision, phase C list B, MD).
import { cloneValue, MCP_ERROR, mcpError, nowIso, pushMcpEvent, trimHistory } from './mcp_core.js';
import { sanitizeConfirmationParams } from './mcp_security_policy.js';
import { confirmProposal, createProposalRecord, pushSecurityJournal } from './mcp_security.js';
import { stableStringify } from '../ai/agent_gateway_normalize.js';

export const MCP_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const MCP_CONFIRMATION_LIMIT = 200;

let confirmationSeq = 0;
const confirmations = new Map();
const waiters = new Map();

const isExpired = record => Date.parse(record.expires_at) <= Date.now();
const settleWaiters = (record) => {
    (waiters.get(record.confirmation_id) || []).forEach(resolve => resolve(record.status));
    waiters.delete(record.confirmation_id);
};
const expire = (record) => {
    if (record.status !== 'pending' && record.status !== 'approved') return record;
    record.status = 'expired';
    settleWaiters(record);
    return record;
};
const current = (confirmationId) => {
    const record = confirmations.get(String(confirmationId || '').trim()) || null;
    if (record && isExpired(record)) expire(record);
    return record;
};

function createConfirmationRecord(method, params, policy, actor) {
    const proposal = policy.proposal_required === true ? createProposalRecord(method, params, policy, actor) : null;
    const created = Date.now();
    const record = {
        confirmation_id: `mcp_confirm_${++confirmationSeq}`,
        method: String(method || ''),
        scope: String(policy.scope || 'tool'),
        subject: String(policy.subject || method || ''),
        status: 'pending',
        created_at: new Date(created).toISOString(),
        expires_at: new Date(created + MCP_CONFIRMATION_TTL_MS).toISOString(),
        decided_at: null,
        consumed_at: null,
        actor: { actor_id: actor.actor_id, role: actor.role, source: actor.source },
        proposal_id: proposal?.proposal_id || null,
        required_capabilities: [...(policy.required_capabilities || [])],
        params: sanitizeConfirmationParams(params)
    };
    confirmations.set(record.confirmation_id, record);
    trimHistory(confirmations, MCP_CONFIRMATION_LIMIT);
    pushMcpEvent('mcp.confirmation.requested', {
        confirmation_id: record.confirmation_id, method: record.method, subject: record.subject,
        actor_id: record.actor.actor_id, source_type: record.actor.source, expires_at: record.expires_at
    });
    pushSecurityJournal('confirmation_created', { confirmation_id: record.confirmation_id, proposal_id: record.proposal_id,
        method: record.method, subject: record.subject, actor_id: record.actor.actor_id });
    return record;
}

const refusal = (error, confirmationId, extra = {}) => ({ ok: false, gate: { ok: false, error, confirmation_id: confirmationId, ...extra } });

/** The gate run by the entry before the handler. `{ ok: true, consumed }` lets the request through. */
export function validateConfirmation(method, params = {}, policy = {}, actor = {}) {
    if (policy.confirmation_required !== true) return { ok: true, consumed: false };
    const confirmationId = String(params?.confirmation_id || '').trim();
    if (params?.confirmed !== true || !confirmationId) {
        const record = createConfirmationRecord(method, params, policy, actor);
        return { ok: false, gate: { ok: false, status: 'pending', confirmation_required: true,
            confirmation_id: record.confirmation_id, proposal_id: record.proposal_id, scope: record.scope,
            subject: record.subject, expires_at: record.expires_at } };
    }
    const record = current(confirmationId);
    if (!record) return refusal('mcp_confirmation_not_found', confirmationId);
    if (record.method !== String(method || '')) return refusal('mcp_confirmation_method_mismatch', confirmationId);
    if (record.actor.actor_id !== actor.actor_id
        || stableStringify(record.params) !== stableStringify(sanitizeConfirmationParams(params))) {
        return refusal('mcp_confirmation_request_mismatch', confirmationId);
    }
    // The person acting in the app confirms by re-sending; every other actor needs the person's decision.
    const decided = record.status === 'approved' || (record.status === 'pending' && actor.source === 'ui');
    if (!decided) return refusal(`mcp_confirmation_${record.status === 'pending' ? 'awaiting_person' : record.status}`, confirmationId, { status: record.status });
    record.status = 'consumed';
    record.consumed_at = nowIso();
    if (record.proposal_id) confirmProposal(record.proposal_id);
    pushMcpEvent('mcp.confirmation.consumed', { confirmation_id: record.confirmation_id, method: record.method, subject: record.subject });
    pushSecurityJournal('confirmation_consumed', { confirmation_id: record.confirmation_id, proposal_id: record.proposal_id,
        method: record.method, subject: record.subject, actor_id: record.actor.actor_id });
    return { ok: true, consumed: true, confirmation_id: confirmationId };
}

/** The person's answer to a pending request. Only the `ui` transport decides. */
export function decideMcpConfirmation(confirmationId, approved, transport) {
    if (transport?.source?.type !== 'ui') throw mcpError(MCP_ERROR.ACCESS_DENIED, 'mcp_confirmation_decider_not_local');
    const record = current(confirmationId);
    if (!record) return { ok: false, error: 'mcp_confirmation_not_found' };
    if (record.status !== 'pending') return { ok: false, error: 'mcp_confirmation_not_pending', status: record.status };
    record.status = approved === true ? 'approved' : 'refused';
    record.decided_at = nowIso();
    pushMcpEvent('mcp.confirmation.decided', { confirmation_id: record.confirmation_id, status: record.status });
    pushSecurityJournal('confirmation_decided', { confirmation_id: record.confirmation_id, method: record.method,
        status: record.status, actor_id: record.actor.actor_id, layer: String(transport.source.layer || '') });
    settleWaiters(record);
    return { ok: true, status: record.status };
}

/** The asker takes back its own request (a cancelled call): it is no longer offered to the person. */
export function withdrawMcpConfirmation(confirmationId, actorId) {
    const record = current(confirmationId);
    if (!record || record.status !== 'pending' || record.actor.actor_id !== actorId) return false;
    record.status = 'withdrawn';
    pushMcpEvent('mcp.confirmation.decided', { confirmation_id: record.confirmation_id, status: record.status });
    settleWaiters(record);
    return true;
}

/** Waits for the person's decision; resolves 'approved', 'refused' or 'expired'. */
export function awaitMcpConfirmation(confirmationId, { signal = null } = {}) {
    const record = current(confirmationId);
    if (!record) return Promise.reject(mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_confirmation_not_found'));
    if (record.status !== 'pending') return Promise.resolve(record.status);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => expire(record), Math.max(0, Date.parse(record.expires_at) - Date.now()));
        const done = (status) => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); resolve(status); };
        const abort = () => {
            clearTimeout(timer);
            waiters.set(record.confirmation_id, (waiters.get(record.confirmation_id) || []).filter(entry => entry !== done));
            reject(mcpError(MCP_ERROR.INTERNAL, 'mcp_confirmation_wait_cancelled'));
        };
        signal?.addEventListener?.('abort', abort, { once: true });
        waiters.set(record.confirmation_id, [...(waiters.get(record.confirmation_id) || []), done]);
    });
}

export function listConfirmations(status = null) {
    return Array.from(confirmations.keys()).map(current)
        .filter(entry => !status || entry.status === status).slice(-50).map(entry => cloneValue(entry));
}

export function readConfirmation(confirmationId = '') {
    return current(confirmationId);
}
