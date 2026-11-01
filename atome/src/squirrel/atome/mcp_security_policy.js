import { PERSONAL_IMPORT_TOOLS } from '#shared/personal_import_tools.js';
import { MCP_CONFIRMED_CONTRACT_COMMANDS, MCP_CONTRACT_COMMANDS, findContractCommand } from './mcp_contract_families.js';
import { cloneValue } from './mcp_core.js';
import { isMcpResourceUri, listMcpPromptEntries, listMcpResourceEntries } from './mcp_resources.js';
import { normalizeRuntimeToolIdentifier } from './mcp_runtime.js';
import { MEDIA_CAPTURE_CAPABILITY } from './mcp_transport.js';
import { RISK_TIERS } from '../ai/agent_gateway_state.js';
import { TIMELINE_AI_RUNTIME_TOOL_IDS } from '../ai/timeline_tool_ids.js';
const CONFIRMED_COMMANDS = MCP_CONFIRMED_CONTRACT_COMMANDS;
// Commands that turn a camera or a microphone on: `media.capture` and the person's yes (architecture §6.1).
const MEDIA_CAPTURE_COMMANDS = Object.freeze(['captures.start', 'media_import.camera', 'media_import.take', 'audio_fx.start']);
const MEDIA_CAPTURE_RUNTIME_TOOL_PATTERNS = [/^ui\.capture\./, /^ui\.detail\.record\.toggle$/, /^ui\.timeline\.record\.start$/];
// A consent the actor would give itself (body data, motion recordings) waits for the person; withdrawing one never waits.
const CONSENT_COMMANDS = Object.freeze(['body_data.set_consent', 'sensors.set_consent']);
// The assistant's risk tiers (ai/agent_gateway_state.js RISK_TIERS) from which a call waits for the person.
const CONFIRMED_AI_TIERS = Object.freeze(['moderate', 'high', 'irreversible']);
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
    if (normalizedMethod === 'mail.send' || normalizedMethod === 'communication.send') {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'mail.send') || null;
    }
    if (['calendar.create', 'calendar.update', 'calendar.delete', 'calendar.share'].includes(normalizedMethod)) {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'calendar.write') || null;
    }
    if (
        normalizedMethod === 'runtime.tools.call'
        && isSensitiveRuntimeTool(normalizeRuntimeToolIdentifier(params))
    ) {
        return MCP_RATE_LIMIT_RULES.find((entry) => entry.id === 'runtime.sensitive') || null;
    }
    return null;
}

const SENSITIVE_RUNTIME_TOOL_PATTERNS = [
    /^ui\.automation$/
];

export function isSensitiveRuntimeTool(toolId = '') {
    const normalized = String(toolId || '').trim();
    return SENSITIVE_RUNTIME_TOOL_PATTERNS.some((pattern) => pattern.test(normalized));
}

const isMediaCaptureRuntimeTool = (toolId = '') => MEDIA_CAPTURE_RUNTIME_TOOL_PATTERNS.some(pattern => pattern.test(String(toolId || '').trim()));

const resolveTimelineToolCapability = (toolName = '') => {
    const normalized = String(toolName || '').trim();
    if (normalized === 'ui.timeline.read') return ['timeline.read'];
    if (normalized.startsWith('ui.timeline.')) return ['timeline.write'];
    return null;
};

export function sanitizeConfirmationParams(params = {}) {
    const cloned = params && typeof params === 'object' ? { ...params } : {};
    delete cloned.__mcp;
    delete cloned.confirmed;
    delete cloned.confirmation_id;
    return cloneValue(cloned) || {};
}

const allow = (subject, required, extra = {}) => ({ allowed: true, scope: 'tool', subject, access: 'allow',
    required_capabilities: required, confirmation_required: false, proposal_required: false, sandbox_profile: null,
    sensitive: false, idempotent: false, ...extra });
const confirm = (subject, required, extra = {}) => allow(subject, required, { access: 'confirm', confirmation_required: true,
    proposal_required: true, sensitive: true, idempotent: true, ...extra });
const deny = (scope, subject, error) => ({ allowed: false, scope, subject: subject || null, error });
const withConfirmation = policy => ({ ...policy, access: 'confirm', confirmation_required: true, proposal_required: true,
    sensitive: true, idempotent: true });

