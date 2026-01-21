const REALTIME_DEDUP_WINDOW_MS = 5000;
const SELF_PATCH_TTL_MS = 3000;
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
const editingAtomes = new Set();

/**
 * Mark an atome as being actively edited locally.
 * While marked, remote patches for this atome will be ignored.
 * @param {string} atomeId - The atome ID being edited
 */
export function markAtomeAsEditing(atomeId) {
    if (atomeId) editingAtomes.add(String(atomeId));
}

/**
 * Unmark an atome as being edited.
 * Remote patches will be allowed again.
 * @param {string} atomeId - The atome ID that finished editing
 */
export function unmarkAtomeAsEditing(atomeId) {
    if (atomeId) editingAtomes.delete(String(atomeId));
}

/**
 * Check if an atome is currently being edited locally.
 * @param {string} atomeId - The atome ID to check
 * @returns {boolean} True if the atome is in edit mode
 */
export function isAtomeBeingEdited(atomeId) {
    return atomeId ? editingAtomes.has(String(atomeId)) : false;
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
    if (!atomeId || !fingerprint) return;
    const key = `${atomeId}:${fingerprint}`;
    selfPatchMap.set(key, Date.now());
    if (selfPatchMap.size > 500) {
        const now = Date.now();
        for (const [k, ts] of selfPatchMap.entries()) {
            if (now - ts > SELF_PATCH_TTL_MS * 2) selfPatchMap.delete(k);
        }
    }
}

export function isSelfPatch(atomeId, fingerprint) {
    if (!atomeId || !fingerprint) return false;
    const key = `${atomeId}:${fingerprint}`;
    const ts = selfPatchMap.get(key);
    if (!ts) return false;
    const now = Date.now();
    if (now - ts > SELF_PATCH_TTL_MS) {
        selfPatchMap.delete(key);
        return false;
    }
    return true;
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
    if (!atomeId) return false;

    // CRITICAL: Check if this atome is currently being edited locally.
    // If so, ignore all remote patches to prevent destroying the editing state.
    if (isAtomeBeingEdited(atomeId)) {
        return true;
    }

    const authorId = options.authorId || payload?.authorId || payload?.author_id || null;
    if (authorId && isFromCurrentUser(authorId)) {
        return true;
    }

    const fingerprint = buildFingerprint(payload);
    if (!fingerprint) return false;

    if (isSelfPatch(atomeId, fingerprint)) {
        return true;
    }

    const now = Date.now();
    const key = `${atomeId}:${fingerprint}`;
    const last = dedupMap.get(key) || 0;
    if (now - last <= REALTIME_DEDUP_WINDOW_MS) {
        return true;
    }

    dedupMap.set(key, now);
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
