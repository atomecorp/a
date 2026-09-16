import { beforeEach, expect, it, vi } from 'vitest';

const profile = vi.hoisted(() => ({
    loadUserProfile: vi.fn(),
    upsertUserProfile: vi.fn()
}));

vi.mock('../../eVe/domains/user/profile_api.js', () => profile);

import {
    persistDashboardWeatherLocation,
    readDashboardWeatherLocation
} from '../../eVe/domains/dashboard/dashboard_weather_preferences.js';

beforeEach(() => {
    profile.loadUserProfile.mockReset();
    profile.upsertUserProfile.mockReset();
    globalThis.window = {
        __eveProfilePreferences: { visual: { handedness: 'right' }, dashboard: { categories: { news: true } } },
        CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        dispatchEvent: vi.fn()
    };
});

it('persists weather location by merging the canonical profile preferences', async () => {
    profile.loadUserProfile.mockResolvedValue({
        ok: true,
        userId: 'user-one',
        profile: { id: 'user-one', preferences: { visual: { handedness: 'right' }, dashboard: { categories: { news: true } } } }
    });
    profile.upsertUserProfile.mockResolvedValue({ ok: true });
    const location = { lat: 45.77, lon: 3.08, label: 'Clermont-Ferrand', source: 'geolocation' };
    await expect(persistDashboardWeatherLocation(location)).resolves.toMatchObject({ ok: true, location });
    expect(profile.upsertUserProfile).toHaveBeenCalledWith(expect.objectContaining({
        preferences: expect.objectContaining({
            visual: { handedness: 'right' },
            dashboard: expect.objectContaining({ weather_location: location })
        })
    }), expect.objectContaining({ allowCreate: false, userId: 'user-one' }));
    expect(readDashboardWeatherLocation()).toEqual(location);
});

it('keeps guest location in the profile preference cache without parallel storage', async () => {
    profile.loadUserProfile.mockResolvedValue({ ok: false, reason: 'no_user', error: 'no_user_logged_in' });
    const location = { lat: 43.3, lon: 5.4, label: 'Marseille', source: 'manual' };
    await expect(persistDashboardWeatherLocation(location)).resolves.toMatchObject({ ok: true, guest: true });
    expect(profile.upsertUserProfile).not.toHaveBeenCalled();
    expect(globalThis.window.__eveProfilePreferences.dashboard.weather_location).toEqual(location);
});
