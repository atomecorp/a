const REALTIME_DEDUP_WINDOW_MS = 5000;
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
    'opacity',
    'zIndex',
    'background',
    'backgroundColor',
    'color',
    'text',
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

const normalizeValue = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value;
    return null;
};

const extractKeys = (source, target, prefix = '') => {
    if (!source || typeof source !== 'object') return;
    REALTIME_KEYS.forEach((key) => {
        const normalized = normalizeValue(source[key]);
        if (normalized != null) {
            target[`${prefix}${key}`] = normalized;
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
            fingerprint[key] = normalized;
        }
    });

    const entries = Object.entries(fingerprint);
    if (!entries.length) return '';

    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(Object.fromEntries(entries));
};

export function shouldIgnoreRealtimePatch(atomeId, payload) {
    if (!atomeId) return false;
    const fingerprint = buildFingerprint(payload);
    if (!fingerprint) return false;

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

export function resetRealtimeDedup() {
    dedupMap.clear();
}
