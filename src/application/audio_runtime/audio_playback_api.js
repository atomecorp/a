import { getPlayRecordCore } from './play_record_core.js';
import { createUnsupportedCapabilityError, installSharedAVContracts } from './av_contracts.js';

export class AudioPlaybackAPI {
    constructor(env = globalThis, core = getPlayRecordCore(env)) {
        this.env = env;
        this.core = core;
        installSharedAVContracts(env);
    }

    loadAsset(input = {}) {
        return this.core.loadAsset(input);
    }

    unloadAsset(input = {}) {
        return this.core.destroyAsset(input);
    }

    prepareAsset(input = {}) {
        return this.core.loadAsset(input);
    }

    playAsset(input = {}) {
        return this.core.playAsset(input);
    }

    stopAsset(input = {}) {
        return this.core.stopAsset(input);
    }

    seekAsset(input = {}) {
        return this.core.jumpAsset(input);
    }

    createVoice(input = {}) {
        return {
            ok: true,
            voiceId: input.voiceId || input.voice_id || input.id || `voice_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            assetId: input.assetId || input.asset_id || input.clipId || input.clip_id || null
        };
    }

    startVoice(input = {}) {
        return this.core.playVoice(input);
    }

    stopVoice(input = {}) {
        return this.core.stopVoice(input);
    }

    scheduleVoice(input = {}) {
        throw createUnsupportedCapabilityError({
            capability: 'sample_accurate_scheduling',
            mediaKind: 'audio',
            backend: this.core.runtime()?.playback || 'unknown'
        });
    }

    setVoiceParam(input = {}) {
        const param = String(input.paramId || input.param_id || input.param || '').trim();
        if (param === 'gain' || param === 'volume') return this.core.setVoiceGain(input);
        if (param === 'rate' || param === 'playback_rate' || param === 'speed') return this.core.setVoiceRate(input);
        throw createUnsupportedCapabilityError({
            capability: param || 'voice_param',
            mediaKind: 'audio',
            backend: this.core.runtime()?.playback || 'unknown'
        });
    }

    queryState(input = {}) {
        const assetId = typeof input === 'string'
            ? input
            : (input.assetId || input.asset_id || input.id || input.clipId || input.clip_id || '');
        return Promise.resolve(this.core.hasAsset(assetId)).then((loaded) => ({
            ok: true,
            assetId,
            loaded
        }));
    }
}

export const getAudioPlaybackAPI = (env = globalThis) => {
    if (!env.__SQUIRREL_AUDIO_PLAYBACK_API__) {
        Object.defineProperty(env, '__SQUIRREL_AUDIO_PLAYBACK_API__', {
            value: new AudioPlaybackAPI(env),
            configurable: false,
            enumerable: false,
            writable: false
        });
    }
    return env.__SQUIRREL_AUDIO_PLAYBACK_API__;
};
