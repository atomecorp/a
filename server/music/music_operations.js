import { createHash, randomUUID } from 'node:crypto';
import { MUSIC_COMMANDS, MUSIC_WRITES, validateMusicInput, musicError, MusicFailure } from '../../atome/src/squirrel/music/contracts.js';
import { createMusicOperationStore } from '../../atome/src/squirrel/apple_music/operation_store.js';
import { handleWsAtomeOperation } from '../wsAtomeOperations.js';
import { readMusicConfig, spotifyConfigured, spotifySession, startSpotifyConnection, awaitSpotifyConnection,
    cancelSpotifyConnection, disconnectSpotify } from './spotify_session.js';
import { readSpotify, controlSpotify, writeSpotify } from './spotify_operations.js';
import { readDeezerCatalog, verifyDeezerProfile } from './deezer_catalog.js';

// Keys of Passwords & keys: the Spotify application Client ID and the Deezer profile.
const MUSIC_CREDENTIALS = Object.freeze({
    spotify: { validateKey: async key => { if (!/^[0-9a-f]{32}$/i.test(key)) throw new Error('provider_key_invalid'); },
        // A Spotify session belongs to the application that authorized it.
        removed: ({ vault, principal }) => disconnectSpotify({ vault, principal, check() {} }) },
    deezer: { validateKey: verifyDeezerProfile }
});
export const musicCredentialProvider = id => MUSIC_CREDENTIALS[id] || null;
const notConfigured = (name, provider) => name === 'get_state'
    ? { ok: true, provider, supported: true, configured: false, state: 'not_configured', capabilities: [] }
    : { ok: false, error: 'NOT_CONFIGURED' };

// The receipt uses the same authenticated canonical commit/read boundary as Atome tools.
export function musicReceiptApi(connection, token, check, dispatch = handleWsAtomeOperation) {
    const call = async message => { check(); const result = await dispatch({ ...message, token, requestId: randomUUID() }, connection); check(); return result; };
    return {
        async getStateCurrent(id) {
            const response = await call({ type: 'state-current', action: 'get', atome_id: id });
            if (response?.ok) return response.state;
            if (response?.error === 'State not found') return null;
            throw new MusicFailure('COMMIT_FAILED');
        },
        commit: event => call({ type: 'events', action: 'commit', event })
    };
}
const receipt = (record, requestId) => ({ ...(record.properties.result || { ok: false, error: 'OPERATION_UNCONFIRMED' }),
    request_id: requestId, status: record.properties.status });
const operationPrefix = ctx => 'music_operation_' + createHash('sha256').update(ctx.principal).digest('hex') + '_' + ctx.input.provider + '_';

async function durableWrite(ctx, action, input, record) {
    const { request_id: supplied, provider, ...payload } = input;
    const requestId = supplied || (ctx.idempotencyKey ? createHash('sha256').update(ctx.principal + ':' + provider + ':' + action + ':' + ctx.idempotencyKey).digest('hex') : randomUUID());
    const ledger = createMusicOperationStore({ api: ctx.receiptApi, readActor: () => { ctx.check(); return ctx.principal; }, type: 'music_operation', idPrefix: operationPrefix(ctx) });
    const previous = await ctx.receiptApi.getStateCurrent(operationPrefix(ctx) + requestId);
    let target = payload;
    if (previous) {
        const saved = await ledger.read(requestId);
        if (saved.properties.request.provider !== provider || saved.properties.request.action !== action) throw new MusicFailure('OPERATION_CONFLICT');
        if (saved.properties.request.provider_account_id !== record.identity.id) throw new MusicFailure('CONTEXT_CHANGED');
        // prepare checks exact request equality, including a frozen favorite target.
        if (action === 'favorite_current') target = saved.properties.request.input;
    } else if (action === 'favorite_current') {
        const state = await readSpotify(ctx, record, 'get_state', {});
        if (!state.current_song?.id) throw new MusicFailure('NO_ACTIVE_MUSIC');
        target = { song_id: state.current_song.id };
    }
    let claim = await ledger.prepare(requestId, { provider, provider_account_id: record.identity.id, action, input: target }); ctx.check();
    if (claim.properties.status !== 'prepared') return receipt(claim, requestId);
    claim = await ledger.transition(requestId, claim, { status: 'submitting' }); ctx.check();
    let result, status = 'completed', accepted = false;
    try { result = await writeSpotify({ ...ctx, effectAccepted: () => { accepted = true; } }, record, action, target); }
    catch (error) {
        // Once submission starts, even a failed verification/read-back is uncertain.
        status = !accepted && !error.uncertain ? 'failed' : 'unconfirmed';
        result = { ok: false, error: status === 'failed' ? musicError(error) : 'OPERATION_UNCONFIRMED' };
    }
    ctx.check();
    try { await ledger.transition(requestId, claim, { status, result }); }
    catch { return { ok: false, error: 'OPERATION_UNCONFIRMED', request_id: requestId, status: 'submitting' }; }
    return { ...result, request_id: requestId, status };
}

