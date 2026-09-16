import { describe, expect, it, vi } from 'vitest';
import { createDashboardNewsModules } from '../../eVe/domains/dashboard/dashboard_news_modules.js';
import { normalizeDashboardPreferences } from '../../eVe/domains/dashboard/dashboard_preferences.js';
import { reverseGeocodePlace } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_place_runtime.js';

const position = (lat = 45.77, lon = 3.08) => ({ coords: { latitude: lat, longitude: lon } });
const navigatorFor = ({ permission = 'granted', location = position(), error = null } = {}) => ({
    permissions: { query: vi.fn(async () => ({ state: permission })) },
    geolocation: { getCurrentPosition: vi.fn((resolve, reject) => error ? reject(error) : resolve(location)) }
});
const createRuntime = (options = {}) => createDashboardNewsModules({
    refresh: vi.fn(),
    weather: vi.fn(async () => ({ temperature: 18.4, code: 1, condition: 'cloudy' })),
    reverseGeocode: vi.fn(async ({ lat, lon }) => ({ lat, lon, label: 'Clermont-Ferrand' })),
    persistLocation: vi.fn(async () => ({ ok: true })),
    readLocation: () => null,
    setIntervalFn: vi.fn(() => 1),
    clearIntervalFn: vi.fn(),
    ...options
});

describe('Dashboard weather runtime', () => {
    it.each(['granted', 'prompt'])('automatically geolocates when permission is %s', async (permission) => {
        const persistLocation = vi.fn(async () => ({ ok: true }));
        const runtime = createRuntime({ navigatorRef: navigatorFor({ permission }), persistLocation });
        await runtime.bootstrap();
        expect(runtime.state.status).toBe('ready');
        expect(runtime.state.city).toBe('Clermont-Ferrand');
        expect(persistLocation).toHaveBeenCalledWith(expect.objectContaining({ source: 'geolocation' }));
        const item = runtime.items(new Map([['news', []]])).get('news')[0];
        expect(item.span).toBe(2);
        expect(item.metadata.weather).toMatchObject({ temperature: 18.4, condition: 'cloudy' });
    });

    it('loads a remembered location and does not request GPS after refusal', async () => {
        const saved = { lat: 48.85, lon: 2.35, label: 'Paris', source: 'manual' };
        const navigatorRef = navigatorFor({ permission: 'denied' });
        const runtime = createRuntime({ navigatorRef, readLocation: () => saved });
        await runtime.bootstrap();
        expect(navigatorRef.geolocation.getCurrentPosition).not.toHaveBeenCalled();
        expect(runtime.state).toMatchObject({ status: 'ready', city: 'Paris', place: saved });
    });

    it('opens the manual fallback when GPS is unavailable or refused without memory', async () => {
        const unavailable = createRuntime({ navigatorRef: {} });
        await unavailable.bootstrap();
        expect(unavailable.state.status).toBe('manual');
        const refused = createRuntime({ navigatorRef: navigatorFor({ permission: 'denied' }) });
        await refused.bootstrap();
        expect(refused.state.status).toBe('manual');
    });

    it('keeps the selected location when weather data is unavailable', async () => {
        const place = { lat: 43.3, lon: 5.4, label: 'Marseille', source: 'manual' };
        const runtime = createRuntime({ weather: vi.fn(async () => { throw new Error('offline'); }) });
        const result = await runtime.load(place);
        expect(result.ok).toBe(false);
        expect(runtime.state).toMatchObject({ status: 'unavailable', city: 'Marseille', place });
    });

    it('normalizes only valid persisted coordinates', () => {
        expect(normalizeDashboardPreferences({ weather_location: { lat: 46, lon: 3, label: 'France', source: 'manual' } }).weather_location)
            .toEqual({ lat: 46, lon: 3, label: 'France', source: 'manual' });
        expect(normalizeDashboardPreferences({ weather_location: { lat: 190, lon: 3, label: 'Invalid' } }).weather_location)
            .toBeUndefined();
    });

    it('reuses Finder reverse geocoding to resolve coordinates to a city', async () => {
        const fetchResource = vi.fn(async () => ({
            ok: true,
            json: async () => ({ address: { city: 'Lyon' }, display_name: 'Lyon, France' })
        }));
        await expect(reverseGeocodePlace({ lat: 45.75, lon: 4.85 }, { fetchResource }))
            .resolves.toEqual({ lat: 45.75, lon: 4.85, label: 'Lyon' });
        expect(fetchResource.mock.calls[0][0].searchParams.get('format')).toBe('json');
    });
});
