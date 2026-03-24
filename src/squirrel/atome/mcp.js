const hasOwn = Object.prototype.hasOwnProperty;
const ATOME_MCP_PROTOCOL = '1.0.0';
const MCP_EVENT_NAME = 'squirrel:mcp';
const MCP_UI_EVENT_NAME = 'squirrel:mcp:ui';
const MCP_VOICE_EVENT_NAME = 'squirrel:mcp:voice';
const MCP_EVENT_LIMIT = 200;
const MCP_OPERATION_LIMIT = 100;
const MCP_SECURITY_JOURNAL_LIMIT = 200;
const MCP_IDEMPOTENCY_LIMIT = 200;
const MCP_PROPOSAL_LIMIT = 100;

let mcpEventSeq = 0;
let mcpOperationSeq = 0;
const mcpEvents = [];
const mcpOperations = new Map();
const mcpConfirmations = new Map();
let mcpConfirmationSeq = 0;
const mcpSecurityJournal = [];
let mcpSecurityJournalSeq = 0;
const mcpProposals = new Map();
let mcpProposalSeq = 0;
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

const MCP_RATE_LIMIT_RULES = Object.freeze([
    {
        id: 'mail.send',
        label: 'Mail send',
        limit: 3,
        window_ms: 60000,
        retry_after_ms: 15000,
        retryable_errors: ['smtp_auth_missing', 'smtp_auth_login_failed', 'smtp_auth_password_failed']
    },
    {
        id: 'calendar.write',
        label: 'Calendar writes',
        limit: 8,
        window_ms: 60000,
        retry_after_ms: 10000,
        retryable_errors: ['calendar_source_read_only', 'calendar_writable_source_missing']
    },
    {
        id: 'runtime.sensitive',
        label: 'Sensitive runtime tools',
        limit: 5,
        window_ms: 60000,
        retry_after_ms: 5000,
        retryable_errors: ['tool_selection_required']
    },
    {
        id: 'toolchain.sensitive',
        label: 'Sensitive toolchains',
        limit: 4,
        window_ms: 60000,
        retry_after_ms: 5000,
        retryable_errors: ['mcp_confirmation_required']
    }
]);

function cloneValue(value) {
    if (value === undefined) return undefined;
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
    } catch (_) {
        // Fall through to JSON clone below.
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function trimHistory(map, limit = MCP_OPERATION_LIMIT) {
    while (map.size > limit) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
    }
}

function trimArrayHistory(list, limit = MCP_EVENT_LIMIT) {
    if (!Array.isArray(list)) return;
    if (list.length > limit) {
        list.splice(0, list.length - limit);
    }
}

function normalizeStringList(value, fallback = []) {
    if (!Array.isArray(value)) return [...fallback];
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function resolveActorProfile(params = {}) {
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

function hasActorCapability(actor = {}, required = []) {
    const needed = normalizeStringList(required);
    if (!needed.length) return true;
    const granted = normalizeStringList(actor.capabilities);
    if (granted.includes('*')) return true;
    return needed.every((entry) => granted.includes(entry));
}

function hasSandboxProfile(actor = {}, requiredProfile = null) {
    const expected = String(requiredProfile || '').trim();
    if (!expected) return true;
    const profiles = normalizeStringList(actor.sandbox_profiles);
    return profiles.includes('*') || profiles.includes(expected);
}

function pushSecurityJournal(type, payload = {}) {
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

function resolveResourceCapability(uri = '') {
    const normalized = String(uri || '').trim();
    if (normalized.startsWith('runtime://')) return ['runtime.read'];
    if (normalized.startsWith('mail://')) return ['mail.read'];
    if (normalized.startsWith('contacts://')) return ['contacts.read'];
    if (normalized.startsWith('calendar://')) return ['calendar.read'];
    if (normalized.startsWith('bank://')) return ['bank.read'];
    if (normalized.startsWith('voice://')) return ['voice.read'];
    if (normalized.startsWith('security://')) return ['mcp.security.read'];
    return ['mcp.read'];
}

function resolvePromptCapability(name = '') {
    const normalized = String(name || '').trim();
    if (normalized.startsWith('mail_')) return ['mail.read'];
    if (normalized.startsWith('contacts_')) return ['contacts.read'];
    if (normalized.startsWith('calendar_')) return ['calendar.read'];
    if (normalized.startsWith('bank_')) return ['bank.read'];
    if (normalized.startsWith('voice_')) return ['voice.read'];
    return ['mcp.read'];
}

function listRateLimitRules() {
    return MCP_RATE_LIMIT_RULES.map((entry) => cloneValue(entry));
}

function resolveRateLimitRule(method, params = {}, policy = {}) {
    const normalizedMethod = String(method || '').trim();
    if (normalizedMethod === 'mail.send') {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'mail.send') || null;
    }
    if (normalizedMethod === 'calendar.create' || normalizedMethod === 'calendar.update' || normalizedMethod === 'calendar.delete') {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'calendar.write') || null;
    }
    if (
        normalizedMethod === 'runtime.tools.call'
        && isSensitiveRuntimeTool(normalizeRuntimeToolIdentifier(params))
    ) {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'runtime.sensitive') || null;
    }
    if (
        normalizedMethod === 'mcp.toolchains.execute'
        && policy?.sensitive === true
    ) {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'toolchain.sensitive') || null;
    }
    return null;
}

