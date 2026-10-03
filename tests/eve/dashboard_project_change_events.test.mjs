import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    isCanonicalProjectChange,
    subscribeCanonicalProjectChanges
} from '../../eVe/domains/dashboard/dashboard_project_change_events.js';
import { createDashboardCreationActions } from '../../eVe/domains/dashboard/dashboard_creation_actions.js';
import { createDashboardCreationRuntime } from '../../eVe/domains/dashboard/dashboard_creation_runtime.js';

afterEach(() => vi.useRealTimers());

describe('dashboard canonical project changes', () => {
    it('recognizes project sets and project lifecycle events without matching child Atomes', () => {
        expect(isCanonicalProjectChange({
            atome_id: 'project-1',
            project_id: 'project-1',
            properties: { kind: 'project', name: 'Campaign' }
        })).toBe(true);
        expect(isCanonicalProjectChange({ atome_id: 'project-1', project_id: 'project-1' })).toBe(true);
        expect(isCanonicalProjectChange({
            atome_id: 'text-1',
            project_id: 'project-1',
            properties: { kind: 'text' }
        })).toBe(false);
    });

    it('subscribes to create, update, delete and restore events and can be detached', () => {
        const eventTarget = new EventTarget();
        const listener = vi.fn();
        const unsubscribe = subscribeCanonicalProjectChanges(listener, eventTarget);

        eventTarget.dispatchEvent(new CustomEvent('squirrel:atome-created', {
            detail: { atome_id: 'project-1', project_id: 'project-1', type: 'project' }
        }));
        eventTarget.dispatchEvent(new CustomEvent('squirrel:atome-updated', {
            detail: { atome_id: 'project-1', project_id: 'project-1' }
        }));
        eventTarget.dispatchEvent(new CustomEvent('squirrel:atome-updated', {
            detail: { atome_id: 'text-1', project_id: 'project-1', properties: { kind: 'text' } }
        }));
        eventTarget.dispatchEvent(new CustomEvent('squirrel:atome-deleted', {
            detail: { atome_id: 'project-1', project_id: 'project-1' }
        }));

        expect(listener).toHaveBeenCalledTimes(3);
        unsubscribe();
        eventTarget.dispatchEvent(new CustomEvent('squirrel:atome-restored', {
            detail: { atome_id: 'project-1', project_id: 'project-1' }
        }));
        expect(listener).toHaveBeenCalledTimes(3);
    });
});

describe('dashboard creation mode', () => {
    it('a short header press opens the grid, steps through a family, and any header closes it', async () => {
        const state = { active: true, activeCategoryId: '', creation: null };
        const created = [];
        const runtime = createDashboardCreationRuntime({
            state,
            render: async () => null,
            actions: {
                createGuidedProject: async (intent) => { created.push(intent); return { ok: true }; },
                createNews: async () => ({ ok: true }),
                openEditor: async () => ({ ok: true })
            }
        });
        await runtime.toggleFromHeader('projects');
        expect(runtime.readStep().cells.map((cell) => cell.id)).toEqual([
            'empty_project', 'family_health', 'family_creation', 'family_recording', 'family_publication', 'family_templates'
        ]);
        await runtime.choose('family_health');
        await runtime.choose('goal_health_weight');
        expect(created).toEqual([{ family: 'health', goal: 'weight' }]);
        expect(state.activeCategoryId).toBe('');
        await runtime.toggleFromHeader('news');
        await runtime.toggleFromHeader('calendar');
        expect(state.creation).toBe(null);
    });
});

it('guided creation carries the full intent into the canonical creator and opens its result', async () => {
    const calls = [];
    const actions = createDashboardCreationActions({ invalidateCategories: async ids => calls.push(['invalidate', ids]),
        projectCreator: async () => async options => { calls.push(['create', options]); return { project: { id: 'guided' } }; },
        newsCreator: async () => async options => { calls.push(['news', options]); return { ok: true, project: { id: 'draft' } }; },
        openProject: async item => { calls.push(['open', item]); return { ok: true }; } });
    await actions.createGuidedProject({ family: 'health', goal: 'journal' });
    expect(calls[0][1].properties.project_intent).toEqual({ family: 'health', goal: 'journal' });
    expect(calls[2]).toEqual(['open', { payload: { id: 'guided' } }]);
    calls.length = 0;
    await actions.createGuidedProject({ family: 'publication', goal: 'everyone' });
    expect(calls[0]).toEqual(['news', expect.objectContaining({ empty: true,
        properties: { project_intent: { family: 'publication', goal: 'everyone', status: 'draft', audience: 'everyone' } } })]);
    await expect(actions.createGuidedProject({ family: 'health', goal: 'invalid' })).rejects.toThrow('dashboard_project_goal_invalid');
});

describe('dashboard weather data contract', () => {
    it('requests current conditions and rejects unavailable or malformed responses', async () => {
        const { fetchDashboardWeather } = await import('../../eVe/domains/dashboard/dashboard_news_modules.js');
        const fetchResource = vi.fn(async () => ({ ok: true, json: async () => ({ current: { temperature_2m: 19, weather_code: 3 } }) }));
        await expect(fetchDashboardWeather({ lat: 48.85, lon: 2.35 }, { fetchResource })).resolves.toEqual({ temperature: 19, condition: 'cloudy' });
        expect(fetchResource.mock.calls[0][0].searchParams.get('current')).toBe('temperature_2m,weather_code');
        await expect(fetchDashboardWeather({ lat: 48, lon: 2 }, { fetchResource: async () => ({ ok: false, status: 503 }) })).rejects.toThrow('weather_http_503');
        await expect(fetchDashboardWeather({ lat: 48, lon: 2 }, { fetchResource: async () => ({ ok: true, json: async () => ({}) }) })).rejects.toThrow('weather_current_required');
    });
});


it('closing the shared place search aborts its request and rejects late results', async () => {
    const { createFinderPlaceRuntime } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_place_runtime.js');
    let finish;
    let signal;
    const geocoder = createFinderPlaceRuntime({ geocode: (_query, options) => {
        signal = options.signal; return new Promise(resolve => { finish = resolve; });
    } });
    const request = geocoder.runSearch('Paris');
    geocoder.reset();
    expect(signal?.aborted).toBe(true);
    finish([{ lat: '48.85', lon: '2.35', display_name: 'Paris' }]);
    expect(await request).toMatchObject({ stale: true });
    expect(geocoder.readState().results).toEqual([]);
});

it('opens calendar and contact drafts without creating records', async () => {
    const openPanel = vi.fn(async () => ({ ok: true }));
    const invalidateCategories = vi.fn();
    const projectCreator = vi.fn();
    const actions = createDashboardCreationActions({ openPanel, invalidateCategories, projectCreator,
        openProject: async () => ({ ok: true }) });
    await actions.openEditor('calendar', 'workspace');
    await actions.openEditor('contact');
    expect(openPanel.mock.calls.map(([key, context]) => [key, context.createNew, context.projectId]))
        .toEqual([['calendar', true, 'workspace'], ['contact', true, null]]);
    expect(projectCreator).not.toHaveBeenCalled();
    expect(invalidateCategories).not.toHaveBeenCalled();
});
