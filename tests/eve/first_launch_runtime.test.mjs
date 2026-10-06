import { beforeEach, describe, expect, it, vi } from 'vitest';
const owners = vi.hoisted(() => ({ gateway: vi.fn(), create: vi.fn(), surface: vi.fn() }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: owners.gateway }));
vi.mock('../../eVe/domains/dashboard/dashboard_workspace_mode.js', () => ({ ensureDashboardWorkspaceSurface: owners.surface }));
vi.mock('../../eVe/domains/dashboard/dashboard_creation_actions.js', () => ({ createDashboardCreationActions: () => ({ createGuidedProject: owners.create }) }));
import { createFirstLaunchRuntime } from '../../eVe/domains/user/first_launch_runtime.js';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
const user = { id: 'new', first_launch_version: 1 };
const fixture = (initial = { preferences: { visual: { masteryLevel: 'advanced' }, custom: 'preserved' } }) => {
    let profile = structuredClone(initial), current = user, fields;
    const renders = [], saves = [], finish = vi.fn(async () => ({ ok: true })), createTemplate = vi.fn(async () => ({ ok: true, project_id: 'basic' }));
    window.Atome = { listStateCurrent: async key => FIRST_LAUNCH_TEMPLATES[key].atoms.map(a => ({ id: a.ref, type: a.type, properties: a.props })) };
    const flow = createFirstLaunchRuntime({ currentUser: () => current,
        loadProfile: async () => ({ ok: true, profile }), saveProfile: async next => { profile = structuredClone(next); saves.push(profile); return { ok: true }; },
        installTemplate: async key => ({ ok: true, project_id: key }), createTemplate, finish,
        guest: async () => ({ ok: true }), submit: async () => ({ ok: true, paymentRequired: true }),
        createPresentation: options => { fields = options; return { open: async () => { renders.push(flow.state.stage); return { ok: true }; }, destroy: async () => {}, render: async () => ({ ok: true }) }; } });
    return { flow, saves, renders, finish, createTemplate, profile: () => profile, draft: (key, value) => fields.writeDraft(key, value), switchUser: () => { current = { id: 'other' }; } };
};
beforeEach(() => {
    globalThis.window = { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), __eveProfilePreferences: {}, AdoleAPI: { sync: { flushWorkspace: vi.fn(async () => ({ ok: true })) }, auth: {
        getPendingPhoneLogin: vi.fn(async () => null), resendPhoneLogin: vi.fn(async () => ({ ok: true })),
        simulatePhonePayment: vi.fn(async () => ({ ok: true })), cancelPhoneLogin: vi.fn(async () => ({ ok: true })) } } };
    owners.gateway.mockReset().mockResolvedValue({ ok: true }); owners.create.mockReset().mockResolvedValue({ ok: true, project_id: 'sleep-project' });
});
describe('first-launch canonical lifecycle', () => {
    it.each([true, false])('restores the canonical pending attempt, payment required: %s', async paymentRequired => {
        const f = fixture(); window.AdoleAPI.auth.getPendingPhoneLogin.mockResolvedValue({ phone: '+33612345678', paymentRequired });
        await f.flow.open(); expect(f.flow.state.stage).toBe(paymentRequired ? 'billing' : 'sms');
        expect(f.flow.state.fields.phone).toBe('+33612345678'); expect(f.saves).toHaveLength(0);
        if (!paymentRequired) { await f.flow.handle({ operation: 'resend' }); expect(window.AdoleAPI.auth.resendPhoneLogin).toHaveBeenCalledTimes(1); }
    });
    it('reopens with live controls after guest entry closed the previous generation', async () => {
        const f = fixture(); await f.flow.open(); await f.flow.handle({ operation: 'guest' });
        expect(f.saves).toHaveLength(0); expect(f.flow.isOpen()).toBe(false);
        await f.flow.open(); expect(f.flow.state.busy).toBe(false); expect(f.flow.state.stage).toBe('access');
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
