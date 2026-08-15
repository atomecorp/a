// Teleport state model — the single owner of teleport state semantics.
//
// It lives under `atome/src/shared/` because both ends need the exact same
// reading of it: the server decides transitions, the renderer decides whether a
// surface paints the object or its residual proxy. A second copy on either side
// would let them disagree about where an object is, which is precisely the
// failure §13 forbids. It has no imports and no runtime dependency, so it is
// safe on both boundaries.
//
// Teleporting an object is a change of *active surface*, not a move of a record:
// the atome keeps its id, its owner and its row. Everything below therefore
// operates on a property patch that the ordinary event pipeline commits, which is
// what gives teleport realtime broadcast, history, undo and per-property ACL for
// free instead of a parallel mechanism.
//
// The invariant the whole feature rests on (§16 of todo/3 - teleport.md): an object
// is never considered gone from its source until the destination has confirmed it.
// `TELEPORT_PREPARING` therefore still renders on the source — only the ACK moves
// `teleport_surface_id`.

export const TELEPORT_STATES = Object.freeze({
    LOCAL: 'LOCAL',
    PREPARING: 'TELEPORT_PREPARING',
    REMOTE: 'REMOTE',
    REMOTE_CONTROLLED: 'REMOTE_CONTROLLED',
    RETURNING: 'RETURNING',
    PERSISTED_REMOTE: 'PERSISTED_REMOTE',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR'
});

export const TELEPORT_PROPERTY_KEYS = Object.freeze([
    'teleport_state',
    'teleport_surface_id',
    'teleport_origin_surface_id',
    'teleport_controller_surface_id',
    'teleport_session_id',
    'teleport_persist'
]);

// Which transitions the manager may perform. Anything absent is refused rather
// than silently coerced, so a lost ACK can never be mistaken for an arrival.
const ALLOWED_TRANSITIONS = Object.freeze({
    [TELEPORT_STATES.LOCAL]: [TELEPORT_STATES.PREPARING],
    [TELEPORT_STATES.PREPARING]: [
        TELEPORT_STATES.REMOTE,
        TELEPORT_STATES.LOCAL,
        TELEPORT_STATES.ERROR
    ],
    [TELEPORT_STATES.REMOTE]: [
        TELEPORT_STATES.PREPARING,
        TELEPORT_STATES.RETURNING,
        TELEPORT_STATES.PERSISTED_REMOTE,
        TELEPORT_STATES.REMOTE_CONTROLLED,
        TELEPORT_STATES.DISCONNECTED
    ],
    [TELEPORT_STATES.REMOTE_CONTROLLED]: [
        TELEPORT_STATES.REMOTE,
        TELEPORT_STATES.RETURNING,
        TELEPORT_STATES.PERSISTED_REMOTE,
        TELEPORT_STATES.DISCONNECTED
    ],
    [TELEPORT_STATES.RETURNING]: [TELEPORT_STATES.LOCAL, TELEPORT_STATES.ERROR],
    [TELEPORT_STATES.PERSISTED_REMOTE]: [
        TELEPORT_STATES.PREPARING,
        TELEPORT_STATES.RETURNING,
        TELEPORT_STATES.REMOTE,
        TELEPORT_STATES.DISCONNECTED
    ],
    // A dropped destination is recoverable: the object is still logically ours.
    // Reconnecting restores REMOTE, or PERSISTED_REMOTE when the user had chosen
    // to leave the object there, so a network blip cannot silently revoke "laisser".
    [TELEPORT_STATES.DISCONNECTED]: [
        TELEPORT_STATES.REMOTE,
        TELEPORT_STATES.PERSISTED_REMOTE,
        TELEPORT_STATES.RETURNING,
        TELEPORT_STATES.LOCAL,
        TELEPORT_STATES.ERROR
    ],
    [TELEPORT_STATES.ERROR]: [TELEPORT_STATES.LOCAL, TELEPORT_STATES.RETURNING]
});

const KNOWN_STATES = new Set(Object.values(TELEPORT_STATES));

