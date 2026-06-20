import { cloneValue } from './mcp_core.js';
import { listMcpPromptEntries, listMcpResourceEntries } from './mcp_resources.js';
import { normalizeRuntimeToolIdentifier } from './mcp_runtime.js';

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

export function resolveResourceCapability(uri = '') {
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

export function resolvePromptCapability(name = '') {
    const normalized = String(name || '').trim();
    if (normalized.startsWith('mail_')) return ['mail.read'];
    if (normalized.startsWith('contacts_')) return ['contacts.read'];
    if (normalized.startsWith('calendar_')) return ['calendar.read'];
    if (normalized.startsWith('bank_')) return ['bank.read'];
    if (normalized.startsWith('voice_')) return ['voice.read'];
    return ['mcp.read'];
}

export function listRateLimitRules() {
    return MCP_RATE_LIMIT_RULES.map((entry) => cloneValue(entry));
}

export function resolveRateLimitRule(method, params = {}, policy = {}) {
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

const SENSITIVE_RUNTIME_TOOL_PATTERNS = [
    /^ui\.capture\./,
    /^ui\.detail\.record\.toggle$/,
    /^ui\.automation$/
];

export function isSensitiveRuntimeTool(toolId = '') {
    const normalized = String(toolId || '').trim();
    return SENSITIVE_RUNTIME_TOOL_PATTERNS.some((pattern) => pattern.test(normalized));
}

const resolveTimelineToolCapability = (toolName = '') => {
    const normalized = String(toolName || '').trim();
    if (normalized === 'eve.timeline.read' || normalized === 'ui.timeline.read') return ['timeline.read'];
    if (normalized.startsWith('eve.timeline.') || normalized.startsWith('ui.timeline.')) return ['timeline.write'];
    return null;
};

export function sanitizeConfirmationParams(params = {}) {
    const cloned = params && typeof params === 'object' ? { ...params } : {};
    delete cloned.__mcp;
    delete cloned.confirmed;
    delete cloned.confirmation_id;
    delete cloned.confirmationId;
    return cloneValue(cloned) || {};
}

export function listAclRules() {
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
                subject: 'mcp.toolchains.execute:sensitive_step',
                access: 'confirm',
                required_capabilities: ['runtime.execute', 'runtime.sensitive'],
                sandbox_profile: 'desktop_local_owner'
            },
            { subject: 'eve.timeline.read', access: 'allow', required_capabilities: ['timeline.read'] },
            { subject: 'eve.timeline.*', access: 'allow', required_capabilities: ['timeline.write'] },
            { subject: 'ui.timeline.read', access: 'allow', required_capabilities: ['timeline.read'] },
            { subject: 'ui.timeline.*', access: 'allow', required_capabilities: ['timeline.write'] }
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

export function resolveAccessPolicy(method, params = {}) {
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
        const timelineCapabilities = resolveTimelineToolCapability(toolId);
        if (timelineCapabilities) {
            return {
                ...defaultPolicy,
                scope: 'tool',
                subject: `runtime.tools.call:${toolId}`,
                required_capabilities: timelineCapabilities,
                idempotent: timelineCapabilities.includes('timeline.write')
            };
        }
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
        const toolName = String(params?.tool_name || params?.name || params?.tool || '').trim();
        const timelineCapabilities = resolveTimelineToolCapability(toolName);
        if (timelineCapabilities) {
            return {
                ...defaultPolicy,
                scope: 'tool',
                subject: toolName,
                required_capabilities: timelineCapabilities,
                idempotent: timelineCapabilities.includes('timeline.write')
            };
        }
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
