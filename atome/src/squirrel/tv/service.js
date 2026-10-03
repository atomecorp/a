import { projectTvPrograms } from './epg.js';
import { TV_CHANNELS, findTvChannels, normalizeTvQuery, resolveTvChannel } from './registry.js';
import { createTvProviderAdapters, validateTvAccess } from './providers.js';
import { tvPage, tvPeriod, validateTvInput, validateTvOutput, normalizeTvError } from './contracts.js';

// Domain state is ephemeral and belongs to one authorized client/context.
export function createTvService({ channels = TV_CHANNELS, adapters = createTvProviderAdapters(),
    player = null, viewer = null, context = () => ({ platform: 'web', country: null }), now = Date.now, categoryPreferences = {} } = {}) {
    let revision = 0, controller = null, activePlayer = null, identity = null, closing = null, activeRoute = null;
    const state = { channel_id: null, operation: 'closed', playback: 'closed', fullscreen: false,
        system_fullscreen: false, action_required: null };
    const listeners = new Set();
    const snapshot = () => ({ ok: true, ...state });
    const notify = () => { const value = snapshot(); listeners.forEach(listener => listener(value)); return value; };
    const fail = error => ({ ...snapshot(), ok: false, error: normalizeTvError(error) });
    const publicChannel = channel => {
        const gates = channel.routes.map(route => adapters[route.provider]?.capabilities(route, context())
            || { ok: false, error: 'NOT_CONFIGURED' });
        return { id: channel.id, name: channel.name, aliases: [...channel.aliases], categories: [...channel.categories],
            country: channel.country, language: channel.language, type: channel.type, logo: channel.logo || null,
            ...(channel.current_program ? { current_program: projectTvPrograms([channel.current_program], { channel_id: channel.id, from: now(), to: now() + 1, now: now() })[0] || null } : {}),
            availability: gates.some(gate => gate.ok) ? 'available' : gates[0]?.error || 'NOT_CONFIGURED' };
    };
    const invalidate = () => { revision += 1; controller?.abort(); controller = null; };
    const release = async () => {
        const previous = activePlayer; activePlayer = null;
        if (previous) await previous.dispose();
    };
    const close = (closeViewer = true) => {
        invalidate(); activeRoute = null;
        Object.assign(state, { channel_id: null, operation: 'closed', playback: 'closed', fullscreen: false,
            system_fullscreen: false, action_required: null });
        notify();
        if (!closeViewer) return release().then(snapshot);
        closing ||= (async () => { await release(); await viewer?.close(); return snapshot(); })().finally(() => { closing = null; });
        return closing;
    };
    const ensureContext = async () => {
        const current = context();
        if (current?.ambiguous === true) return 'AMBIGUOUS_CLIENT';
        if (!current?.client_id) return 'NO_ACTIVE_CLIENT';
        const next = JSON.stringify([current.client_id, current.user_id, current.project_id]);
        if (identity && identity !== next) await close();
        identity = next; return null;
    };
    const resolve = query => {
        let result = resolveTvChannel(channels, query);
        const preferred = categoryPreferences[normalizeTvQuery(query)];
        if (result.error === 'AMBIGUOUS_CHANNEL' && preferred) {
            const chosen = result.candidates.find(channel => channel.id === preferred);
            if (chosen) result = { ok: true, channel: chosen };
        }
        return result.ok ? result : { ...result, candidates: result.candidates.map(publicChannel) };
    };
    const setFullscreen = async enabled => {
        if (!activePlayer || !viewer) return fail('NO_ACTIVE_CHANNEL');
        const token = revision;
        const result = await viewer.setFullscreen(enabled);
        if (token !== revision) return fail('CANCELLED');
        if (!result?.ok) return fail(result?.error || 'FULLSCREEN_UNSUPPORTED');
        Object.assign(state, { fullscreen: result.fullscreen === true, system_fullscreen: result.system_fullscreen === true });
        return notify();
    };
    const open = async input => {
        const target = resolve(input.channel);
        if (!target.ok) return target;
        const channel = target.channel;
        if (activePlayer && state.channel_id === channel.id && state.action_required === 'USER_GESTURE_REQUIRED') {
            const token = revision;
            const started = await activePlayer.play();
            if (token !== revision) return fail('CANCELLED');
            if (started?.ok === false) return fail(started.error);
            state.action_required = null;
            if (state.playback === 'user_action_required') state.playback = 'opened_unconfirmed';
            return notify();
        }
        const candidates = channel.routes.map(route => ({ route, adapter: adapters[route.provider],
            gate: adapters[route.provider]?.capabilities(route, context()) }));
        const candidate = candidates.filter(item => item.gate?.ok).sort((a, b) => (Number(b.route.priority) || 0) - (Number(a.route.priority) || 0))[0];
        if (!candidate) return { ...fail(candidates[0]?.gate?.error || 'NOT_CONFIGURED'), channel_id: channel.id };
        if (!player || !viewer) return fail('NOT_CONFIGURED');
        if (closing) await closing;
        invalidate(); const token = revision; controller = new AbortController();
        const signal = controller.signal; activeRoute = candidate.route;
        await release();
        if (token !== revision) return fail('CANCELLED');
        Object.assign(state, { channel_id: channel.id, operation: 'resolving', playback: 'loading', action_required: null }); notify();
        let prepared = null;
        try {
            const access = validateTvAccess(await candidate.adapter.resolveAccess(channel, candidate.route, context(), signal), candidate.route);
            if (token !== revision) return fail('CANCELLED');
            if (!access?.ok) { Object.assign(state, { operation: 'error', playback: 'error' }); notify(); return fail(access?.error || 'PLAYBACK_FAILED'); }
            prepared = await player.prepare(access, { signal, channel_id: channel.id, onState: event => {
                if (token !== revision) return;
                if (!['playing', 'loading', 'opened_unconfirmed', 'user_action_required', 'stopped', 'error'].includes(event.playback)) return;
                Object.assign(state, { playback: event.playback, action_required: event.action_required ? normalizeTvError(event.action_required) : null }); notify();
            } });
            if (token !== revision) { await prepared?.dispose(); return fail('CANCELLED'); }
            if (!prepared?.ok) { await prepared?.dispose?.(); Object.assign(state, { operation: 'error', playback: 'error' }); notify(); return fail(prepared?.error || 'PLAYBACK_FAILED'); }
            activePlayer = prepared;
            const opened = await viewer.open({ channel, player: prepared });
            if (token !== revision) return fail('CANCELLED');
            if (!opened?.ok) { await release(); Object.assign(state, { operation: 'error', playback: 'error' }); notify(); return fail(opened?.error || 'PLAYBACK_FAILED'); }
            state.operation = 'opened';
            if (state.playback === 'loading') state.playback = 'opened_unconfirmed';
            notify();
            if (Object.hasOwn(input, 'fullscreen')) {
                const presentation = await setFullscreen(input.fullscreen);
                if (!presentation.ok) return presentation;
            }
            const started = await prepared.play();
            if (token !== revision) return fail('CANCELLED');
            if (started?.ok === false) {
                Object.assign(state, { playback: 'user_action_required', action_required: normalizeTvError(started.error) }); notify(); return fail(started.error);
            }
            return notify();
        } catch (error) {
            if (token !== revision || signal.aborted) return fail('CANCELLED');
            await release(); Object.assign(state, { operation: 'error', playback: 'error' }); notify();
            return fail(error?.code || 'PLAYBACK_FAILED');
        }
    };
    const programsFor = async (channel, period) => {
        const adapter = adapters[channel.provider];
        let result;
        try { result = await adapter?.getEpg(channel, period); }
        catch { return { ok: false, error: 'EPG_UNAVAILABLE' }; }
        if (!result?.ok || !Array.isArray(result.programs)) return { ok: false, error: 'EPG_UNAVAILABLE' };
        const programs = projectTvPrograms(result.programs, { channel_id: channel.id, ...period, now: now() });
        if (!programs.length && result.programs.length) return { ok: false, error: 'EPG_UNAVAILABLE' };
        return { ok: true, programs };
    };
    const execute = async (action, input = {}) => {
        const error = validateTvInput(action, input); if (error) return fail(error);
        const contextError = await ensureContext(); if (contextError) return fail(contextError);
        if (action === 'get_state') return snapshot();
        if (action === 'close') return close();
        if (action === 'set_fullscreen') return setFullscreen(input.enabled);
        if (action === 'open_channel') return open(input);
        if (action === 'find_channel') {
            const candidates = findTvChannels(channels, input.query).map(publicChannel);
            return { ok: true, candidates };
        }
        if (action === 'list_channels') {
            const paged = tvPage(findTvChannels(channels, input.query, input.category).map(publicChannel), input);
            return paged.ok ? { ok: true, channels: paged.items, cursor: paged.cursor } : paged;
        }
        const period = tvPeriod(input, now()); if (!period) return fail('INVALID_ARGUMENT');
        if (action === 'search_program') {
            const results = await Promise.all(channels.map(channel => programsFor(channel, period)));
            if (!results.some(result => result.ok)) return fail('EPG_UNAVAILABLE');
            const items = results.flatMap(result => result.programs || []).filter(item => normalizeTvQuery(item.title + ' ' + item.description).includes(normalizeTvQuery(input.query)));
            const paged = tvPage(items, input);
            return paged.ok ? { ok: true, programs: paged.items, cursor: paged.cursor } : paged;
        }
        const selected = input.channel || state.channel_id;
        if (!selected) return fail('NO_ACTIVE_CHANNEL');
        const target = resolve(selected); if (!target.ok) return target;
        const result = await programsFor(target.channel, period); if (!result.ok) return result;
        if (action === 'get_epg') return { ...result, channel_id: target.channel.id };
        const time = now();
        const program = action === 'now' ? result.programs.find(item => Date.parse(item.start) <= time && Date.parse(item.end) > time)
            : result.programs.find(item => Date.parse(item.start) > time);
        return program ? { ok: true, channel_id: target.channel.id, program } : fail('EPG_UNAVAILABLE');
    };
    return Object.freeze({ execute: async (action, input) => {
        const result = await execute(action, input);
        return validateTvOutput(result) ? fail('PLAYBACK_FAILED') : result;
    }, close, snapshot, viewerClosed: () => close(false),
        configureRoutes(catalog) {
            channels = channels.map(channel => {
                const routes = catalog?.find(item => item.id === channel.id)?.routes;
                const current_program = catalog?.find(item => item.id === channel.id)?.current_program || null;
                return routes?.length ? { ...channel, routes, current_program } : { ...channel, current_program: null, routes: TV_CHANNELS.find(item => item.id === channel.id)?.routes || channel.routes };
            });
            const route = channels.find(channel => channel.id === state.channel_id)?.routes.find(item => item.id === activeRoute?.id && item.provider === activeRoute?.provider);
            if (activeRoute && (!route || !adapters[route.provider]?.capabilities(route, context()).ok)) return close();
            return Promise.resolve();
        },
        presentationChanged(value) { state.fullscreen = value === true; notify(); },
        systemPresentationChanged(value) { state.system_fullscreen = value === true; notify(); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } });
}
