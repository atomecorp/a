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

// --- Transition builders -----------------------------------------------------
//
// Each returns `{ ok, patch }` or `{ ok: false, error }`. They never touch the
// database: the caller commits the patch through the normal event pipeline, so
// authorization and broadcast stay where they already live.

