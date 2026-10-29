// Surface identity and discovery — the client half of the surface registry.
//
// A surface is this device seat: one browser tab, one Tauri window, one iOS app
// instance. Teleport needs to address *this screen* rather than "every connection
// the account owns", so the id must survive a reload and a reconnection — hence a
// persisted UUID v4 rather than the server-side connection id, which is
// regenerated on every socket.
//
// The registry always lives on Fastify, even in Tauri/iOS runtimes: the local
// Axum/Swift server only ever sees its own device, so it cannot relay between
// two of them. `FastifyAdapter` is therefore used unconditionally here.
//
// The name of this device is the account's, not the surface's: the account device
// registry (`auth_device_keys.label` on Fastify, the one Home › Security lists) keeps
// it across a cleared browser or a reinstall that kept the device key. The surface
// only announces it; every rename (voice `surface.rename`, Home › My hardware,
// Security › My devices) goes through `renameLocalSurface`.

import { FastifyAdapter } from '../adole.js';
import { generateUUID } from '../adole_connection.js';
import { accountMethods, describeThisDevice } from './auth_methods_account.js';
import { ensureFastifyToken } from './auth_fastify_token.js';
import { readStorage, removeStorage, writeStorage } from './storage.js';
import { isTauriRuntime } from './runtime.js';
import { getSessionState } from './session.js';

const SURFACE_ID_STORAGE_KEY = 'squirrel.surface_id';
// Where 1.36 and earlier kept a name given by voice, on this device only: moved once
// to the account registry, then removed.
const DEVICE_NAME_TRANSFER_KEY = 'squirrel.surface_label';

// `attachWsApiSurface` rejects anything outside this shape, so a persisted value
// written by an older or corrupted client must be discarded rather than sent.
const SURFACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const state = {
    surfaceId: '',
    announcedGeneration: -1,
    announcing: null,
    // This device in the account registry ({ deviceId, label }), read once per session.
    device: null,
    readingDevice: null,
    heartbeatTimer: null,
    lifecycleInstalled: false
};

const isAuthenticated = () => getSessionState()?.mode === 'authenticated';

export const getLocalSurfaceId = () => {
    if (state.surfaceId) return state.surfaceId;
    const persisted = String(readStorage(SURFACE_ID_STORAGE_KEY) || '').trim();
    if (SURFACE_ID_PATTERN.test(persisted)) {
        state.surfaceId = persisted;
        return persisted;
    }
    const generated = generateUUID();
    writeStorage(SURFACE_ID_STORAGE_KEY, generated);
    state.surfaceId = generated;
    return generated;
};

// The registry's own bound (server/auth_devices.js#normalizeDeviceMeta).
const normalizeDeviceName = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);

const readLocalDevice = async () => {
    if (state.device) return state.device;
    if (!isAuthenticated()) throw new Error('not_authenticated');
    state.readingDevice ||= (async () => {
        const listed = await accountMethods.listDevices();
        const current = (listed?.devices || []).find((device) => device.current === true);
        if (!current?.deviceId) throw new Error('surface_device_unknown');
        let label = normalizeDeviceName(current.label);
        const given = normalizeDeviceName(readStorage(DEVICE_NAME_TRANSFER_KEY));
        if (given && given !== label) {
            await accountMethods.renameDevice(current.deviceId, given);
            label = given;
        }
        removeStorage(DEVICE_NAME_TRANSFER_KEY);
        state.device = { deviceId: current.deviceId, label };
        return state.device;
    })().finally(() => { state.readingDevice = null; });
    return state.readingDevice;
};

// A device enrolled without a name is called what its enrollment would have called it.
export const readLocalSurfaceName = async () => (await readLocalDevice()).label || describeThisDevice().label;

export const renameLocalSurface = async (label) => {
    const name = normalizeDeviceName(label);
    if (!name) throw new Error('surface_name_required');
    const device = await readLocalDevice();
    await accountMethods.renameDevice(device.deviceId, name);
    state.device = { ...device, label: name };
    // The name is part of the announced descriptor, so a rename must be pushed.
    state.announcedGeneration = -1;
    const announced = await ensureSurfaceAnnounced();
    return { ok: true, name, announced: announced?.success === true, error: announced?.error || undefined };
};

const resolvePlatform = () => {
    if (typeof window === 'undefined') return 'unknown';
    if (window.__AUV3_MODE__ === true) return 'ios';
    const protocol = String(window.location?.protocol || '').toLowerCase();
    if (protocol === 'atome:') return 'ios';
    if (isTauriRuntime()) return 'tauri';
    return 'browser';
};

const resolveCapabilities = () => {
    const hasDom = typeof document !== 'undefined';
    return {
        render: hasDom,
        // Coarse pointers (touch) drive the same gesture path, so both count as
        // pointer input; what varies is only precision, not availability.
        pointer_input: hasDom,
        audio: typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined',
        video: hasDom,
        fullscreen: hasDom && typeof document.documentElement?.requestFullscreen === 'function'
    };
};