function consumeRateLimit(method, params = {}, policy = {}, actor = {}) {
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

function buildIdempotencyCacheKey(method, params = {}, policy = {}) {
    const key = String(params?.idempotency_key || params?.idempotencyKey || '').trim();
    if (!key) return null;
    if (policy?.idempotent !== true) return null;
    return `${String(method || '').trim()}:${String(policy.subject || '').trim()}:${key}`;
}

function readIdempotencyRecord(method, params = {}, policy = {}) {
    const cacheKey = buildIdempotencyCacheKey(method, params, policy);
    if (!cacheKey) return null;
    return mcpIdempotencyCache.get(cacheKey) || null;
}

function writeIdempotencyRecord(method, params = {}, policy = {}, result = null) {
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

function pushMcpEvent(type, payload = {}) {
    const event = {
        seq: ++mcpEventSeq,
        at: nowIso(),
        type: String(type || 'mcp.event'),
        payload: cloneValue(payload) || {}
    };
    mcpEvents.push(event);
    if (mcpEvents.length > MCP_EVENT_LIMIT) {
        mcpEvents.splice(0, mcpEvents.length - MCP_EVENT_LIMIT);
    }
    if (typeof globalThis?.dispatchEvent === 'function' && typeof globalThis?.CustomEvent === 'function') {
        [MCP_EVENT_NAME, MCP_UI_EVENT_NAME, MCP_VOICE_EVENT_NAME].forEach((eventName) => {
            globalThis.dispatchEvent(new globalThis.CustomEvent(eventName, {
                detail: cloneValue(event) || {}
            }));
        });
    }
    return event;
}

function summarizeResult(value) {
    if (value == null) return value;
    if (typeof value !== 'object') return value;
    const summary = {};
    if (Object.prototype.hasOwnProperty.call(value, 'ok')) summary.ok = value.ok;
    if (Object.prototype.hasOwnProperty.call(value, 'error')) summary.error = value.error;
    if (Object.prototype.hasOwnProperty.call(value, 'tool_id')) summary.tool_id = value.tool_id;
    if (Object.prototype.hasOwnProperty.call(value, 'count')) summary.count = value.count;
    if (Object.keys(summary).length) return summary;
    return cloneValue(value);
}

function createOperationRecord(method, params = {}, requestId = null) {
    const operation_id = `mcp_op_${++mcpOperationSeq}`;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const record = {
        operation_id,
        request_id: requestId,
        method: String(method || ''),
        status: 'running',
        progress_ratio: 0,
        progress_phase: 'queued',
        started_at: nowIso(),
        updated_at: nowIso(),
        completed_at: null,
        cancel_requested_at: null,
        error: null,
        result: null,
        params_preview: summarizeResult(params),
        controller
    };
    mcpOperations.set(operation_id, record);
    trimHistory(mcpOperations, MCP_OPERATION_LIMIT);
    pushMcpEvent('mcp.operation.started', {
        operation_id,
        method: record.method,
        request_id: requestId
    });
    return record;
}

function updateOperationRecord(operation_id, patch = {}) {
    const record = mcpOperations.get(String(operation_id || ''));
    if (!record) return null;
    Object.assign(record, patch, {
        updated_at: nowIso()
    });
    return record;
}

function reportOperationProgress(operation_id, {
    ratio = null,
    phase = null,
    detail = null
} = {}) {
    const record = updateOperationRecord(operation_id, {
        ...(ratio != null ? { progress_ratio: Math.max(0, Math.min(1, Number(ratio) || 0)) } : {}),
        ...(phase ? { progress_phase: String(phase) } : {})
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.progress', {
        operation_id: record.operation_id,
        method: record.method,
        ratio: record.progress_ratio,
        phase: record.progress_phase,
        detail: cloneValue(detail)
    });
    return record;
}

function completeOperationRecord(operation_id, result) {
    const record = updateOperationRecord(operation_id, {
        status: 'completed',
        progress_ratio: 1,
        progress_phase: 'completed',
        completed_at: nowIso(),
        result: summarizeResult(result)
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.completed', {
        operation_id: record.operation_id,
        method: record.method,
        result: record.result
    });
    return record;
}

function failOperationRecord(operation_id, error) {
    const record = updateOperationRecord(operation_id, {
        status: 'failed',
        progress_phase: 'failed',
        completed_at: nowIso(),
        error: error && error.message ? error.message : String(error || 'mcp_operation_failed')
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.failed', {
        operation_id: record.operation_id,
        method: record.method,
        error: record.error
    });
    return record;
}

function cancelOperationRecord(operation_id) {
    const record = mcpOperations.get(String(operation_id || ''));
    if (!record) {
        return { ok: false, error: 'mcp_operation_not_found', operation_id: String(operation_id || '') || null };
    }
    if (record.status !== 'running') {
        return {
            ok: false,
            error: 'mcp_operation_not_running',
            operation_id: record.operation_id,
            status: record.status
        };
    }
    record.cancel_requested_at = nowIso();
    record.status = 'cancel_requested';
    record.progress_phase = 'cancel_requested';
    record.updated_at = nowIso();
    if (record.controller && typeof record.controller.abort === 'function' && record.controller.signal?.aborted !== true) {
        record.controller.abort();
    }
    pushMcpEvent('mcp.operation.cancel_requested', {
        operation_id: record.operation_id,
        method: record.method
    });
    return {
        ok: true,
        operation_id: record.operation_id,
        status: record.status
    };
}

function finalizeCancelledOperation(operation_id) {
    const record = updateOperationRecord(operation_id, {
        status: 'cancelled',
        progress_phase: 'cancelled',
        completed_at: nowIso()
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.cancelled', {
        operation_id: record.operation_id,
        method: record.method
    });
    return record;
}

const SENSITIVE_RUNTIME_TOOL_PATTERNS = [
    /^ui\.capture\./,
    /^ui\.detail\.record\.toggle$/,
    /^ui\.mtrax\.open$/,
    /^ui\.automation$/
];

function isSensitiveRuntimeTool(toolId = '') {
    const normalized = String(toolId || '').trim();
    return SENSITIVE_RUNTIME_TOOL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sanitizeConfirmationParams(params = {}) {
    const cloned = params && typeof params === 'object' ? { ...params } : {};
    delete cloned.__mcp;
    delete cloned.confirmed;
    delete cloned.confirmation_id;
    delete cloned.confirmationId;
    return cloneValue(cloned) || {};
}

function listAclRules() {
    return {
        tools: [
            { subject: 'mail.send', access: 'confirm', required_capabilities: ['mail.send'] },
            { subject: 'calendar.create', access: 'confirm', required_capabilities: ['calendar.write'] },
            { subject: 'calendar.update', access: 'confirm', required_capabilities: ['calendar.write'] },
            { subject: 'calendar.delete', access: 'confirm', required_capabilities: ['calendar.write'] },
            {
                subject: 'runtime.tools.call:ui.capture.*',
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                sandbox_profile: 'desktop_local_owner'
            },
            {
                subject: 'runtime.tools.call:ui.detail.record.toggle',
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                sandbox_profile: 'desktop_local_owner'
            },
            {
                subject: 'runtime.tools.call:ui.mtrax.open',
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                sandbox_profile: 'desktop_local_owner'
            },
            {
                subject: 'mcp.toolchains.execute:sensitive_step',
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                sandbox_profile: 'desktop_local_owner'
            }
        ],
        resources: listMcpResourceEntries().map((entry) => ({
            subject: entry.uri,
            access: 'allow',
            required_capabilities: resolveResourceCapability(entry.uri)
        })),
        prompts: listMcpPromptEntries().map((entry) => ({
            subject: entry.name,
            access: 'allow',
            required_capabilities: resolvePromptCapability(entry.name)
        }))
    };
}

function resolveAccessPolicy(method, params = {}) {
    const normalizedMethod = String(method || '').trim();
    const defaultPolicy = {
        allowed: true,
        scope: 'method',
        subject: normalizedMethod,
        access: 'allow',
        required_capabilities: ['mcp.read'],
        confirmation_required: false,
        proposal_required: false,
        sandbox_profile: null,
        sensitive: false,
        idempotent: false
    };
    if (normalizedMethod === 'mcp.resources.read') {
        const uri = String(params?.uri || params?.resource || params?.resource_uri || '').trim();
        const known = listMcpResourceEntries().some((entry) => entry.uri === uri);
        return known
            ? {
                ...defaultPolicy,
                scope: 'resource',
                subject: uri,
                required_capabilities: resolveResourceCapability(uri)
            }
            : { allowed: false, scope: 'resource', subject: uri || null, error: 'mcp_resource_forbidden' };
    }
    if (normalizedMethod === 'mcp.prompts.get') {
        const name = String(params?.name || params?.prompt || params?.prompt_name || '').trim();
        const known = listMcpPromptEntries().some((entry) => entry.name === name);
        return known
            ? {
                ...defaultPolicy,
                scope: 'prompt',
                subject: name,
                required_capabilities: resolvePromptCapability(name)
            }
            : { allowed: false, scope: 'prompt', subject: name || null, error: 'mcp_prompt_forbidden' };
    }
    if (normalizedMethod === 'mcp.security.journal.list') {
        return {
            ...defaultPolicy,
            subject: normalizedMethod,
            required_capabilities: ['mcp.security.read']
        };
    }
    if (normalizedMethod === 'mcp.proposals.list' || normalizedMethod === 'mcp.proposals.read' || normalizedMethod === 'mcp.rate_limits.list') {
        return {
            ...defaultPolicy,
            subject: normalizedMethod,
            required_capabilities: ['mcp.read']
        };
    }
    if (normalizedMethod === 'mail.send') {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: 'mail.send',
            access: 'confirm',
            required_capabilities: ['mail.send'],
            confirmation_required: true,
            proposal_required: true,
            sensitive: true,
            idempotent: true
        };
    }
    if (normalizedMethod === 'calendar.create' || normalizedMethod === 'calendar.update' || normalizedMethod === 'calendar.delete') {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            access: 'confirm',
            required_capabilities: ['calendar.write'],
            confirmation_required: true,
            proposal_required: true,
            sensitive: true,
            idempotent: true
        };
    }
    if (normalizedMethod === 'runtime.tools.call') {
        const toolId = normalizeRuntimeToolIdentifier(params);
        if (isSensitiveRuntimeTool(toolId)) {
            return {
                ...defaultPolicy,
                scope: 'tool',
                subject: `runtime.tools.call:${toolId}`,
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                confirmation_required: true,
                proposal_required: true,
                sandbox_profile: 'desktop_local_owner',
                sensitive: true,
                idempotent: true
            };
        }
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: `runtime.tools.call:${toolId || 'unknown'}`,
            required_capabilities: ['runtime.execute']
        };
    }
    if (normalizedMethod === 'runtime.tools.batch_call') {
        const events = Array.isArray(params?.events) ? params.events : [];
        const sensitive = events.some((entry) => isSensitiveRuntimeTool(normalizeRuntimeToolIdentifier(entry)));
        return sensitive
            ? {
                ...defaultPolicy,
                scope: 'tool',
                subject: 'runtime.tools.batch_call:sensitive_batch',
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                confirmation_required: true,
                proposal_required: true,
                sandbox_profile: 'desktop_local_owner',
                sensitive: true,
                idempotent: true
            }
            : {
                ...defaultPolicy,
                scope: 'tool',
                subject: 'runtime.tools.batch_call',
                required_capabilities: ['runtime.execute']
            };
    }
    if (normalizedMethod === 'mcp.toolchains.execute') {
        const steps = Array.isArray(params?.steps) ? params.steps : [];
        const requiredCapabilities = ['runtime.execute'];
        const sensitive = steps.some((step) => {
            const stepMethod = String(step?.method || '').trim();
            if (stepMethod === 'runtime.tools.call') {
                requiredCapabilities.push('runtime.execute');
                if (isSensitiveRuntimeTool(normalizeRuntimeToolIdentifier(step?.params || {}))) {
                    requiredCapabilities.push('runtime.sensitive');
                    return true;
                }
                return false;
            }
            if (stepMethod === 'mail.send') {
                requiredCapabilities.push('mail.send');
                return true;
            }
            if (stepMethod === 'calendar.create' || stepMethod === 'calendar.update' || stepMethod === 'calendar.delete') {
                requiredCapabilities.push('calendar.write');
                return true;
            }
            return ['mail.send', 'calendar.create', 'calendar.update', 'calendar.delete'].includes(stepMethod);
        });
        return sensitive
            ? {
                ...defaultPolicy,
                scope: 'tool',
                subject: 'mcp.toolchains.execute:sensitive_step',
                access: 'confirm',
                required_capabilities: Array.from(new Set(requiredCapabilities)),
                confirmation_required: true,
                proposal_required: true,
                sandbox_profile: 'desktop_local_owner',
                sensitive: true,
                idempotent: true
            }
            : {
                ...defaultPolicy,
                scope: 'tool',
                subject: 'mcp.toolchains.execute',
                required_capabilities: Array.from(new Set(requiredCapabilities))
            };
    }
    if (normalizedMethod === 'runtime.tools.list' || normalizedMethod === 'runtime.audit.list') {
        return {
            ...defaultPolicy,
            subject: normalizedMethod,
            required_capabilities: ['runtime.read']
        };
    }
    if (normalizedMethod.startsWith('mail.')) {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            required_capabilities: ['mail.read']
        };
    }
    if (normalizedMethod === 'contacts.push_icloud') {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            access: 'confirm',
            required_capabilities: ['contacts.write'],
            confirmation_required: true,
            proposal_required: true,
            sensitive: true,
            idempotent: true
        };
    }
    if (
        normalizedMethod === 'contacts.import_macos'
        || normalizedMethod === 'contacts.import_icloud'
        || normalizedMethod === 'contacts.create'
        || normalizedMethod === 'contacts.update'
        || normalizedMethod === 'contacts.delete'
    ) {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            required_capabilities: ['contacts.write']
        };
    }
    if (normalizedMethod.startsWith('contacts.')) {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            required_capabilities: ['contacts.read']
        };
    }
    if (normalizedMethod === 'calendar.delete') {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            required_capabilities: ['calendar.write']
        };
    }
    if (normalizedMethod.startsWith('calendar.')) {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            required_capabilities: ['calendar.read']
        };
    }
    if (normalizedMethod.startsWith('bank.')) {
        return {
            ...defaultPolicy,
            scope: 'tool',
            subject: normalizedMethod,
            required_capabilities: ['bank.read']
        };
    }
    if (normalizedMethod === 'ai.tools.call') {
        return {
            ...defaultPolicy,
            subject: normalizedMethod,
            required_capabilities: ['ai.execute']
        };
    }
    if (normalizedMethod === 'ai.tools.list') {
        return {
            ...defaultPolicy,
            subject: normalizedMethod,
            required_capabilities: ['ai.read']
        };
    }
    if (normalizedMethod === 'ai.audit.list') {
        return {
            ...defaultPolicy,
            subject: normalizedMethod,
            required_capabilities: ['audit.read']
        };
    }
    return defaultPolicy;
}

