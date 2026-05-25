const safeString = (value) => String(value ?? '').trim();

const RESERVED_ATOME_PROPERTY_KEYS = new Set([
    'id', 'atome_id', 'atomeId',
    'type', 'atome_type', 'atomeType',
    'owner', 'owner_id', 'ownerId',
    'parent', 'parent_id', 'parentId',
    'project_id', 'projectId',
    'creator_id', 'creatorId',
    'created_at', 'createdAt',
    'updated_at', 'updatedAt',
    'deleted_at', 'deletedAt',
    'last_sync', 'lastSync',
    'sync_status', 'syncStatus',
    'created_source', 'createdSource'
]);

const sanitizeAtomeProperties = (properties = {}) => {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
    const sanitized = {};
    Object.entries(properties).forEach(([key, value]) => {
        if (!key || value === undefined || RESERVED_ATOME_PROPERTY_KEYS.has(key)) return;
        sanitized[key] = value;
    });
    return sanitized;
};

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

export class AVAtomeObjectStore {
    constructor({ kind = 'object', env = globalThis } = {}) {
        this.kind = safeString(kind) || 'object';
        this.env = env;
        this.items = new Map();
        this.atomeKind = `av_${this.kind}`;
    }

    async create(input = {}) {
        const base = createAVLifecycleObject({
            ...input,
            id: input.id || randomId(`av_${this.kind}`)
        });
        const item = Object.freeze({
            ...base,
            ...input,
            id: base.id,
            kind: this.atomeKind,
            av_object_kind: this.kind,
            schema_version: base.schema_version,
            created_at: base.created_at,
            updated_at: base.updated_at
        });
        await this.#commitItem(item);
        this.items.set(item.id, item);
        return item;
    }

    get(id = '') {
        return this.items.get(safeString(id)) || null;
    }

    async refresh(projectId = null, options = {}) {
        const listStateCurrent = this.#listStateCurrent();
        if (typeof listStateCurrent !== 'function') {
            throw this.#unavailable('listStateCurrent');
        }
        const result = await listStateCurrent(projectId, {
            limit: Number(options.limit || 5000) || 5000
        });
        const records = Array.isArray(result)
            ? result
            : (Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data) ? result.data : []));
        this.items.clear();
        records.forEach((record) => {
            const item = this.#fromAtomeRecord(record);
            if (item) this.items.set(item.id, item);
        });
        return this.list();
    }

    list(filter = {}) {
        const assetId = safeString(filter.assetId || filter.asset_id);
        return Array.from(this.items.values()).filter((item) => {
            if (!assetId) return true;
            return safeString(item.asset_id || item.assetId) === assetId;
        });
    }

    async update(id = '', patch = {}) {
        const key = safeString(id);
        const previous = this.items.get(key);
        if (!previous) return null;
        const item = Object.freeze({
            ...previous,
            ...patch,
            id: previous.id,
            kind: this.atomeKind,
            av_object_kind: this.kind,
            schema_version: previous.schema_version,
            created_at: previous.created_at,
            updated_at: nowIso()
        });
        await this.#commitItem(item);
        this.items.set(key, item);
        return item;
    }

    async delete(id = '') {
        const key = safeString(id);
        if (!key) return false;
        const previous = this.items.get(key);
        if (!previous) return false;
        await this.#commitItem({
            ...previous,
            state: 'disposed',
            deleted_iso: nowIso(),
            updated_at: nowIso()
        });
        this.items.delete(key);
        return true;
    }

    async #commitItem(item) {
        const commit = this.#commit();
        if (typeof commit !== 'function') {
            throw this.#unavailable('commit');
        }
        const result = await commit({
            kind: 'set',
            atome_id: item.id,
            project_id: item.project_id || null,
            props: sanitizeAtomeProperties(item)
        });
        if (result?.ok === false || result?.success === false) {
            throw new AVTypedError('av_persistence_commit_failed', {
                ok: false,
                error: 'av_persistence_commit_failed',
                object_kind: this.kind,
                object_id: item.id
            });
        }
        return result;
    }

    #commit() {
        const api = this.env?.Atome || this.env?.__atomeCommitApi || null;
        return typeof api?.commit === 'function' ? api.commit.bind(api) : null;
    }

    #listStateCurrent() {
        const api = this.env?.Atome || this.env?.__atomeCommitApi || null;
        return typeof api?.listStateCurrent === 'function' ? api.listStateCurrent.bind(api) : null;
    }

    #fromAtomeRecord(record = {}) {
        const props = record.properties || record.props || record.particles || record.data?.properties || record.data || {};
        const objectKind = safeString(props.av_object_kind || props.object_kind);
        const kind = safeString(props.kind || record.kind || record.type);
        if (objectKind !== this.kind && kind !== this.atomeKind) return null;
        const id = safeString(props.id || record.id || record.atome_id || record.atomeId);
        if (!id) return null;
        return Object.freeze({
            ...props,
            id,
            kind: this.atomeKind,
            av_object_kind: this.kind
        });
    }

    #unavailable(apiName) {
        return new AVTypedError('av_persistence_unavailable', {
            ok: false,
            error: 'av_persistence_unavailable',
            object_kind: this.kind,
            api: apiName
        });
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

