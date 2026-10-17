import { spotifyApi } from './spotify_http.js';
import { MusicFailure } from '../../atome/src/squirrel/music/contracts.js';

const songUri = id => 'spotify:track:' + id;
const page = input => new URLSearchParams({ limit: String(input.limit || 10), offset: String(input.offset || 0) });
export const musicItem = value => value && ['track', 'artist', 'playlist'].includes(value.type) && /^[A-Za-z0-9]{1,100}$/.test(value.id || '') && typeof value.name === 'string'
    ? { id: value.id, name: value.name, kind: value.type === 'track' ? 'song' : value.type,
        ...(Array.isArray(value.artists) ? { artist: value.artists.map(artist => artist.name).join(', ') } : {}) } : null;
const itemsOf = values => (values || []).map(musicItem).filter(Boolean);

export async function readSpotify(ctx, record, action, input) {
    const get = path => spotifyApi(ctx, record, path);
    if (action === 'get_state') {
        const state = await get('/me/player');
        return { playback: state?.is_playing === true ? 'playing' : state ? 'paused' : 'stopped',
            current_song: state?.item?.type === 'track' ? musicItem(state.item) : null,
            device: state?.device ? { id: state.device.id, name: state.device.name, restricted: state.device.is_restricted === true } : null };
    }
    if (action === 'devices') {
        const result = await get('/me/player/devices');
        return { items: (result.devices || []).map(device => ({ id: device.id, name: device.name,
            active: device.is_active === true, restricted: device.is_restricted === true })) };
    }
    let result, values;
    if (action === 'search') {
        const type = input.kind === 'song' || !input.kind ? 'track' : input.kind;
        result = await get('/search?' + new URLSearchParams({ q: input.query, type, ...Object.fromEntries(page(input)) }));
        result = result[type + 's']; values = result?.items;
    } else if (action === 'list_library') {
        result = await get('/me/tracks?' + page(input)); values = result?.items?.map(entry => entry.track);
    } else if (action === 'list_playlists') {
        result = await get('/me/playlists?' + page(input)); values = result?.items;
    } else if (action === 'playlist_tracks') {
        result = await get('/playlists/' + input.id + '/items?' + page(input)); values = result?.items?.map(entry => entry.item);
    } else throw new MusicFailure('INVALID_ARGUMENT');
    if (!result || !Array.isArray(values)) throw new MusicFailure('PROVIDER_REJECTED');
    return { items: itemsOf(values), has_more: typeof result.next === 'string' && result.next.length > 0 };
}

export async function controlSpotify(ctx, record, action, input) {
    let target = input;
    if (action === 'play' && input.query) {
        const found = await readSpotify(ctx, record, 'search', { ...input, limit: 10 });
        const exact = found.items.filter(item => item.name.localeCompare(input.query, undefined, { sensitivity: 'base' }) === 0);
        const candidates = exact.length ? exact : found.items;
        if (candidates.length !== 1 || found.has_more && !exact.length) return { ok: false,
            error: candidates.length ? 'AMBIGUOUS_SELECTION' : 'ITEM_NOT_FOUND', candidates };
        target = { ...input, ...candidates[0] };
    }
    const state = await readSpotify(ctx, record, 'get_state', {});
    const deviceId = input.device_id || state.device?.id;
    if (!deviceId) throw new MusicFailure('NO_ACTIVE_DEVICE');
    if (!input.device_id && state.device?.restricted) throw new MusicFailure('PERMISSION_DENIED');
    const suffix = '?' + new URLSearchParams({ device_id: deviceId });
    const path = action === 'play' || action === 'resume' ? 'play' : action;
    const body = action === 'play' ? (target.kind === 'song' ? { uris: [songUri(target.id)] }
        : { context_uri: 'spotify:' + target.kind + ':' + target.id }) : undefined;
    await spotifyApi(ctx, record, '/me/player/' + path + suffix, { method: ['next', 'previous'].includes(action) ? 'POST' : 'PUT', body, effect: true });
    const observed = await readSpotify(ctx, record, 'get_state', {});
    const sameSong = target.kind !== 'song' || observed.current_song?.id === target.id;
    return { ok: true, playback: ['play', 'resume'].includes(action)
        ? observed.playback === 'playing' && sameSong ? 'playing' : 'opened_unconfirmed'
        : action === 'pause' ? observed.playback === 'paused' ? 'paused' : 'opened_unconfirmed' : 'opened_unconfirmed' };
}

// Every caller must own a canonical durable claim before reaching this function.
export async function writeSpotify(ctx, record, action, input) {
    const api = (path, options) => spotifyApi(ctx, record, path, options);
    if (action === 'create_playlist') {
        const created = await api('/me/playlists', { method: 'POST', body: { name: input.name, description: input.description || '', public: false }, effect: true });
        if (!/^[A-Za-z0-9]{1,100}$/.test(created?.id || '')) throw new MusicFailure('OPERATION_UNCONFIRMED', { uncertain: true });
        const saved = await api('/playlists/' + created.id);
        if (saved?.id !== created.id || saved.name !== input.name || saved.public !== false || saved.owner?.id !== record.spotify_user_id)
            throw new MusicFailure('OPERATION_UNCONFIRMED', { uncertain: true });
        return { ok: true, playlist_id: saved.id };
    }
    if (action === 'add_tracks') {
        const before = await api('/playlists/' + input.playlist_id);
        const total = before?.items?.total;
        if (!Number.isInteger(total) || total < 0) throw new MusicFailure('PERMISSION_DENIED');
        const uris = input.track_ids.map(songUri);
        await api('/playlists/' + input.playlist_id + '/items', { method: 'POST', body: { uris }, effect: true });
        const after = await api('/playlists/' + input.playlist_id + '/items?' + new URLSearchParams({ offset: String(total), limit: String(uris.length) }));
        if (!Array.isArray(after?.items) || after.items.length !== uris.length || after.items.some((entry, index) => entry.item?.uri !== uris[index]))
            throw new MusicFailure('OPERATION_UNCONFIRMED', { uncertain: true });
        return { ok: true, playlist_id: input.playlist_id };
    }
    if (action === 'favorite_current') {
        const state = await readSpotify(ctx, record, 'get_state', {});
        if (state.current_song?.id !== input.song_id) throw new MusicFailure('CURRENT_SONG_CHANGED');
        const query = '?' + new URLSearchParams({ uris: songUri(input.song_id) });
        await api('/me/library' + query, { method: 'PUT', effect: true });
        const result = await api('/me/library/contains' + query);
        if (!Array.isArray(result) || result[0] !== true) throw new MusicFailure('OPERATION_UNCONFIRMED', { uncertain: true });
        return { ok: true, song_id: input.song_id, favorited: true };
    }
    throw new MusicFailure('INVALID_ARGUMENT');
}
