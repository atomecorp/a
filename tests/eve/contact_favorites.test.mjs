import { beforeEach, afterEach, test, expect, vi } from 'vitest';

const profile = vi.hoisted(() => ({ value: {}, save: null }));
vi.mock('../../eVe/domains/user/profile_api.js', () => ({
    loadUserProfile: async () => ({ ok: true, userId: 'self', profile: profile.value }),
    upsertUserProfile: async value => {
        const result = await (profile.save ? profile.save(value) : Promise.resolve({ ok: true }));
        if (result.ok) profile.value = value;
        return result;
    }
}));
import { setContactFavorite, isContactFavorite } from '../../eVe/intuition/tools/contact_favorites_preference.js';
let previous;
beforeEach(() => {
    previous = globalThis.window;
    const win = new EventTarget(); win.CustomEvent = CustomEvent;
    win.AdoleAPI = { auth: { getCurrentInfo: () => ({ id: 'self' }) } };
    win.__eveProfilePreferences = { contacts: { favorites: [] } };
    globalThis.window = win;
    profile.value = { preferences: { contacts: { favorites: [{ id: 'other-device' }] }, visual: { masteryLevel: 2 } } };
    profile.save = null;
});
afterEach(() => { globalThis.window = previous; });

test('favorites publish only after persistence and preserve other devices and preferences', async () => {
    let settle;
    profile.save = () => new Promise(resolve => { settle = resolve; });
    const pending = setContactFavorite({ contactId: 'bob', favorite: true });
    await vi.waitFor(() => expect(settle).toBeTypeOf('function'));
    expect(isContactFavorite('bob')).toBe(false);
    settle({ ok: true }); await pending;
    expect(isContactFavorite('bob')).toBe(true);
    expect(isContactFavorite('other-device')).toBe(true);
    expect(profile.value.preferences.visual.masteryLevel).toBe(2);
    profile.save = null;
    await setContactFavorite({ contactId: 'bob', favorite: false });
    expect(isContactFavorite('bob')).toBe(false);
});
test('a refused save never becomes a Dashboard favorite', async () => {
    profile.save = async () => ({ ok: false, error: 'denied' });
    expect((await setContactFavorite({ contactId: 'bob', favorite: true })).ok).toBe(false);
    expect(isContactFavorite('bob')).toBe(false);
});
test('an account switch cannot publish another account favorites', async () => {
    let settle;
    profile.save = () => new Promise(resolve => { settle = resolve; });
    const pending = setContactFavorite({ contactId: 'bob', favorite: true });
    await vi.waitFor(() => expect(settle).toBeTypeOf('function'));
    window.AdoleAPI.auth.getCurrentInfo = () => ({ id: 'second' });
    window.__eveProfilePreferences = { contacts: { favorites: [] } };
    settle({ ok: true }); await pending;
    expect(isContactFavorite('bob')).toBe(false);
});
