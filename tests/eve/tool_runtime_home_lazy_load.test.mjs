import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBevyToolCountdown } from '../../eVe/intuition/ribbon/bevy_ui_tool_countdown.js';
import { createBevyMainMenuInteractions } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_interactions.js';
import { createBevyMainMenuHoldRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_hold_runtime.js';
import { buildPanelRuntimeConfigByToolId } from '../../eVe/intuition/panel_definitions.js';
import { createToolRuntimeBootstrapPanelHandlers } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_panel_handlers.js';
import { createMainMenuContentRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js';
import { createMainToolCatalogRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js';
import { createRuntimeHarness, findNode } from './bevy_ui_main_menu_test_helpers.mjs';
import { eveT } from '../../eVe/i18n/i18n.js';

const ensureString = (value, fallback = '') => {
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback;
};

const createHomeHandler = ({ ensureToolModule, callWindowRuntimeFunction, buildDynamicImportFailureResult, openPanelSurface = vi.fn() }) => (
    createToolRuntimeBootstrapPanelHandlers({
        DEFAULT_PRESENTATION: 'ui',
        buildDynamicImportFailureResult,
        callWindowRuntimeFunction,
        closePanelSurface: vi.fn(),
        deepClone: (value) => structuredClone(value),
        ensureString,
        ensureToolModule,
        isPlainObject: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        normalizeAction: action => action || 'pointer.click',
        openPanelSurface,
        readRegisteredHandlerLatchedState: () => false,
        resolveRegisteredHandlerNextLatchedState: () => true,
        writeRegisteredHandlerLatchedState: vi.fn()
    }).executeBootstrapPanelHandler
);

describe('Runtime V2 Home lazy owner', () => {
    it('loads the canonical Home module before invoking its window owner', async () => {
        const order = [];
        const ensureToolModule = vi.fn(async (moduleKey) => order.push(`module:${moduleKey}`));
        const callWindowRuntimeFunction = vi.fn(async (name) => {
            order.push(`window:${name}`);
            return { ok: true, invoked: true, result: { ok: true } };
        });
        const executeBootstrapPanelHandler = createHomeHandler({
            ensureToolModule,
            callWindowRuntimeFunction,
            buildDynamicImportFailureResult: vi.fn()
        });
        const config = buildPanelRuntimeConfigByToolId()['ui.home.panel'];

        const result = await executeBootstrapPanelHandler({ tool_id: 'ui.home.panel' }, config);

        expect(config).toMatchObject({ module_key: 'home', open_fn: 'open_home_panel' });
        expect(order).toEqual(['module:home', 'window:open_home_panel']);
        expect(result).toMatchObject({ ok: true, active: true, bridged: 'window_function' });
    });

    it('returns the existing typed import failure without invoking the window owner', async () => {
        const error = new Error('home_import_failed');
        const ensureToolModule = vi.fn(async () => { throw error; });
        const callWindowRuntimeFunction = vi.fn();
        const buildDynamicImportFailureResult = vi.fn((owner, cause, details) => ({
            ok: false,
            error: 'dynamic_import_failed',
            owner,
            cause: cause.message,
            ...details
        }));
        const executeBootstrapPanelHandler = createHomeHandler({
            ensureToolModule,
            callWindowRuntimeFunction,
            buildDynamicImportFailureResult
        });

        const result = await executeBootstrapPanelHandler(
            { tool_id: 'ui.home.panel' },
            { module_key: 'home', open_fn: 'open_home_panel', close_fn: 'close_home_panel' }
        );

        expect(result).toMatchObject({
            ok: false,
            error: 'dynamic_import_failed',
            owner: 'home_module',
            tool_id: 'ui.home.panel'
        });
        expect(callWindowRuntimeFunction).not.toHaveBeenCalled();
    });
});

describe('User tool canonical command', () => {
    it('retains the complete Expert toolbar and the existing Beginner composition', async () => {
        const inert = [
            'applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel', 'closeCommunicatePanel',
            'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel', 'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMatrixView',
            'closeMediaPanel', 'closePastePanel', 'closeTimelinePanel', 'closeUndoPanel', 'ensureActivitiesModule', 'ensureCopyModule',
            'ensurePastePanelModule', 'handleAiTouch', 'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel',
            'openCanonicalHomePanel', 'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel', 'openFinderPanel', 'openFontPanel',
            'openInfoPanel', 'openLayerPanel', 'openMatrixView', 'openMediaPanel', 'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'
        ];
        const content = createMainMenuContentRuntime({ ...Object.fromEntries(inert.map(key => [key, () => null])),
            defaultOrientation: 'up', directionValueToLabel: {}, directionValues: [], translate: eveT,
            mainToolIdByKey: createMainToolCatalogRuntime({ normalizeMainToolKey: key => key }).mainToolIdByKey });
        const h = createRuntimeHarness({ content });
        h.window.__eveWorkspaceMode = { mode: 'project', projectId: 'expert-toolbar' };
        h.window.__eveProfilePreferences = { visual: { masteryLevel: 'advanced' } };
        try {
            await h.runtime.showFully();
            const expected = ['capture', 'create', 'find', 'communicate', 'calendar', 'view', 'help', 'contact'];
            expect(h.runtime.measure().itemCount).toBe(expected.length + 1);
            expect(h.runtime.state.lastTree.items.map(item => item.key)).toEqual(expect.arrayContaining(expected));
            expect(h.runtime.measure().treeMounted).toBe(true);
            expect(h.runtime.measure().reservedHeight).toBeGreaterThan(0);
            expect(content.contact).toMatchObject({ tool_id: 'ui.contact.panel', icon: 'contacts', longPressAction: 'pointer.long' });
            expect(content.contact.longPressActive).toBeUndefined();
            h.window.__eveProfilePreferences.visual.masteryLevel = 'beginner'; await h.runtime.refresh();
            expect(h.runtime.measure().itemCount).toBe(1);
            h.window.__eveProfilePreferences.visual.masteryLevel = 'advanced'; await h.runtime.refresh();
            expect(h.runtime.measure().itemCount).toBe(expected.length + 1);
        } finally { h.runtime.destroy(); h.restore(); h.dom.window.close(); }
    });
    it('keeps Contact opening on the panel command and routes only a long press to disconnect', async () => {
        const disconnect = vi.fn(async () => ({ ok: true, counted: true }));
        vi.doMock('../../eVe/intuition/tools/user.js', () => ({ disconnectHomeSession: disconnect }));
        try {
            const { buildBootstrapDefsA } = await import('../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js');
            const declared = buildBootstrapDefsA(value => value, value => value, 'calendar', 'handler').find(def => def.tool_id === 'ui.contact.panel');
            expect(declared.behavior.actions).toEqual(['pointer.click', 'pointer.long', 'state.on', 'state.off']);
            const openPanelSurface = vi.fn(async () => ({ ok: true }));
            const execute = createHomeHandler({ openPanelSurface });
            const config = buildPanelRuntimeConfigByToolId()['ui.contact.panel'];
            expect(await execute({ tool_id: 'ui.contact.panel', action: 'pointer.click' }, config)).toMatchObject({ ok: true, bridged: 'panel_api' });
            expect(openPanelSurface).toHaveBeenCalledOnce();
            expect(await execute({ tool_id: 'ui.contact.panel', action: 'pointer.long' }, config)).toEqual({ ok: true, counted: true });
            expect(disconnect).toHaveBeenCalledExactlyOnceWith({ toolId: 'ui.contact.panel' });
            expect(openPanelSurface).toHaveBeenCalledOnce();
            const { registerPanelUiToolsRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_tool_registration_runtime.js');
            const registered = new Map(), open = vi.fn(async () => ({ ok: true }));
            registerPanelUiToolsRuntime({ registerAtomeTool: () => {},
                registerUiAction: definition => registered.set(definition.tool_id, definition),
                ensureContactPanelModule: vi.fn(async () => {}), applyContactPanelOpen: open, applyContactPanelClose: vi.fn() });
            const contact = registered.get('ui.contact.panel');
            expect(await contact.handler({ event: 'touch' })).toEqual({ ok: true, opened: true, closed: false });
            expect(await contact.handler({ event: 'hold' })).toEqual({ ok: true, counted: true });
            expect(await contact.handler({ event: 'pointer.long' })).toEqual({ ok: true, counted: true });
            expect(disconnect).toHaveBeenCalledTimes(3); expect(open).toHaveBeenCalledOnce();
        } finally { vi.doUnmock('../../eVe/intuition/tools/user.js'); vi.resetModules(); }
    });
});

describe('Home long-press session feedback', () => {
    afterEach(() => vi.useRealTimers());
    const harness = () => {
        vi.useFakeTimers();
        const painted = [], patches = [];
        let presentation;
        const countdown = createBevyToolCountdown({
            setPresentation: value => {
                presentation = value.presentation;
                if (presentation) {
                    const nodes = presentation.buildNodes({ itemSize: 60, zIndex: 4 });
                    painted.push(nodes.find(node => node.id.endsWith('_countdown'))?.text ?? 'icon');
                }
            },
            patchIcon: update => patches.push(update), now: () => Date.now()
        });
        return { countdown, painted, patches, presentation: () => presentation,
            item: { id: 'home', toolId: 'tool.main.home', icon: './assets/images/icons/home.svg', label: 'Home' } };
    };
    it('fades through the shared motion path, paints 2, 1 and 0, then executes once', async () => {
        const h = harness(), complete = vi.fn(async () => ({ ok: true }));
        const pending = h.countdown.start({ item: h.item, complete });
        expect(h.countdown.start({ item: h.item, complete })).toBe(pending);
        await vi.advanceTimersByTimeAsync(192);
        expect(h.patches[0].opacity).toBeGreaterThan(0);
        expect(h.patches.at(-1).opacity).toBe(0);
        expect(h.painted).toEqual(['icon', '2']);
        expect(complete).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(h.painted.at(-1)).toBe('1');
        await vi.advanceTimersByTimeAsync(1000);
        expect(h.painted.at(-1)).toBe('0');
        expect(complete).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(200);
        expect(await pending).toEqual({ ok: true });
        expect(complete).toHaveBeenCalledTimes(1);
        expect(h.presentation()).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('cancels pending feedback when the menu closes without disconnecting', async () => {
        const h = harness(), complete = vi.fn();
        const pending = h.countdown.start({ item: h.item, complete });
        await vi.advanceTimersByTimeAsync(500);
        h.countdown.cancel();
        expect(await pending).toEqual({ ok: true, cancelled: true });
        await vi.advanceTimersByTimeAsync(4000);
        expect(complete).not.toHaveBeenCalled();
        expect(h.presentation()).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('restores the ordinary icon after a refused disconnect', async () => {
        const h = harness();
        const pending = h.countdown.start({ item: h.item, complete: async () => { throw new Error('logout_failed'); } });
        await vi.advanceTimersByTimeAsync(2400);
        expect(await pending).toEqual({ ok: false, error: 'logout_failed' });
        expect(h.presentation()).toBeUndefined();
    });
    it('settles synchronous presentation errors and retains cancellation until feedback is cleared', async () => {
        vi.useFakeTimers();
        let releaseClear;
        const clearReady = new Promise(resolve => { releaseClear = resolve; });
        const countdown = createBevyToolCountdown({ setPresentation: ({ presentation }) => {
            if (presentation) throw new Error('projection_failed');
            return clearReady;
        }, patchIcon: vi.fn() });
        const complete = vi.fn(), item = { id: 'contact', toolId: 'ui.contact.panel', label: 'Utilisateur' };
        const pending = countdown.start({ item, complete });
        await vi.advanceTimersByTimeAsync(0);
        expect(countdown.start({ item, complete })).toBe(pending);
        releaseClear(); expect(await pending).toEqual({ ok: false, error: 'projection_failed' });
        expect(complete).not.toHaveBeenCalled(); expect(countdown.isActive()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('keeps the simple activation and upward panel swipe separate from a stationary hold', async () => {
        vi.useFakeTimers();
        const invoked = [];
        const hold = createBevyMainMenuHoldRuntime();
        const interactions = createBevyMainMenuInteractions({
            state: { latchedByToolId: new Map(), sliderStateByKey: new Map(), activePaletteKey: '', pressedId: '', hoveredId: '' },
            inlineSearch: {}, scroll: { press: () => {}, release: () => {}, consumeActivation: () => false }, hold, countdown: { cancel: vi.fn() },
            onInvoke: async (...args) => { invoked.push(args); return { ok: true }; },
            scheduleVisualRender: () => {}, runtimeResolver: () => null
        });
        const home = interactions.handlerForItem({ id: 'contact', type: 'tool', toolId: 'ui.contact.panel',
            entry: { key: 'contact', toolId: 'ui.contact.panel', canLongPress: true, longPressAction: 'pointer.long' } });
        try {
            await home.activate();
            expect(invoked.at(-1)[1]).toBe('bevy_ui.activate');
            await home.palette_slide_open();
            expect(invoked.at(-1)[2].actionOverride).toBe('state.on');
            home.press({ x: 10, y: 10 });
            await vi.advanceTimersByTimeAsync(520);
            expect(invoked.at(-1)[1]).toBe('bevy_ui.hold');
            home.release({ x: 10, y: 10 });
            const count = invoked.length;
            await home.activate();
            expect(invoked).toHaveLength(count);
            home.press({ x: 10, y: 10 });
            await home.long_press();
            await vi.advanceTimersByTimeAsync(520);
            expect(invoked).toHaveLength(count + 1);
            expect(invoked.at(-1)[2].actionOverride).toBe('pointer.long');
        } finally { hold.cancel(); interactions.lensController.cancel(); }
    });
});

describe('generic Home panel ownership', () => {
    it('uses the declared session-aware owner for generic open and close requests', async () => {
        const previousWindow = globalThis.window;
        vi.resetModules();
        const loadModule = vi.fn(async () => {});
        vi.doMock('../../eVe/intuition/panel_definitions.js', async () => ({
            ...await vi.importActual('../../eVe/intuition/panel_definitions.js'), ensureToolModule: loadModule
        }));
        const open = vi.fn(async () => ({ ok: true, compact: false }));
        const close = vi.fn(async () => ({ ok: true, closed: true }));
        globalThis.window = { open_home_panel: open, close_home_panel: close,
            addEventListener: () => {}, removeEventListener: () => {} };
        try {
            const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
            const panels = createPanelSurfaceRuntime();
            const context = { section: 'identity', projectId: 'qa', source: { type: 'panel_open_tool' } };
            expect(await panels.openPanelSurface('home', context)).toEqual({ ok: true, compact: false });
            expect(open).toHaveBeenCalledWith(context);
            expect(await panels.closePanelSurface('home', context)).toEqual({ ok: true, closed: true });
            expect(close).toHaveBeenCalledWith(context);
            expect(loadModule).toHaveBeenCalledWith('home');
        } finally {
            globalThis.window = previousWindow;
            vi.doUnmock('../../eVe/intuition/panel_definitions.js');
            vi.resetModules();
        }
    });
});

describe('shared User disconnect owner', () => {
    it('shares one countdown across both controls and refuses to log out a changed principal', async () => {
        vi.resetModules();
        let session = { mode: 'authenticated', user: { id: 'self' } }, finish;
        const logout = vi.fn(async () => ({ ok: true }));
        vi.doMock('../../atome/src/squirrel/apis/unified/adole_api/session.js', () => ({ getSessionState: () => session }));
        vi.doMock('../../eVe/intuition/tools/user_home_panel_runtime.js', () => ({ createUserHomePanelRuntime: () => ({}) }));
        vi.doMock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js', async () => ({
            ...await vi.importActual('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js'), logoutHomeSession: logout
        }));
        try {
            const { disconnectHomeSession } = await import('../../eVe/intuition/tools/user.js');
            const startCountdown = vi.fn(({ complete }) => new Promise(resolve => { finish = async () => resolve(await complete()); }));
            const pending = disconnectHomeSession({ startCountdown });
            expect(disconnectHomeSession({ startCountdown: vi.fn() })).toBe(pending);
            session = { mode: 'authenticated', user: { id: 'other' } };
            await finish(); expect(await pending).toEqual({ ok: false, error: 'user_logout_session_changed' });
            expect(logout).not.toHaveBeenCalled();
            session = { mode: 'anonymous', user: { id: 'guest' } };
            const guest = disconnectHomeSession({ startCountdown }); await finish();
            expect(await guest).toEqual({ ok: true }); expect(logout).toHaveBeenCalledExactlyOnceWith({ guest: true });
            session = { mode: 'logged_out', user: null };
            expect(disconnectHomeSession({ startCountdown })).toEqual({ ok: false, error: 'user_logout_session_required' });
            expect(startCountdown).toHaveBeenCalledTimes(2);
        } finally {
            vi.doUnmock('../../atome/src/squirrel/apis/unified/adole_api/session.js');
            vi.doUnmock('../../eVe/intuition/tools/user_home_panel_runtime.js');
            vi.doUnmock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js');
            vi.resetModules();
        }
    });
});


describe('User ribbon countdown gesture lifetime', () => {
    it.each(['release', 'cancel'].flatMap(phase => [100, 1200, 2250].map(elapsed => [phase, elapsed])))('stops a User countdown on %s at %i ms and allows another hold', async (phase, elapsed) => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
        const complete = vi.fn(async () => ({ ok: true }));
        let h;
        const content = { toolbox: { children: ['contact'] }, contact: { atome_tool: true,
            label: 'User', icon: 'contact', tool_id: 'ui.contact.panel', long_press_action: 'pointer.long' } };
        h = createRuntimeHarness({ content, onInvoke: () => h.runtime.startToolCountdown({ toolId: 'ui.contact.panel', complete }) });
        h.window.eveBevyUiRuntime.updateTreeMotion = vi.fn();
        try {
            await h.runtime.showFully();
            const tool = () => findNode(h.calls.filter(call => call.payload?.tree).at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_contact');
            tool().on.press({ x: 20, y: 20 });
            const pending = tool().on.long_press();
            await vi.advanceTimersByTimeAsync(elapsed);
            tool().on[phase]({ x: 20, y: 20 });
            await vi.advanceTimersByTimeAsync(4000);
            expect(await pending).toMatchObject({ cancelled: true });
            expect(complete).not.toHaveBeenCalled();
            tool().on.press({ x: 20, y: 20 });
            const next = tool().on.long_press();
            await vi.advanceTimersByTimeAsync(2600);
            expect(await next).toMatchObject({ ok: true });
            expect(complete).toHaveBeenCalledOnce();
        } finally { h.runtime.destroy(); h.restore(); vi.useRealTimers(); }
    });
});
