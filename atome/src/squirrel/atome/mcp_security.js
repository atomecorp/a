import {
    cloneValue,
    normalizeStringList,
    nowIso,
    pushMcpEvent,
    summarizeResult,
    trimArrayHistory,
    trimHistory
} from './mcp_core.js';
import { renderPrompt } from './mcp_resources.js';
import { resolveRateLimitRule, sanitizeConfirmationParams } from './mcp_security_policy.js';

const MCP_SECURITY_JOURNAL_LIMIT = 200;
const MCP_IDEMPOTENCY_LIMIT = 200;
const MCP_PROPOSAL_LIMIT = 100;

let mcpConfirmationSeq = 0;
let mcpSecurityJournalSeq = 0;
let mcpProposalSeq = 0;
const mcpConfirmations = new Map();
const mcpSecurityJournal = [];
const mcpProposals = new Map();
const mcpIdempotencyCache = new Map();
const mcpRateLimitState = new Map();

const DEFAULT_ACTOR_CAPABILITIES = Object.freeze([
    'mcp.read',
    'mcp.security.read',
    'runtime.read',
    'runtime.execute',
    'runtime.sensitive',
    'mail.read',
    'mail.send',
    'contacts.read',
    'contacts.write',
    'calendar.read',
    'calendar.write',
    'bank.read',
    'voice.read',
    'ai.read',
    'ai.execute',
    'audit.read'
]);

const DEFAULT_SANDBOX_PROFILES = Object.freeze([
    'desktop_local_owner'
]);

export function resolveActorProfile(params = {}) {
    const actor = params?.actor && typeof params.actor === 'object'
        ? params.actor
        : {};
    const capabilities = Array.isArray(actor.capabilities)
        ? normalizeStringList(actor.capabilities)
        : [...DEFAULT_ACTOR_CAPABILITIES];
    const sandboxProfiles = Array.isArray(actor.sandbox_profiles)
        ? normalizeStringList(actor.sandbox_profiles)
        : [...DEFAULT_SANDBOX_PROFILES];
    return {
        actor_id: String(actor.actor_id || actor.id || actor.user_id || actor.userId || 'local_owner').trim() || 'local_owner',
        role: String(actor.role || 'local_owner').trim() || 'local_owner',
        source: String(actor.source || 'local').trim() || 'local',
        capabilities,
        sandbox_profiles: sandboxProfiles
    };
}

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

function createProposalRecord(method, params = {}, policy = {}, actor = {}) {
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

export function buildIdempotencyCacheKey(method, params = {}, policy = {}) {
    const key = String(params?.idempotency_key || params?.idempotencyKey || '').trim();
    if (!key) return null;
    if (policy?.idempotent !== true) return null;
    return `${String(method || '').trim()}:${String(policy.subject || '').trim()}:${key}`;
}

export function readIdempotencyRecord(method, params = {}, policy = {}) {
    const cacheKey = buildIdempotencyCacheKey(method, params, policy);
    if (!cacheKey) return null;
    return mcpIdempotencyCache.get(cacheKey) || null;
}

export function writeIdempotencyRecord(method, params = {}, policy = {}, result = null) {
    const cacheKey = buildIdempotencyCacheKey(method, params, policy);
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

export function createConfirmationRecord(method, params, policy = {}, actor = {}, proposal = null) {
    const confirmation_id = `mcp_confirm_${++mcpConfirmationSeq}`;
    const record = {
        confirmation_id,
        method: String(method || ''),
        scope: String(policy.scope || 'tool'),
        subject: String(policy.subject || method || ''),
        status: 'pending',
        created_at: nowIso(),
        consumed_at: null,
        actor: {
            actor_id: actor.actor_id || 'local_owner',
            role: actor.role || 'local_owner'
        },
        proposal_id: proposal?.proposal_id || null,
        required_capabilities: normalizeStringList(policy.required_capabilities),
        sandbox_profile: String(policy.sandbox_profile || '').trim() || null,
        params: sanitizeConfirmationParams(params)
    };
    mcpConfirmations.set(confirmation_id, record);
    pushMcpEvent('mcp.confirmation.created', {
        confirmation_id,
        method: record.method,
        scope: record.scope,
        subject: record.subject
    });
    pushSecurityJournal('confirmation_created', {
        confirmation_id,
        proposal_id: record.proposal_id,
        method: record.method,
        subject: record.subject,
        actor_id: record.actor.actor_id
    });
    return record;
}

export function validateConfirmation(method, params = {}, policy = {}, actor = {}) {
    if (policy.confirmation_required !== true) {
        return { ok: true };
    }
    const confirmationId = String(params?.confirmation_id || params?.confirmationId || '').trim();
    const confirmed = params?.confirmed === true;
    if (!confirmed || !confirmationId) {
        const proposal = policy.proposal_required === true
            ? createProposalRecord(method, params, policy, actor)
            : null;
        const record = createConfirmationRecord(method, params, policy, actor, proposal);
        return {
            ok: false,
            gate: {
                ok: false,
                confirmation_required: true,
                confirmation_id: record.confirmation_id,
                proposal_id: proposal?.proposal_id || null,
                scope: record.scope,
                subject: record.subject
            }
        };
    }
    const record = mcpConfirmations.get(confirmationId);
    if (!record) {
        return {
            ok: false,
            gate: {
                ok: false,
                error: 'mcp_confirmation_not_found',
                confirmation_id: confirmationId
            }
        };
    }
    if (record.status !== 'pending') {
        return {
            ok: false,
            gate: {
                ok: false,
                error: 'mcp_confirmation_not_pending',
                confirmation_id: confirmationId,
                status: record.status
            }
        };
    }
    if (record.method !== String(method || '')) {
        return {
            ok: false,
            gate: {
                ok: false,
                error: 'mcp_confirmation_method_mismatch',
                confirmation_id: confirmationId
            }
        };
    }
    record.status = 'consumed';
    record.consumed_at = nowIso();
    if (record.proposal_id && mcpProposals.has(record.proposal_id)) {
        const proposal = mcpProposals.get(record.proposal_id);
        proposal.status = 'confirmed';
        proposal.confirmed_at = nowIso();
    }
    pushMcpEvent('mcp.confirmation.consumed', {
        confirmation_id: record.confirmation_id,
        method: record.method,
        subject: record.subject
    });
    pushSecurityJournal('confirmation_consumed', {
        confirmation_id: record.confirmation_id,
        proposal_id: record.proposal_id,
        method: record.method,
        subject: record.subject,
        actor_id: record.actor?.actor_id || actor.actor_id || 'local_owner'
    });
    return { ok: true, confirmation_id: confirmationId };
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

export function listConfirmations(status = null) {
    return Array.from(mcpConfirmations.values())
        .filter((entry) => !status || entry.status === status)
        .slice(-50)
        .map((entry) => cloneValue(entry));
}

export function readConfirmation(confirmationId = '') {
    return mcpConfirmations.get(String(confirmationId || '').trim()) || null;
}

export function listSecurityJournal({ type = null, limit = 50 } = {}) {
    const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 50;
    return mcpSecurityJournal
        .filter((entry) => !type || entry.type === type)
        .slice(-size)
        .map((entry) => cloneValue(entry));
}
