import assert from 'node:assert/strict';
import {
    auv3ClearAuxSlots,
    auv3PlayMedia,
    auv3StopMedia,
    auv3StopNode,
    auv3StopSlot,
    shouldUseAuv3HostPlayback
} from './auv3_host_playback.js';

const messages = [];
const env = {
    __HOST_ENV: 'auv3',
    __AUV3_MODE__: true,
    webkit: {
        messageHandlers: {
            swiftBridge: {
                postMessage(message) {
                    messages.push(message);
                }
            }
        }
    }
};

assert.equal(shouldUseAuv3HostPlayback(env), true);
assert.equal(shouldUseAuv3HostPlayback({ __HOST_ENV: 'app', webkit: env.webkit }), false);

const videoNode = {
    tagName: 'video',
    currentSrc: 'atome:///audio/Alive.m4a',
    src: '',
    dataset: {
        eveAuv3PlaybackTime: '2',
        eveAuv3PlaybackDuration: '8'
    },
    playCalled: false,
    play() {
        this.playCalled = true;
        return Promise.resolve();
    }
};

assert.equal(auv3PlayMedia(videoNode, env), true);
assert.equal(videoNode.muted, true);
assert.equal(videoNode.playCalled, true);
assert.deepEqual(messages.pop(), {
    action: 'loadAndPlay',
    relativePath: 'Alive.m4a',
    positionNormalized: 0.25
});

const audioNode = {
    tagName: 'audio',
    currentSrc: 'blob:atome://local-object-url',
    src: '',
    __eveMediaProjectionState: {
        source: '/api/uploads/Evolution_2.wav'
    },
    play() {
        return Promise.resolve();
    }
};

assert.equal(auv3PlayMedia(audioNode, env), true);
assert.equal(audioNode.muted, true);
assert.equal(audioNode.volume, 0);
assert.deepEqual(messages.pop(), {
    action: 'loadAndPlay',
    relativePath: 'Evolution_2.wav'
});

assert.equal(auv3PlayMedia({ tagName: 'audio', currentSrc: '', src: '', dataset: {}, play() { return Promise.resolve(); } }, env), true);
assert.deepEqual(messages.pop(), { type: 'param', id: 'play', value: 1 });

assert.equal(auv3StopMedia(env), true);
assert.deepEqual(messages.pop(), { type: 'param', id: 'play', value: 0 });

assert.equal(auv3StopSlot('clip-1', env), true);
assert.deepEqual(messages.pop(), { action: 'stopSlot', slotId: 'clip-1' });

assert.equal(auv3ClearAuxSlots(env), true);
assert.deepEqual(messages.pop(), { action: 'clearAuxSlots' });

const stoppedNode = {
    paused: false,
    pause() {
        this.paused = true;
    }
};
auv3StopNode(stoppedNode);
assert.equal(stoppedNode.paused, true);

console.log('auv3_host_playback.test: PASS');
