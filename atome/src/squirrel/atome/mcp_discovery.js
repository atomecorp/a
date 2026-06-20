import { cloneValue } from './mcp_core.js';
import { ensureAIAgent, ensureRuntimeToolApi } from './mcp_bridges.js';

export async function listUnifiedMcpTools() {
    const tools = [];
    try {
        const runtime = ensureRuntimeToolApi();
        if (typeof runtime.listTools === 'function') {
            const runtimeTools = await runtime.listTools({ includeDisabled: false });
            (Array.isArray(runtimeTools) ? runtimeTools : []).forEach((entry) => {
                tools.push({
                    name: String(entry?.id || entry?.tool_key || '').trim() || null,
                    description: String(entry?.meta?.name || entry?.ui?.label_fallback || entry?.tool_key || '').trim() || null,
                    domain: 'runtime',
                    risk_tier: 'low',
                    parameters: cloneValue(entry?.input_schema || { type: 'object', properties: {} }),
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
                domain: String(entry?.domain || '').trim() || null,
                risk_tier: String(entry?.risk_tier || '').trim() || null,
                parameters: entry?.parameters ? cloneValue(entry.parameters) : null,
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
