import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cloneValue = (value) => {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
};

const normalizeId = (value) => String(value || '').trim();
const createMockFetch = () => async (input) => {
    const url = new URL(String(input));
    if (url.protocol !== 'file:') throw new Error(`mock_fetch_unsupported_url:${url.protocol}`);
    const body = readFileSync(fileURLToPath(url), 'utf8');
    return {
        ok: true,
        text: async () => body,
        json: async () => JSON.parse(body)
    };
};
const installRuntimeContractAugmenters = (window) => {
    let toolBase = null;
    Object.defineProperty(window, 'eveToolBase', {
        configurable: true,
        get: () => toolBase,
        set: (value) => {
            if (value && typeof value.getProjectSceneState === 'function') {
                const readScene = value.getProjectSceneState;
                value.getProjectSceneState = (projectId) => ({
                    ...readScene(projectId),
                    projection: { ok: true }
                });
            }
            toolBase = value;
        }
    });
};

const createAtomeStore = () => {
    const records = new Map();

    const upsertRecord = (event = {}) => {
        const id = normalizeId(event.atome_id || event.id);
        if (!id) return { ok: false, error: 'missing_atome_id' };
        const props = event.props && typeof event.props === 'object' ? cloneValue(event.props) : {};
        const previous = records.get(id) || { id, atome_id: id, type: props.type || props.kind || 'atome', properties: {} };
        const nextProperties = {
            ...(previous.properties || {}),
            ...props
        };
        const next = {
            ...previous,
            id,
            atome_id: id,
            type: nextProperties.type || nextProperties.kind || previous.type || 'atome',
            kind: nextProperties.kind || previous.kind || nextProperties.type || 'atome',
            properties: nextProperties
        };
        records.set(id, next);
        return { ok: true, id, atome_id: id, record: cloneValue(next) };
    };

    return {
        commit: async (event = {}) => upsertRecord(event),
        commitBatch: async (events = []) => {
            const list = Array.isArray(events) ? events : [];
            const results = list.map((event) => upsertRecord(event));
            return { ok: results.every((result) => result.ok), results };
        },
        list: async (options = {}) => {
            const type = normalizeId(options.type || options.atome_type || '').toLowerCase();
            const atomes = Array.from(records.values())
                .filter((entry) => !type || String(entry.type || entry.kind || entry.properties?.type || '').toLowerCase() === type)
                .map(cloneValue);
            return { ok: true, atomes };
        },
        get: async (id) => {
            const key = normalizeId(id);
            return records.has(key) ? { ok: true, atome: cloneValue(records.get(key)) } : { ok: false, error: 'not_found' };
        },
        _records: records
    };
};

const installMockBrowserEnv = () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="intuition"></div></body></html>', {
        url: 'http://localhost/'
    });
    const { window } = dom;
    const store = createAtomeStore();
    installRuntimeContractAugmenters(window);

    window.Atome = {
        commit: store.commit,
        commitBatch: store.commitBatch
    };
    window.AdoleAPI = {
        atomes: {
            list: store.list,
            get: store.get
        },
        auth: {
            lookupPhone: async () => ({ ok: false, success: false, error: 'User not found' }),
            getCurrentInfo: () => {
                const auth = window.__authCheckResult;
                if (auth && auth.authenticated === false) return null;
                return { id: 'test_user' };
            }
        },
        security: {
            isAuthenticated: () => window.__authCheckResult?.authenticated !== false,
            isAnonymous: () => window.__authCheckResult?.anonymous === true
        }
    };
    window.atome = window.atome || {};
    window.atome.tools = window.atome.tools || {};
    window.__selectedAtomeIds = [];
    window.__selectedAtomeId = null;
    window.requestAnimationFrame = window.requestAnimationFrame || ((fn) => setTimeout(() => fn(Date.now()), 0));
    window.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
    window.requestIdleCallback = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 16 }), 0));
    window.cancelIdleCallback = window.cancelIdleCallback || ((id) => clearTimeout(id));
    window.fetch = createMockFetch();
    window.Element.prototype.animate = function animate() {
        return {
            cancel() {},
            finished: Promise.resolve()
        };
    };

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Element = window.Element;
    globalThis.Node = window.Node;
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.Event = window.Event;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.PointerEvent = window.PointerEvent || window.MouseEvent;
    globalThis.localStorage = window.localStorage;
    globalThis.fetch = window.fetch;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: window.navigator
    });
    globalThis.Atome = window.Atome;
    globalThis.AdoleAPI = window.AdoleAPI;
    globalThis.atome = window.atome;

    return { window, document: window.document, store };
};

export { installMockBrowserEnv };