export class AVDeviceRegistry {
    constructor() {
        this.devices = new Map();
        this.selected = new Map();
    }

    register(input = {}) {
        const id = safeString(input.id || input.device_id || input.deviceId);
        if (!id) {
            throw new AVTypedError('av_device_id_required', {
                ok: false,
                error: 'av_device_id_required'
            });
        }
        const device = Object.freeze({
            id,
            schema_version: AV_API_SCHEMA_VERSION,
            media_kind: safeString(input.media_kind || input.mediaKind || 'audio') || 'audio',
            direction: safeString(input.direction || input.kind || 'input') || 'input',
            label: safeString(input.label || input.name || id),
            backend: safeString(input.backend || input.runtime_backend || input.runtimeBackend),
            channels: Number(input.channels || 0) || 0,
            sample_rate: Number(input.sample_rate || input.sampleRate || 0) || 0,
            created_at: nowIso()
        });
        this.devices.set(device.id, device);
        return device;
    }

    list(filter = {}) {
        const mediaKind = safeString(filter.media_kind || filter.mediaKind);
        const direction = safeString(filter.direction || filter.kind);
        return Array.from(this.devices.values()).filter((device) => {
            if (mediaKind && device.media_kind !== mediaKind) return false;
            if (direction && device.direction !== direction) return false;
            return true;
        });
    }

    select(input = {}) {
        const id = safeString(typeof input === 'string' ? input : (input.id || input.device_id || input.deviceId));
        const device = this.devices.get(id);
        if (!device) {
            throw new AVTypedError('av_device_not_found', {
                ok: false,
                error: 'av_device_not_found',
                device_id: id
            });
        }
        const scope = safeString(input.scope || `${device.media_kind}.${device.direction}`);
        this.selected.set(scope, device.id);
        return Object.freeze({ ok: true, scope, device });
    }

    selectedDevice(scope = '') {
        const id = this.selected.get(safeString(scope));
        return id ? this.devices.get(id) || null : null;
    }
}

export class AVLatencyRegistry {
    constructor() {
        this.reports = [];
    }

    report(input = {}) {
        const report = Object.freeze({
            id: input.id || randomId('av_latency'),
            schema_version: AV_API_SCHEMA_VERSION,
            media_kind: safeString(input.media_kind || input.mediaKind || 'audio') || 'audio',
            scope: safeString(input.scope || 'session') || 'session',
            object_id: safeString(input.object_id || input.objectId || input.session_id || input.sessionId),
            input_latency_ms: Number(input.input_latency_ms || input.inputLatencyMs || 0) || 0,
            output_latency_ms: Number(input.output_latency_ms || input.outputLatencyMs || 0) || 0,
            codec_latency_ms: Number(input.codec_latency_ms || input.codecLatencyMs || 0) || 0,
            bridge_latency_ms: Number(input.bridge_latency_ms || input.bridgeLatencyMs || 0) || 0,
            created_at: nowIso()
        });
        this.reports.push(report);
        return report;
    }

    list(filter = {}) {
        const mediaKind = safeString(filter.media_kind || filter.mediaKind);
        return this.reports.filter((report) => !mediaKind || report.media_kind === mediaKind);
    }
}

export class AVCodecRegistry {
    constructor() {
        this.profiles = new Map();
    }

    createProfile(input = {}) {
        const id = safeString(input.id || input.profile_id || input.profileId) || randomId('av_codec_profile');
        const profile = Object.freeze({
            id,
            schema_version: AV_API_SCHEMA_VERSION,
            media_kind: safeString(input.media_kind || input.mediaKind || 'audio') || 'audio',
            codec: safeString(input.codec),
            container: safeString(input.container),
            sample_rate: Number(input.sample_rate || input.sampleRate || 0) || 0,
            channels: Number(input.channels || 0) || 0,
            bit_depth: Number(input.bit_depth || input.bitDepth || 0) || 0,
            bitrate: Number(input.bitrate || 0) || 0,
            created_at: nowIso()
        });
        this.profiles.set(profile.id, profile);
        return profile;
    }

    getProfile(id = '') {
        return this.profiles.get(safeString(id)) || null;
    }

