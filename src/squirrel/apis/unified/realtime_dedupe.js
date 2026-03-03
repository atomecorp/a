const REALTIME_DEDUP_WINDOW_MS = 5000;
const SELF_PATCH_TTL_MS = 3000;
const EDITING_IDLE_WINDOW_MS = 1200;
const REALTIME_KEYS = [
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'x',
    'y',
    'rotation',
    'rotate',
    'transform',
    'opacity',
    'zIndex',
    'background',
    'backgroundColor',
    'color',
    'text',
    'content',
    'textContent',
    'fontSize',
    'fontFamily',
    'fontWeight',
    'borderRadius',
    'radius',
    'scale',
    'scaleX',
    'scaleY'
];

const dedupMap = new Map();
const selfPatchMap = new Map();
const editingAtomes = new Map();
const RECENT_LOCAL_DRAG_ENDS_KEY = '__EVE_RECENT_LOCAL_DRAG_ENDS__';
const RECENT_LOCAL_RESIZE_ENDS_KEY = '__EVE_RECENT_LOCAL_RESIZE_ENDS__';
const RECENT_LOCAL_GESTURE_END_TTL_MS = 4200;

const normalizeAtomeId = (value) => String(value || '').trim();

const resolveAtomeIdAliases = (atomeId) => {
    const id = normalizeAtomeId(atomeId);
    if (!id) return [];
    const aliases = new Set([id]);
    if (id.startsWith('atome_')) {
        const unprefixed = normalizeAtomeId(id.slice(6));
        if (unprefixed) aliases.add(unprefixed);
    } else {
        aliases.add(`atome_${id}`);
    }
    return Array.from(aliases);
};

const isRealtimeDedupDebugEnabled = () => {
    if (typeof window === 'undefined') return false;
    if (window.__EVE_DEBUG_REALTIME_DEDUP__ === true) return true;
    try {
        return window.localStorage?.getItem('eve.debug.realtime_dedup') === '1';
    } catch (_) {
        return false;
    }
};

const logRealtimeDedup = (stage, detail = {}) => {
    if (!isRealtimeDedupDebugEnabled()) return;
    try {
        console.log('[eVe:realtime_dedup]', stage, detail);
    } catch (_) { }
};

const parseFiniteRealtimeNumber = (value) => {
    const normalized = normalizeValue(value);
    return Number.isFinite(normalized) ? Number(normalized) : null;
};

const resolveRecentLocalGestureEndByAliases = (aliases = [], storageKey = '') => {
    if (typeof window === 'undefined') return null;
    if (!Array.isArray(aliases) || !aliases.length) return null;
    const key = String(storageKey || '').trim();
    if (!key) return null;
    const map = window[key];
    if (!map || typeof map !== 'object') return null;
    const now = Date.now();
    let best = null;
    aliases.forEach((alias) => {
        const entry = map[alias];
        const endedAt = Number(entry?.endedAt || 0);
        if (!endedAt || (now - endedAt) > RECENT_LOCAL_GESTURE_END_TTL_MS) {
            delete map[alias];
            return;
        }
        if (!best || endedAt > Number(best?.endedAt || 0)) {
            best = {
                alias,
                endedAt,
                left: parseFiniteRealtimeNumber(entry?.left),
                top: parseFiniteRealtimeNumber(entry?.top),
                width: parseFiniteRealtimeNumber(entry?.width),
                height: parseFiniteRealtimeNumber(entry?.height),
                gestureId: String(entry?.gestureId || '').trim() || null,
                txId: String(entry?.txId || '').trim() || null
            };
        }
    });
    return best;
};

const resolveRealtimePatchGeometry = (payload = {}) => ({
    left: parseFiniteRealtimeNumber(payload?.left ?? payload?.x),
    top: parseFiniteRealtimeNumber(payload?.top ?? payload?.y),
    width: parseFiniteRealtimeNumber(payload?.width),
    height: parseFiniteRealtimeNumber(payload?.height)
});

/**
 * Mark an atome as being actively edited locally.
 * While marked, remote patches for this atome will be ignored.
 * @param {string} atomeId - The atome ID being edited
 */
export function markAtomeAsEditing(atomeId) {
    const aliases = resolveAtomeIdAliases(atomeId);
    if (!aliases.length) return;
    const now = Date.now();
    aliases.forEach((alias) => {
        editingAtomes.set(alias, now);
    });
    logRealtimeDedup('mark_editing', {
        atome_id: normalizeAtomeId(atomeId) || null,
        aliases
    });
}

