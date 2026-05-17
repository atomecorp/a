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

export class AVClock {
    constructor({
        id = 'default',
        kind = 'monotonic',
        sampleRate = 0,
        tempo = 120,
        originSeconds = 0
    } = {}) {
        this.id = safeString(id) || 'default';
        this.schema_version = AV_API_SCHEMA_VERSION;
        this.kind = safeString(kind) || 'monotonic';
        this.sample_rate = Number(sampleRate || 0) || 0;
        this.tempo = Number(tempo || 120) || 120;
        this.origin_seconds = Number(originSeconds || 0) || 0;
        Object.freeze(this);
    }

    nowSeconds() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return this.origin_seconds + performance.now() / 1000;
        }
        return this.origin_seconds + Date.now() / 1000;
    }

    secondsToSamples(seconds = 0) {
        const value = Number(seconds);
        if (!Number.isFinite(value) || this.sample_rate <= 0) return 0;
        return Math.max(0, Math.round(value * this.sample_rate));
    }

    samplesToSeconds(samples = 0) {
        const value = Number(samples);
        if (!Number.isFinite(value) || this.sample_rate <= 0) return 0;
        return Math.max(0, value / this.sample_rate);
    }
}

export class AVClockRegistry {
    constructor() {
        this.clocks = new Map();
        this.create({ id: 'default', kind: 'monotonic' });
    }

    create(input = {}) {
        const clock = new AVClock(input);
        this.clocks.set(clock.id, clock);
        return clock;
    }

    get(id = 'default') {
        return this.clocks.get(safeString(id) || 'default') || null;
    }

    requireClock(input = {}) {
        const requested = typeof input === 'string'
            ? input
            : (input.clockId || input.clock_id || input.id || 'default');
        const id = safeString(requested) || 'default';
        const existing = this.get(id);
        if (existing) return existing;
        throw new AVTypedError('av_clock_not_found', {
            ok: false,
            error: 'av_clock_not_found',
            clock_id: id
        });
    }

    list() {
        return Array.from(this.clocks.values());
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

export class AVMonitoringStore {
    constructor() {
        this.streamReports = [];
    }

    reportStreamOverrun(input = {}) {
        const frames = Number(input.overrun_frames ?? input.overrunFrames ?? 0);
        const report = Object.freeze({
            id: input.id || randomId('av_stream_overrun'),
            schema_version: AV_API_SCHEMA_VERSION,
            event_type: 'av.stream.overrun',
            media_kind: safeString(input.media_kind || input.mediaKind || 'audio') || 'audio',
            stream_id: safeString(input.stream_id || input.streamId || input.session_id || input.sessionId),
            session_id: safeString(input.session_id || input.sessionId),
            backend: safeString(input.backend || input.provider || input.runtime_backend || input.runtimeBackend),
            overrun_frames: Number.isFinite(frames) && frames > 0 ? frames : 0,
            sample_rate: Number(input.sample_rate || input.sampleRate || 0) || 0,
            channels: Number(input.channels || 0) || 0,
            timestamp_seconds: Number(input.timestamp_seconds || input.timestampSeconds || 0) || Date.now() / 1000,
            created_at: nowIso()
        });
        this.streamReports.push(report);
        return report;
    }

    listStreamOverruns(filter = {}) {
        const mediaKind = safeString(filter.media_kind || filter.mediaKind);
        const sessionId = safeString(filter.session_id || filter.sessionId);
        return this.streamReports.filter((report) => {
            if (mediaKind && report.media_kind !== mediaKind) return false;
            if (sessionId && report.session_id !== sessionId) return false;
            return true;
        });
    }

    getStreamOverrunSummary(filter = {}) {
        const reports = this.listStreamOverruns(filter);
        const totalFrames = reports.reduce((sum, report) => sum + report.overrun_frames, 0);
        return Object.freeze({
            schema_version: AV_API_SCHEMA_VERSION,
            event_type: 'av.stream.overrun.summary',
            count: reports.length,
            overrun_frames: totalFrames
        });
    }
}

export const installSharedAVContracts = (env = globalThis) => {
    const ns = (env.Squirrel = env.Squirrel || {});
    const av = (ns.av = ns.av || {});
    if (!av.assets) av.assets = new AVMemoryObjectStore({ kind: 'asset' });
    if (!av.markers) av.markers = new AVMemoryObjectStore({ kind: 'marker' });
    if (!av.regions) av.regions = new AVMemoryObjectStore({ kind: 'region' });
    if (!av.monitoring) av.monitoring = new AVMonitoringStore();
    if (!av.clocks) av.clocks = new AVClockRegistry();
    if (!av.sync) av.sync = {};
    av.sync.clocks = av.clocks;
    av.createUnsupportedCapabilityError = createUnsupportedCapabilityError;
    av.schema_version = AV_API_SCHEMA_VERSION;
    return av;
};
