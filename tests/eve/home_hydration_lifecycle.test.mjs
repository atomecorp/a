import { test, vi, expect } from 'vitest';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
const loader = vi.hoisted(() => vi.fn());
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js', async (original) => ({...await original(), loadHomeProfile: loader}));
import { homeSurface, readHomePanelState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js';

test('Home returns its shell immediately and ignores a profile from a closed opening', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window; globalThis.document = document;
    let resolveOld;
    loader.mockReturnValueOnce(new Promise(resolve => {resolveOld=resolve;}));
    const refreshOld = vi.fn();
    const releaseOld = homeSurface.onOpen({context:{guest:false},refresh:refreshOld});
    expect(typeof releaseOld).toBe('function');
    expect(readHomePanelState().loading).toBe(true);
    releaseOld();
    loader.mockResolvedValueOnce({ok:true,userId:'new_user',profile:{name:'New'}});
    const releaseNew = homeSurface.onOpen({context:{guest:false},refresh:vi.fn()});
    await Promise.resolve(); await Promise.resolve();
    const refreshes = refreshOld.mock.calls.length;
    resolveOld({ok:true,userId:'old_user',profile:{name:'Old'}});
    await Promise.resolve(); await Promise.resolve();
    expect(readHomePanelState().userId).toBe('new_user');
    expect(readHomePanelState().loading).toBe(false);
    expect(refreshOld.mock.calls.length).toBe(refreshes);
    releaseNew();
});

test('late Home contact preferences cannot overwrite the next opening', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window; globalThis.document = document;
    let resolveOld;
    window.AdoleAPI = { contacts: { getPreferences: vi.fn()
        .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
        .mockResolvedValueOnce({ acceptUnknown: true }) } };
    loader.mockResolvedValue({ ok: true, userId: 'self', profile: { name: 'Self' } });
    const releaseOld = homeSurface.onOpen({ context: { guest: false }, refresh: vi.fn() });
    await vi.waitFor(() => expect(window.AdoleAPI.contacts.getPreferences).toHaveBeenCalledOnce());
    releaseOld();
    const releaseNew = homeSurface.onOpen({ context: { guest: false }, refresh: vi.fn() });
    try {
        await vi.waitFor(() => expect(readHomePanelState().loading).toBe(false));
        resolveOld({ acceptUnknown: false }); await Promise.resolve(); await Promise.resolve();
        expect(readHomePanelState().contacts.acceptUnknown).toBe(true);
    } finally {
        releaseNew(); globalThis.window = previousWindow; globalThis.document = previousDocument;
    }
});
