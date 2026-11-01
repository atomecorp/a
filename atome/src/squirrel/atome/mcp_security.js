import {
    cloneValue,
    normalizeStringList,
    nowIso,
    pushMcpEvent,
    trimArrayHistory,
    trimHistory
} from './mcp_core.js';
import { renderPrompt } from './mcp_resources.js';
import { resolveRateLimitRule, sanitizeConfirmationParams } from './mcp_security_policy.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const MCP_SECURITY_JOURNAL_LIMIT = 200;
const MCP_IDEMPOTENCY_LIMIT = 200;
const MCP_PROPOSAL_LIMIT = 100;

let mcpSecurityJournalSeq = 0;
let mcpProposalSeq = 0;
const mcpSecurityJournal = [];
const mcpProposals = new Map();
const mcpIdempotencyCache = new Map();
const mcpRateLimitState = new Map();

export function hasActorCapability(actor = {}, required = []) {
    const needed = normalizeStringList(required);
    if (!needed.length) return true;
    const granted = normalizeStringList(actor.capabilities);
    if (granted.includes('*')) return true;
    return needed.every((entry) => granted.includes(entry));
}

export function hasSandboxProfile(actor = {}, requiredProfile = null) {
    const expected = String(requiredProfile || '').trim();
    if (!expected) return true;
    const profiles = normalizeStringList(actor.sandbox_profiles);
    return profiles.includes('*') || profiles.includes(expected);
}

export function pushSecurityJournal(type, payload = {}) {
    const entry = {
        seq: ++mcpSecurityJournalSeq,
        at: nowIso(),
        type: String(type || 'security.event'),
        payload: cloneValue(payload) || {}
    };
    mcpSecurityJournal.push(entry);
    trimArrayHistory(mcpSecurityJournal, MCP_SECURITY_JOURNAL_LIMIT);
    pushMcpEvent('mcp.security.journal', {
        type: entry.type,
        seq: entry.seq,
        payload: entry.payload
    });
    return entry;
}

export function createProposalRecord(method, params = {}, policy = {}, actor = {}) {
    const proposal_id = `mcp_proposal_${++mcpProposalSeq}`;
    const record = {
        proposal_id,
        method: String(method || ''),
        scope: String(policy.scope || 'tool'),
        subject: String(policy.subject || method || ''),
        status: 'pending',
        created_at: nowIso(),
        confirmed_at: null,
        actor: {
            actor_id: actor.actor_id || 'local_owner',
            role: actor.role || 'local_owner'
        },
        required_capabilities: normalizeStringList(policy.required_capabilities),
        sandbox_profile: String(policy.sandbox_profile || '').trim() || null,
        prompt: renderPrompt('confirm_sensitive_action', {
            action: String(policy.subject || method || 'cette action')
        }).prompt,
        params: sanitizeConfirmationParams(params)
    };
    mcpProposals.set(proposal_id, record);
    trimHistory(mcpProposals, MCP_PROPOSAL_LIMIT);
    pushMcpEvent('mcp.proposal.created', {
        proposal_id,
        method: record.method,
        subject: record.subject
    });
    pushSecurityJournal('proposal_created', {
        method: record.method,
        subject: record.subject,
        proposal_id,
        actor_id: record.actor.actor_id
    });
    return record;
}

export function consumeRateLimit(method, params = {}, policy = {}, actor = {}) {
    const rule = resolveRateLimitRule(method, params, policy);
    if (!rule) return { ok: true };
    const actorId = String(actor.actor_id || 'local_owner').trim() || 'local_owner';
    const stateKey = `${rule.id}:${actorId}`;
    const windowStart = Date.now() - Number(rule.window_ms || 60000);
    const history = Array.isArray(mcpRateLimitState.get(stateKey))
        ? mcpRateLimitState.get(stateKey).filter((entry) => Number(entry) >= windowStart)
        : [];
    if (history.length >= Number(rule.limit || 1)) {
        pushSecurityJournal('rate_limited', {
            actor_id: actorId,
            method: String(method || ''),
            subject: String(policy.subject || method || ''),
            rule_id: rule.id
        });
        pushMcpEvent('mcp.rate_limit.hit', {
            actor_id: actorId,
            method: String(method || ''),
            subject: String(policy.subject || method || ''),
            rule_id: rule.id
        });
        mcpRateLimitState.set(stateKey, history);
        return {
            ok: false,
            gate: {
                ok: false,
                error: 'mcp_rate_limited',
                method: String(method || ''),
                rule_id: rule.id,
                retry_after_ms: Number(rule.retry_after_ms || 1000)
            }
        };
    }
    history.push(Date.now());
    mcpRateLimitState.set(stateKey, history);
    return { ok: true };
}

export function buildIdempotencyCacheKey(method, params = {}, policy = {}, actor = {}) {
    const key = String(params?.idempotency_key || params?.idempotencyKey || '').trim();
    if (!key) return null;
    if (policy?.idempotent !== true) return null;
    // A native library receipt must never be served to a later account or another delegated actor.
    return JSON.stringify([getSessionState().user?.id || '', actor.actor_id,
        String(method || '').trim(), String(policy.subject || '').trim(), key]);
}

export function readIdempotencyRecord(method, params = {}, policy = {}, actor = {}) {
    const cacheKey = buildIdempotencyCacheKey(method, params, policy, actor);
    if (!cacheKey) return null;
    return mcpIdempotencyCache.get(cacheKey) || null;
}

export function writeIdempotencyRecord(method, params = {}, policy = {}, actor = {}, result = null) {
    const cacheKey = buildIdempotencyCacheKey(method, params, policy, actor);
    if (!cacheKey) return null;
    const record = {
        method: String(method || ''),
        subject: String(policy.subject || method || ''),
        stored_at: nowIso(),
        result: cloneValue(result)
    };
    mcpIdempotencyCache.set(cacheKey, record);
    trimHistory(mcpIdempotencyCache, MCP_IDEMPOTENCY_LIMIT);
    return record;
}

export function confirmProposal(proposalId) {
    const proposal = mcpProposals.get(String(proposalId || ''));
    if (!proposal) return null;
    proposal.status = 'confirmed';
    proposal.confirmed_at = nowIso();
    return proposal;
}

export function listProposals(status = null) {
    return Array.from(mcpProposals.values())
        .filter((entry) => !status || entry.status === status)
        .slice(-50)
        .map((entry) => cloneValue(entry));
}

export function readProposal(proposalId = '') {
    return mcpProposals.get(String(proposalId || '').trim()) || null;
}

export function listSecurityJournal({ type = null, limit = 50 } = {}) {
    const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 50;
    return mcpSecurityJournal
        .filter((entry) => !type || entry.type === type)
        .slice(-size)
        .map((entry) => cloneValue(entry));
}
