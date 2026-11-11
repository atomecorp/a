import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createMainMenuAuthRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_auth_runtime.js';
import { createUserWorkspaceRuntime } from '../../eVe/intuition/tools/user_workspace_runtime.js';
import { createUserHomePanelRuntime } from '../../eVe/intuition/tools/user_home_panel_runtime.js';
import { getFirstLaunchRuntime } from '../../eVe/domains/user/first_launch_runtime.js';
import * as panelRuntime from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import * as homeView from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js';
import { disconnectHomeSession } from '../../eVe/intuition/tools/user.js';
import { getSessionState, setSessionState, clearSessionState, resetWorkspaceForNextUser } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';

const transport = vi.hoisted(() => ({ presentations: [], cleanup: null, install: vi.fn(async () => ({ ok: true, project_id: 'goals' })) }));
vi.mock('../../eVe/domains/templates/system_template_runtime.js', async importOriginal => ({
    ...await importOriginal(), ensureSystemTemplate: transport.install
}));
vi.mock('../../eVe/domains/matrix/matrix_template_runtime.js', () => ({
    createMatrixTemplateRuntime: options => {
        const presentation = {
            open: vi.fn(async () => { options.readBounds(); return { ok: true }; }),
            render: vi.fn(async () => { options.readBounds(); return { ok: true }; }),
            destroy: vi.fn(async () => {})
        };
        presentation.activate = options.activate;
        presentation.writeDraft = options.writeDraft;
        transport.presentations.push(presentation);
        return presentation;
    }
}));

