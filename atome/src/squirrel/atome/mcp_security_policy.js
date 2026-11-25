import { PERSONAL_IMPORT_TOOLS } from '#shared/personal_import_tools.js';
import { MCP_CONFIRMED_CONTRACT_COMMANDS, MCP_CONTRACT_COMMANDS, findContractCommand } from './mcp_contract_families.js';
import { CB_CONFIRMED_WHEN, CB_OUTWARD_COMMANDS } from '../cb/contracts.js';
import { cloneValue } from './mcp_core.js';
import { isMcpResourceUri, listMcpPromptEntries, listMcpResourceEntries } from './mcp_resources.js';
import { normalizeRuntimeToolIdentifier } from './mcp_runtime.js';
import { MEDIA_CAPTURE_CAPABILITY } from './mcp_transport.js';
import { RISK_TIERS } from '../ai/agent_gateway_state.js';
import { TIMELINE_AI_RUNTIME_TOOL_IDS } from '../ai/timeline_tool_ids.js';
const CONFIRMED_COMMANDS = MCP_CONFIRMED_CONTRACT_COMMANDS;
// Commands that turn a camera or a microphone on: `media.capture` and the person's yes (architecture §6.1).
const MEDIA_CAPTURE_COMMANDS = Object.freeze(['captures.start', 'media_import.camera', 'media_import.take', 'audio_fx.start']);
const MEDIA_CAPTURE_RUNTIME_TOOL_PATTERNS = [/^ui\.capture\./, /^ui\.detail\.record\.toggle$/, /^ui\.timeline\.record\.start$/,
    // The camera watched (camera_watch.js) opens the camera as a capture does.
    /^camera\.watch$/];
// A consent the actor would give itself (body data, motion recordings) waits for the person; withdrawing one never waits.
const CONSENT_COMMANDS = Object.freeze(['body_data.set_consent', 'sensors.set_consent']);
// The assistant's risk tiers (ai/agent_gateway_state.js RISK_TIERS) from which a call waits for the person.
const CONFIRMED_AI_TIERS = Object.freeze(['moderate', 'high', 'irreversible']);
// What leaves toward other people or the world, moves money or deletes for good (AGENTS.md rule 22): asked by the assistant, only
// these are asked again, in her conversation and in the person's own mode (spoken or typed), never on a screen.
// Everything else the person asked her is done at once (mcp_confirmation_gate.js).
const OUTWARD_COMMANDS = new Set(['mail.send', 'communication.send', 'calendar.share', 'contacts.push_icloud',
    'social.connect', 'social.publish', 'social.reply', 'ordonnance.send', 'ordonnance.sign', 'prescription_aid.send',
    'share.send', 'share.rights', 'events.publish', 'shop.sell', 'shop.buy', 'shop.withdraw', 'coaches.book', 'creation.send',
    'site.publish', 'site.domain_buy', 'site.domain_transfer', 'video_train.share', 'video_train.forward',
    'publish.send', 'publish.send_now', 'forum.post', 'forum.invite', 'billing.topup', 'billing.withdraw',
    'billing.admin_move', 'billing.invite',
    // Permanent deletions, which no history keeps (user, 17 Nov. 2026, « On les ajoute. Oui. »): media deleted for good from
    // the server and every device, a sale deleted for good, a post taken off a network, motion recordings and body data
    // erased with their copies, a health product erased with every intake, a forum with everyone's posts, a book's
    // files, a mail box. A deletion the history keeps (a project, a creation, a list) is done at once.
    'media_import.delete', 'shop.delete', 'social.delete', 'sensors.delete', 'body_data.delete', 'health_products.remove',
    'health_products.list_remove', 'forum.delete', 'books.remove', 'site.mail_remove',
    // The CB sociale (R-173 L6, cahier §8): a call accepted, a bottle launched or answered reach another person, a wider reach
    // sends the voice to more people (user, 19 Nov. 2026); each only when its input asks it (cb/contracts.js CB_CONFIRMED_WHEN).
    ...CB_OUTWARD_COMMANDS]);
const OUTWARD_AI_TIERS = Object.freeze(['high', 'irreversible']);
const outwardOf = subject => OUTWARD_COMMANDS.has(String(subject || '').split(':').pop());
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
    sensitive: false, idempotent: false, outward: outwardOf(subject), ...extra });
const confirm = (subject, required, extra = {}) => allow(subject, required, { access: 'confirm', confirmation_required: true,
    proposal_required: true, sensitive: true, idempotent: true, ...extra });
const deny = (scope, subject, error) => ({ allowed: false, scope, subject: subject || null, error });
const withConfirmation = policy => ({ ...policy, access: 'confirm', confirmation_required: true, proposal_required: true,
    sensitive: true, idempotent: true });

