import {
    getTauriInvoke,
    isIosHostAppRuntime,
    resolveAudioRuntime
} from './runtime_audio_backend.js';
import {
    buildFacadeKiraAudioPayload,
    buildTauriKiraAudioPayload,
    KIRA_AUDIO_COMMANDS,
    normalizeKiraPlayInstancePayload,
    normalizeKiraStopInstancePayload
} from './kira_audio_commands.js';
import {
    PLAY_RECORD_API_CONTRACT,
    PLAY_RECORD_API_VERSION
} from './play_record_contract.js';
import { canonicalizePlayRecordMediaSource } from './play_record_media_source.js';

export {
    PLAY_RECORD_API_CONTRACT,
    PLAY_RECORD_API_VERSION
} from './play_record_contract.js';
export { canonicalizePlayRecordMediaSource } from './play_record_media_source.js';

const safeString = (value) => String(value ?? '').trim();

// [AUDIO_DIAG] temporary Tauri regression diagnostics — remove after fix.
const diagAudio = (stage, data = {}) => {
    const tauriInvoke = getTauriInvoke(globalThis);
    if (typeof tauriInvoke !== 'function') return;
    Promise.resolve(tauriInvoke('log_from_webview', {
        payload: {
            level: 'warn',
            source: 'tauri_webview',
            component: 'mtrack_audio_diag',
            message: `[AUDIO_DIAG] play_record_core ${stage}`,
            data,
            timestamp: new Date().toISOString()
        }
    })).catch(() => { });
};

const readAudioFacade = (env = globalThis) => env?.Squirrel?.av?.audio || null;

const stableSerialize = (value) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
};