export const describeLocalSurface = async () => {
    const platform = resolvePlatform();
    return {
        surface_id: getLocalSurfaceId(),
        label: await readLocalSurfaceName(),
        platform,
        capabilities: resolveCapabilities()
    };
};

const currentGeneration = () => {
    try {
        return Number(FastifyAdapter.ws.connectionGeneration ?? -1);
    } catch (_) {
        return -1;
    }
};

// The registry is Fastify-only, but a Tauri/iOS session can be authenticated against
// the *local* backend with no Fastify token at all. Without this, every teleport action
// on those runtimes fails as "unauthenticated" with nothing explaining why — so the
// token handoff is required here rather than assumed.
export const ensureRemoteSurfacePrincipal = async () => {
    if (FastifyAdapter?.getToken?.()) return { ok: true };
    try {
        const ensured = await ensureFastifyToken();
        if (ensured?.ok) return { ok: true };
        return { ok: false, error: `fastify_principal_unavailable:${ensured?.reason || 'unknown'}` };
    } catch (error) {
        return { ok: false, error: `fastify_principal_unavailable:${error?.message || 'error'}` };
    }
};

const sendSurfaceMessage = async (action, fields = {}) => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, success: false, error: principal.error };
    try {
        return await FastifyAdapter.ws.send({ type: 'surface', action, ...fields });
    } catch (error) {
        return { ok: false, success: false, error: error?.message || String(error) };
    }
};

export const announceSurface = async () => {
    const generation = currentGeneration();
    let descriptor = null;
    try {
        descriptor = await describeLocalSurface();
    } catch (error) {
        return { ok: false, success: false, error: error?.message || String(error) };
    }
    const result = await sendSurfaceMessage('announce', descriptor);
    if (result?.success === true) {
        state.announcedGeneration = generation;
    }
    return result;
};

// Idempotent: announces once per socket generation. The transport bumps that
// counter on every `onopen`, so a reconnection re-announces exactly once even
// though the surface id itself never changed.
export const ensureSurfaceAnnounced = async () => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    const generation = currentGeneration();
    if (generation >= 0 && state.announcedGeneration === generation) {
        return { ok: true, success: true, cached: true };
    }
    if (state.announcing) return state.announcing;
    state.announcing = announceSurface().finally(() => {
        state.announcing = null;
    });
    return state.announcing;
};

export const listSurfaces = async ({ excludeSelf = false, includeShared = false } = {}) => {
    await ensureSurfaceAnnounced();
    const result = await sendSurfaceMessage('list', {
        exclude_self: excludeSelf === true,
        include_shared: includeShared === true
    });
    const own = Array.isArray(result?.surfaces) ? result.surfaces : [];
    const shared = Array.isArray(result?.shared) ? result.shared : [];
    return {
        ok: result?.success === true,
        error: result?.error || null,
        // Own seats first: they need no authorization and are the common case.
        surfaces: includeShared ? [...own, ...shared] : own,
        own,
        shared
    };
};

export const pingSurface = () => sendSurfaceMessage('ping');

export const retireSurface = async () => {
    const result = await sendSurfaceMessage('retire');
    state.announcedGeneration = -1;
    return result;
};

// ---------------------------------------------------------------------------
// Lifecycle
//
// A device that never opened a teleport tool must still be reachable as a
// destination, so announcing cannot wait for the first `list()`. Login triggers
// it, and a slow heartbeat re-declares the surface after a silent reconnection —
// the transport reconnects on its own timer without telling anyone, and the
// server registry is in-memory, so a restart on either side loses the binding.
// The heartbeat is a generation comparison, not a message: it only reaches the
// wire when the socket actually changed.
// ---------------------------------------------------------------------------

const SURFACE_HEARTBEAT_MS = 30000;

const scheduleSurfaceHeartbeat = () => {
    if (state.heartbeatTimer) return;
    state.heartbeatTimer = setInterval(() => {
        if (!isAuthenticated()) return;
        void ensureSurfaceAnnounced();
    }, SURFACE_HEARTBEAT_MS);
    // Never hold a Node process (or a test runner) open for this.
    state.heartbeatTimer?.unref?.();
};

export const installSurfaceLifecycle = () => {
    if (typeof window === 'undefined' || state.lifecycleInstalled) return false;
    state.lifecycleInstalled = true;

    window.addEventListener('squirrel:user-logged-in', (event) => {
        // Anonymous and guest sessions have no remote principal; the server would
        // reject the announce and there is nothing to teleport between.
        if (event?.detail?.anonymous === true) return;
        state.announcedGeneration = -1;
        // Another account may open without a logout in between: its registry names this device.
        state.device = null;
        void ensureSurfaceAnnounced();
        scheduleSurfaceHeartbeat();
    });

    window.addEventListener('squirrel:user-logged-out', () => {
        state.announcedGeneration = -1;
        state.announcing = null;
        state.device = null;
        if (state.heartbeatTimer) {
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }
    });

    if (isAuthenticated()) {
        void ensureSurfaceAnnounced();
        scheduleSurfaceHeartbeat();
    }
    return true;
};

installSurfaceLifecycle();
