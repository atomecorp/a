import { test, expect, vi } from 'vitest';

const panels = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), isOpen: vi.fn(), mounted: new Map() }));
const login = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), openCredentials: vi.fn(), isOpen: () => false }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', async original => ({
    ...await original(), openBevyPanelSurface: panels.open, closeBevyPanelSurface: panels.close,
    isBevyPanelSurfaceOpen: panels.isOpen, bevyPanelRuntimeState: { mounted: panels.mounted }
}));
vi.mock('../../eVe/intuition/tools/user_login_shared_runtime.js', () => ({
    LOGIN_SEQUENCE_ID: 'login', ensureSharedLoginSequence: () => login, setSharedLoginHandlers() {}
}));
import { createGenerativeSlotRuntime } from '../../eVe/intuition/tools/ai_generators/slot_runtime.js';
import { createTagsPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tags_runtime.js';
import { createUserHomePanelRuntime } from '../../eVe/intuition/tools/user_home_panel_runtime.js';
import { buildPanelRuntimeConfigByToolId } from '../../eVe/intuition/panel_definitions.js';
import { createToolRuntimeBootstrapPanelHandlers } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_panel_handlers.js';
import { createRegisteredHandlerRuntime } from '../../eVe/intuition/tools/core/tool_runtime_registered_handler.js';
import { openRequiredPanel } from '../../eVe/intuition/runtime/eve_intuition/panel_actions_runtime.js';

const flush = async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('the registered Home action forwards its field and source while already latched', async () => {
    const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
    const ensureString = (value, fallback = '') => String(value || fallback);
    const latch = createRegisteredHandlerRuntime({ isPlainObject, ensureString,
        openActionSet: new Set(['open', 'state.on']), closeActionSet: new Set(['close', 'state.off']), pointerActionSet: new Set(['pointer.click']) });
    const callWindowRuntimeFunction = vi.fn(async () => ({ ok: true, invoked: true, result: { ok: true } }));
    const handlers = createToolRuntimeBootstrapPanelHandlers({ DEFAULT_PRESENTATION: 'ui', isPlainObject, ensureString,
        deepClone: structuredClone, normalizeAction: action => action, ensureToolModule: async () => {}, callWindowRuntimeFunction,
        readRegisteredHandlerLatchedState: () => true, writeRegisteredHandlerLatchedState: vi.fn(),
        resolveRegisteredHandlerNextLatchedState: latch.resolveRegisteredHandlerNextLatchedState });
    const input = { section: 'settings', focusField: 'security.aiKeys.openai' };
    await openRequiredPanel({ toolId: 'ui.home.panel', input, source: 'assistant_ai_settings',
        invoke: payload => handlers.executeBootstrapPanelHandler(payload, buildPanelRuntimeConfigByToolId()['ui.home.panel']) });
    expect(callWindowRuntimeFunction).toHaveBeenCalledWith('open_home_panel', expect.objectContaining({ input,
        source: { type: 'assistant_ai_settings' } }));
});

for (const [projectId, error, providerId] of [['', 'ai_generator_project_missing', 'openai'],
    ['project', 'NO_PROVIDER_KEY', 'runway'], ['project', 'not_authenticated', 'musicgpt']]) {
    test('generator prerequisite keeps the prompt and navigates without a reply: ' + error, async () => {
        const navigate = vi.fn(async () => ({ ok: true })), run = vi.fn(async () => { throw new Error(error); });
        const dock = { open: async () => {}, blur() {}, refresh() {} };
        const runtime = createGenerativeSlotRuntime({ id: 'fixture', kind: 'video', providerId,
            run, resolveProjectId: () => projectId, openSettings: navigate, dockFactory: () => dock,
            requestFrame: () => 1, translate: key => key, env: {} });
        await runtime.open();
        expect(await runtime.sendText('Keep this prompt')).toEqual({ ok: false, error }); await flush();
        expect(navigate).toHaveBeenCalledOnce(); expect(navigate.mock.calls[0][0]).toMatchObject({ error, providerId });
        const turns = runtime.getState().conversation.turns;
        expect(turns.at(-1)).toEqual({ role: 'user', text: 'Keep this prompt' });
        expect(turns.filter(turn => turn.role === 'assistant')).toHaveLength(1);
        expect(run).toHaveBeenCalledTimes(projectId ? 1 : 0);
        expect(runtime.getState().inputMode).toBe('text');
    });
}

test('a late generator rejection after close does not navigate', async () => {
    const job = deferred(), navigate = vi.fn(); const frames = [];
    const runtime = createGenerativeSlotRuntime({ id: 'fixture', kind: 'audio', run: async () => { await job.promise; throw new Error('NO_PROVIDER_KEY'); },
        resolveProjectId: () => 'project', openSettings: navigate, dockFactory: () => ({ open: async () => {}, blur() {}, refresh() {}, close: async () => {} }),
        requestFrame: frame => { frames.push(frame); return frames.length; }, renderScene: async () => {}, clearScene: async () => {}, now: () => 0, env: {} });
    await runtime.open(); const pending = runtime.sendText('Prompt'); await flush();
    void runtime.close(); job.resolve(); await pending; await flush(); expect(navigate).not.toHaveBeenCalled();
});

test('Tags opens Matrix and preserves the entered tag until the user chooses a News', async () => {
    const navigate = vi.fn(async () => ({ ok: true }));
    const tags = createTagsPanelSurface({ resolveProjectId: () => '', navigate });
    tags.state.query = 'Keep this tag';
    expect(await tags.submitQuery()).toEqual({ ok: false, error: 'news_project_required' });
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ toolId: 'ui.matrix.view', source: 'news_project_required' });
    expect(tags.state.query).toBe('Keep this tag'); expect(tags.state.notice).toBe('');
});

