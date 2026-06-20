export const ensureToolchain = (intent) => Array.isArray(intent?.execution?.toolchain)
    ? intent.execution.toolchain.filter((step) => step && typeof step === 'object')
    : [];

export const normalizeInvocationMeta = (intent, options = {}) => {
    const meta = {};
    if (intent?.intent_id) meta.intent_id = String(intent.intent_id);
    if (options?.trace_id) meta.trace_id = String(options.trace_id);
    if (options?.idempotency_key) meta.idempotency_key = String(options.idempotency_key);
    return meta;
};

export const normalizeInvocationSource = (intent, options = {}) => ({
    type: 'voice',
    layer: String(options?.source_layer || 'voice_orchestrator'),
    domain: String(intent?.domain || 'unknown'),
    action: String(intent?.action || 'unknown')
});

export const createVoiceConfirmation = (intent, options = {}) => {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const actorId = String(options.actor?.user_id || options.actor_id || 'local_user').trim();
    const idempotencyKey = String(options.idempotency_key || `voice_idem_${suffix}`).trim();
    return {
        confirmation_id: `voice_confirm_${suffix}`,
        actor_id: actorId,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
        intent_id: String(intent?.intent_id || options.intent_id || ''),
        domain: String(intent?.domain || ''),
        action: String(intent?.action || '')
    };
};

export const normalizeVoiceConfirmation = (options = {}) => {
    const confirmation = options.confirmation && typeof options.confirmation === 'object'
        ? options.confirmation
        : {};
    const confirmationId = String(confirmation.confirmation_id || confirmation.confirmationId || '').trim();
    const actorId = String(confirmation.actor_id || confirmation.actorId || options.actor?.user_id || options.actor_id || '').trim();
    const idempotencyKey = String(
        options.idempotency_key
        || options.idempotencyKey
        || confirmation.idempotency_key
        || confirmation.idempotencyKey
        || ''
    ).trim();
    if (!confirmationId || !actorId || !idempotencyKey) return null;
    return {
        confirmation_id: confirmationId,
        actor_id: actorId,
        idempotency_key: idempotencyKey
    };
};

export const normalizeBatchEvents = (intent, options = {}) => ensureToolchain(intent).map((step) => ({
    tool_id: step.tool_id,
    action: step.action || 'pointer.click',
    input: step.input && typeof step.input === 'object' ? { ...step.input } : {},
    source: normalizeInvocationSource(intent, options),
    meta: normalizeInvocationMeta(intent, options)
}));

export const BUSINESS_CONNECTOR_DOMAINS = new Set(['mail', 'calendar', 'contacts', 'bank']);