export function normalizeTeleportState(value) {
    const raw = String(value ?? '').trim().toUpperCase();
    return KNOWN_STATES.has(raw) ? raw : TELEPORT_STATES.LOCAL;
}

export function canTransition(from, to) {
    const source = normalizeTeleportState(from);
    const target = normalizeTeleportState(to);
    if (source === target) return false;
    return (ALLOWED_TRANSITIONS[source] || []).includes(target);
}

// Reads the teleport view of an atome's properties. Absent properties mean LOCAL:
// every atome created before this feature existed is local, with no migration.
export function readTeleportState(properties) {
    const props = properties && typeof properties === 'object' ? properties : {};
    return {
        state: normalizeTeleportState(props.teleport_state),
        surfaceId: String(props.teleport_surface_id || '').trim(),
        originSurfaceId: String(props.teleport_origin_surface_id || '').trim(),
        controllerSurfaceId: String(props.teleport_controller_surface_id || '').trim(),
        sessionId: String(props.teleport_session_id || '').trim(),
        persist: props.teleport_persist === true || props.teleport_persist === 'true'
    };
}

// True when this surface must paint the object itself rather than a residual proxy.
// An empty `teleport_surface_id` means "not teleported", so it renders everywhere the
// atome would normally render — that is the pre-feature behaviour.
export function rendersOnSurface(properties, surfaceId) {
    const { surfaceId: activeSurfaceId } = readTeleportState(properties);
    if (!activeSurfaceId) return true;
    return activeSurfaceId === String(surfaceId || '').trim();
}

export function isTeleported(properties) {
    return Boolean(readTeleportState(properties).surfaceId);
}

function patch(fields) {
    return Object.freeze({ ...fields });
}

// --- Transition builders -----------------------------------------------------
//
// Each returns `{ ok, patch }` or `{ ok: false, error }`. They never touch the
// database: the caller commits the patch through the normal event pipeline, so
// authorization and broadcast stay where they already live.

export function buildPrepareTeleportPatch(current, { targetSurfaceId, sourceSurfaceId, sessionId }) {
    const state = readTeleportState(current);
    const target = String(targetSurfaceId || '').trim();
    const source = String(sourceSurfaceId || '').trim();
    if (!target) return { ok: false, error: 'teleport_target_required' };
    if (!sessionId) return { ok: false, error: 'teleport_session_required' };
    if (target === state.surfaceId) return { ok: false, error: 'teleport_already_on_target' };
    if (!state.surfaceId && target === source) return { ok: false, error: 'teleport_target_is_source' };
    if (!canTransition(state.state, TELEPORT_STATES.PREPARING)) {
        return { ok: false, error: `teleport_invalid_transition_from_${state.state}` };
    }
    return {
        ok: true,
        patch: patch({
            teleport_state: TELEPORT_STATES.PREPARING,
            teleport_session_id: sessionId,
            // The origin is captured once, on the first hop, so "Rapatrier" always
            // means the surface the object actually came from — not the previous
            // stop of a Phone → Mac → iPad chain (§22).
            teleport_origin_surface_id: state.originSurfaceId || source || ''
        })
    };
}

export function buildCommitTeleportPatch(current, { targetSurfaceId, sessionId }) {
    const state = readTeleportState(current);
    const target = String(targetSurfaceId || '').trim();
    if (!target) return { ok: false, error: 'teleport_target_required' };
    if (state.sessionId !== String(sessionId || '')) {
        return { ok: false, error: 'teleport_session_mismatch' };
    }
    if (!canTransition(state.state, TELEPORT_STATES.REMOTE)) {
        return { ok: false, error: `teleport_invalid_transition_from_${state.state}` };
    }
    return {
        ok: true,
        patch: patch({
            teleport_state: TELEPORT_STATES.REMOTE,
            teleport_surface_id: target,
            // Control stays with the surface that initiated the move (§9.2): the
            // phone keeps driving the video it just pushed to the Mac.
            teleport_controller_surface_id: state.originSurfaceId || '',
            teleport_session_id: ''
        })
    };
}