const CALENDAR_WRITES = ['calendar.create', 'calendar.update', 'calendar.delete', 'calendar.share'];
const CONTACT_WRITES = ['contacts.import_icloud', 'contacts.create', 'contacts.update'];
const MAIL_WRITES = ['mail.delete', 'mail.archive', 'communication.reply_draft'];
const COMMUNICATION_READS = ['communication.list', 'communication.search', 'communication.read'];

// One contract command, whatever its door (its own method, runtime.tools.call, a toolchain step).
function contractPolicy(contract, input = {}) {
    const capture = MEDIA_CAPTURE_COMMANDS.includes(contract.name);
    const consent = CONSENT_COMMANDS.includes(contract.name) && input?.granted === true;
    const policy = allow(contract.name, [contract.capability, ...(capture ? [MEDIA_CAPTURE_CAPABILITY] : [])], {
        ...(contract.name.startsWith('social.') ? { idempotent: contract.name !== 'social.connect' } : {}),
        ...(contract.access === 'write' && /^(apple_music|music)\./.test(contract.name) ? { idempotent: true } : {}) });
    if (!CONFIRMED_COMMANDS.includes(contract.name) && !capture && !consent) return policy;
    return { ...withConfirmation(policy), proposal_required: contract.name === 'social.publish',
        idempotent: policy.idempotent };
}

function runtimeToolPolicy(toolId, input = {}) {
    if (PERSONAL_IMPORT_TOOLS.some(tool => tool.name === toolId)) return resolveAccessPolicy(toolId, input);
    const contract = findContractCommand(toolId);
    if (contract) return contractPolicy(contract, input);
    if (toolId.startsWith('tv.')) return allow(toolId, ['tv.control']);
    const subject = `runtime.tools.call:${toolId || 'unknown'}`;
    const timeline = resolveTimelineToolCapability(toolId);
    if (isMediaCaptureRuntimeTool(toolId)) {
        return confirm(subject, ['runtime.execute', ...(timeline || []), MEDIA_CAPTURE_CAPABILITY], { sandbox_profile: 'desktop_local_owner' });
    }
    if (timeline) return allow(subject, timeline, { idempotent: timeline.includes('timeline.write') });
    if (isSensitiveRuntimeTool(toolId)) {
        return confirm(subject, ['runtime.execute', 'runtime.sensitive'], { sandbox_profile: 'desktop_local_owner' });
    }
    return allow(subject, ['runtime.execute']);
}

// An assistant tool: its runtime twin's policy (eve.timeline.* → ui.timeline.*), and the person's yes from `moderate` up.
function aiToolPolicy(name, tool) {
    if (!tool) return deny('tool', name, 'mcp_ai_tool_unknown');
    if (!RISK_TIERS.includes(tool.risk_tier)) return deny('tool', name, 'mcp_ai_tool_risk_tier_invalid');
    const twin = TIMELINE_AI_RUNTIME_TOOL_IDS[name];
    const policy = { ...(twin ? runtimeToolPolicy(twin, {}) : allow(name, ['ai.execute'])), subject: name };
    return CONFIRMED_AI_TIERS.includes(tool.risk_tier) && !policy.confirmation_required ? withConfirmation(policy) : policy;
}

