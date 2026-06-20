import { defaultEnv, readEnv } from './orchestrator_env.js';

const createMcpBridge = (env) => {
    const asyncHandler = readEnv(env, 'handleAtomeMCPRequestAsync');
    if (typeof asyncHandler !== 'function') return null;
    return {
        kind: 'mcp',
        async listRuntimeTools() {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tools-list',
                method: 'runtime.tools.list',
                params: {}
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.list failed');
            }
            return Array.isArray(response?.result?.tools) ? response.result.tools : [];
        },
        async callRuntimeTool(payload = {}) {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tool-call',
                method: 'runtime.tools.call',
                params: payload
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.call failed');
            }
            return response.result;
        },
        async batchRuntimeTools(events = [], options = {}) {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tool-batch',
                method: 'runtime.tools.batch_call',
                params: {
                    events,
                    ...(options?.tx_id ? { tx_id: options.tx_id } : {})
                }
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.batch_call failed');
            }
            return response.result;
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
