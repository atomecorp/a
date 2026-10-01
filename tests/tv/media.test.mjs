import test from 'node:test';
import assert from 'node:assert/strict';
import { registerBevyVideoStreamSource, getBevyVideoStreamSourceStatus } from '../../eVe/domains/rendering/bevy_video_stream_source_runtime.js';

// Deliberate decoder fixture; these events do not constitute provider playback evidence.
const fakeSurface = () => {
    let document;
    class Element extends EventTarget {
        constructor(tag) { super(); this.tag = tag; this.children = []; this.style = { removeProperty() {} }; this.ownerDocument = document; this.paused = true; }
        setAttribute() {}
        removeAttribute() { this.src = ''; }
        appendChild(child) { this.children.push(child); child.parentNode = this; }
        remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
        get childElementCount() { return this.children.length; }
        canPlayType() { return 'probably'; }
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