// Rollback: a declined offer, a timeout, or a destination that vanished before it
// confirmed. The object was never removed from the source, so this only clears the
// in-flight markers.
export function buildCancelTeleportPatch(current, { sessionId = null, reason = 'cancelled' } = {}) {
    const state = readTeleportState(current);
    if (state.state !== TELEPORT_STATES.PREPARING) {
        return { ok: false, error: `teleport_not_preparing_${state.state}` };
    }
    if (sessionId && state.sessionId !== String(sessionId)) {
        return { ok: false, error: 'teleport_session_mismatch' };
    }
    return {
        ok: true,
        reason,
        patch: patch({
            // Falls back to where the object actually is: still REMOTE if this was a
            // retarget of an already-teleported object, LOCAL otherwise.
            teleport_state: state.surfaceId ? TELEPORT_STATES.REMOTE : TELEPORT_STATES.LOCAL,
            teleport_session_id: ''
        })
    };
}

export function buildReturnTeleportPatch(current, { toSurfaceId = '' } = {}) {
    const state = readTeleportState(current);
    if (!state.surfaceId) return { ok: false, error: 'teleport_not_remote' };
    const destination = String(toSurfaceId || '').trim() || state.originSurfaceId;
    if (!destination) return { ok: false, error: 'teleport_origin_unknown' };
    if (!canTransition(state.state, TELEPORT_STATES.RETURNING)) {
        return { ok: false, error: `teleport_invalid_transition_from_${state.state}` };
    }
    return {
        ok: true,
        destination,
        patch: patch({
            teleport_state: TELEPORT_STATES.LOCAL,
            // Empty rather than the origin id: an object that came home renders
            // wherever the atome normally renders, exactly as before it ever left.
            teleport_surface_id: '',
            teleport_controller_surface_id: '',
            teleport_origin_surface_id: '',
            teleport_session_id: '',
            teleport_persist: false
        })
    };
}

// "Laisser" — the object stays on the destination on purpose (§21.B). It is an
// explicit user decision, never an inferred consequence of disconnecting.
export function buildPersistTeleportPatch(current) {
    const state = readTeleportState(current);
    if (!state.surfaceId) return { ok: false, error: 'teleport_not_remote' };
    if (!canTransition(state.state, TELEPORT_STATES.PERSISTED_REMOTE)) {
        return { ok: false, error: `teleport_invalid_transition_from_${state.state}` };
    }
    return {
        ok: true,
        patch: patch({
            teleport_state: TELEPORT_STATES.PERSISTED_REMOTE,
            teleport_persist: true
        })
    };
}

// The destination went away. The object is not lost and not returned: it is
// unreachable, and the source keeps a residual proxy offering "Rapatrier" (§16).
export function buildDisconnectTeleportPatch(current, { surfaceId }) {
    const state = readTeleportState(current);
    const lost = String(surfaceId || '').trim();
    if (!lost || state.surfaceId !== lost) return { ok: false, error: 'teleport_surface_not_active' };
    if (!canTransition(state.state, TELEPORT_STATES.DISCONNECTED)) {
        return { ok: false, error: `teleport_invalid_transition_from_${state.state}` };
    }
    return {
        ok: true,
        patch: patch({
            teleport_state: TELEPORT_STATES.DISCONNECTED,
            teleport_session_id: ''
        })
    };
}

// The destination came back with the same persisted surface id (§13: identity must
// survive a reconnection).
export function buildReconnectTeleportPatch(current, { surfaceId }) {
    const state = readTeleportState(current);
    const back = String(surfaceId || '').trim();
    if (state.state !== TELEPORT_STATES.DISCONNECTED) {
        return { ok: false, error: `teleport_not_disconnected_${state.state}` };
    }
    if (!back || state.surfaceId !== back) return { ok: false, error: 'teleport_surface_not_active' };
    const restored = state.persist ? TELEPORT_STATES.PERSISTED_REMOTE : TELEPORT_STATES.REMOTE;
    if (!canTransition(state.state, restored)) {
        return { ok: false, error: `teleport_invalid_transition_from_${state.state}` };
    }
    return { ok: true, patch: patch({ teleport_state: restored }) };
}
