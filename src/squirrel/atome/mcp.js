const hasOwn = Object.prototype.hasOwnProperty;
const ATOME_MCP_PROTOCOL = '1.0.0';

function ensureAIAgent() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    if (!globalThis.AtomeAI || typeof globalThis.AtomeAI.listTools !== 'function') {
        throw new Error('AtomeAI is not available');
    }
    return globalThis.AtomeAI;
}

function ensureAtomeContext() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    if (typeof globalThis.Atome !== 'function') {
        throw new Error('Atome constructor is not exposed on the global scope');
    }
    return {
        defaults: globalThis.atomeDefaultsParams || {},
        AtomeCtor: globalThis.Atome
    };
}

function extractAtomePayload(input) {
    if (!input || typeof input !== 'object') return {};

    const { mergeDefaults = true } = input;
    const values = hasOwn.call(input, 'values') && input.values && typeof input.values === 'object'
        ? input.values
        : { ...input };

    const sanitized = { ...values };
    delete sanitized.mergeDefaults;
    delete sanitized.values;

    return { mergeDefaults, payload: sanitized };
}

const atomeMCPHandlers = {
    'atome.create'(params = {}) {
        const { defaults, AtomeCtor } = ensureAtomeContext();
        const { mergeDefaults, payload } = extractAtomePayload(params);
        const resolvedPayload = mergeDefaults ? { ...defaults, ...payload } : { ...payload };
        const instance = new AtomeCtor(resolvedPayload);
        return {
            elementId: instance.element ? instance.element.id : null,
            tag: instance.tag ?? null,
            params: resolvedPayload
        };
    },
    'atome.box'(params = {}) {
        const { defaults, AtomeCtor } = ensureAtomeContext();
        const { mergeDefaults, payload } = extractAtomePayload(params);
        const resolvedPayload = mergeDefaults ? { ...defaults, ...payload } : { ...payload };
        const instance = typeof AtomeCtor.box === 'function'
            ? AtomeCtor.box({ ...payload, mergeDefaults })
            : new AtomeCtor(resolvedPayload);
        return {
            elementId: instance.element ? instance.element.id : null,
            tag: instance.tag ?? null,
            params: resolvedPayload
        };
    },
    'atome.describe'() {
        const { defaults } = ensureAtomeContext();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            defaults,
            methods: Object.keys(atomeMCPHandlers),
            async_methods: ['ai.tools.call']
        };
    },
    'ai.tools.list'() {
        const agent = ensureAIAgent();
        const tools = agent.listTools();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools
        };
    },
    async 'ai.tools.call'(params = {}) {
        const agent = ensureAIAgent();
        if (typeof agent.callTool !== 'function') {
            throw new Error('AtomeAI.callTool is not available');
        }

        const request = {
            tool_name: params.tool_name || params.name || params.tool,
            params: params.params || {},
            actor: params.actor || {},
            signals: params.signals || {},
            idempotency_key: params.idempotency_key || null,
            dry_run: params.dry_run === true
        };

        return agent.callTool(request);
    },
    'ai.audit.list'(params = {}) {
        const agent = ensureAIAgent();
        const limit = Number.isFinite(params?.limit) ? params.limit : 20;
        if (!agent.audit || typeof agent.audit.list !== 'function') {
            throw new Error('AtomeAI.audit.list is not available');
        }
        return agent.audit.list({ limit });
    }
};

function handleAtomeMCPRequest(request = {}) {
    const response = { jsonrpc: '2.0', id: request.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') {
            throw new Error('Invalid MCP payload: missing jsonrpc 2.0 envelope');
        }
        const { method, params } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) {
            throw new Error(`Unknown MCP method: ${method}`);
        }
        const handler = atomeMCPHandlers[method];
        const result = handler(params);
        if (result && typeof result.then === 'function') {
            throw new Error('Async MCP method called via sync handler. Use handleAtomeMCPRequestAsync.');
        }
        response.result = result;
    } catch (error) {
        response.error = {
            code: -32000,
            message: error && error.message ? error.message : 'Unhandled MCP error'
        };
    }
    return response;
}

async function handleAtomeMCPRequestAsync(request = {}) {
    const response = { jsonrpc: '2.0', id: request.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') {
            throw new Error('Invalid MCP payload: missing jsonrpc 2.0 envelope');
        }
        const { method, params } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) {
            throw new Error(`Unknown MCP method: ${method}`);
        }
        const result = await atomeMCPHandlers[method](params);
        response.result = result;
    } catch (error) {
        response.error = {
            code: -32000,
            message: error && error.message ? error.message : 'Unhandled MCP error'
        };
    }
    return response;
}

if (typeof globalThis !== 'undefined') {
    globalThis.handleAtomeMCPRequest = handleAtomeMCPRequest;
    globalThis.handleAtomeMCPRequestAsync = handleAtomeMCPRequestAsync;
}