/**
 * Unmark an atome as being edited.
 * Remote patches will be allowed again.
 * @param {string} atomeId - The atome ID that finished editing
 */
export function unmarkAtomeAsEditing(atomeId) {
    const aliases = resolveAtomeIdAliases(atomeId);
    aliases.forEach((alias) => {
        editingAtomes.delete(alias);
    });
    logRealtimeDedup('unmark_editing', {
        atome_id: normalizeAtomeId(atomeId) || null,
        aliases
    });
}

/**
 * Check if an atome is currently being edited locally.
 * @param {string} atomeId - The atome ID to check
 * @returns {boolean} True if the atome is in edit mode
 */
export function isAtomeBeingEdited(atomeId) {
    const aliases = resolveAtomeIdAliases(atomeId);
    if (!aliases.length) return false;
    const now = Date.now();
    for (const alias of aliases) {
        const ts = editingAtomes.get(alias);
        if (!ts) continue;
        if ((now - ts) <= EDITING_IDLE_WINDOW_MS) return true;
    }
    return false;
}

const getCurrentUserId = () => {
    if (typeof window === 'undefined') return null;
    try {
        const api = window.AdoleAPI;
        if (api?.auth?.getCurrentInfo) {
            const info = api.auth.getCurrentInfo();
            return info?.user_id || info?.userId || info?.id || info?.atome_id || null;
        }
    } catch (_) { }
    return null;
};

export function rememberSelfPatch(atomeId, fingerprint) {
    const aliases = resolveAtomeIdAliases(atomeId);
    if (!aliases.length || !fingerprint) return;
    const now = Date.now();
    aliases.forEach((alias) => {
        const key = `${alias}:${fingerprint}`;
        selfPatchMap.set(key, now);
    });
    logRealtimeDedup('remember_self_patch', {
        atome_id: normalizeAtomeId(atomeId) || null,
        aliases,
        fingerprint
    });
    if (selfPatchMap.size > 500) {
        for (const [k, ts] of selfPatchMap.entries()) {
            if (now - ts > SELF_PATCH_TTL_MS * 2) selfPatchMap.delete(k);
        }
    }
}

export function isSelfPatch(atomeId, fingerprint) {
    const aliases = resolveAtomeIdAliases(atomeId);
    if (!aliases.length || !fingerprint) return false;
    const now = Date.now();
    for (const alias of aliases) {
        const key = `${alias}:${fingerprint}`;
        const ts = selfPatchMap.get(key);
        if (!ts) continue;
        if (now - ts > SELF_PATCH_TTL_MS) {
            selfPatchMap.delete(key);
            continue;
        }
        return true;
    }
    return false;
}

export function isFromCurrentUser(authorId) {
    if (!authorId) return false;
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return false;
    return String(authorId) === String(currentUserId);
}

const normalizeValue = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        const numericMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)(px|deg|rad)?$/i);
        if (numericMatch) {
            const num = Number.parseFloat(numericMatch[1]);
            if (Number.isFinite(num)) {
                if (numericMatch[2] && numericMatch[2].toLowerCase() === 'rad') {
                    return Number.parseFloat((num * 180 / Math.PI).toFixed(4));
                }
                return num;
            }
        }
        return trimmed;
    }
    if (typeof value === 'boolean') return value;
    return null;
};

const canonicalKey = (key) => {
    const base = String(key || '').startsWith('css.')
        ? String(key).slice(4)
        : String(key || '');
    if (base === 'x') return 'left';
    if (base === 'y') return 'top';
    if (base === 'rotation') return 'rotate';
    if (base === 'radius') return 'borderRadius';
    return base;
};

const extractKeys = (source, target, prefix = '') => {
    if (!source || typeof source !== 'object') return;
    REALTIME_KEYS.forEach((key) => {
        const normalized = normalizeValue(source[key]);
        if (normalized != null) {
            const normalizedKey = canonicalKey(`${prefix}${key}`);
            target[normalizedKey] = normalized;
        }
    });
};

const buildFingerprint = (payload) => {
    const props = payload?.properties || payload?.particles || payload?.data || payload || null;
    if (!props || typeof props !== 'object') return '';

    const fingerprint = {};
    extractKeys(props, fingerprint, '');

    if (props.css && typeof props.css === 'object') {
        extractKeys(props.css, fingerprint, 'css.');
    }

    Object.keys(props).forEach((key) => {
        if (!key.startsWith('css.')) return;
        const normalized = normalizeValue(props[key]);
        if (normalized != null) {
            const normalizedKey = canonicalKey(key.replace(/^css\./, ''));
            fingerprint[normalizedKey] = normalized;
        }
    });

    const entries = Object.entries(fingerprint);
    if (!entries.length) return '';

    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(Object.fromEntries(entries));
};

