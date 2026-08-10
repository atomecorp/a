import { defaultEnv, readEnv } from './orchestrator_env.js';
import { writeVoiceDiagnostic } from './telemetry.js';

const summarizeMcpRequest = (method, params = {}) => ({
    parameter_keys: Object.keys(params || {}).filter((key) => key !== '__mcp').slice(0, 24),
    ...(method === 'runtime.tools.call' ? {
        tool_id: params.tool_id || params.toolId || null,
        action: params.action || params.event || null,
        input: params.input && typeof params.input === 'object' ? params.input : {}
    } : {}),
    ...(method === 'mcp.toolchains.execute' ? {
        step_count: Array.isArray(params.steps) ? params.steps.length : 0,
        steps: (Array.isArray(params.steps) ? params.steps : []).slice(0, 16).map((step) => ({
            method: step?.method || null,
            tool_name: step?.params?.tool_name || null,
            parameter_keys: Object.keys(step?.params?.params || {}).slice(0, 24)
        }))
    } : {})
});

const summarizeMcpResult = (method, result = null) => {
    if (method === 'runtime.tools.list') {
        const tools = Array.isArray(result?.tools) ? result.tools : [];
        return {
            tools_count: tools.length,
            tools: tools.slice(0, 24).map((tool) => ({
                tool_id: tool?.tool_id || tool?.name || null,
                actions: Array.isArray(tool?.actions) ? tool.actions.slice(0, 16) : []
            }))
        };
    }
    if (!result || typeof result !== 'object') return { result_type: typeof result };
    return {
        result_keys: Object.keys(result).slice(0, 24),
        ok: result.ok ?? null,
        status: result.status || null,
        error: result.error || null,
        target_id: result.target_id || result.atome_id || null,
        completed_steps: result.completed_steps ?? null
    };
};

const createMcpBridge = (env) => {
    const asyncHandler = readEnv(env, 'handleAtomeMCPRequestAsync');
    if (typeof asyncHandler !== 'function') return null;
    const callMcp = async (method, params = {}, id = method) => {
        const startedAt = Date.now();
        const traceId = params?.trace_id || params?.meta?.trace_id || null;
        const intentId = params?.intent_id || params?.meta?.intent_id || null;
        writeVoiceDiagnostic(env, 'voice.mcp.request', {
            id,
            method,
            trace_id: traceId,
            intent_id: intentId,
            ...summarizeMcpRequest(method, params)
        });
        try {
            const response = await asyncHandler({ jsonrpc: '2.0', id, method, params });
            if (response?.error) throw new Error(response.error.message || `MCP ${method} failed`);
            writeVoiceDiagnostic(env, 'voice.mcp.response', {
                id,
                method,
                trace_id: traceId,
                intent_id: intentId,
                elapsed_ms: Date.now() - startedAt,
                ...summarizeMcpResult(method, response?.result)
            });
            return response?.result;
        } catch (error) {
            writeVoiceDiagnostic(env, 'voice.mcp.error', {
                id,
                method,
                trace_id: traceId,
                intent_id: intentId,
                elapsed_ms: Date.now() - startedAt,
                error: error?.message || String(error)
            });
            throw error;
        }
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
