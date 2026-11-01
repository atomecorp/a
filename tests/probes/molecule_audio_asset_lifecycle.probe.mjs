import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {
    location: { href: 'http://127.0.0.1:52376/', origin: 'http://127.0.0.1:52376' },
    setTimeout, clearTimeout, requestAnimationFrame: callback => setTimeout(callback, 16),
    cancelAnimationFrame: clearTimeout
};
globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
const { createMoleculeEngine } = await import('../../eVe/core/media_engine/molecule.js');

test('disposing one hundred sessions releases their decoded assets and preserves borrowed sounds', async () => {
    const engine = createMoleculeEngine();
    const loaded = new Set(['shared_metronome']);
    const calls = [];
    const audio = {
        async hasAsset(id) { return loaded.has(id); },
        async loadAsset({ assetId }) { loaded.add(assetId); calls.push(['load', assetId]); },
        async destroyAsset(id) { loaded.delete(id); calls.push(['destroy', id]); },
        async stopVoice(id) { calls.push(['stop', id]); }
    };
    for (let cycle = 0; cycle < 100; cycle += 1) {
        const session = engine.createSession({ id: `asset_lifetime_${cycle}` });
        session.audio = audio;
        await session.setTimeline({ tracks: [{ id: 'audio', clips: [
            { id: 'owned', kind: 'audio', start: 0, duration: 3, source: { url: 'fixture.wav' } },
            { id: 'borrowed', kind: 'audio', start: 0, duration: 3, source: { assetId: 'shared_metronome' } }
        ] }] }, { commit: false });
        const owned = session.runtimeClips.get('owned');
        owned.liveVoiceIds.add(owned.voiceId);
        await engine.disposeSession(session.id);
        assert.equal(engine.sessions.size, 0);
        assert.equal(session.runtimeClips.size, 0);
        assert.deepEqual([...loaded], ['shared_metronome'], `decoded asset survives disposed session ${cycle}`);
        const stop = calls.findIndex(([action, id]) => action === 'stop' && id === owned.voiceId);
        const destroy = calls.findIndex(([action, id]) => action === 'destroy' && id === owned.assetId);
        assert.ok(stop >= 0 && destroy > stop, 'voices stop before the decoded asset is released');
        await session.dispose();
        assert.equal(calls.filter(([action, id]) => action === 'destroy' && id === owned.assetId).length, 1);
    }
    assert.equal(calls.filter(([action]) => action === 'load').length, 100);
    assert.equal(calls.filter(([action]) => action === 'destroy').length, 100);
});

test('closing while an owned audio asset is still loading releases the late acquisition', async () => {
    const engine = createMoleculeEngine();
    const session = engine.createSession({ id: 'late_audio_asset' });
    const loaded = new Set();
    let finishLoad;
    const pendingLoad = new Promise(resolve => { finishLoad = resolve; });
    session.audio = {
        async loadAsset({ assetId }) { await pendingLoad; loaded.add(assetId); },
        async destroyAsset(id) { loaded.delete(id); },
        async stopVoice() {}
    };
    const preparing = session.setTimeline({ tracks: [{ id: 'audio', clips: [
        { id: 'late', kind: 'audio', start: 0, duration: 3, source: { url: 'late.wav' } }
    ] }] }, { commit: false });
    // Attach rejection handling before disposal resolves the pending acquisition.
    const prepared = preparing.then(() => ({ ok: true }), error => ({ error: error.message }));
    await new Promise(resolve => setImmediate(resolve));
    const closing = engine.disposeSession(session.id);
    finishLoad();
    await closing;
    await prepared;
    assert.equal(loaded.size, 0, 'a late decoder must not outlive the disposed session');
    assert.equal(session.runtimeClips.size, 0);
});

test('a video soundtrack completing after close is released and cannot restart the disposed session', async () => {
    const engine = createMoleculeEngine();
    const session = engine.createSession({ id: 'late_video_audio_asset' });
    const loaded = new Set();
    let finishLoad;
    const pendingLoad = new Promise(resolve => { finishLoad = resolve; });
    session.audio = {
        async loadAsset({ assetId }) { await pendingLoad; loaded.add(assetId); },
        async destroyAsset(id) { loaded.delete(id); },
        async stopVoice() {}
    };
    await session.setTimeline({ tracks: [{ id: 'video', clips: [
        { id: 'video', kind: 'video', start: 0, duration: 3, source: { url: '/api/uploads/fixture.mp4' } }
    ] }] }, { commit: false });
    const runtime = session.runtimeClips.get('video');
    const loading = session._ensureVideoAudioAsset(runtime);
    await engine.disposeSession(session.id);
    finishLoad();
    assert.equal(await loading, false);
    assert.equal(runtime.audioAvailable, false);
    assert.equal(loaded.size, 0);
    assert.equal(await session._ensureVideoAudioAsset(runtime), false);
    await assert.rejects(session.prepare(), /molecule_session_disposed/);
});