function createConfirmationRecord(method, params, policy = {}, actor = {}, proposal = null) {
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

function validateConfirmation(method, params = {}, policy = {}, actor = {}) {
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

function ensureAIAgent() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    if (!globalThis.AtomeAI || typeof globalThis.AtomeAI.listTools !== 'function') {
        throw new Error('AtomeAI is not available');
    }
    return globalThis.AtomeAI;
}

function ensureRuntimeToolApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    const runtime = globalThis.atome?.tools?.v2Runtime || globalThis.window?.atome?.tools?.v2Runtime || null;
    if (!runtime || typeof runtime.invokeById !== 'function') {
        throw new Error('Runtime V2 MCP bridge is not available');
    }
    return runtime;
}

function ensureRuntimeCommandBus() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for runtime command bus');
    }
    const bus = globalThis.atome?.tools?.v2CommandBus || globalThis.window?.atome?.tools?.v2CommandBus || null;
    if (!bus || typeof bus.listEvents !== 'function') {
        throw new Error('Runtime V2 command bus is not available');
    }
    return bus;
}

function ensureMailApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for mail bridge');
    }
    const api = globalThis.atome?.mail || globalThis.window?.atome?.mail || globalThis.Squirrel?.mail || globalThis.window?.Squirrel?.mail || null;
    if (!api || typeof api.list !== 'function') {
        throw new Error('Mail API is not available');
    }
    return api;
}

function ensureContactsApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for contacts bridge');
    }
    const api = globalThis.atome?.contacts || globalThis.window?.atome?.contacts || globalThis.Squirrel?.contacts || globalThis.window?.Squirrel?.contacts || null;
    if (!api || typeof api.list !== 'function') {
        throw new Error('Contacts API is not available');
    }
    return api;
}

function ensureCalendarApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for calendar bridge');
    }
    const api = globalThis.atome?.calendar || globalThis.window?.atome?.calendar || globalThis.Squirrel?.calendar || globalThis.window?.Squirrel?.calendar || null;
    if (!api || typeof api.today !== 'function') {
        throw new Error('Calendar API is not available');
    }
    return api;
}

async function prepareContactsApi(options = {}) {
    const api = ensureContactsApi();
    if (typeof api.ensureReady === 'function') {
        const ready = await Promise.race([
            Promise.resolve().then(() => api.ensureReady({
                import_legacy_if_empty: false,
                ...options
            })),
            new Promise((resolve) => {
                setTimeout(() => resolve({
                    ok: false,
                    error: 'contacts_sync_timeout'
                }), 1500);
            })
        ]);
        if (ready?.ok !== false) return api;
        const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
        if (Array.isArray(cached?.items) && cached.items.length) {
            return api;
        }
        return api;
    }
    if (typeof api.configureMacosSource === 'function') {
        api.configureMacosSource(options);
    }
    if (typeof api.syncPull === 'function') {
        const syncResult = await api.syncPull({});
        if (syncResult?.ok !== true) {
            const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
            if (!Array.isArray(cached?.items) || !cached.items.length) {
                throw new Error(syncResult?.error || 'contacts_sync_failed');
            }
        }
    }
    return api;
}

function ensureBankApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for bank bridge');
    }
    const api = globalThis.atome?.bank || globalThis.window?.atome?.bank || globalThis.Squirrel?.bank || globalThis.window?.Squirrel?.bank || null;
    if (!api || typeof api.accounts !== 'function') {
        throw new Error('Bank API is not available');
    }
    return api;
}

function getOptionalVoiceApi() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.atome?.voice || globalThis.window?.atome?.voice || globalThis.Squirrel?.voice || globalThis.window?.Squirrel?.voice || null;
}

async function listUnifiedMcpTools() {
    const tools = [];
    try {
        const runtime = ensureRuntimeToolApi();
        if (typeof runtime.listTools === 'function') {
            const runtimeTools = await runtime.listTools({ includeDisabled: false });
            (Array.isArray(runtimeTools) ? runtimeTools : []).forEach((entry) => {
                tools.push({
                    name: String(entry?.id || entry?.tool_key || '').trim() || null,
                    description: String(entry?.meta?.name || entry?.ui?.label_fallback || entry?.tool_key || '').trim() || null,
                    source: 'runtime_v2',
                    kind: 'tool'
                });
            });
        }
    } catch (_) {
        // Ignore unavailable optional surfaces in discovery.
    }
    try {
        const agent = ensureAIAgent();
        const aiTools = agent.listTools();
        (Array.isArray(aiTools) ? aiTools : []).forEach((entry) => {
            tools.push({
                name: String(entry?.name || '').trim() || null,
                description: String(entry?.description || '').trim() || null,
                source: 'atome_ai',
                kind: 'tool'
            });
        });
    } catch (_) {
        // Ignore unavailable optional surfaces in discovery.
    }
    const deduped = new Map();
    tools.forEach((entry) => {
        const key = `${entry.source}:${entry.name}`;
        if (!entry.name || deduped.has(key)) return;
        deduped.set(key, entry);
    });
    return Array.from(deduped.values());
}