const stableHash = (value = '') => {
    const text = safeString(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const resolveOperationContract = (operation = '') => (
    PLAY_RECORD_API_CONTRACT.operations.find((entry) => entry.name === operation) || null
);

export class PlayRecordCore {
    constructor(env = globalThis) {
        this.env = env;
        this.assetCache = new Map();
        this.initializedPlayback = '';
    }

    runtime() {
        return resolveAudioRuntime(this.env);
    }

    invoke() {
        const invoke = getTauriInvoke(this.env);
        if (typeof invoke !== 'function') {
            throw new Error('play_record_native_invoke_unavailable');
        }
        return invoke;
    }

    facade() {
        const facade = readAudioFacade(this.env);
        if (!facade) {
            throw new Error('play_record_audio_facade_unavailable');
        }
        return facade;
    }

    commandBus() {
        const runtimeBus = this.env?.atome?.tools?.v2CommandBus
            || this.env?.Squirrel?.commandBus
            || this.env?.AtomeCommandBus
            || null;
        if (!runtimeBus || typeof runtimeBus.dispatch !== 'function') {
            throw new Error('play_record_command_bus_unavailable');
        }
        return runtimeBus;
    }

    dispatchIntent(operation = '', payload = {}, options = {}) {
        const contract = resolveOperationContract(operation);
        if (!contract) {
            throw new Error(`play_record_operation_not_declared:${safeString(operation) || 'unknown'}`);
        }
        const targetId = safeString(
            options.targetId
            || payload.assetId
            || payload.asset_id
            || payload.voiceId
            || payload.voice_id
            || payload.id
            || payload.clipId
            || payload.clip_id
            || payload.sessionId
            || payload.session_id
            || 'play_record_runtime'
        );
        const serialized = stableSerialize({
            operation,
            targetId,
            payload
        });
        const envelope = {
            intent_id: safeString(options.intentId || payload.intent_id || payload.intentId) || `play_record_intent_${stableHash(serialized)}`,
            trace_id: safeString(options.traceId || payload.trace_id || payload.traceId) || `play_record_trace_${stableHash(`${operation}:${targetId}`)}`,
            source: safeString(options.source || payload.source_layer || payload.source || 'runtime'),
            actor: payload.actor && typeof payload.actor === 'object' ? payload.actor : {},
            idempotency_key: safeString(options.idempotencyKey || payload.idempotency_key || payload.idempotencyKey) || `play_record:${operation}:${stableHash(serialized)}`,
            dry_run: payload.dry_run === true,
            action: contract.command_action,
            target: { id: targetId },
            patch: {
                play_record: {
                    schema_version: PLAY_RECORD_API_VERSION,
                    operation,
                    effect: contract.effect,
                    target_id: targetId
                }
            },
            meta: {
                tool_key: PLAY_RECORD_API_CONTRACT.tool_key,
                tool_id: PLAY_RECORD_API_CONTRACT.tool_key,
                action: operation,
                history_mode: contract.effect,
                source_layer: safeString(options.sourceLayer || payload.source_layer || 'play_record_core'),
                api_schema_version: PLAY_RECORD_API_VERSION
            }
        };
        const command = this.commandBus().dispatch(envelope, { strictIdempotency: true });
        if (!command?.ok) {
            throw new Error(`play_record_command_rejected:${stableSerialize(command?.errors || [])}`);
        }
        return command;
    }

    async waitForFacadeBackend(timeoutMs = 4000) {
        const facade = this.facade();
        if (typeof facade.get_backend !== 'function') return null;
        const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
        while (Date.now() <= deadline) {
            const backend = safeString(facade.get_backend());
            if (backend) return backend;
            if (typeof facade.detect_and_set_backend === 'function') {
                facade.detect_and_set_backend();
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return null;
    }

    async init() {
        const runtime = this.runtime();
        const playback = safeString(runtime.playback);
        if (this.initializedPlayback === playback) {
            return { ok: true, runtime, cached: true };
        }
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            await this.invoke()('audio_init', {});
            this.initializedPlayback = playback;
            return { ok: true, runtime };
        }
        if (
            runtime.playback === 'web_wasm_kira'
            || runtime.playback === 'ios_auv3_native'
        ) {
            const facade = this.facade();
            if (typeof facade.detect_and_set_backend === 'function') {
                facade.detect_and_set_backend();
            }
            const backend = await this.waitForFacadeBackend(4000);
            if (!backend) {
                throw new Error(`play_record_facade_backend_not_ready:${playback || 'unknown'}`);
            }
            this.initializedPlayback = playback;
            return { ok: true, runtime };
        }
        throw new Error(`play_record_playback_unsupported:${safeString(runtime.playback) || 'unknown'}`);
    }

    async hasAsset(assetId = '') {
        const id = safeString(assetId);
        if (!id) return false;
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()('audio_has_clip', { id });
            return result?.success === true && result?.loaded === true;
        }
        return this.assetCache.has(id);
    }

    async loadAsset(input = {}) {
        const media = canonicalizePlayRecordMediaSource(input);
        const assetId = safeString(input.assetId || input.asset_id || input.clipId || input.clip_id || input.id || media.assetId);
        if (!assetId) {
            throw new Error('play_record_asset_id_required');
        }
        this.dispatchIntent('loadAsset', { ...input, assetId });
        await this.init();
        const runtime = this.runtime();
        const cacheKey = JSON.stringify({
            mediaRef: media.mediaRef,
            localPath: media.localPath,
            url: media.url,
            bytesLength: media.bytes?.byteLength || media.bytes?.length || 0
        });
        if (input.force !== true && this.assetCache.get(assetId) === cacheKey) {
            return { ok: true, assetId, cached: true, media };
        }
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            diagAudio('loadAsset:native', {
                asset_id: assetId,
                playback: runtime.playback,
                media: {
                    mediaRef: media.mediaRef || null,
                    localPath: media.localPath || null,
                    url: media.url || null,
                    source: media.source || null,
                    bytes_length: media.bytes?.byteLength || media.bytes?.length || 0
                },
                input_keys: Object.keys(input || {})
            });
            if (!media.localPath) {
                diagAudio('loadAsset:native:NO_LOCAL_PATH', { asset_id: assetId });
                throw new Error('play_record_native_local_path_required');
            }
            const result = await this.invoke()('audio_load_clip', {
                id: assetId,
                path: media.localPath
            });
            diagAudio('loadAsset:native:result', {
                asset_id: assetId,
                success: result?.success === true,
                error: result?.error || null,
                resolved_path: result?.path || null,
                duration_seconds: result?.duration_seconds ?? null
            });
            if (result?.success !== true) {
                throw new Error(safeString(result?.error) || 'play_record_native_load_failed');
            }
            this.assetCache.set(assetId, cacheKey);
            return { ok: true, assetId, media, result };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        const payload = {
            id: assetId,
            path: media.localPath,
            url: media.url || media.source,
            bytes: media.bytes
        };
        const result = await Promise.resolve(facade.__call_backend_method('create_clip', payload));
        if (result === false) {
            throw new Error('play_record_facade_load_failed');
        }
        this.assetCache.set(assetId, cacheKey);
        return { ok: true, assetId, media, result };
    }

    async playAsset(input = {}) {
        const id = safeString(
            typeof input === 'string'
                ? input
                : (input.assetId || input.asset_id || input.id || input.clipId || input.clip_id)
        );
        if (!id) {
            throw new Error('play_record_asset_id_required');
        }
        this.dispatchIntent('playAsset', { ...(typeof input === 'object' ? input : {}), assetId: id });
        await this.init();
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()('audio_play', { id });
            if (result?.success === false) {
                throw new Error(safeString(result?.error) || 'play_record_native_direct_play_failed');
            }
            return { ok: true, result, assetId: id };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        const result = await Promise.resolve(facade.__call_backend_method('play', { id }));
        if (result === false) {
            throw new Error('play_record_facade_direct_play_failed');
        }
        return { ok: true, result, assetId: id };
    }

    async playVoice(input = {}) {
        const payload = normalizeKiraPlayInstancePayload(input);
        if (!payload.assetId || !payload.voiceId) {
            throw new Error('play_record_voice_asset_and_id_required');
        }
        this.dispatchIntent('playVoice', payload);
        await this.init();
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()(
                KIRA_AUDIO_COMMANDS.PLAY_INSTANCE,
                buildTauriKiraAudioPayload(KIRA_AUDIO_COMMANDS.PLAY_INSTANCE, payload)
            );
            if (result?.success === false) {
                throw new Error(safeString(result?.error) || 'play_record_native_play_failed');
            }
            return { ok: true, result, payload };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        const result = await Promise.resolve(
            facade.__call_backend_method(
                'play_instance',
                buildFacadeKiraAudioPayload(KIRA_AUDIO_COMMANDS.PLAY_INSTANCE, payload)
            )
        );
        if (result === false) {
            throw new Error('play_record_facade_play_failed');
        }
        return { ok: true, result, payload };
    }

    async stopVoice(input = {}) {
        const payload = normalizeKiraStopInstancePayload(input);
        if (!payload.voiceId) return { ok: true, skipped: true };
        this.dispatchIntent('stopVoice', payload);
        await this.init();
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()(
                KIRA_AUDIO_COMMANDS.STOP_INSTANCE,
                buildTauriKiraAudioPayload(KIRA_AUDIO_COMMANDS.STOP_INSTANCE, payload)
            );
            return { ok: true, result, payload };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        const result = await Promise.resolve(
            facade.__call_backend_method(
                'stop_instance',
                buildFacadeKiraAudioPayload(KIRA_AUDIO_COMMANDS.STOP_INSTANCE, payload)
            )
        );
        return { ok: true, result, payload };
    }

    async stopAsset(input = {}) {
        const id = safeString(
            typeof input === 'string'
                ? input
                : (input.assetId || input.asset_id || input.id || input.clipId || input.clip_id)
        );
        if (!id) return { ok: true, skipped: true };
        this.dispatchIntent('stopAsset', { ...(typeof input === 'object' ? input : {}), assetId: id });
        await this.init();
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()('audio_stop', { id });
            return { ok: true, result, assetId: id };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        const result = await Promise.resolve(facade.__call_backend_method('stop', { id }));
        return { ok: true, result, assetId: id };
    }

    async jumpAsset(input = {}) {
        const id = safeString(
            typeof input === 'string'
                ? input
                : (input.assetId || input.asset_id || input.id || input.clipId || input.clip_id)
        );
        if (!id) return { ok: true, skipped: true };
        this.dispatchIntent('jumpAsset', { ...(typeof input === 'object' ? input : {}), assetId: id });
        await this.stopAsset(id);
        return await this.playAsset(id);
    }

    async destroyAsset(assetId = '') {
        const id = safeString(
            typeof assetId === 'string'
                ? assetId
                : (assetId?.assetId || assetId?.asset_id || assetId?.id || assetId?.clipId || assetId?.clip_id)
        );
        if (!id) return { ok: true, skipped: true };
        this.dispatchIntent('destroyAsset', { assetId: id }, { targetId: id });
        await this.init();
        this.assetCache.delete(id);
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()('audio_destroy_clip', { id });
            return { ok: true, result };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method === 'function') {
            await Promise.resolve(facade.__call_backend_method('destroy_clip', { id }));
        }
        return { ok: true };
    }

    async setVoiceGain(voiceId = '', gain = 1) {
        const source = (voiceId && typeof voiceId === 'object') ? voiceId : null;
        const id = safeString(source ? (source.voiceId || source.voice_id || source.id || source.clipId || source.clip_id) : voiceId);
        if (!id) return { ok: true, skipped: true };
        this.dispatchIntent('setVoiceGain', { voiceId: id, gain: source ? source.gain : gain });
        await this.init();
        const normalizedGain = Math.min(16, Math.max(0.000001, Number(source ? source.gain : gain) || 1));
        const db = 20 * Math.log10(normalizedGain);
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()('audio_set_volume', { id, db });
            return { ok: true, result, id, gain: normalizedGain };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        await Promise.resolve(facade.__call_backend_method('set_param', { id, paramId: 'volume', value: db }));
        return { ok: true, id, gain: normalizedGain };
    }

    async setVoiceRate(voiceId = '', rate = 1) {
        const source = (voiceId && typeof voiceId === 'object') ? voiceId : null;
        const id = safeString(source ? (source.voiceId || source.voice_id || source.id || source.clipId || source.clip_id) : voiceId);
        if (!id) return { ok: true, skipped: true };
        this.dispatchIntent('setVoiceRate', { voiceId: id, rate: source ? source.rate : rate });
        await this.init();
        const normalizedRate = Math.max(0.0001, Number(source ? source.rate : rate) || 1);
        const runtime = this.runtime();
        if (
            runtime.playback === 'tauri_native_kira'
            || runtime.playback === 'ios_native_kira'
        ) {
            const result = await this.invoke()('audio_set_playback_rate', { id, rate: normalizedRate });
            return { ok: true, result, id, rate: normalizedRate };
        }
        const facade = this.facade();
        if (typeof facade.__call_backend_method !== 'function') {
            throw new Error('play_record_facade_backend_call_unavailable');
        }
        await Promise.resolve(facade.__call_backend_method('set_param', { id, paramId: 'playback_rate', value: normalizedRate }));
        return { ok: true, id, rate: normalizedRate };
    }

    async recordStart(params = {}) {
        if (typeof this.env?.record_start !== 'function') {
            throw new Error('play_record_record_start_unavailable');
        }
        this.dispatchIntent('recordStart', params);
        return await this.env.record_start(params);
    }

    async recordStop(sessionId = '') {
        if (typeof this.env?.record_stop !== 'function') {
            throw new Error('play_record_record_stop_unavailable');
        }
        this.dispatchIntent('recordStop', { sessionId });
        return await this.env.record_stop(sessionId);
    }
}

export const getPlayRecordCore = (env = globalThis) => {
    if (!env.__SQUIRREL_PLAY_RECORD_CORE__) {
        Object.defineProperty(env, '__SQUIRREL_PLAY_RECORD_CORE__', {
            value: new PlayRecordCore(env),
            configurable: false,
            enumerable: false,
            writable: false
        });
    }
    return env.__SQUIRREL_PLAY_RECORD_CORE__;
};

if (typeof window !== 'undefined') {
    getPlayRecordCore(window);
}