export function shouldIgnoreRealtimePatch(atomeId, payload, options = {}) {
    const aliases = resolveAtomeIdAliases(atomeId);
    if (!aliases.length) return false;
    const baseLog = {
        atome_id: normalizeAtomeId(atomeId) || null,
        aliases,
        source: String(options?.source || '').trim() || null,
        origin: String(options?.origin || '').trim() || null
    };

    // CRITICAL: Check if this atome is currently being edited locally.
    // If so, ignore all remote patches to prevent destroying the editing state.
    if (isAtomeBeingEdited(aliases[0])) {
        logRealtimeDedup('ignore_patch', {
            reason: 'editing_active',
            ...baseLog
        });
        return true;
    }

    const authorId = options.authorId || payload?.authorId || payload?.author_id || null;
    if (authorId && isFromCurrentUser(authorId)) {
        logRealtimeDedup('ignore_patch', {
            reason: 'same_author',
            ...baseLog,
            author_id: String(authorId || '')
        });
        return true;
    }

    const fingerprint = buildFingerprint(payload);
    if (!fingerprint) {
        logRealtimeDedup('allow_patch', {
            reason: 'fingerprint_missing',
            ...baseLog
        });
        return false;
    }

    if (!authorId) {
        const recentDragEnd = resolveRecentLocalGestureEndByAliases(aliases, RECENT_LOCAL_DRAG_ENDS_KEY);
        const recentResizeEnd = resolveRecentLocalGestureEndByAliases(aliases, RECENT_LOCAL_RESIZE_ENDS_KEY);
        const recentLocalEnd = (() => {
            if (recentDragEnd && recentResizeEnd) {
                return Number(recentResizeEnd.endedAt || 0) >= Number(recentDragEnd.endedAt || 0)
                    ? recentResizeEnd
                    : recentDragEnd;
            }
            return recentResizeEnd || recentDragEnd || null;
        })();
        if (recentLocalEnd) {
            const geometry = resolveRealtimePatchGeometry(payload);
            const hasGeometry = [geometry.left, geometry.top, geometry.width, geometry.height]
                .some((value) => Number.isFinite(value));
            if (hasGeometry) {
                logRealtimeDedup('ignore_patch', {
                    reason: 'recent_local_gesture_guard',
                    ...baseLog,
                    fingerprint,
                    ended_at: Number(recentLocalEnd.endedAt || 0),
                    age_ms: Math.max(0, Date.now() - Number(recentLocalEnd.endedAt || 0)),
                    recent_geometry: {
                        left: recentLocalEnd.left,
                        top: recentLocalEnd.top,
                        width: recentLocalEnd.width,
                        height: recentLocalEnd.height
                    },
                    incoming_geometry: geometry
                });
                return true;
            }
        }
    }

    if (isSelfPatch(aliases[0], fingerprint)) {
        logRealtimeDedup('ignore_patch', {
            reason: 'self_patch_fingerprint',
            ...baseLog,
            fingerprint
        });
        return true;
    }

    const now = Date.now();
    for (const alias of aliases) {
        const key = `${alias}:${fingerprint}`;
        const last = dedupMap.get(key) || 0;
        if (now - last <= REALTIME_DEDUP_WINDOW_MS) {
            logRealtimeDedup('ignore_patch', {
                reason: 'dedup_window',
                ...baseLog,
                fingerprint,
                dedup_alias: alias,
                age_ms: Math.max(0, now - last)
            });
            return true;
        }
    }

    aliases.forEach((alias) => {
        dedupMap.set(`${alias}:${fingerprint}`, now);
    });
    logRealtimeDedup('allow_patch', {
        reason: 'new_patch',
        ...baseLog,
        fingerprint
    });
    if (dedupMap.size > 800) {
        for (const [entryKey, ts] of dedupMap.entries()) {
            if (now - ts > REALTIME_DEDUP_WINDOW_MS * 2) {
                dedupMap.delete(entryKey);
            }
        }
    }
    return false;
}

export { buildFingerprint };

export function resetRealtimeDedup() {
    dedupMap.clear();
    selfPatchMap.clear();
    editingAtomes.clear();
}