// The document profile (user, 18 Nov. 2026: « Oui ajoute ce profile l'assistant sachant qu'on peut intervenir avec la
// voix ou avec l'input de prompt »): while the person works on one text with Calc on (Créer › Texte), what the assistant
// asks, spoken or typed, names no Atome but that text; '' while it is not filed yet, then none at all. It narrows, it never
// asks: no confirmation is added (AGENTS.md rule 22). The person at the device is not narrowed.
let documentScope = null;
export const setMcpDocumentScope = (atomeId = '') => { documentScope = { atome_id: String(atomeId || '') }; };
export const clearMcpDocumentScope = () => { documentScope = null; };
const ATOME_KEY = /(^|_)atome_ids?$/;
// Every Atome a request names: the values of its `…atome_id` / `…atome_ids` keys, at any depth (a tool's input, a batch's events).
const namedAtomes = (value, found = new Set(), depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 8) return found;
    Object.entries(value).forEach(([key, item]) => {
        if (key === '__mcp') return;
        if (ATOME_KEY.test(key)) [item].flat().forEach(id => { if (typeof id === 'string' && id.trim()) found.add(id.trim()); });
        else namedAtomes(item, found, depth + 1);
    });
    return found;
};
/** `access` narrowed by the document profile for an assistant's request (`assistant`: its transport is voice or ai). */
export function documentScopePolicy(access, params = {}, assistant = false) {
    if (!documentScope || !assistant || access?.allowed !== true) return access;
    if ([...namedAtomes(params)].some(id => id !== documentScope.atome_id)) return deny('document', access.subject, 'mcp_document_scope_denied');
    return { ...access, document_scope: documentScope.atome_id };
}

const CALENDAR_WRITES = ['calendar.create', 'calendar.update', 'calendar.delete', 'calendar.share'];
const CONTACT_WRITES = ['contacts.import_icloud', 'contacts.create', 'contacts.update'];
const MAIL_WRITES = ['mail.delete', 'mail.archive', 'communication.reply_draft'];
const COMMUNICATION_READS = ['communication.list', 'communication.search', 'communication.read'];

// One contract command, whatever its door (its own method, runtime.tools.call, a toolchain step).
function contractPolicy(contract, input = {}) {
    const capture = MEDIA_CAPTURE_COMMANDS.includes(contract.name);
    // A consent the actor would give itself, or a command confirmed for such an input only (a CB call accepted, not refused).
    const consent = (CONSENT_COMMANDS.includes(contract.name) && input?.granted === true) || CB_CONFIRMED_WHEN[contract.name]?.(input) === true;
    const policy = allow(contract.name, [contract.capability, ...(capture ? [MEDIA_CAPTURE_CAPABILITY] : [])], {
        // A connection and a reply (each one a new message on the network) are never replayed.
        ...(contract.name.startsWith('social.') ? { idempotent: !['social.connect', 'social.reply'].includes(contract.name) } : {}),
        ...(contract.access === 'write' && /^(apple_music|music)\./.test(contract.name) ? { idempotent: true } : {}),
        // A command outward for some inputs only (a call accepted, a reach widened) is outward for those alone.
        ...(CB_CONFIRMED_WHEN[contract.name] ? { outward: CB_CONFIRMED_WHEN[contract.name](input) === true } : {}) });
    if (!CONFIRMED_COMMANDS.includes(contract.name) && !capture && !consent) return policy;
    return { ...withConfirmation(policy), proposal_required: contract.name === 'social.publish',
        idempotent: policy.idempotent };
}

function runtimeToolPolicy(toolId, input = {}) {
    if (PERSONAL_IMPORT_TOOLS.some(tool => tool.name === toolId)) return resolveAccessPolicy(toolId, input);
    const contract = findContractCommand(toolId);
    if (contract) return contractPolicy(contract, input);
    // A timed run is its tool's run, later (timed_tool_runs.js): the tool's own policy, and an outward one is always asked.
    if (toolId === 'timer.schedule') {
        const target = runtimeToolPolicy(String(input?.tool || '').trim(), input?.input || {});
        if (target.allowed === false) return target;
        const policy = { ...target, subject: 'runtime.tools.call:timer.schedule',
            required_capabilities: [...new Set(['runtime.execute', ...target.required_capabilities])] };
        return policy.outward && !policy.confirmation_required ? withConfirmation(policy) : policy;
    }
    // A programmed task runs later with nobody asked again (eVe/voice/assistant/assistant_task.js): asked of the assistant it is
    // the person's request, done at once; asked by another program, the person says yes to it first.
    if (toolId === 'assistant.task.schedule') {
        return confirm(`runtime.tools.call:${toolId}`, ['runtime.execute'], { proposal_required: false, idempotent: false });
    }
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
    if (OUTWARD_AI_TIERS.includes(tool.risk_tier) || outwardOf(name)) policy.outward = true;
    return CONFIRMED_AI_TIERS.includes(tool.risk_tier) && !policy.confirmation_required ? withConfirmation(policy) : policy;
}

export function listAclRules() {
    const rule = policy => ({ subject: policy.subject, access: policy.access, required_capabilities: policy.required_capabilities,
        ...(policy.sandbox_profile ? { sandbox_profile: policy.sandbox_profile } : {}) });
    return {
        tools: [
            ...['mail.send', 'communication.send', ...MAIL_WRITES, ...CALENDAR_WRITES, 'contacts.push_icloud', 'contacts.delete', ...CONTACT_WRITES]
                .map(name => rule(resolveAccessPolicy(name, {}))),
            // Each command at its strictest: a consent given, a call accepted, the reach widened to the world.
            ...MCP_CONTRACT_COMMANDS.map(command => rule(contractPolicy(command, { granted: true, accept: true, range: 'world' }))),
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
// What leaves toward other people, moves money or deletes for good is always one the person confirms, whatever door
// names it (its own method, runtime.tools.call, a batch): an outward policy that would run at once is held (rule 22).
export function resolveAccessPolicy(method, params = {}, context = {}) {
    const policy = basePolicy(method, params, context);
    return policy.allowed === true && policy.outward === true && policy.confirmation_required !== true ? withConfirmation(policy) : policy;
}

function basePolicy(method, params = {}, context = {}) {
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
            { idempotent: policies.some(entry => entry.idempotent), outward: policies.some(entry => entry.outward) });
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