function listMcpResourceEntries() {
    const resources = [{
        uri: 'security://journal/recent',
        name: 'Security Journal',
        description: 'Recent sensitive-flow security decisions, confirmations, and idempotency hits.',
        mime_type: 'application/json',
        source: 'mcp'
    }];
    try {
        ensureRuntimeCommandBus();
        resources.push({
            uri: 'runtime://audit/recent',
            name: 'Runtime Audit Stream',
            description: 'Recent runtime command-bus events.',
            mime_type: 'application/json',
            source: 'runtime_v2'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureMailApi();
        resources.push({
            uri: 'mail://summary/default',
            name: 'Mail Summary',
            description: 'Summary of the local indexed mailbox.',
            mime_type: 'application/json',
            source: 'mail'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureContactsApi();
        resources.push({
            uri: 'contacts://sources',
            name: 'Contacts Sources',
            description: 'Registered contact sources bridged into the shared eVe contacts service.',
            mime_type: 'application/json',
            source: 'contacts'
        });
        resources.push({
            uri: 'contacts://directory/default',
            name: 'Contacts Directory',
            description: 'Unified contacts directory currently available in eVe.',
            mime_type: 'application/json',
            source: 'contacts'
        });
        resources.push({
            uri: 'contacts://directory/local',
            name: 'Local Contacts Directory',
            description: 'Contacts currently stored in the local eVe primary contacts store.',
            mime_type: 'application/json',
            source: 'contacts'
        });
        resources.push({
            uri: 'contacts://status/default',
            name: 'Contacts Sync Status',
            description: 'Current contacts sync status and registered source states.',
            mime_type: 'application/json',
            source: 'contacts'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureCalendarApi();
        resources.push({
            uri: 'calendar://sources',
            name: 'Calendar Sources',
            description: 'Registered unified calendar sources.',
            mime_type: 'application/json',
            source: 'calendar'
        });
        resources.push({
            uri: 'calendar://today',
            name: 'Calendar Today',
            description: 'Unified calendar events for today.',
            mime_type: 'application/json',
            source: 'calendar'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureBankApi();
        resources.push({
            uri: 'bank://summary/default',
            name: 'Bank Summary',
            description: 'Analytical summary of normalized banking data.',
            mime_type: 'application/json',
            source: 'bank'
        });
    } catch (_) {
        // Optional.
    }
    const voice = getOptionalVoiceApi();
    if (voice && typeof voice.listSessions === 'function') {
        resources.push({
            uri: 'voice://sessions/active',
            name: 'Voice Sessions',
            description: 'Active voice sessions exposed by the shared voice runtime.',
            mime_type: 'application/json',
            source: 'voice'
        });
    }
    return resources;
}

async function readMcpResource(uri, params = {}) {
    const normalizedUri = String(uri || '').trim();
    if (!normalizedUri) {
        throw new Error('Missing resource uri');
    }
    if (normalizedUri === 'security://journal/recent') {
        return atomeMCPHandlers['mcp.security.journal.list']({
            limit: Number.isFinite(Number(params?.limit)) ? Number(params.limit) : 50
        });
    }
    if (normalizedUri === 'runtime://audit/recent') {
        return atomeMCPHandlers['runtime.audit.list']({
            limit: Number.isFinite(Number(params?.limit)) ? Number(params.limit) : 50
        });
    }
    if (normalizedUri === 'mail://summary/default') {
        return atomeMCPHandlers['mail.summarize'](params || {});
    }
    if (normalizedUri === 'contacts://sources') {
        return atomeMCPHandlers['contacts.sources'](params || {});
    }
    if (normalizedUri === 'contacts://directory/default') {
        return atomeMCPHandlers['contacts.list'](params || {});
    }
    if (normalizedUri === 'contacts://directory/local') {
        return atomeMCPHandlers['contacts.list']({
            ...(params || {}),
            source_id: 'eve_contacts_local'
        });
    }
    if (normalizedUri === 'contacts://status/default') {
        const contacts = ensureContactsApi();
        return contacts.syncStatus();
    }
    if (normalizedUri === 'calendar://sources') {
        return atomeMCPHandlers['calendar.sources'](params || {});
    }
    if (normalizedUri === 'calendar://today') {
        return atomeMCPHandlers['calendar.today'](params || {});
    }
    if (normalizedUri === 'voice://sessions/active') {
        const voice = getOptionalVoiceApi();
        if (!voice || typeof voice.listSessions !== 'function') {
            throw new Error('Voice API is not available');
        }
        return voice.listSessions({
            includeClosed: params?.includeClosed === true
        });
    }
    if (normalizedUri === 'bank://summary/default') {
        return atomeMCPHandlers['bank.summary'](params || {});
    }
    throw new Error(`Unknown MCP resource: ${normalizedUri}`);
}

function listMcpPromptEntries() {
    const prompts = [
        {
            name: 'confirm_sensitive_action',
            description: 'Prompt template asking for explicit confirmation before a sensitive action.',
            source: 'mcp'
        }
    ];
    try {
        ensureMailApi();
        prompts.push({
            name: 'mail_reply_brief',
            description: 'Prompt template for a concise spoken or typed mail reply.',
            source: 'mail'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureContactsApi();
        prompts.push({
            name: 'contacts_lookup_brief',
            description: 'Prompt template for concise contact lookup answers.',
            source: 'contacts'
        });
        prompts.push({
            name: 'contacts_import_summary',
            description: 'Prompt template for summarizing a contact import result.',
            source: 'contacts'
        });
        prompts.push({
            name: 'contacts_push_confirmation',
            description: 'Prompt template for confirming an explicit contact push to iCloud.',
            source: 'contacts'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureCalendarApi();
        prompts.push({
            name: 'calendar_event_brief',
            description: 'Prompt template for presenting or confirming a calendar event.',
            source: 'calendar'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureBankApi();
        prompts.push({
            name: 'bank_analytics_brief',
            description: 'Prompt template for concise banking analysis answers.',
            source: 'bank'
        });
    } catch (_) {
        // Optional.
    }
    const voice = getOptionalVoiceApi();
    if (voice) {
        prompts.push({
            name: 'voice_interrupt_hint',
            description: 'Prompt template reminding the available interruption commands.',
            source: 'voice'
        });
    }
    return prompts;
}

function renderPrompt(name, params = {}) {
    const promptName = String(name || '').trim();
    if (!promptName) {
        throw new Error('Missing prompt name');
    }
    if (promptName === 'confirm_sensitive_action') {
        const action = String(params?.action || params?.tool || 'cette action').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Confirmation requise: voulez-vous vraiment executer ${action} ? Repondez explicitement par oui pour continuer.`
        };
    }
    if (promptName === 'mail_reply_brief') {
        const topic = String(params?.topic || params?.subject || 'ce mail').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Redige une reponse courte, polie et claire a propos de ${topic}. Conserve un ton direct et actionnable.`
        };
    }
    if (promptName === 'contacts_lookup_brief') {
        const topic = String(params?.topic || params?.contact || 'ce contact').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Donne une reponse concise a propos de ${topic}, avec le nom, le telephone principal, l'adresse mail principale et la source de synchronisation si elle existe.`
        };
    }
    if (promptName === 'contacts_import_summary') {
        const source = String(params?.source || params?.provider || 'la source contacts').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Resume l'import realise depuis ${source} avec le nombre de contacts importes, les doublons probables, et ce qui reste stocke localement dans eVe.`
        };
    }
    if (promptName === 'contacts_push_confirmation') {
        const contact = String(params?.contact || params?.name || 'ce contact').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Confirmation requise: voulez-vous vraiment pousser ${contact} vers iCloud Contacts ? Repondez explicitement par oui pour continuer.`
        };
    }
    if (promptName === 'calendar_event_brief') {
        const title = String(params?.title || 'cet evenement').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Resume ${title} en une phrase, puis confirme la date, l'heure et le lieu de facon concise.`
        };
    }
    if (promptName === 'voice_interrupt_hint') {
        return {
            ok: true,
            name: promptName,
            prompt: 'Commandes vocales locales disponibles: stop, passe au suivant, resume, annule, reponds.'
        };
    }
    if (promptName === 'bank_analytics_brief') {
        return {
            ok: true,
            name: promptName,
            prompt: 'Donne une reponse bancaire courte, factuelle, avec les montants, la periode, et les contreparties les plus importantes.'
        };
    }
    throw new Error(`Unknown MCP prompt: ${promptName}`);
}

function ensureAtomeContext() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    if (typeof globalThis.Atome !== 'function') {
        throw new Error('Atome constructor is not exposed on the global scope');
    }
    return {
        defaults: globalThis.atomeDefaultsParams || {},
        AtomeCtor: globalThis.Atome
    };
}

function extractAtomePayload(input) {
    if (!input || typeof input !== 'object') return {};

    const { mergeDefaults = true } = input;
    const values = hasOwn.call(input, 'values') && input.values && typeof input.values === 'object'
        ? input.values
        : { ...input };

    const sanitized = { ...values };
    delete sanitized.mergeDefaults;
    delete sanitized.values;

    return { mergeDefaults, payload: sanitized };
}

function normalizeRuntimeToolIdentifier(params = {}) {
    const candidates = [
        params.tool_id,
        params.toolId,
        params.tool_key,
        params.toolKey,
        params.tool_name,
        params.name,
        params.tool
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return '';
}

function normalizeRuntimeToolEntry(tool = {}) {
    const contexts = Array.isArray(tool?.capabilities?.contexts)
        ? tool.capabilities.contexts.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    return {
        name: String(tool?.id || tool?.tool_key || '').trim() || null,
        description: String(tool?.meta?.name || tool?.ui?.label_fallback || tool?.tool_key || tool?.id || '').trim() || null,
        source: 'runtime_v2',
        tool_id: String(tool?.id || '').trim() || null,
        tool_key: String(tool?.tool_key || '').trim() || null,
        visibility: String(tool?.visibility || '').trim() || 'visible',
        params_schema: null,
        runtime: {
            execution_mode: String(tool?.runtime?.execution_mode || '').trim() || null,
            contexts,
            selection_required: tool?.capabilities?.selection_required === true,
            disabled: tool?.capabilities?.disabled === true
        }
    };
}

function buildRuntimeInvocationPayload(params = {}, defaults = {}) {
    const toolId = normalizeRuntimeToolIdentifier(params);
    if (!toolId) {
        throw new Error('Missing runtime tool identifier');
    }
    const mcpContext = params?.__mcp && typeof params.__mcp === 'object' ? params.__mcp : null;
    const input = params?.input && typeof params.input === 'object'
        ? { ...params.input }
        : ((params?.params && typeof params.params === 'object') ? { ...params.params } : {});
    const meta = params?.meta && typeof params.meta === 'object'
        ? { ...params.meta }
        : {};
    if (params?.trace_id && !meta.trace_id) {
        meta.trace_id = String(params.trace_id);
    }
    if (params?.intent_id && !meta.intent_id) {
        meta.intent_id = String(params.intent_id);
    }
    if (params?.idempotency_key && !meta.idempotency_key) {
        meta.idempotency_key = params.idempotency_key;
    }
    if (mcpContext?.operation_id && !meta.operation_id) {
        meta.operation_id = String(mcpContext.operation_id);
    }
    return {
        tool_id: toolId,
        action: params.action || params.event || defaults.action || 'pointer.click',
        ...(params.event ? { event: params.event } : {}),
        input,
        presentation: params.presentation || defaults.presentation || 'mcp',
        source: (params?.source && typeof params.source === 'object')
            ? params.source
            : { type: 'mcp', layer: defaults.layer || 'atome_mcp' },
        ...(params?.actor && typeof params.actor === 'object' ? { actor: params.actor } : {}),
        meta,
        ...(mcpContext?.signal ? { signal: mcpContext.signal } : {}),
        ...(params?.dry_run === true ? { dry_run: true } : {}),
        ...(params?.idempotency_key ? { idempotency_key: params.idempotency_key } : {})
    };
}

const atomeMCPHandlers = {
    'atome.create'(params = {}) {
        const { defaults, AtomeCtor } = ensureAtomeContext();
        const { mergeDefaults, payload } = extractAtomePayload(params);
        const resolvedPayload = mergeDefaults ? { ...defaults, ...payload } : { ...payload };
        const instance = new AtomeCtor(resolvedPayload);
        return {
            elementId: instance.element ? instance.element.id : null,
            tag: instance.tag ?? null,
            params: resolvedPayload
        };
    },
    'atome.box'(params = {}) {
        const { defaults, AtomeCtor } = ensureAtomeContext();
        const { mergeDefaults, payload } = extractAtomePayload(params);
        const resolvedPayload = mergeDefaults ? { ...defaults, ...payload } : { ...payload };
        const instance = typeof AtomeCtor.box === 'function'
            ? AtomeCtor.box({ ...payload, mergeDefaults })
            : new AtomeCtor(resolvedPayload);
        return {
            elementId: instance.element ? instance.element.id : null,
            tag: instance.tag ?? null,
            params: resolvedPayload
        };
    },
    'atome.describe'() {
        const { defaults } = ensureAtomeContext();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            defaults,
            methods: Object.keys(atomeMCPHandlers),
            async_methods: [
                'ai.tools.call',
                'mcp.tools.list',
                'mcp.resources.list',
                'mcp.resources.read',
                'mcp.prompts.list',
                'mcp.prompts.get',
                'mcp.acl.list',
                'mcp.proposals.list',
                'mcp.proposals.read',
                'mcp.confirmations.list',
                'mcp.confirmations.read',
                'mcp.rate_limits.list',
                'mcp.security.journal.list',
                'mcp.toolchains.execute',
                'mcp.operations.list',
                'mcp.operations.read',
                'mcp.operations.cancel',
                'mcp.events.list',
                'mail.list',
                'mail.read',
                'mail.search',
                'mail.next_unread',
                'mail.summarize',
                'mail.reply_draft',
                'mail.mark_read',
                'mail.mark_unread',
                'mail.archive',
                'mail.delete',
                'mail.send',
                'contacts.sources',
                'contacts.list',
                'contacts.search',
                'contacts.read',
                'contacts.import_macos',
                'contacts.import_icloud',
                'contacts.push_icloud',
                'contacts.create',
                'contacts.update',
                'contacts.delete',
                'calendar.sources',
                'calendar.search',
                'calendar.today',
                'calendar.next',
                'calendar.create',
                'calendar.update',
                'calendar.delete',
                'bank.accounts',
                'bank.balance',
                'bank.transactions',
                'bank.summary',
                'bank.search_transactions',
                'bank.find_payer',
                'bank.spending_by_period',
                'bank.top_merchants',
                'bank.recurring_payments',
                'runtime.tools.list',
                'runtime.tools.call',
                'runtime.tools.batch_call',
                'runtime.audit.list'
            ]
        };
    },
    async 'mcp.tools.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools: await listUnifiedMcpTools()
        };
    },
    'mcp.resources.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            resources: listMcpResourceEntries()
        };
    },
    async 'mcp.resources.read'(params = {}) {
        const uri = params?.uri || params?.resource || params?.resource_uri;
        return {
            protocol: ATOME_MCP_PROTOCOL,
            uri: String(uri || '').trim() || null,
            content: await readMcpResource(uri, params)
        };
    },
    'mcp.prompts.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            prompts: listMcpPromptEntries()
        };
    },
    'mcp.prompts.get'(params = {}) {
        const name = params?.name || params?.prompt || params?.prompt_name;
        return renderPrompt(name, params);
    },
    'mcp.acl.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            acl: listAclRules()
        };
    },
    'mcp.proposals.list'(params = {}) {
        const status = params?.status ? String(params.status) : null;
        const proposals = Array.from(mcpProposals.values())
            .filter((entry) => !status || entry.status === status)
            .slice(-50)
            .map((entry) => cloneValue(entry));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            proposals
        };
    },
    'mcp.proposals.read'(params = {}) {
        const proposalId = String(params?.proposal_id || params?.proposalId || params?.id || '').trim();
        const entry = mcpProposals.get(proposalId);
        if (!entry) {
            throw new Error(`Unknown MCP proposal: ${proposalId}`);
        }
        return {
            protocol: ATOME_MCP_PROTOCOL,
            proposal: cloneValue(entry)
        };
    },
    'mcp.confirmations.list'(params = {}) {
        const status = params?.status ? String(params.status) : null;
        const confirmations = Array.from(mcpConfirmations.values())
            .filter((entry) => !status || entry.status === status)
            .slice(-50)
            .map((entry) => cloneValue(entry));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            confirmations
        };
    },
    'mcp.confirmations.read'(params = {}) {
        const confirmationId = String(params?.confirmation_id || params?.confirmationId || params?.id || '').trim();
        const entry = mcpConfirmations.get(confirmationId);
        if (!entry) {
            throw new Error(`Unknown MCP confirmation: ${confirmationId}`);
        }
        return {
            protocol: ATOME_MCP_PROTOCOL,
            confirmation: cloneValue(entry)
        };
    },
    'mcp.rate_limits.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            rules: listRateLimitRules()
        };
    },
    'mcp.security.journal.list'(params = {}) {
        const type = params?.type ? String(params.type) : null;
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        const items = mcpSecurityJournal
            .filter((entry) => !type || entry.type === type)
            .slice(-limit)
            .map((entry) => cloneValue(entry));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            items
        };
    },
    async 'mcp.toolchains.execute'(params = {}) {
        const steps = Array.isArray(params?.steps) ? params.steps : [];
        if (!steps.length) {
            throw new Error('Missing toolchain steps');
        }
        const reportProgress = typeof params?.__mcp?.reportProgress === 'function'
            ? params.__mcp.reportProgress
            : () => {};

        if (steps.every((step) => String(step?.method || '').trim() === 'runtime.tools.call')) {
            reportProgress({
                ratio: 0.25,
                phase: 'toolchain.batch'
            });
            const result = await atomeMCPHandlers['runtime.tools.batch_call']({
                events: steps.map((step) => ({
                    ...(step?.params && typeof step.params === 'object' ? step.params : {})
                })),
                __mcp: params.__mcp
            });
            reportProgress({
                ratio: 1,
                phase: 'toolchain.completed'
            });
            return {
                ok: true,
                mode: 'runtime_batch',
                count: steps.length,
                result
            };
        }

        const results = [];
        for (let index = 0; index < steps.length; index += 1) {
            const step = steps[index];
            const method = String(step?.method || '').trim();
            if (!method || !hasOwn.call(atomeMCPHandlers, method) || method === 'mcp.toolchains.execute') {
                throw new Error(`Invalid toolchain step: ${method || '<empty>'}`);
            }
            const stepParams = step?.params && typeof step.params === 'object'
                ? { ...step.params }
                : {};
            if (params?.__mcp) {
                stepParams.__mcp = params.__mcp;
            }
            const result = await atomeMCPHandlers[method](stepParams);
            results.push({
                index,
                method,
                result
            });
            reportProgress({
                ratio: (index + 1) / steps.length,
                phase: 'toolchain.step',
                detail: {
                    index,
                    method
                }
            });
        }
        return {
            ok: true,
            mode: 'sequential',
            count: results.length,
            steps: results
        };
    },
    'mcp.operations.list'(params = {}) {
        const status = params?.status ? String(params.status) : null;
        const method = params?.method ? String(params.method) : null;
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        const operations = Array.from(mcpOperations.values())
            .filter((entry) => (!status || entry.status === status) && (!method || entry.method === method))
            .slice(-limit)
            .map((entry) => ({
                operation_id: entry.operation_id,
                request_id: entry.request_id,
                method: entry.method,
                status: entry.status,
                progress_ratio: entry.progress_ratio,
                progress_phase: entry.progress_phase,
                started_at: entry.started_at,
                updated_at: entry.updated_at,
                completed_at: entry.completed_at,
                cancel_requested_at: entry.cancel_requested_at,
                result: cloneValue(entry.result),
                error: entry.error
            }));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            operations
        };
    },
    'mcp.operations.read'(params = {}) {
        const operationId = String(params?.operation_id || params?.operationId || params?.id || '').trim();
        const entry = mcpOperations.get(operationId);
        if (!entry) {
            throw new Error(`Unknown MCP operation: ${operationId}`);
        }
        return {
            protocol: ATOME_MCP_PROTOCOL,
            operation: {
                operation_id: entry.operation_id,
                request_id: entry.request_id,
                method: entry.method,
                status: entry.status,
                progress_ratio: entry.progress_ratio,
                progress_phase: entry.progress_phase,
                started_at: entry.started_at,
                updated_at: entry.updated_at,
                completed_at: entry.completed_at,
                cancel_requested_at: entry.cancel_requested_at,
                result: cloneValue(entry.result),
                error: entry.error
            }
        };
    },
    'mcp.operations.cancel'(params = {}) {
        const operationId = params?.operation_id || params?.operationId || params?.id;
        return cancelOperationRecord(operationId);
    },
    'mcp.events.list'(params = {}) {
        const type = params?.type ? String(params.type) : null;
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        const events = mcpEvents
            .filter((entry) => !type || entry.type === type)
            .slice(-limit)
            .map((entry) => cloneValue(entry));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            events
        };
    },
    'ai.tools.list'() {
        const agent = ensureAIAgent();
        const tools = agent.listTools();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools
        };
    },
    async 'ai.tools.call'(params = {}) {
        const agent = ensureAIAgent();
        if (typeof agent.callTool !== 'function') {
            throw new Error('AtomeAI.callTool is not available');
        }

        const request = {
            tool_name: params.tool_name || params.name || params.tool,
            params: params.params || {},
            actor: params.actor || {},
            signals: params.signals || {},
            source: (params?.source && typeof params.source === 'object')
                ? params.source
                : { type: 'mcp', layer: 'atome_mcp_ai_call' },
            idempotency_key: params.idempotency_key || null,
            trace_id: params.trace_id || null,
            intent_id: params.intent_id || null,
            dry_run: params.dry_run === true
        };

        return agent.callTool(request);
    },
    'ai.audit.list'(params = {}) {
        const agent = ensureAIAgent();
        const limit = Number.isFinite(params?.limit) ? params.limit : 20;
        if (!agent.audit || typeof agent.audit.list !== 'function') {
            throw new Error('AtomeAI.audit.list is not available');
        }
        return agent.audit.list({ limit });
    },
    async 'runtime.tools.list'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        if (typeof runtime.listTools !== 'function') {
            throw new Error('Runtime V2 listTools is not available');
        }
        const tools = await runtime.listTools({
            includeDisabled: params?.includeDisabled === true
        });
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools: Array.isArray(tools) ? tools.map((entry) => normalizeRuntimeToolEntry(entry)) : []
        };
    },
    async 'runtime.tools.call'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        const payload = buildRuntimeInvocationPayload(params, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_runtime_call'
        });
        return runtime.invokeById(payload);
    },
    async 'runtime.tools.batch_call'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        if (typeof runtime.invokeBatch !== 'function') {
            throw new Error('Runtime V2 invokeBatch is not available');
        }
        const events = Array.isArray(params?.events) ? params.events : [];
        const normalizedEvents = events.map((entry) => buildRuntimeInvocationPayload(entry, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_runtime_batch_call'
        }));
        return runtime.invokeBatch(normalizedEvents, {
            tx_id: String(params?.tx_id || params?.txId || '').trim() || undefined
        });
    },
    'runtime.audit.list'(params = {}) {
        const bus = ensureRuntimeCommandBus();
        const events = bus.listEvents({
            fromSeq: Number.isFinite(Number(params?.fromSeq)) ? Number(params.fromSeq) : undefined,
            kind: params?.kind ? String(params.kind) : undefined,
            trace_id: params?.trace_id ? String(params.trace_id) : undefined,
            tool_id: params?.tool_id ? String(params.tool_id) : undefined,
            source: params?.source ? String(params.source) : undefined,
            source_layer: params?.source_layer ? String(params.source_layer) : undefined
        });
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        return {
            protocol: ATOME_MCP_PROTOCOL,
            events: Array.isArray(events) ? events.slice(-limit) : []
        };
    },
    'mail.list'(params = {}) {
        const mail = ensureMailApi();
        return mail.list(params);
    },
    'mail.read'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.read(messageId);
    },
    'mail.search'(params = {}) {
        const mail = ensureMailApi();
        const query = params?.query || params?.q || '';
        return mail.search(query, params);
    },
    'mail.next_unread'(params = {}) {
        const mail = ensureMailApi();
        return mail.nextUnread(params);
    },
    'mail.summarize'(params = {}) {
        const mail = ensureMailApi();
        return mail.summarize(params);
    },
    'mail.reply_draft'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.replyDraft(messageId, {
            reply_text: params?.reply_text || params?.replyText || params?.text || '',
            signature: params?.signature || '',
            to: params?.to
        });
    },
    'mail.mark_read'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.markRead(messageId, { read: true });
    },
    'mail.mark_unread'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.markUnread(messageId, { read: false });
    },
    'mail.archive'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.archive(messageId, params || {});
    },
    'mail.delete'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.delete(messageId, params || {});
    },
    'mail.send'(params = {}) {
        const mail = ensureMailApi();
        const draftId = params?.draft_id || params?.draftId || params?.id;
        return mail.send(draftId, {
            confirmed: params?.confirmed === true
        });
    },
    async 'contacts.sources'() {
        const contacts = await prepareContactsApi();
        return contacts.sources();
    },
    async 'contacts.list'(params = {}) {
        const contacts = await prepareContactsApi();
        return contacts.list(params || {});
    },
    async 'contacts.search'(params = {}) {
        const contacts = await prepareContactsApi();
        const query = params?.query || params?.q || '';
        return contacts.search(query, params || {});
    },
    async 'contacts.read'(params = {}) {
        const contacts = await prepareContactsApi();
        const contactId = params?.contact_id || params?.contactId || params?.id;
        return contacts.read(contactId);
    },
    async 'contacts.create'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.createLocalContact !== 'function') {
            throw new Error('Contacts create API is not available');
        }
        const contact = params?.contact && typeof params.contact === 'object'
            ? { ...params.contact }
            : { ...params };
        delete contact.contact;
        return contacts.createLocalContact(contact, params || {});
    },
    async 'contacts.update'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.updateLocalContact !== 'function') {
            throw new Error('Contacts update API is not available');
        }
        const contactId = params?.contact_id || params?.contactId || params?.id;
        const changes = params?.changes && typeof params.changes === 'object'
            ? { ...params.changes }
            : params?.contact && typeof params.contact === 'object'
                ? { ...params.contact }
            : { ...params };
        delete changes.contact_id;
        delete changes.contactId;
        delete changes.id;
        delete changes.changes;
        delete changes.contact;
        return contacts.updateLocalContact(contactId, changes, params || {});
    },
    async 'contacts.delete'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.deleteLocalContact !== 'function') {
            throw new Error('Contacts delete API is not available');
        }
        const contactId = params?.contact_id || params?.contactId || params?.id;
        return contacts.deleteLocalContact(contactId, params || {});
    },
    async 'contacts.import_macos'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.importMacosContacts !== 'function') {
            throw new Error('Contacts import API is not available');
        }
        return contacts.importMacosContacts(params || {});
    },
    async 'contacts.import_icloud'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.importIcloudContacts !== 'function') {
            throw new Error('iCloud contacts import API is not available');
        }
        return contacts.importIcloudContacts(params || {});
    },
    async 'contacts.push_icloud'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.pushContactToIcloud !== 'function') {
            throw new Error('iCloud contacts write API is not available');
        }
        return contacts.pushContactToIcloud(params || {});
    },
    'calendar.sources'() {
        const calendar = ensureCalendarApi();
        return calendar.sources();
    },
    'calendar.search'(params = {}) {
        const calendar = ensureCalendarApi();
        const query = params?.query || params?.q || '';
        return calendar.search(query, params);
    },
    'calendar.today'(params = {}) {
        const calendar = ensureCalendarApi();
        return calendar.today(params);
    },
    'calendar.next'(params = {}) {
        const calendar = ensureCalendarApi();
        return calendar.next(params);
    },
    'calendar.create'(params = {}) {
        const calendar = ensureCalendarApi();
        const input = params?.event && typeof params.event === 'object'
            ? { ...params.event }
            : { ...params };
        delete input.event;
        return calendar.create(input, params);
    },
    'calendar.update'(params = {}) {
        const calendar = ensureCalendarApi();
        const eventId = params?.event_id || params?.eventId || params?.id;
        const changes = params?.changes && typeof params.changes === 'object'
            ? { ...params.changes }
            : { ...params };
        delete changes.event_id;
        delete changes.eventId;
        delete changes.id;
        delete changes.changes;
        return calendar.update(eventId, changes, params);
    },
    'calendar.delete'(params = {}) {
        const calendar = ensureCalendarApi();
        const eventId = params?.event_id || params?.eventId || params?.id;
        return calendar.delete(eventId, params || {});
    },
    'bank.accounts'() {
        const bank = ensureBankApi();
        return bank.accounts();
    },
    'bank.balance'(params = {}) {
        const bank = ensureBankApi();
        return bank.balance(params);
    },
    'bank.transactions'(params = {}) {
        const bank = ensureBankApi();
        return bank.transactions(params);
    },
    'bank.summary'(params = {}) {
        const bank = ensureBankApi();
        return bank.summary(params);
    },
    'bank.search_transactions'(params = {}) {
        const bank = ensureBankApi();
        const query = params?.query || params?.q || '';
        return bank.searchTransactions(query, params);
    },
    'bank.find_payer'(params = {}) {
        const bank = ensureBankApi();
        const name = params?.name || params?.payer || params?.counterparty || '';
        return bank.findPayer(name, params);
    },
    'bank.spending_by_period'(params = {}) {
        const bank = ensureBankApi();
        return bank.spendingByPeriod(params);
    },
    'bank.top_merchants'(params = {}) {
        const bank = ensureBankApi();
        return bank.topMerchants(params);
    },
    'bank.recurring_payments'(params = {}) {
        const bank = ensureBankApi();
        return bank.recurringPayments(params);
    }
};

