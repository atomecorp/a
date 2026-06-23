const loadAdoleApi = async () => {
    if (typeof window !== 'undefined' && window.AdoleAPI) return window.AdoleAPI;
    if (typeof globalThis !== 'undefined' && globalThis.AdoleAPI) return globalThis.AdoleAPI;
    const mod = await import('../apis/unified/adole_apis.js');
    return mod.AdoleAPI;
};

const isAdoleAuthenticated = (api) => !!api?.auth?.isAuthenticated?.();

const collectAdoleAtomes = (result = {}) => {
    const byId = new Map();
    const add = (items = [], source = '') => {
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
            const id = item?.atome_id || item?.id || item?.data?.atome_id || item?.data?.id || null;
            if (!id || byId.has(String(id))) return;
            byId.set(String(id), { ...item, id, source });
        });
    };
    add(result?.tauri?.atomes, 'tauri');
    add(result?.fastify?.atomes, 'fastify');
    add(result?.atomes, result?.source || '');
    add(result?.data, result?.source || '');
    return Array.from(byId.values());
};

const extractAdoleAtome = (result) => (
    result?.atome
    || result?.data?.atome
    || result?.data
    || result?.tauri?.data?.atome
    || result?.fastify?.data?.atome
    || result?.tauri?.data?.data?.atome
    || result?.fastify?.data?.data?.atome
    || null
);

const extractCreatedAtomeId = (result) => (
    result?.tauri?.data?.atome_id
    || result?.tauri?.data?.id
    || result?.tauri?.data?.data?.atome_id
    || result?.tauri?.data?.data?.id
    || result?.fastify?.data?.atome_id
    || result?.fastify?.data?.id
    || result?.fastify?.data?.data?.atome_id
    || result?.fastify?.data?.data?.id
    || null
);

const adoleOperationSucceeded = (result) => !!(
    result?.ok
    || result?.success
    || result?.tauri?.success
    || result?.fastify?.success
);

const listCodeFileAtomes = async (api, options = {}) => {
    const { kind, ...rest } = options;
    return collectAdoleAtomes(await api.atomes.list({ ...rest, type: kind || options.type || 'code_file' }));
};

export {
    loadAdoleApi,
    isAdoleAuthenticated,
    collectAdoleAtomes,
    extractAdoleAtome,
    extractCreatedAtomeId,
    adoleOperationSucceeded,
    listCodeFileAtomes
};
