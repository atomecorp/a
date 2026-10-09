import { beforeEach, describe, expect, it, vi } from 'vitest';
const owners = vi.hoisted(() => ({ gateway: vi.fn(), create: vi.fn(), surface: vi.fn(), media: vi.fn(), readFile: vi.fn(), readImage: vi.fn() }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: owners.gateway }));
vi.mock('../../eVe/domains/dashboard/dashboard_workspace_mode.js', () => ({ ensureDashboardWorkspaceSurface: owners.surface }));
vi.mock('../../eVe/domains/dashboard/dashboard_creation_actions.js', () => ({ createDashboardCreationActions: () => ({ createGuidedProject: owners.create }) }));
vi.mock('../../eVe/intuition/tools/media.js', () => ({ requestMediaSelection: owners.media }));
vi.mock('../../eVe/intuition/runtime/project_media_import_runtime.js', () => ({ readSelectionItemAsFile: owners.readFile, readImageFileAsDataUrl: owners.readImage }));
import { createFirstLaunchRuntime } from '../../eVe/domains/user/first_launch_runtime.js';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { buildMatrixToolDefinitions } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_matrix_defs.js';
import { setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';
const user = { id: 'new', first_launch_version: 1 };
const fixture = (initial = { preferences: { visual: { masteryLevel: 'advanced' }, custom: 'preserved' } }) => {
    let profile = structuredClone(initial), current = user, fields;
    const renders = [], saves = [], finish = vi.fn(async () => ({ ok: true })), createTemplate = vi.fn(async () => ({ ok: true, project_id: 'basic' }));
    const guest = vi.fn(async () => {
        const user = { id: 'guest' };
        setSessionState({ mode: 'anonymous', user }, { persist: false, silent: true });
        return { ok: true, user };
    });
    const loadProfile = vi.fn(async () => ({ ok: true, profile }));
    const installTemplate = vi.fn(async key => ({ ok: true, project_id: key }));
    window.Atome = { listStateCurrent: async key => FIRST_LAUNCH_TEMPLATES[key].atoms.map(a => ({ id: a.ref, type: a.type, properties: a.props })) };
    const flow = createFirstLaunchRuntime({ currentUser: () => current,
        loadProfile, saveProfile: async next => { profile = structuredClone(next); saves.push(profile); return { ok: true }; },
        installTemplate, createTemplate, finish,
        guest, submit: async () => ({ ok: true, paymentRequired: true }),
        createPresentation: options => { fields = options; return { open: async () => { renders.push(flow.state.stage); return { ok: true }; }, destroy: async () => {}, render: async () => ({ ok: true }) }; } });
    return { flow, saves, renders, finish, createTemplate, guest, loadProfile, installTemplate, profile: () => profile, draft: (key, value) => fields.writeDraft(key, value), submitField: key => fields.onSubmit(key), switchUser: () => { current = { id: 'other' }; } };
};
beforeEach(() => {
    globalThis.window = { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), __eveProfilePreferences: {}, AdoleAPI: { sync: { flushWorkspace: vi.fn(async () => ({ ok: true })) }, auth: {
        getPendingPhoneLogin: vi.fn(async () => null), resendPhoneLogin: vi.fn(async () => ({ ok: true })),
        simulatePhonePayment: vi.fn(async () => ({ ok: true })), cancelPhoneLogin: vi.fn(async () => ({ ok: true })) } } };
    owners.gateway.mockReset().mockResolvedValue({ ok: true }); owners.create.mockReset().mockResolvedValue({ ok: true, project_id: 'sleep-project' });
    owners.media.mockReset().mockResolvedValue({ ok: false, cancelled: true });
    owners.readFile.mockReset().mockResolvedValue({ type: 'image/png' }); owners.readImage.mockReset().mockResolvedValue('data:image/png;base64,selected');
    setSessionState({ mode: 'logged_out', user: null }, { persist: false, silent: true });
});
describe('first-launch canonical lifecycle', () => {
    it('edits the optional nickname without exposing or replacing the technical username', async () => {
        const username = 'user_a143b08c-54bd-430c-a5ac';
        const f = fixture({ username, nickname: '', preferences: { first_launch: { version: 1, step: 'profile' } } });
        await f.flow.authenticated({ user });
        expect(f.flow.state.fields.nickname).toBe('');
        expect(Object.values(f.flow.state.fields)).not.toContain(username);
        f.draft('nickname', '  Eve  ');
        expect(await f.flow.handle({ operation: 'save_profile' })).toMatchObject({ ok: true });
        expect(f.profile()).toMatchObject({ username, nickname: 'Eve' });
        const resumed = fixture(f.profile());
        await resumed.flow.authenticated({ user });
        expect(resumed.flow.state.fields.nickname).toBe('Eve');
    });
    it('allows an empty nickname and preserves the account username and photo', async () => {
        const f = fixture({ username: 'existing-login', nickname: 'Old nickname', user_face: 'saved.png',
            preferences: { first_launch: { version: 1, step: 'profile' } } });
        await f.flow.authenticated({ user });
        expect(f.flow.state.fields.nickname).toBe('Old nickname');
        f.draft('nickname', '  ');
        expect(await f.flow.handle({ operation: 'save_profile' })).toMatchObject({ ok: true });
        expect(f.profile()).toMatchObject({ username: 'existing-login', nickname: '', user_face: 'saved.png' });
        expect(f.flow.state.stage).toBe('goals');
    });
    it('shares one pending opening across the menu and Home entry points', async () => {
        const f = fixture(); let resolve;
        window.AdoleAPI.auth.getPendingPhoneLogin.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const menu = f.flow.open(), home = f.flow.open();
        resolve(null);
        expect(await menu).toMatchObject({ ok: true });
        expect(await home).toMatchObject({ ok: true });
        expect(window.AdoleAPI.auth.getPendingPhoneLogin).toHaveBeenCalledTimes(1);
        expect(f.renders).toEqual(['access']);
    });
    it('cancels an opening during logout and waits for teardown before reentry', async () => {
        const f = fixture(); let resolve;
        window.AdoleAPI.auth.getPendingPhoneLogin.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const pending = f.flow.open();
        const closing = f.flow.close();
        const reopened = f.flow.open();
        resolve(null);
        expect(await pending).toMatchObject({ ok: true, cancelled: true });
        await closing;
        expect(await reopened).toMatchObject({ ok: true });
        expect(f.renders).toEqual(['access']);
        expect(f.flow.isOpen()).toBe(true);
        expect(f.saves).toHaveLength(0);
    });
    it('persists optional biometrics in the canonical profile without replacing other bio fields', async () => {
        const f = fixture({ bio: { birth: '2000-01-01', weight: '70', height: '180', biometrics: [{ label: 'owned', value: 'kept' }] },
            preferences: { first_launch: { version: 1, step: 'sleep', program_id: 'sleep-project' } } });
        await f.flow.authenticated({ user });
        expect(f.flow.state.fields.weight).toBe('70'); expect(f.flow.state.fields.height).toBe('180');
        f.draft('weight', ' 72.5 '); f.draft('height', ''); f.draft('hours', 1);
        expect((await f.flow.handle({ operation: 'configure_sleep' })).ok).toBe(true);
        expect(f.profile().bio).toEqual({ birth: '2000-01-01', weight: '72.5', height: '', biometrics: [{ label: 'owned', value: 'kept' }] });
        const resumed = fixture(f.profile()); await resumed.flow.authenticated({ user });
        expect(resumed.flow.state.fields.hours).toBe(1); expect(resumed.flow.state.fields.weight).toBe(' 72.5 ');
        expect(resumed.flow.state.fields.height).toBe('');
    });
    it('declares photo selection on the canonical persistent first-launch tool', () => {
        const tool = buildMatrixToolDefinitions(definition => definition, 'registered_handler').find(tool => tool.tool_id === 'ui.first_launch.commit');
        expect(tool.input_schema.properties.operation.enum).toContain('photo');
        expect(tool.behavior.effects['pointer.click']).toBe('persistent');
    });
    it.each([true, false])('restores the canonical pending attempt, payment required: %s', async paymentRequired => {
        const f = fixture(); window.AdoleAPI.auth.getPendingPhoneLogin.mockResolvedValue({ phone: '+33612345678', paymentRequired });
        await f.flow.open(); expect(f.flow.state.stage).toBe(paymentRequired ? 'billing' : 'sms');
        expect(f.flow.state.fields.phone).toBe('+33612345678'); expect(f.saves).toHaveLength(0);
        if (!paymentRequired) { await f.flow.handle({ operation: 'resend' }); expect(window.AdoleAPI.auth.resendPhoneLogin).toHaveBeenCalledTimes(1); }
    });
    it('opens Goals as a beginner without loading or writing an account profile', async () => {
        window.__eveProfilePreferences = { visual: { masteryLevel: 'advanced' }, first_launch: { version: 1, step: 'complete' }, custom: 'account-only' };
        const f = fixture(); await f.flow.open(); await f.flow.handle({ operation: 'guest' });
        expect(f.flow.state.stage).toBe('goals'); expect(f.flow.isOpen()).toBe(true);
        expect(f.renders).toEqual(['access', 'goals']); expect(f.guest).toHaveBeenCalledTimes(1);
        expect(window.__eveProfilePreferences.visual.masteryLevel).toBe('beginner');
        expect(window.__eveProfilePreferences.custom).toBeUndefined();
        expect(f.loadProfile).not.toHaveBeenCalled(); expect(f.saves).toHaveLength(0);
        expect(window.AdoleAPI.auth.simulatePhonePayment).not.toHaveBeenCalled();
        expect(window.AdoleAPI.auth.resendPhoneLogin).not.toHaveBeenCalled();
        expect(f.createTemplate).not.toHaveBeenCalled(); expect(owners.create).not.toHaveBeenCalled();
        await f.flow.close();
        await f.flow.open(); expect(f.flow.state.busy).toBe(false); expect(f.flow.state.stage).toBe('access');
    });
    it.each(['nutrition', 'movement', 'journal'])('finishes the guest %s goal through the canonical project and home owners', async goal => {
        const f = fixture(); await f.flow.open(); await f.flow.handle({ operation: 'guest' });
        expect(await f.flow.handle({ operation: 'goal', value: goal })).toMatchObject({ ok: true });
        expect(owners.create).toHaveBeenCalledWith({ family: 'health', goal });
        expect(f.finish).toHaveBeenCalledWith({ projectId: 'sleep-project', homeId: 'basic' });
        expect(f.flow.state.progress.step).toBe('complete'); expect(f.flow.isOpen()).toBe(false);
        expect(f.flow.state.profile.preferences.visual.masteryLevel).toBe('beginner');
        expect(f.loadProfile).not.toHaveBeenCalled(); expect(f.saves).toHaveLength(0);
    });
    it('keeps guest sleep configuration and programme controls on the shared tool path', async () => {
        const f = fixture(); await f.flow.open(); await f.flow.handle({ operation: 'guest' });
        await f.flow.handle({ operation: 'goal', value: 'sleep' }); expect(f.flow.state.stage).toBe('sleep');
        f.draft('hours', 7); f.draft('weight', '72');
        expect(await f.flow.handle({ operation: 'configure_sleep' })).toMatchObject({ ok: true });
        expect(f.flow.state.stage).toBe('program');
        expect(owners.gateway).toHaveBeenCalledWith(expect.objectContaining({ tool_id: 'project.program.commit',
            input: expect.objectContaining({ project_id: 'sleep-project', sleep_preferences: expect.objectContaining({ hours: 7 }) }) }));
        await f.flow.handle({ operation: 'brick', value: 'nap' });
        expect(f.flow.state.bricks).toEqual(['meditation', 'nutrition']);
        await f.flow.handle({ operation: 'finish' });
        expect(f.finish).toHaveBeenCalledWith({ projectId: 'basic', homeId: 'basic' });
        expect(f.saves).toHaveLength(0); expect(f.loadProfile).not.toHaveBeenCalled();
    });
    it('serializes guest entry and keeps failed entry retryable on Access', async () => {
        const f = fixture(); await f.flow.open(); let release;
        f.guest.mockImplementationOnce(() => new Promise(done => { release = done; }));
        const first = f.flow.handle({ operation: 'guest' });
        expect(await f.flow.handle({ operation: 'guest' })).toMatchObject({ ok: true, pending: true });
        release({ ok: false, error: 'anonymous_session_start_failed' });
        expect(await first).toMatchObject({ ok: false, error: 'anonymous_session_start_failed' });
        expect(f.flow.state).toMatchObject({ stage: 'access', busy: false, guest: false });
        expect((await f.flow.handle({ operation: 'guest' })).ok).toBe(true);
        expect(f.flow.state.stage).toBe('goals');
    });
    it('rejects a different guest before creation and after an in-flight creation', async () => {
        const f = fixture(); await f.flow.open(); await f.flow.handle({ operation: 'guest' });
        setSessionState({ mode: 'anonymous', user: { id: 'other' } }, { persist: false, silent: true });
        expect(await f.flow.handle({ operation: 'goal', value: 'sleep' })).toMatchObject({ ok: false, error: 'first_launch_context_changed' });
        expect(owners.create).not.toHaveBeenCalled();
        setSessionState({ mode: 'anonymous', user: { id: 'guest' } }, { persist: false, silent: true });
        let release; owners.create.mockImplementationOnce(() => new Promise(done => { release = done; }));
        const pending = f.flow.handle({ operation: 'goal', value: 'sleep' });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        setSessionState({ mode: 'authenticated', user }, { persist: false, silent: true });
        release({ ok: true, project_id: 'outgoing' });
        expect(await pending).toMatchObject({ ok: false, error: 'first_launch_context_changed' });
        expect(f.flow.state.progress.program_id).toBe(''); expect(f.finish).not.toHaveBeenCalled();
    });
    it('restores actionable Access choices when the guest goal template cannot open', async () => {
        const f = fixture(); await f.flow.open();
        f.installTemplate.mockResolvedValueOnce({ ok: false, error: 'template_install_failed' });
        expect(await f.flow.handle({ operation: 'guest' })).toMatchObject({ ok: false, error: 'template_install_failed' });
        expect(f.flow.state).toMatchObject({ active: true, stage: 'access', busy: false, guest: true, guestId: '' });
        expect(f.renders).toEqual(['access', 'access']);
        expect((await f.flow.handle({ operation: 'guest' })).ok).toBe(true);
        expect(f.flow.state.stage).toBe('goals');
    });
    it('does not remount Goals when guest entry settles after logout', async () => {
        const f = fixture(); await f.flow.open(); let release;
        f.guest.mockImplementationOnce(() => new Promise(done => { release = done; }));
        const pending = f.flow.handle({ operation: 'guest' }); await f.flow.close();
        release({ ok: true, user: { id: 'guest' } });
        expect(await pending).toMatchObject({ ok: true, cancelled: true });
        expect(f.renders).toEqual(['access']); expect(f.flow.isOpen()).toBe(false);
    });
    it('serializes SMS resend, displays rate limits and never creates a profile before proof', async () => {
        const f = fixture(); window.AdoleAPI.auth.getPendingPhoneLogin.mockResolvedValue({ phone: '+33612345678', paymentRequired: false });
        await f.flow.open(); let resolve;
        window.AdoleAPI.auth.resendPhoneLogin.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const first = f.flow.handle({ operation: 'resend' });
        expect(await f.flow.handle({ operation: 'resend' })).toEqual({ ok: true, pending: true });
        expect(window.AdoleAPI.auth.resendPhoneLogin).toHaveBeenCalledTimes(1);
        resolve({ ok: false, error: 'auth_rate_limited' });
        expect(await first).toMatchObject({ ok: false, error: 'auth_rate_limited' });
        expect(f.flow.state.notice).toBeTruthy(); expect(f.flow.state.busy).toBe(false);
        expect(f.flow.state.stage).toBe('sms'); expect(f.saves).toHaveLength(0);
        await f.flow.handle({ operation: 'resend' });
        expect(f.flow.state.notice).toBe(''); expect(f.saves).toHaveLength(0);
    });
    it('handles SMS expiry and cancels the pending attempt when changing number', async () => {
        const f = fixture(); window.AdoleAPI.auth.getPendingPhoneLogin.mockResolvedValue({ phone: '+33612345678', paymentRequired: false });
        await f.flow.open();
        const listener = window.addEventListener.mock.calls.find(([name]) => name === 'squirrel:phone-login-error')[1];
        listener({ detail: { code: 'auth_attempt_expired' } });
        expect(f.flow.state.notice).toBeTruthy(); expect(f.flow.state.stage).toBe('sms');
        expect((await f.flow.handle({ operation: 'goals' })).ok).toBe(false);
        await f.flow.handle({ operation: 'change_phone' });
        expect(window.AdoleAPI.auth.cancelPhoneLogin).toHaveBeenCalledTimes(1);
        expect(f.flow.state.stage).toBe('phone'); expect(f.flow.state.fields.phone).toBe('+33612345678');
        expect(f.saves).toHaveLength(0); expect(f.createTemplate).not.toHaveBeenCalled();
    });
    it('closes once when the normal menu reacts by requesting the same close', async () => {
        const f = fixture(); await f.flow.open();
        window.dispatchEvent.mockClear();
        window.dispatchEvent.mockImplementation(event => { if (event.detail.active === false) void f.flow.close(); });
        await f.flow.close(); expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(await f.flow.close()).toEqual({ ok: true, closed: false });
    });
    it('prepares payment before SMS and routes actions only from their current stage', async () => {
        const f = fixture(); await f.flow.open();
        expect((await f.flow.handle({ operation: 'finish' })).ok).toBe(false);
        await f.flow.handle({ operation: 'phone' }); f.draft('phone', '+33612345678');
        await f.flow.handle({ operation: 'authenticate' }); expect(f.flow.state.stage).toBe('billing');
        await f.flow.handle({ operation: 'method', value: 'paypal' });
        await f.flow.handle({ operation: 'pay' }); expect(window.AdoleAPI.auth.simulatePhonePayment).toHaveBeenCalledWith('paypal');
        expect(f.flow.state.stage).toBe('sms'); expect(f.saves).toHaveLength(0);
    });
    it('advances simulated Pay before SMS delivery settles and keeps delivery failures visible', async () => {
        const f = fixture(); await f.flow.open();
        await f.flow.handle({ operation: 'phone' }); f.draft('phone', '+33612345678');
        await f.flow.handle({ operation: 'authenticate' }); let release;
        window.AdoleAPI.auth.simulatePhonePayment.mockImplementationOnce(() => new Promise(done => { release = done; }));
        const paying = f.flow.handle({ operation: 'pay' });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(f.flow.state.stage).toBe('sms'); expect(f.saves).toHaveLength(0);
        release({ ok: false, error: 'sms_delivery_unavailable' });
        expect(await paying).toMatchObject({ ok: false, error: 'sms_delivery_unavailable' });
        expect(f.flow.state.notice).toBeTruthy(); expect(f.flow.state.busy).toBe(false);
        expect((await f.flow.handle({ operation: 'change_phone' })).ok).toBe(true);
        expect(f.flow.state.stage).toBe('phone');
    });
    it('returns from Billing before cancellation settles and reports its failure on the phone panel', async () => {
        const f = fixture(); window.AdoleAPI.auth.getPendingPhoneLogin.mockResolvedValue({ phone: '+33612345678', paymentRequired: true });
        await f.flow.open(); let release;
        window.AdoleAPI.auth.cancelPhoneLogin.mockImplementationOnce(() => new Promise(done => { release = done; }));
        const back = f.flow.handle({ operation: 'change_phone' });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(f.flow.state.stage).toBe('phone');
        release({ ok: false, error: 'auth_connection_unavailable' });
        expect(await back).toMatchObject({ ok: false, error: 'auth_connection_unavailable' });
        expect(f.flow.state.notice).toBeTruthy(); expect(f.flow.state.busy).toBe(false); expect(f.saves).toHaveLength(0);
    });
    it('keeps Back actionable while delivery is pending and ignores an obsolete payment failure', async () => {
        const f = fixture(); window.AdoleAPI.auth.getPendingPhoneLogin.mockResolvedValue({ phone: '+33612345678', paymentRequired: true });
        await f.flow.open(); let release;
        window.AdoleAPI.auth.simulatePhonePayment.mockImplementationOnce(() => new Promise(done => { release = done; }));
        const paying = f.flow.handle({ operation: 'pay' });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(f.flow.state.busy).toBe(false);
        expect(await f.flow.handle({ operation: 'change_phone' })).toMatchObject({ ok: true });
        expect(f.flow.state.stage).toBe('phone');
        release({ ok: false, error: 'sms_delivery_unavailable' });
        await paying;
        expect(f.flow.state.stage).toBe('phone'); expect(f.flow.state.notice).toBe(''); expect(f.flow.state.busy).toBe(false);
    });
    it('preserves legacy users without loading or mutating their profile', async () => {
        const f = fixture(); expect(await f.flow.authenticated({ user: { id: 'old' } })).toBe(false); expect(f.saves).toHaveLength(0); expect(f.renders).toHaveLength(0);
    });
    it('uses the authenticated profile instead of another account’s completed published preferences', async () => {
        window.__eveProfilePreferences = { first_launch: { version: 1, step: 'complete' } };
        const f = fixture(); await f.flow.authenticated({ user, newAccount: true });
        expect(f.flow.state.stage).toBe('welcome'); expect(f.profile().preferences.visual.masteryLevel).toBe('beginner');
        await f.flow.handle({ operation: 'goals' }); await f.flow.authenticated({ user, newAccount: true });
        expect(f.flow.state.stage).toBe('goals');
    });
    it('resumes sleep selection, persists canonical configuration, and completes with one Basic instance', async () => {
        const f = fixture(); await f.flow.authenticated({ user });
        expect(f.profile().preferences.visual.masteryLevel).toBe('beginner');
        await f.flow.handle({ operation: 'goals' }); await f.flow.handle({ operation: 'goal', value: 'sleep' });
        f.draft('hours', 9); await f.flow.handle({ operation: 'configure_sleep' });
        expect(owners.gateway).toHaveBeenCalledWith(expect.objectContaining({ tool_id: 'project.program.commit', input: expect.objectContaining({ sleep_preferences: expect.objectContaining({ hours: 9 }) }) }));
        await f.flow.handle({ operation: 'brick', value: 'nap' }); expect(f.profile().preferences.first_launch.bricks).toEqual(['meditation', 'nutrition']);
        const resumed = fixture(f.profile()); await resumed.flow.authenticated({ user });
        expect(resumed.flow.state.stage).toBe('program'); expect(resumed.flow.state.fields.hours).toBe(9); expect(resumed.flow.state.bricks).toEqual(['meditation', 'nutrition']);
        await resumed.flow.handle({ operation: 'finish' }); expect(resumed.createTemplate).toHaveBeenCalledTimes(1);
        expect(resumed.profile().preferences.workspace).toMatchObject({ startup_view: 'dashboard', home_template_project_id: 'basic' });
        expect(resumed.profile().preferences.custom).toBe('preserved'); expect(resumed.profile().preferences.first_launch.step).toBe('complete');
        expect(await resumed.flow.authenticated({ user })).toBe(false); expect(resumed.createTemplate).toHaveBeenCalledTimes(1);
    });
    it('lets an authenticated newcomer introduce themselves or skip without creating a programme', async () => {
        const introduced = fixture(); await introduced.flow.authenticated({ user, newAccount: true });
        await introduced.flow.handle({ operation: 'profile' });
        expect(introduced.flow.state.stage).toBe('profile'); expect(introduced.profile().preferences.first_launch.step).toBe('profile');
        introduced.draft('name', ' Martin '); introduced.draft('firstname', ' Eve ');
        await introduced.flow.handle({ operation: 'save_profile' });
        expect(introduced.profile()).toMatchObject({ name: 'Martin', first_name: 'Eve' });
        expect(introduced.flow.state.stage).toBe('goals');
        const skipped = fixture(); await skipped.flow.authenticated({ user, newAccount: true });
        await skipped.flow.handle({ operation: 'goals' });
        expect(skipped.flow.state.stage).toBe('goals'); expect(skipped.profile().name).toBeUndefined();
        expect(skipped.profile().preferences.custom).toBe('preserved');
        expect(owners.create).not.toHaveBeenCalled(); expect(skipped.createTemplate).not.toHaveBeenCalled();
    });
    it('reuses the profile photo editor, preserves identity drafts, cancellation and saved photo on resume', async () => {
        const f = fixture(); await f.flow.authenticated({ user }); await f.flow.handle({ operation: 'profile' });
        f.draft('name', 'Still editing'); const before = f.saves.length;
        expect(await f.flow.handle({ operation: 'photo' })).toEqual({ ok: true, cancelled: true });
        expect(f.saves).toHaveLength(before); expect(f.flow.state.notice).toBe('');
        owners.media.mockResolvedValueOnce({ ok: true, items: [{ origin: 'external', file: { type: 'image/png' } }] });
        expect((await f.flow.handle({ operation: 'photo' })).ok).toBe(true);
        expect(owners.media).toHaveBeenLastCalledWith({ kinds: ['image'], multiple: false });
        expect(f.profile().user_face).toBe('data:image/png;base64,selected');
        expect(f.flow.state.fields.name).toBe('Still editing'); expect(f.profile().preferences.custom).toBe('preserved');
        const resumed = fixture(f.profile()); await resumed.flow.authenticated({ user });
        expect(resumed.flow.state.stage).toBe('profile'); expect(resumed.flow.state.profile.user_face).toBe(f.profile().user_face);
    });
    it('does not commit a photo selected after the active account changes', async () => {
        const f = fixture(); await f.flow.authenticated({ user }); await f.flow.handle({ operation: 'profile' });
        let resolve; owners.media.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const pending = f.flow.handle({ operation: 'photo' });
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
        const before = f.saves.length; f.switchUser();
        resolve({ ok: true, items: [{ origin: 'external', file: { type: 'image/png' } }] });
        expect(await pending).toMatchObject({ ok: false, error: 'first_launch_context_changed' });
        expect(f.saves).toHaveLength(before); expect(f.profile().user_face).toBeUndefined();
    });
    it('keeps a failed arrival resumable and reuses its already-created home on retry', async () => {
        const f = fixture({ preferences: { first_launch: { version: 1, step: 'program', program_id: 'sleep-project' } } });
        await f.flow.authenticated({ user }); f.finish.mockResolvedValueOnce({ ok: false, error: 'arrival_failed' });
        expect((await f.flow.handle({ operation: 'finish' })).ok).toBe(false); expect(f.profile().preferences.first_launch.step).toBe('program');
        expect(f.profile().preferences.first_launch.home_project_id).toBe('basic');
        await f.flow.handle({ operation: 'finish' }); expect(f.createTemplate).toHaveBeenCalledTimes(1); expect(f.profile().preferences.first_launch.step).toBe('complete');
    });
    it('rejects a durable mutation after the account changes', async () => {
        const f = fixture(); await f.flow.authenticated({ user }); f.switchUser();
        expect(await f.flow.handle({ operation: 'goals' })).toMatchObject({ ok: false, error: 'first_launch_context_changed' });
        expect(f.saves).toHaveLength(1);
    });
    it.each(['nutrition', 'movement', 'journal'])('opens the canonical %s project and ends onboarding', async goal => {
        const f = fixture(); await f.flow.authenticated({ user }); await f.flow.handle({ operation: 'goals' });
        await f.flow.handle({ operation: 'goal', value: goal }); expect(owners.create).toHaveBeenCalledWith({ family: 'health', goal });
        expect(f.finish).toHaveBeenCalledWith({ projectId: 'sleep-project', homeId: 'basic' }); expect(f.profile().preferences.first_launch.step).toBe('complete');
    });
});


it('phone Enter invokes the same registered authentication action as Continue', async () => {
    const f = fixture(); await f.flow.open({ credentials: true });
    f.draft('phone', '0612345678');
    await f.submitField('phone');
    expect(owners.gateway).toHaveBeenLastCalledWith({ tool_id: 'ui.first_launch.auth', action: 'pointer.click',
        input: { operation: 'authenticate' }, source: { type: 'ui' } });
    expect((await f.flow.handle({ operation: 'authenticate' })).ok).toBe(true);
    expect(f.flow.state.stage).toBe('billing');
    const calls = owners.gateway.mock.calls.length;
    await f.submitField('phone'); expect(owners.gateway.mock.calls).toHaveLength(calls);
    const invalid = fixture(); await invalid.flow.open({ credentials: true }); invalid.draft('phone', 'abc');
    expect(await invalid.flow.handle({ operation: 'authenticate' })).toMatchObject({ ok: false, error: 'auth_phone_e164_required' });
    expect(invalid.flow.state.stage).toBe('phone');
});
