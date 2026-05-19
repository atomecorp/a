import { normalizeLocalVoiceCommand } from './session_runtime.js';
import { normalizeSTTUtterance } from './stt_normalizer.js';

export const VOICE_INTENT_SCHEMA_VERSION = '2.0.0';
export const VOICE_INTENT_TYPES = Object.freeze([
    'local_command',
    'agent_tool',
    'agent_toolchain',
    'runtime_tool',
    'runtime_toolchain',
    'connector_tool',
    'connector_toolchain',
    'ambiguous'
]);
export const VOICE_INTENT_TARGETS = Object.freeze([
    'voice_runtime',
    'atome_ai',
    'runtime_v2',
    'mcp',
    'pending_connector',
    'none'
]);
export const VOICE_INTENT_DOMAINS = Object.freeze([
    'conversation_control',
    'ui_navigation',
    'calendar',
    'mail',
    'contacts',
    'bank',
    'media',
    'creative',
    'capture',
    'unknown'
]);

const DEFAULT_LOCALE = 'fr-FR';

const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const uniqueStrings = (values = []) => Array.from(new Set(
    (Array.isArray(values) ? values : [values])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
));

const buildBaseIntent = ({
    intent_id = null,
    utterance = '',
    locale = DEFAULT_LOCALE,
    source = null,
    context = {}
} = {}) => ({
    schema_version: VOICE_INTENT_SCHEMA_VERSION,
    intent_id,
    type: 'ambiguous',
    domain: 'unknown',
    action: 'unknown',
    locale: String(locale || DEFAULT_LOCALE).trim() || DEFAULT_LOCALE,
    confidence: 0.18,
    status: 'ambiguous',
    utterance: {
        raw: String(utterance || '').trim(),
        normalized: normalizeText(utterance)
    },
    source: source && typeof source === 'object'
        ? {
            type: String(source.type || 'voice').trim() || 'voice',
            layer: String(source.layer || 'voice_intent_schema_minimal').trim() || 'voice_intent_schema_minimal'
        }
        : {
            type: 'voice',
            layer: 'voice_intent_schema_minimal'
        },
    context: context && typeof context === 'object' ? cloneValue(context) : {},
    entities: {},
    requested_capabilities: [],
    execution: {
        target: 'none',
        confirmation_required: false,
        toolchain: []
    }
});

export const normalizeVoiceIntent = (intent = {}) => {
    const utterance = intent?.utterance && typeof intent.utterance === 'object'
        ? intent.utterance
        : {};
    const execution = intent?.execution && typeof intent.execution === 'object'
        ? intent.execution
        : {};
    return {
        schema_version: VOICE_INTENT_SCHEMA_VERSION,
        intent_id: intent?.intent_id || null,
        type: VOICE_INTENT_TYPES.includes(intent?.type) ? intent.type : 'ambiguous',
        domain: VOICE_INTENT_DOMAINS.includes(intent?.domain) ? intent.domain : 'unknown',
        action: String(intent?.action || 'unknown').trim() || 'unknown',
        locale: String(intent?.locale || DEFAULT_LOCALE).trim() || DEFAULT_LOCALE,
        confidence: Number.isFinite(Number(intent?.confidence)) ? Number(intent.confidence) : 0,
        status: String(intent?.status || 'ambiguous').trim() || 'ambiguous',
        utterance: {
            raw: String(utterance?.raw || '').trim(),
            normalized: String(utterance?.normalized || normalizeText(utterance?.raw || '')).trim(),
            ...(utterance?.stt_normalized ? { stt_normalized: String(utterance.stt_normalized).trim() } : {})
        },
        source: intent?.source && typeof intent.source === 'object'
            ? cloneValue(intent.source)
            : {
                type: 'voice',
                layer: 'voice_intent_schema_minimal'
            },
        context: intent?.context && typeof intent.context === 'object' ? cloneValue(intent.context) : {},
        entities: intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {},
        requested_capabilities: uniqueStrings(intent?.requested_capabilities || []),
        assistant_reply: typeof intent?.assistant_reply === 'string' ? intent.assistant_reply : '',
        llm_raw_response: typeof intent?.llm_raw_response === 'string' ? intent.llm_raw_response : '',
        execution: {
            target: VOICE_INTENT_TARGETS.includes(execution?.target) ? execution.target : 'none',
            confirmation_required: execution?.confirmation_required === true,
            toolchain: Array.isArray(execution?.toolchain) ? cloneValue(execution.toolchain) : []
        },
        ...(intent?.followups && typeof intent.followups === 'object' ? { followups: cloneValue(intent.followups) } : {})
    };
};

const buildLocalCommandIntent = (rawUtterance, parsed, options = {}) => normalizeVoiceIntent({
    ...buildBaseIntent({
        intent_id: options.intent_id,
        utterance: rawUtterance,
        locale: options.locale,
        source: options.source,
        context: options.context
    }),
    type: 'local_command',
    domain: 'conversation_control',
    action: String(parsed?.command || parsed?.action || 'stop').trim() || 'stop',
    confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0.95,
    status: 'ready',
    entities: parsed?.entities && typeof parsed.entities === 'object' ? cloneValue(parsed.entities) : {},
    execution: {
        target: 'voice_runtime',
        confirmation_required: false,
        toolchain: []
    }
});

export const readMailOrderReference = () => null;

export const classifyVoiceIntent = (utterance, {
    intent_id = null,
    locale = DEFAULT_LOCALE,
    source = null,
    context = {},
    runtime_tools = []
} = {}) => {
    const rawUtterance = String(utterance || '').trim();
    const sttNormalized = normalizeSTTUtterance(rawUtterance, { locale });
    const effectiveUtterance = sttNormalized || rawUtterance;
    const base = buildBaseIntent({
        intent_id,
        utterance: effectiveUtterance,
        locale,
        source,
        context
    });
    base.utterance.raw = rawUtterance;
    if (sttNormalized) {
        base.utterance.stt_normalized = sttNormalized;
    }

    const localCommand = normalizeLocalVoiceCommand(rawUtterance);
    if (localCommand) {
        return buildLocalCommandIntent(rawUtterance, localCommand, {
            intent_id,
            locale,
            source,
            context
        });
    }

    return normalizeVoiceIntent(base);
};
