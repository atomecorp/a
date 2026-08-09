import { defaultEnv, readEnv } from './orchestrator_env.js';

const createMcpBridge = (env) => {
    const asyncHandler = readEnv(env, 'handleAtomeMCPRequestAsync');
    if (typeof asyncHandler !== 'function') return null;
    const callMcp = async (method, params = {}, id = method) => {
        const response = await asyncHandler({ jsonrpc: '2.0', id, method, params });
        if (response?.error) throw new Error(response.error.message || `MCP ${method} failed`);
        return response?.result;
    };
    return {
        kind: 'mcp',
        async listRuntimeTools() {
            const result = await callMcp('runtime.tools.list', {}, 'voice-runtime-tools-list');
            return Array.isArray(result?.tools) ? result.tools : [];
        },
        async callRuntimeTool(payload = {}) {
            return callMcp('runtime.tools.call', payload, 'voice-runtime-tool-call');
        },
        async batchRuntimeTools(events = [], options = {}) {
            return callMcp('runtime.tools.batch_call', {
                events,
                ...(options?.tx_id ? { tx_id: options.tx_id } : {})
            }, 'voice-runtime-tool-batch');
        },
        async callAiTool(request = {}) {
            return callMcp('ai.tools.call', request, 'voice-ai-tool-call');
        },
        async executeAiToolchain({ steps = [], confirmation = null, ...context } = {}) {
            const shared = {
                actor: context.actor || {},
                signals: context.signals || {},
                source: context.source || {},
                trace_id: context.trace_id || null,
                intent_id: context.intent_id || null,
                idempotency_key: context.idempotency_key || null
            };
            return callMcp('mcp.toolchains.execute', {
                steps: steps.map((step) => ({
                    method: 'ai.tools.call',
                    params: { ...shared, tool_name: step.tool_name, params: step.params || {} }
                })),
                ...shared,
                ...(confirmation ? {
                    confirmed: true,
                    confirmation_id: confirmation.confirmation_id
                } : {})
            }, 'voice-ai-toolchain');
        }
    };
};

const createRuntimeBridge = (env) => {
    const runtime = readEnv(env, 'atome')?.tools?.v2Runtime
        || readEnv(env, 'window')?.atome?.tools?.v2Runtime
        || null;
    if (!runtime || typeof runtime.invokeById !== 'function') return null;
    return {
        kind: 'runtime_v2',
        async listRuntimeTools() {
            if (typeof runtime.listTools !== 'function') return [];
            return runtime.listTools({ includeDisabled: false });
        },
        async callRuntimeTool(payload = {}) {
            return runtime.invokeById(payload);
        },
        async batchRuntimeTools(events = [], options = {}) {
            if (typeof runtime.invokeBatch === 'function') {
                return runtime.invokeBatch(events, options);
            }
            const results = [];
            for (const event of events) {
                results.push(await runtime.invokeById(event));
            }
            return { ok: results.every((entry) => entry?.ok !== false), results };
        }
    };
};

export const resolveVoiceExecutionBridge = (env = defaultEnv()) => {
    return createMcpBridge(env) || createRuntimeBridge(env) || null;
};
