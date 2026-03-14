import assert from 'node:assert/strict';

import { shouldEnableVoicePanel } from './panel.js';

const baseEnv = {
    location: {
        protocol: 'tauri:',
        hostname: 'tauri.localhost',
        href: 'https://example.test/'
    },
    __TAURI_INTERNALS__: {
        invoke() {}
    },
    navigator: {
        userAgent: 'tauri'
    },
    localStorage: {
        getItem() {
            return '';
        }
    }
};

assert.equal(shouldEnableVoicePanel(baseEnv), false, 'debug voice panel should stay hidden by default even in Tauri');
assert.equal(shouldEnableVoicePanel({ ...baseEnv, __ATOME_VOICE_PANEL__: true }), true, 'debug voice panel should still be available through the explicit flag');
assert.equal(shouldEnableVoicePanel({
    ...baseEnv,
    location: {
        ...baseEnv.location,
        href: 'https://example.test/?voicepanel=1'
    }
}), true, 'debug voice panel should still be reachable through the explicit query param');

console.log('voice_panel_visibility: ok');