export function listAclRules() {
    const rule = policy => ({ subject: policy.subject, access: policy.access, required_capabilities: policy.required_capabilities,
        ...(policy.sandbox_profile ? { sandbox_profile: policy.sandbox_profile } : {}) });
    return {
        tools: [
            ...['mail.send', 'communication.send', ...MAIL_WRITES, ...CALENDAR_WRITES, 'contacts.push_icloud', 'contacts.delete', ...CONTACT_WRITES]
                .map(name => rule(resolveAccessPolicy(name, {}))),
            ...MCP_CONTRACT_COMMANDS.map(command => rule(contractPolicy(command, { granted: true }))),
            ...['ui.capture.*', 'ui.detail.record.toggle', 'ui.timeline.record.start', 'ui.automation', 'ui.timeline.read', 'ui.timeline.*']
                .map(toolId => rule(runtimeToolPolicy(toolId, {})))
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

const CONDITION_READS = new Set(['conditions.evaluate', 'conditions.properties.discover', 'conditions.query.once',
    'conditions.computed.list', 'conditions.lists.list', 'conditions.lists.get', 'conditions.lists.resolve',
    'conditions.sets.list', 'conditions.sets.get', 'conditions.bindings.list', 'conditions.bindings.evaluate']);
const METHOD_CAPABILITIES = Object.freeze({
    'mcp.security.journal.list': ['mcp.security.read'], 'runtime.tools.list': ['runtime.read'], 'runtime.audit.list': ['runtime.read'],
    'ai.tools.list': ['ai.read'], 'ai.audit.list': ['audit.read'], 'mcp.toolchains.execute': ['mcp.read'],
    'atome.create': ['runtime.execute'], 'atome.box': ['runtime.execute']
});

/** The policy of one request, before any effect. `context.aiTool`: the assistant tool an `ai.tools.call`
 *  names, resolved by the entry (mcp.js) from AtomeAI.getTool. */
export function resolveAccessPolicy(method, params = {}, context = {}) {
    const name = String(method || '').trim();
    const read = required => ({ ...allow(name, required), scope: 'method' });
    if (CONDITION_READS.has(name)) return read(['conditions.read']);
    if (/^conditions\.(sets|bindings|computed|lists)\./.test(name)) return confirm(name, ['conditions.write']);
    if (name === 'mcp.resources.read') {
        const uri = String(params?.uri || '').trim();
        return isMcpResourceUri(uri)
            ? { ...allow(uri, resolveResourceCapability(uri)), scope: 'resource' } : deny('resource', uri, 'mcp_resource_forbidden');
    }
    if (name === 'mcp.prompts.get') {
        const prompt = String(params?.name || '').trim();
        return listMcpPromptEntries().some(entry => entry.name === prompt)
            ? { ...allow(prompt, resolvePromptCapability(prompt)), scope: 'prompt' } : deny('prompt', prompt, 'mcp_prompt_forbidden');
    }
    if (METHOD_CAPABILITIES[name]) return read(METHOD_CAPABILITIES[name]);
    // A mail leaves only on the person's yes, by whichever method it is sent.
    if (name === 'mail.send' || name === 'communication.send') return confirm(name, ['mail.send']);
    if (CALENDAR_WRITES.includes(name)) return confirm(name, name === 'calendar.share' ? ['calendar.write', 'share.write'] : ['calendar.write']);
    const contract = findContractCommand(name);
    if (contract) return contractPolicy(contract, params);
    if (name.startsWith('tv.')) return allow(name, ['tv.control']);
    if (name === 'runtime.tools.call') return runtimeToolPolicy(normalizeRuntimeToolIdentifier(params), params?.input || {});
    if (name === 'runtime.tools.batch_call') {
        const events = Array.isArray(params?.events) ? params.events : [];
        const policies = events.map(entry => runtimeToolPolicy(normalizeRuntimeToolIdentifier(entry), entry?.input || {}));
        const denied = policies.find(policy => policy.allowed !== true);
        if (denied) return denied;
        const sensitive = policies.some(policy => policy.sensitive || policy.confirmation_required);
        const policy = allow(sensitive ? 'runtime.tools.batch_call:sensitive_batch' : name,
            [...new Set(['runtime.execute', ...policies.flatMap(entry => entry.required_capabilities)])],
            { idempotent: policies.some(entry => entry.idempotent) });
        return sensitive ? { ...withConfirmation(policy), sandbox_profile: 'desktop_local_owner' } : policy;
    }
    if (name === 'ai.tools.call') return aiToolPolicy(String(params?.tool_name || '').trim(), context.aiTool || null);
    if (MAIL_WRITES.includes(name)) return allow(name, ['mail.write']);
    if (name.startsWith('mail.') || COMMUNICATION_READS.includes(name)) return allow(name, ['mail.read']);
    if (name === 'contacts.push_icloud' || name === 'contacts.delete') return confirm(name, ['contacts.write']);
    const importTool = PERSONAL_IMPORT_TOOLS.find(tool => tool.name === name);
    if (CONTACT_WRITES.includes(name) || (importTool?.write && name.startsWith('contacts.'))) return allow(name, ['contacts.write']);
    if (name.startsWith('contacts.')) return allow(name, ['contacts.read']);
    if (importTool?.write) return allow(name, ['calendar.write']);
    if (name.startsWith('calendar.')) return allow(name, ['calendar.read']);
    if (name.startsWith('bank.')) return allow(name, ['bank.read']);
    return read(['mcp.read']);
}
