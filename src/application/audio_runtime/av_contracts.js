const safeString = (value) => String(value ?? '').trim();

const nowIso = () => {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
};

const randomId = (prefix = 'av') => {
    const crypto = globalThis?.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const AV_API_SCHEMA_VERSION = 1;

export class AVTypedError extends Error {
    constructor(code, detail = {}) {
        super(code);
        this.name = 'AVTypedError';
        this.code = code;
        Object.assign(this, detail);
    }
}

export const createUnsupportedCapabilityError = ({
    capability = '',
    mediaKind = '',
    backend = ''
} = {}) => new AVTypedError('av_capability_unsupported', {
    ok: false,
    error: 'av_capability_unsupported',
    capability: safeString(capability),
    media_kind: safeString(mediaKind),
    backend: safeString(backend)
});

export const createAVLifecycleObject = ({
    id = '',
    state = 'created',
    runtimeBackend = 'js.boundary',
    ownerUserId = null,
    projectId = null,
    clockId = 'default',
    traceId = ''
} = {}) => {
    const timestamp = nowIso();
    return Object.freeze({
        id: safeString(id) || randomId('av_object'),
        schema_version: AV_API_SCHEMA_VERSION,
        state: safeString(state) || 'created',
        created_at: timestamp,
        updated_at: timestamp,
        runtime_backend: safeString(runtimeBackend) || 'js.boundary',
        owner_user_id: ownerUserId || null,
        project_id: projectId || null,
        clock_id: safeString(clockId) || 'default',
        trace_id: safeString(traceId) || randomId('av_trace')
    });
};

export class AVMemoryObjectStore {
    constructor({ kind = 'object' } = {}) {
        this.kind = safeString(kind) || 'object';
        this.items = new Map();
    }

    create(input = {}) {
        const base = createAVLifecycleObject({
            ...input,
            id: input.id || randomId(`av_${this.kind}`)
        });
        const item = Object.freeze({
            ...base,
            ...input,
            id: base.id,
            schema_version: base.schema_version,
            created_at: base.created_at,
            updated_at: base.updated_at
        });
        this.items.set(item.id, item);
        return item;
    }

    get(id = '') {
        return this.items.get(safeString(id)) || null;
    }

    list(filter = {}) {
        const assetId = safeString(filter.assetId || filter.asset_id);
        return Array.from(this.items.values()).filter((item) => {
            if (!assetId) return true;
            return safeString(item.asset_id || item.assetId) === assetId;
        });
    }

    update(id = '', patch = {}) {
        const key = safeString(id);
        const previous = this.items.get(key);
        if (!previous) return null;
        const item = Object.freeze({
            ...previous,
            ...patch,
            id: previous.id,
            schema_version: previous.schema_version,
            created_at: previous.created_at,
            updated_at: nowIso()
        });
        this.items.set(key, item);
        return item;
    }

    delete(id = '') {
        return this.items.delete(safeString(id));
    }
}

export const installSharedAVContracts = (env = globalThis) => {
    const ns = (env.Squirrel = env.Squirrel || {});
    const av = (ns.av = ns.av || {});
    if (!av.assets) av.assets = new AVMemoryObjectStore({ kind: 'asset' });
    if (!av.markers) av.markers = new AVMemoryObjectStore({ kind: 'marker' });
    if (!av.regions) av.regions = new AVMemoryObjectStore({ kind: 'region' });
    av.createUnsupportedCapabilityError = createUnsupportedCapabilityError;
    av.schema_version = AV_API_SCHEMA_VERSION;
    return av;
};
