const hasOwn = Object.prototype.hasOwnProperty;
const ATOME_MCP_PROTOCOL = '1.0.0';

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
    'atome.describe'() {
        const { defaults } = ensureAtomeContext();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            defaults,
            methods: Object.keys(atomeMCPHandlers)
        };
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
        const result = atomeMCPHandlers[method](params);
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
}