export async function handleMusicAction(action, input, options) {
    const name = action.replace(/^music\./, '');
    if (validateMusicInput(name, input)) return { ok: false, error: 'INVALID_ARGUMENT' };
    const ctx = { ...options, input };
    ctx.check();
    try {
        ctx.config ??= await readMusicConfig(ctx.vault);
        ctx.check();
        if (input.provider === 'deezer') return ctx.config.deezerProfile ? await readDeezerCatalog(name, input, ctx) : notConfigured(name, 'deezer');
        if (name === 'operation_status') {
            const store = createMusicOperationStore({ api: ctx.receiptApi, readActor: () => { ctx.check(); return ctx.principal; }, type: 'music_operation', idPrefix: operationPrefix(ctx) });
            const saved = await store.read(input.request_id);
            if (saved.properties.request.provider !== input.provider) throw new MusicFailure('OPERATION_NOT_FOUND');
            return receipt(saved, input.request_id);
        }
        const configured = spotifyConfigured(ctx.config);
        if (name === 'get_state' && !configured) return notConfigured(name, 'spotify');
        if (name === 'connect') return { ok: true, ...startSpotifyConnection(ctx) };
        if (name === 'await_connection') { const result = await awaitSpotifyConnection(ctx); return result.ok ? result : { ok: false, error: musicError(result.error) }; }
        if (name === 'cancel_connection') return { ok: true, cancelled: cancelSpotifyConnection(ctx) };
        if (name === 'disconnect') return { ok: true, ...await disconnectSpotify(ctx) };
        if (!configured) throw new MusicFailure('NOT_CONFIGURED');
        if (name === 'open_item') return { ok: true, url: 'https://open.spotify.com/' + (input.kind === 'song' ? 'track' : input.kind) + '/' + input.id,
            playback: 'opened_unconfirmed' };
        let record;
        try { record = await spotifySession(ctx); }
        catch (error) {
            if (name === 'get_state' && error.code === 'AUTHORIZATION_REQUIRED') return { ok: true, provider: 'spotify', supported: true, configured: true, state: 'disconnected', capabilities: ['connect'] };
            throw error;
        }
        if (name === 'get_state') return { ok: true, provider: 'spotify', supported: true, configured: true, state: 'connected',
            capabilities: MUSIC_COMMANDS.map(command => command.action), identity: record.identity, ...await readSpotify(ctx, record, name, {}) };
        if (MUSIC_WRITES.includes(name)) return await durableWrite(ctx, name, input, record);
        if (['play', 'resume', 'pause', 'next', 'previous', 'seek'].includes(name)) return await controlSpotify(ctx, record, name, input);
        return { ok: true, ...await readSpotify(ctx, record, name, input) };
    } catch (error) { ctx.check(); return { ok: false, error: musicError(error) }; }
}
