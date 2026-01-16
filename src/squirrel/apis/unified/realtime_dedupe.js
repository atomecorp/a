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
    'transform',
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