function handleAtomeMCPRequest(request = {}) {
    const response = { jsonrpc: '2.0', id: request.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') {
            throw new Error('Invalid MCP payload: missing jsonrpc 2.0 envelope');
        }
        const { method, params } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) {
            throw new Error(`Unknown MCP method: ${method}`);
        }
        const handler = atomeMCPHandlers[method];
        const result = handler(params);
        if (result && typeof result.then === 'function') {
            throw new Error('Async MCP method called via sync handler. Use handleAtomeMCPRequestAsync.');
        }
        response.result = result;
    } catch (error) {
        response.error = {
            code: -32000,
            message: error && error.message ? error.message : 'Unhandled MCP error'
        };
    }
    return response;
}

async function handleAtomeMCPRequestAsync(request = {}) {
    const response = { jsonrpc: '2.0', id: request.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') {
            throw new Error('Invalid MCP payload: missing jsonrpc 2.0 envelope');
        }
        const { method, params } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) {
            throw new Error(`Unknown MCP method: ${method}`);
        }
        const actor = resolveActorProfile(params || {});
        const access = resolveAccessPolicy(method, params || {});
        if (access.allowed !== true) {
            pushSecurityJournal('access_denied', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method,
                error: access.error || 'mcp_access_denied'
            });
            throw new Error(access.error || 'mcp_access_denied');
        }
        if (!hasActorCapability(actor, access.required_capabilities)) {
            pushSecurityJournal('capability_denied', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method,
                required_capabilities: access.required_capabilities || []
            });
            throw new Error('mcp_capability_denied');
        }
        if (!hasSandboxProfile(actor, access.sandbox_profile)) {
            pushSecurityJournal('sandbox_denied', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method,
                sandbox_profile: access.sandbox_profile || null
            });
            throw new Error('mcp_sandbox_denied');
        }
        const idempotentRecord = readIdempotencyRecord(method, params || {}, access);
        if (idempotentRecord) {
            pushSecurityJournal('idempotency_hit', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method
            });
            pushMcpEvent('mcp.idempotency.hit', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method
            });
            response.result = cloneValue(idempotentRecord.result);
            return response;
        }
        const rateLimit = consumeRateLimit(method, params || {}, access, actor);
        if (rateLimit.ok !== true) {
            response.result = rateLimit.gate;
            return response;
        }
        const confirmation = validateConfirmation(method, params || {}, access, actor);
        if (confirmation.ok !== true) {
            response.result = confirmation.gate;
            return response;
        }
        const operation = createOperationRecord(method, params, request.id != null ? request.id : null);
        if (access.sensitive === true) {
            pushSecurityJournal('operation_started', {
                actor_id: actor.actor_id,
                operation_id: operation.operation_id,
                method,
                subject: access.subject || method
            });
        }
        const handlerParams = params && typeof params === 'object'
            ? { ...params }
            : {};
        handlerParams.actor = handlerParams.actor && typeof handlerParams.actor === 'object'
            ? handlerParams.actor
            : actor;
        handlerParams.__mcp = {
            operation_id: operation.operation_id,
            signal: operation.controller?.signal || null,
            access,
            reportProgress(progress = {}) {
                const normalized = progress && typeof progress === 'object'
                    ? progress
                    : { ratio: Number(progress) };
                reportOperationProgress(operation.operation_id, normalized);
            }
        };
        reportOperationProgress(operation.operation_id, {
            ratio: 0.1,
            phase: 'running'
        });

        const execute = async () => {
            try {
                const result = await atomeMCPHandlers[method](handlerParams);
                if (operation.controller?.signal?.aborted === true && operation.status === 'cancel_requested') {
                    finalizeCancelledOperation(operation.operation_id);
                    if (access.sensitive === true) {
                        pushSecurityJournal('operation_cancelled', {
                            actor_id: actor.actor_id,
                            operation_id: operation.operation_id,
                            method,
                            subject: access.subject || method
                        });
                    }
                    return {
                        ok: false,
                        error: 'mcp_operation_cancelled',
                        operation_id: operation.operation_id
                    };
                }
                completeOperationRecord(operation.operation_id, result);
                writeIdempotencyRecord(method, params || {}, access, result);
                if (access.sensitive === true) {
                    pushSecurityJournal('operation_completed', {
                        actor_id: actor.actor_id,
                        operation_id: operation.operation_id,
                        method,
                        subject: access.subject || method,
                        result: summarizeResult(result)
                    });
                }
                return result;
            } catch (error) {
                if (operation.controller?.signal?.aborted === true && operation.status === 'cancel_requested') {
                    finalizeCancelledOperation(operation.operation_id);
                    if (access.sensitive === true) {
                        pushSecurityJournal('operation_cancelled', {
                            actor_id: actor.actor_id,
                            operation_id: operation.operation_id,
                            method,
                            subject: access.subject || method
                        });
                    }
                    return {
                        ok: false,
                        error: 'mcp_operation_cancelled',
                        operation_id: operation.operation_id
                    };
                }
                failOperationRecord(operation.operation_id, error);
                if (access.sensitive === true) {
                    pushSecurityJournal('operation_failed', {
                        actor_id: actor.actor_id,
                        operation_id: operation.operation_id,
                        method,
                        subject: access.subject || method,
                        error: error?.message || String(error)
                    });
                }
                throw error;
            }
        };

        if (params?.defer === true) {
            execute().catch(() => {});
            response.result = {
                ok: true,
                deferred: true,
                operation_id: operation.operation_id
            };
            return response;
        }

        const result = await execute();
        response.result = result;
    } catch (error) {
        response.error = {
            code: -32000,
            message: error && error.message ? error.message : 'Unhandled MCP error'
        };
    }
    return response;
}

if (typeof globalThis !== 'undefined') {
    globalThis.handleAtomeMCPRequest = handleAtomeMCPRequest;
    globalThis.handleAtomeMCPRequestAsync = handleAtomeMCPRequestAsync;
}
