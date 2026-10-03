import test from 'node:test';
import assert from 'node:assert/strict';
import { registerBevyVideoStreamSource, getBevyVideoStreamSourceStatus } from '../../eVe/domains/rendering/bevy_video_stream_source_runtime.js';

// Deliberate decoder fixture; these events do not constitute provider playback evidence.
const fakeSurface = (native = true) => {
    let document;
    class Element extends EventTarget {
        constructor(tag) { super(); this.tag = tag; this.children = []; this.style = { removeProperty() {} }; this.ownerDocument = document; this.paused = true; }
        setAttribute() {}
        removeAttribute() { this.src = ''; }
        appendChild(child) { this.children.push(child); child.parentNode = this; }
        remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
        get childElementCount() { return this.children.length; }
        canPlayType() { return native ? 'probably' : ''; }
        requestVideoFrameCallback() { return 1; }
        cancelVideoFrameCallback() {}
        async play() { if (this.denied) throw Object.assign(new Error(), { name: 'NotAllowedError' }); this.paused = false; }
        pause() { this.paused = true; }
        load() { this.loaded = true; }
    }
    document = { defaultView: { navigator: { userAgent: 'test-decoder' } }, createElement: tag => new Element(tag),
        getElementById: id => document.body.children.find(child => child.id === id) };
    document.body = new Element('body');
    return { ownerDocument: document };
};
test('media source requires actual playing event and reports autoplay denial independently', async () => {
    const surface = fakeSurface(), events = [];
    const player = await registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/live', format: 'hls', autoplay: false, onState: e => events.push(e) });
    assert.equal(player.ok, true); assert.equal(events.length, 0);
    player.video.denied = true; assert.equal((await player.play()).error, 'USER_GESTURE_REQUIRED');
    player.video.denied = false; await player.play(); assert.equal(events.length, 0);
    player.video.dispatchEvent(new Event('playing')); assert.equal(events[0].playback, 'playing');
    player.dispose(); assert.equal(player.video.paused, true); assert.equal(player.video.src, '');
    player.video.dispatchEvent(new Event('playing')); assert.equal(events.length, 1);
    assert.equal(getBevyVideoStreamSourceStatus({ id: 'tv', surface }).exists, false);
});
test('disposing a superseded source cannot delete its replacement', async () => {
    const surface = fakeSurface();
    const first = await registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/one', format: 'hls', autoplay: false });
    const second = await registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/two', format: 'hls', autoplay: false });
    first.dispose(); assert.equal(getBevyVideoStreamSourceStatus({ id: 'tv', surface }).exists, true);
    assert.equal(second.video.src, 'https://media.example.test/two'); second.dispose();
});

const hlsFixture = () => {
    const instances = [];
    class Hls {
        static isSupported() { return true; }
        static Events = { ERROR: 'error' };
        constructor() { this.destroyed = false; instances.push(this); }
        on(_, listener) { this.error = listener; }
        loadSource(source) { this.source = source; }
        attachMedia(video) { this.video = video; }
        destroy() { this.destroyed = true; }
    }
    return { Hls, instances };
};
test('native HLS never loads MSE and replacement stays mounted', async () => {
    const surface = fakeSurface();
    const args = { id: 'tv', surface, source: 'https://media.example.test/live', format: 'hls', autoplay: false,
        loadHls: () => { throw new Error('native should not import HLS'); } };
    const first = await registerBevyVideoStreamSource(args);
    const second = await registerBevyVideoStreamSource(args);
    assert.equal(second.ok, true);
    assert.equal(second.video.parentNode.parentNode, surface.ownerDocument.body);
    first.dispose(); assert.equal(second.video.parentNode.parentNode, surface.ownerDocument.body);
    second.dispose();
});
test('MSE HLS uses the shared video and destroys the decoder on abort and fatal errors', async () => {
    const surface = fakeSurface(false), { Hls, instances } = hlsFixture();
    const abort = new AbortController(), events = [];
    const source = await registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/live', format: 'hls',
        autoplay: false, signal: abort.signal, loadHls: async () => Hls, onState: event => events.push(event) });
    assert.equal(instances[0].video, source.video); assert.equal(instances[0].destroyed, false);
    abort.abort(); assert.equal(instances[0].destroyed, true); assert.equal((await source.play()).error, 'CANCELLED');
    const other = await registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/live', format: 'hls',
        autoplay: false, loadHls: async () => Hls, onState: event => events.push(event) });
    instances[1].error('error', { fatal: false }); assert.equal(instances[1].destroyed, false);
    instances[1].error('error', { fatal: true }); assert.equal(instances[1].destroyed, true);
    assert.equal(events.at(-1).playback, 'error'); other.dispose();
});
test('closing during lazy HLS import cannot attach a decoder or remove its replacement', async () => {
    const surface = fakeSurface(false), { Hls, instances } = hlsFixture(); let finish;
    const abort = new AbortController();
    const first = registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/first', format: 'hls',
        autoplay: false, signal: abort.signal, loadHls: () => new Promise(resolve => { finish = resolve; }) });
    abort.abort();
    const second = await registerBevyVideoStreamSource({ id: 'tv', surface, source: 'https://media.example.test/second', format: 'hls',
        autoplay: false, loadHls: async () => Hls });
    finish(Hls); assert.equal((await first).error, 'CANCELLED'); assert.equal(instances.length, 1);
    assert.equal(getBevyVideoStreamSourceStatus({ id: 'tv', surface }).exists, true); second.dispose();
});
