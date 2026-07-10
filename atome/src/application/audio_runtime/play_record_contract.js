export const PLAY_RECORD_API_VERSION = 1;

export const PLAY_RECORD_API_CONTRACT = Object.freeze({
    schema_version: PLAY_RECORD_API_VERSION,
    tool_key: 'play_record',
    operations: Object.freeze([
        Object.freeze({ name: 'loadAsset', effect: 'persistent', command_action: 'PATCH' }),
        Object.freeze({ name: 'loadTransientAsset', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'playAsset', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'playVoice', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'stopAsset', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'stopVoice', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'jumpAsset', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'destroyAsset', effect: 'persistent', command_action: 'SOFT_DELETE' }),
        Object.freeze({ name: 'releaseTransientAsset', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'setVoiceGain', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'setVoiceRate', effect: 'ephemeral', command_action: 'PATCH' }),
        Object.freeze({ name: 'recordStart', effect: 'persistent', command_action: 'PATCH' }),
        Object.freeze({ name: 'recordStop', effect: 'persistent', command_action: 'PATCH' })
    ])
});
