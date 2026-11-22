// The journal of what every page learns and tells about the Atomes (user, 20 Nov. 2026: « des logs de façon à voir ce qui
// se passe chacun d'un côté et de l'autre »): one line per change, on every page, whatever carried it: this page's commit,
// the account (`ws/sync`), a connected screen's page (`external_display`), an echo dropped, a gesture's frames. Each line
// names its page (`app`, `screen`), the wall-clock time to the millisecond (the pages of one device share their clock, so
// two journals interleave), the change, the full Atome id and the keys it carries, never their values (a text, a media
// path stay private). Lines go to the native log on iOS (the page's `console` handler, both pages have one), to the
// console elsewhere, and the last ones stay in `window.__eveSyncJournal` for a probe or a look in the inspector.
import { ATOME_CHANGE_EVENTS, ATOME_FRAME_EVENT } from './atome_change_signal.js';
import { isExternalDisplayFollower } from '../../external_display_role.js';

const KEPT = 400;
const FRAME_EVERY = 30;

const clock = () => {
    const d = new Date();
    const two = n => String(n).padStart(2, '0');
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const id = value => String(value == null ? '' : value).trim();
const keysOf = detail => [...Object.keys(detail?.properties || detail?.props || {}), ...(detail?.delete_keys || []).map(k => `-${k}`)].slice(0, 12).join(',');

export const createSyncJournal = (env = globalThis.window) => {
    const page = isExternalDisplayFollower() ? 'screen' : 'app';
    const kept = [];
    const native = env?.webkit?.messageHandlers?.console;
    const write = (line) => {
        kept.push(line);
        if (kept.length > KEPT) kept.shift();
        try {
            if (native?.postMessage) native.postMessage({ source: 'sync', level: 'info', message: line });
            else env?.console?.info?.(line);
        } catch (_) { /* a journal never breaks what it watches */ }
    };
    const note = (what, fields = {}) => write(`[SYNC] ${clock()} ${page} ${what} ${Object.entries(fields)
        .filter(([, value]) => value !== '' && value != null).map(([key, value]) => `${key}=${value}`).join(' ')}`.trim());
    const frames = new Map();
    const listeners = [
        ...Object.values(ATOME_CHANGE_EVENTS).map(name => [name, (event) => {
            const detail = event?.detail || {};
            const atome = id(detail.atome_id || detail.id);
            if (!atome || atome.startsWith('tool_ui.')) return;
            note(name.replace('squirrel:atome-', ''), { atome, from: detail.origin || detail.source || '?', keys: keysOf(detail),
                event: id(detail.event_id) || null });
        }]),
        [ATOME_FRAME_EVENT, (event) => {
            const detail = event?.detail || {};
            const key = `${id(detail.gesture_id)}:${id(detail.atome_id)}`;
            const count = (frames.get(key) || 0) + 1;
            frames.set(key, count);
            if (frames.size > 64) frames.delete(frames.keys().next().value);
            if (count === 1 || count % FRAME_EVERY === 0) note('frame', { atome: id(detail.atome_id), gesture: id(detail.gesture_id), n: count, keys: keysOf(detail) });
        }]
    ];
    listeners.forEach(([name, listener]) => env?.addEventListener?.(name, listener));
    if (env) env.__eveSyncJournal = kept;
    return { note, lines: () => [...kept], stop: () => listeners.forEach(([name, listener]) => env?.removeEventListener?.(name, listener)) };
};

// One journal per page, whoever asks first.
let shared = null;
export const syncJournal = (env = globalThis.window) => (shared ||= createSyncJournal(env));