    listProfiles(filter = {}) {
        const mediaKind = safeString(filter.media_kind || filter.mediaKind);
        return Array.from(this.profiles.values()).filter((profile) => !mediaKind || profile.media_kind === mediaKind);
    }
}

export class AVGraphRegistry {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    createNode(input = {}) {
        const id = safeString(input.id || input.node_id || input.nodeId) || randomId('av_graph_node');
        const node = Object.freeze({
            id,
            schema_version: AV_API_SCHEMA_VERSION,
            media_kind: safeString(input.media_kind || input.mediaKind || 'audio') || 'audio',
            node_type: safeString(input.node_type || input.nodeType || input.type || 'media') || 'media',
            label: safeString(input.label || id),
            created_at: nowIso()
        });
        this.nodes.set(node.id, node);
        return node;
    }

    connect(input = {}) {
        const source = safeString(input.source || input.source_id || input.sourceId);
        const target = safeString(input.target || input.target_id || input.targetId);
        if (!this.nodes.has(source) || !this.nodes.has(target)) {
            throw new AVTypedError('av_graph_node_not_found', {
                ok: false,
                error: 'av_graph_node_not_found',
                source_id: source,
                target_id: target
            });
        }
        const id = safeString(input.id || input.edge_id || input.edgeId) || `${source}->${target}`;
        const edge = Object.freeze({
            id,
            schema_version: AV_API_SCHEMA_VERSION,
            source_id: source,
            target_id: target,
            route_type: safeString(input.route_type || input.routeType || 'media') || 'media',
            created_at: nowIso()
        });
        this.edges.set(edge.id, edge);
        return edge;
    }

    disconnect(id = '') {
        return this.edges.delete(safeString(id));
    }

    listNodes() {
        return Array.from(this.nodes.values());
    }

    listEdges() {
        return Array.from(this.edges.values());
    }
}

export class AVVideoMetricsStore {
    constructor() {
        this.reports = [];
    }

    report(input = {}) {
        const report = Object.freeze({
            id: input.id || randomId('av_video_metrics'),
            schema_version: AV_API_SCHEMA_VERSION,
            media_kind: 'video',
            object_id: safeString(input.object_id || input.objectId || input.session_id || input.sessionId),
            frame_rate: Number(input.frame_rate || input.frameRate || 0) || 0,
            dropped_frames: Number(input.dropped_frames || input.droppedFrames || 0) || 0,
            jitter_ms: Number(input.jitter_ms || input.jitterMs || 0) || 0,
            decode_latency_ms: Number(input.decode_latency_ms || input.decodeLatencyMs || 0) || 0,
            render_latency_ms: Number(input.render_latency_ms || input.renderLatencyMs || 0) || 0,
            av_drift_ms: Number(input.av_drift_ms || input.avDriftMs || 0) || 0,
            created_at: nowIso()
        });
        this.reports.push(report);
        return report;
    }

    list(filter = {}) {
        const objectId = safeString(filter.object_id || filter.objectId || filter.session_id || filter.sessionId);
        return this.reports.filter((report) => !objectId || report.object_id === objectId);
    }
}

export class AVExportAPI {
    constructor({ backend = '' } = {}) {
        this.backend = safeString(backend);
    }

    createJob(input = {}) {
        throw createUnsupportedCapabilityError({
            capability: safeString(input.capability || 'offline_export'),
            mediaKind: safeString(input.media_kind || input.mediaKind || 'av'),
            backend: this.backend || 'js.boundary'
        });
    }
}

export const installSharedAVContracts = (env = globalThis) => {
    const ns = (env.Squirrel = env.Squirrel || {});
    const av = (ns.av = ns.av || {});
    if (!av.assets) av.assets = new AVMemoryObjectStore({ kind: 'asset' });
    if (!av.markers) av.markers = new AVAtomeObjectStore({ kind: 'marker', env });
    if (!av.regions) av.regions = new AVAtomeObjectStore({ kind: 'region', env });
    if (!av.monitoring) av.monitoring = new AVMonitoringStore();
    if (!av.clocks) av.clocks = new AVClockRegistry();
    if (!av.sync) av.sync = {};
    av.sync.clocks = av.clocks;
    if (!av.devices) av.devices = new AVDeviceRegistry();
    if (!av.latency) av.latency = new AVLatencyRegistry();
    if (!av.codec) av.codec = new AVCodecRegistry();
    if (!av.graph) av.graph = new AVGraphRegistry();
    if (!av.videoMetrics) av.videoMetrics = new AVVideoMetricsStore();
    if (!av.export) av.export = new AVExportAPI({ backend: 'js.boundary' });
    av.createUnsupportedCapabilityError = createUnsupportedCapabilityError;
    av.schema_version = AV_API_SCHEMA_VERSION;
    return av;
};