let dom;
afterEach(() => { dom?.window.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const setup = async () => {
    transport.presentations = [];
    dom = new JSDOM('<div id="view"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
    const win = dom.window;
    vi.stubGlobal('window', win); vi.stubGlobal('document', win.document); vi.stubGlobal('CustomEvent', win.CustomEvent);
    setSessionState({ mode: 'logged_out', user: null }, { persist: false, silent: true });
    const api = { auth: { getPendingPhoneLogin: vi.fn(async () => null), hasKnownPassword: vi.fn(async () => true),
        getPendingPairing: vi.fn(async () => null), getPendingRecovery: vi.fn(async () => null), listLocalAccounts: vi.fn(async () => []) }, security: { isAuthenticated: () => false, isAnonymous: () => false } };
    win.AdoleAPI = api; win.__authCheckComplete = true;
    win.__authCheckResult = { complete: true, authenticated: false, anonymous: false };
    win.__eveWorkspaceMode = { mode: 'project', projectId: 'outgoing' };
    const failures = []; win.addEventListener('eve:workspace-open-failed', event => failures.push(event.detail));
    const menu = { updateContent: vi.fn(), hideCompletely: vi.fn(), setToolLatchedState: vi.fn() };
    setMainMenuRuntime(menu, win);
    const gate = createMainMenuAuthRuntime({ intuitionContent: {}, translate: key => key, ensureHomePanelModule: async () => {} });
    gate.bindMainMenuAuthGate();
    const workspace = createUserWorkspaceRuntime({ getAdoleApi: () => api });
    const closePanel = vi.spyOn(panelRuntime, 'closeBevyPanelSurface');
    const home = createUserHomePanelRuntime({ getAdoleApi: () => api, openWorkspace: async () => ({ ok: true }),
        cleanupWorkspace: async options => { await transport.cleanup?.(); await workspace.performFullLogoutWorkspaceCleanup(options); } });
    return { win, api, home, gate, workspace, flow: getFirstLaunchRuntime, failures, menu, closePanel };
};

describe('logout first-launch ownership', () => {
    it('keeps foreign pairing open on an already authenticated phone and restores its workspace on dismissal', async () => {
        const f = await setup(); transport.cleanup = null;
        const user = { id: 'existing' };
        f.api.security.isAuthenticated = () => true; f.api.auth.getCurrentInfo = () => user;
        f.win.__authCheckResult = { complete: true, authenticated: true, userId: user.id };
        setSessionState({ mode: 'authenticated', user }, { persist: false, silent: true });
        f.api.auth.getPendingPhoneLogin.mockResolvedValue({ confirmationRequired: true });
        f.api.auth.cancelPhoneLogin = vi.fn(async () => { f.api.auth.getPendingPhoneLogin.mockResolvedValue(null); return { ok: true }; });
        f.win.dispatchEvent(new f.win.CustomEvent('squirrel:phone-login-pending', { detail: { confirmationRequired: true } }));
        await vi.waitFor(() => expect(f.flow()?.state.stage).toBe('pairing'));
        f.gate.syncMainMenuAuthContent({ force: true });
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(false);
        expect(f.flow().isOpen()).toBe(true);
        await f.flow().handle({ operation: 'dismiss_link' });
        expect(getSessionState()).toMatchObject({ mode: 'authenticated', user: { id: 'existing' } });
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(true);
    });
    // Logging out left Home (bevy_panel_home_view.js): it is the Atom's gesture on the Dashboard, whose red confirmation calls
    // dashboard_mystic_runtime.js `disconnect` → user.js#disconnectHomeSession → the canonical session owner, once.
    it('keeps the guest adoption in the Home band and ends the session only through the Atom disconnect path', async () => {
        const f = await setup();
        expect('buildHomeFixedContent' in homeView).toBe(false);
        f.api.security.guestAdoptionStatus = () => ({ pending: false });
        const actions = [];
        const band = homeView.buildHomeBandTools({ guest: false, busy: false, hardware: {} }, { emit: event => actions.push(event) });
        expect(band.map(tool => tool.key)).toEqual(['home_guest_adoption_accept', 'home_guest_adoption_decline']);
        band.forEach(tool => tool.onSelect());
        expect(actions).toEqual([{ type: 'home.guest.adopt' }, { type: 'home.guest.decline' }]);
        const atom = { startCountdown: ({ complete }) => complete() };
        expect(await disconnectHomeSession(atom)).toEqual({ ok: false, error: 'user_logout_session_required' });
        f.api.auth.logout = vi.fn(async () => ({ ok: true }));
        setSessionState({ mode: 'authenticated', user: { id: 'existing' } }, { persist: false, silent: true });
        const [first, second] = [disconnectHomeSession(atom), disconnectHomeSession(atom)];
        expect(second).toBe(first);
        expect(await first).toEqual({ ok: true });
        expect(f.api.auth.logout).toHaveBeenCalledTimes(1);
        f.api.security.leaveGuest = vi.fn(async () => ({ ok: true }));
        setSessionState({ mode: 'anonymous', user: { id: 'guest' } }, { persist: false, silent: true });
        expect(await disconnectHomeSession(atom)).toEqual({ ok: true });
        expect(f.api.security.leaveGuest).toHaveBeenCalledWith({ discard: false });
        setSessionState({ mode: 'logged_out', user: null }, { persist: false, silent: true });
    });
    it('admits a restored account without waiting for persisted first-launch progress', async () => {
        const f = await setup(); transport.cleanup = null;
        await f.home.openLoginSequenceAfterAuthCheck(); await f.flow().close();
        const user = { id: 'pending-account', first_launch_version: 1 };
        f.api.security.isAuthenticated = () => true; f.api.auth.getCurrentInfo = () => user;
        f.win.__authCheckResult = { complete: true, authenticated: true, userId: user.id };
        setSessionState({ mode: 'authenticated', user }, { persist: false, silent: true });
        const resumed = vi.spyOn(f.flow(), 'authenticated').mockResolvedValue(true);
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(true);
        await f.gate.openInitialLoginSequence();
        expect(resumed).not.toHaveBeenCalled();
        expect(f.failures).toEqual([]);
    });
    it('allows a restored legacy account to leave the public login presentation', async () => {
        const f = await setup(); transport.cleanup = null;
        await f.home.openLoginSequenceAfterAuthCheck();
        f.api.security.isAuthenticated = () => true;
        f.api.auth.getCurrentInfo = () => ({ id: 'existing' });
        setSessionState({ mode: 'authenticated', user: { id: 'existing' } }, { persist: false, silent: true });
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(true);
        await vi.waitFor(() => expect(f.flow().isOpen()).toBe(false));
        expect(f.failures).toEqual([]);
    });
    it('routes Billing Pay and Back through the real declared tool gateway', async () => {
        const f = await setup(); transport.cleanup = null;
        f.api.auth.startPhoneLogin = vi.fn(async () => ({ ok: true, paymentRequired: true }));
        f.api.auth.payPhoneLogin = vi.fn(async () => ({ ok: true })); f.api.auth.paymentStore = vi.fn(() => null);
        f.api.auth.cancelPhoneLogin = vi.fn(async () => ({ ok: true }));
        await f.home.openLoginSequenceAfterAuthCheck();
        expect(await transport.presentations.at(-1).activate({ operation: 'phone', value: '' })).toMatchObject({ ok: true });
        transport.presentations.at(-1).writeDraft('phone', '+33612345678');
        expect(await transport.presentations.at(-1).activate({ operation: 'choose_auth', value: '' })).toMatchObject({ ok: true });
        expect(await transport.presentations.at(-1).activate({ operation: 'authenticate', value: '' })).toMatchObject({ ok: true });
        expect(f.flow().state.stage).toBe('billing');
        expect(await transport.presentations.at(-1).activate({ operation: 'pay', value: '' })).toMatchObject({ ok: true });
        expect(f.flow().state.stage).toBe('billing');
        expect(await transport.presentations.at(-1).activate({ operation: 'change_phone', value: '' })).toMatchObject({ ok: true });
        expect(f.flow().state.stage).toBe('phone');
        expect(f.api.auth.payPhoneLogin).toHaveBeenCalledWith({ method: 'card' }); expect(f.api.auth.cancelPhoneLogin).toHaveBeenCalledTimes(1);
        await f.flow().close();
    });
    it('keeps the guest goal selector open across the real session and main-menu events', async () => {
        const f = await setup(); transport.cleanup = null;
        f.api.security.isAnonymous = () => getSessionState().mode === 'anonymous';
        f.api.security.startGuest = vi.fn(async () => {
            const user = { id: 'local-guest' };
            setSessionState({ mode: 'anonymous', user }, { persist: false });
            return { ok: true, user };
        });
        await f.home.openLoginSequenceAfterAuthCheck();
        // Use the public catalogue for this session-coordinator test; template
        // installation and durable guest projects are exercised by real Web UI.
        // The guest's beginner level is stored at once (first_launch_runtime.js#enterGuest): its profile goes through the
        // canonical profile write (profile_api.js#upsertUserProfile), the guest session its principal.
        f.api.atomes = {}; f.api.auth.current = async () => ({ logged: true, anonymous: true, user: getSessionState().user });
        f.win.Atome = { listStateCurrent: vi.fn(async () => []), commit: vi.fn(async () => ({ ok: true })) };
        const result = await transport.presentations.at(-1).activate({ operation: 'guest', value: '' });
        expect(result).toMatchObject({ ok: true });
        expect(f.api.security.startGuest).toHaveBeenCalledTimes(1);
        expect(f.flow().state).toMatchObject({ stage: 'goals', guest: true, guestId: 'local-guest', accountId: '' });
        expect(f.win.__eveProfilePreferences.visual.masteryLevel).toBe('beginner');
        expect(f.win.Atome.commit).toHaveBeenCalledWith(expect.objectContaining({ atome_id: 'local-guest', type: 'guest_workspace', scope: 'global' }), expect.anything());
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(false);
        f.gate.syncMainMenuAuthContent({ force: true });
        expect(f.flow().isOpen()).toBe(true); expect(transport.presentations.at(-1).destroy).not.toHaveBeenCalled();
        expect(f.failures).toEqual([]); await f.flow().close();
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(true);
    });
    it('serializes the authenticated logout and auth-checked events before remounting Access', async () => {
        const f = await setup(); let release;
        transport.cleanup = () => new Promise(done => { release = done; });
        setSessionState({ mode: 'authenticated', user: { id: 'existing' } }, { persist: false, silent: true });
        await f.home.openLoginSequenceAfterAuthCheck();
        const canvas = document.getElementById('eve_surface_project');
        const host = document.createElement('div'); host.id = 'project_view_existing';
        document.getElementById('view').appendChild(host); host.appendChild(canvas);
        const resetBackground = vi.fn(); f.win.eveBackground = { defaults: {}, setParams: resetBackground };
        clearSessionState(); resetWorkspaceForNextUser();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(canvas.isConnected).toBe(true);
        expect(resetBackground).not.toHaveBeenCalled();
        expect(transport.presentations).toHaveLength(1);
        release();
        await vi.waitFor(() => expect(f.flow().isOpen()).toBe(true));
        expect(f.flow().state.stage).toBe('access');
        expect(document.getElementById('eve_surface_project')).toBe(canvas);
        expect(f.failures).toEqual([]);
        await f.flow().render(); await f.flow().close();
    });
    it('keeps an active access presentation despite the outgoing workspace mode', async () => {
        const f = await setup(); transport.cleanup = null;
        await f.home.openLoginSequenceAfterAuthCheck();
        expect(f.flow().isOpen()).toBe(true);
        expect(f.gate.isWorkspaceActiveForMainMenu()).toBe(false);
        expect(transport.presentations[0].destroy).not.toHaveBeenCalled();
        expect(f.failures).toEqual([]);
        await f.flow().close();
    });
    it('waits for logout cleanup before reentry and preserves the one shared canvas', async () => {
        const f = await setup(); let release;
        transport.cleanup = () => new Promise(done => { release = done; });
        await f.home.openLoginSequenceAfterAuthCheck();
        const canvas = document.getElementById('eve_surface_project');
        const previous = transport.presentations[0];
        f.win.dispatchEvent(new f.win.CustomEvent('squirrel:user-logged-out'));
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(previous.destroy).toHaveBeenCalledTimes(1);
        expect(f.closePanel).toHaveBeenCalledWith('contact', { source: { type: 'auth_logout' } });
        expect(f.flow().isOpen()).toBe(false);
        expect(transport.presentations).toHaveLength(1);
        release();
        await vi.waitFor(() => expect(transport.presentations).toHaveLength(2));
        await vi.waitFor(() => expect(f.flow().isOpen()).toBe(true));
        expect(document.getElementById('eve_surface_project')).toBe(canvas);
        expect(document.querySelectorAll('#eve_surface_project')).toHaveLength(1);
        expect(canvas.isConnected).toBe(true);
        expect(f.failures).toEqual([]);
        await f.flow().render(); await f.flow().close();
    });
    it('reports a failed cleanup without mounting a new login presentation', async () => {
        const f = await setup(); transport.cleanup = async () => { throw new Error('cleanup_failed'); };
        await f.home.openLoginSequenceAfterAuthCheck();
        f.win.dispatchEvent(new f.win.CustomEvent('squirrel:user-logged-out'));
        await vi.waitFor(() => expect(f.failures).toEqual([{ source: 'logout', cause: 'cleanup_failed' }]));
        expect(transport.presentations).toHaveLength(1); expect(f.flow().isOpen()).toBe(false);
    });
});
