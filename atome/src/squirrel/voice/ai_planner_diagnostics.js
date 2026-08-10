const toText = (value) => String(value || '').trim();

export const buildProviderRequestDiagnostic = ({ options = {}, providerConfig = {}, utterance = '', systemPrompt = '' } = {}) => ({
    session_id: options.session_id || null,
    intent_id: options.intent_id || null,
    provider: providerConfig.providerId,
    model: providerConfig.model,
    utterance: toText(utterance).slice(0, 500),
    utterance_length: toText(utterance).length,
    prompt_characters: systemPrompt.length,
    runtime_tool_count: Array.isArray(options.runtime_tools) ? options.runtime_tools.length : 0,
    scene_atome_count: Array.isArray(options.context?.project_scene?.atomes) ? options.context.project_scene.atomes.length : 0
});

export const buildProviderResponseDiagnostic = ({ options = {}, providerConfig = {}, parsed = {}, text = '', usage = null, elapsedMs = 0 } = {}) => ({
    session_id: options.session_id || null,
    intent_id: options.intent_id || null,
    provider: providerConfig.providerId,
    model: providerConfig.model,
    elapsed_ms: elapsedMs,
    response_characters: toText(text).length,
    reply: toText(parsed?.reply).slice(0, 500),
    domain: toText(parsed?.domain) || null,
    action: toText(parsed?.action) || null,
    target: toText(parsed?.target) || null,
    planned_actions: (Array.isArray(parsed?.actions) ? parsed.actions : []).slice(0, 8).map((entry) => ({
        target: toText(entry?.target) || null,
        tool_name: toText(entry?.tool_name) || null,
        tool_id: toText(entry?.tool_id) || null,
        action: toText(entry?.action) || null,
        parameter_keys: Object.keys(entry?.params || entry?.input || {}).slice(0, 24)
    })),
    usage
});