test('Home already open forwards nested tool input and waits for the requested field landing', async () => {
    const previous = globalThis.window;
    globalThis.window = { addEventListener() {}, dispatchEvent() {} };
    const ready = deferred(); let settled = false;
    panels.isOpen.mockReturnValue(true); panels.close.mockResolvedValue({ ok: true });
    panels.open.mockImplementation(async (_key, context) => { context.onHomeNavigationReady(ready.promise); return { ok: true }; });
    const home = createUserHomePanelRuntime({ getAdoleApi: () => ({ auth: { current: async () => ({ logged: true }) } }), openWorkspace: async () => ({ ok: true }) });
    try {
        const pending = home.openHomePanel({ input: { section: 'settings', focusField: 'security.aiKeys.openai' } }).then(result => { settled = true; return result; });
        await flush(); expect(settled).toBe(false); expect(panels.close).toHaveBeenCalled();
        expect(panels.open.mock.calls.at(-1)[1]).toMatchObject({ section: 'settings', focusField: 'security.aiKeys.openai' });
        ready.resolve({ ok: true }); expect((await pending).ok).toBe(true);
    } finally { globalThis.window = previous; }
});

test('a guest authentication prerequisite opens the existing credentials sequence', async () => {
    const previous = globalThis.window; globalThis.window = { addEventListener() {}, dispatchEvent() {} };
    panels.open.mockClear(); login.openCredentials.mockResolvedValue({ ok: true });
    const home = createUserHomePanelRuntime({ getAdoleApi: () => ({ security: { isAnonymous: () => true } }), openWorkspace: async () => ({ ok: true }) });
    try {
        expect((await home.openHomePanel({ input: { requireAuthentication: true } })).ok).toBe(true);
        expect(login.openCredentials).toHaveBeenCalled(); expect(panels.open).not.toHaveBeenCalled();
    } finally { globalThis.window = previous; }
});

test('a closed assistant while Home checks the session cannot open its panel', async () => {
    const previous = globalThis.window, session = deferred(); let active = true;
    globalThis.window = { addEventListener() {}, eveAssistantApi: { getState: () => ({ active, navigationGeneration: 2 }) } };
    panels.open.mockClear();
    const home = createUserHomePanelRuntime({ getAdoleApi: () => ({ auth: { current: () => session.promise } }), openWorkspace: async () => ({ ok: true }) });
    try {
        const pending = home.openHomePanel({ input: { section: 'settings', navigation: { owner: 'assistant', generation: 2 } } });
        await flush(); active = false; session.resolve({ logged: true });
        expect(await pending).toEqual({ ok: false, cancelled: true }); expect(panels.open).not.toHaveBeenCalled();
    } finally { globalThis.window = previous; }
});
