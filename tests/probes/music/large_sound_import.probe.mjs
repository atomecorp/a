// A 90 MB sound imported (found on the iPad in AUM, 16 Nov. 2026: a 90 MB AIFF killed the app, its bytes crossing the
// native bridge as a JSON array of numbers). On the Web page: the upload's duration is read from a 90 MB AIFF through
// the real route (asset_box_media.js#probeAudioDurationFromBlob), from its header alone (no clip loaded, nothing
// decoded; 17 Nov. 2026), an MP3's packet by packet; the native routes (iOS, Tauri) send the bytes once, as one
// base64 string, never as an array — the payload the bridge gets is checked byte for byte.
// Test PE-26 of tests/parcours_musique/10_persistance_plateformes.md.
// node tests/probes/music/large_sound_import.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';

const OUT = path.resolve('temp/probe_reports/music/large_sound_import');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const home = createReport('large_sound_import');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.stack || e?.message || e).slice(0, 900)}`));
page.on('crash', () => report.errors.push('page crashed'));

// A 16-bit stereo AIFF of 520 s at 44.1 kHz, 91.7 MB, built in the page (a ramp, so a byte-for-byte check means something).
const AIFF = `const seconds = 520, frames = 44100 * seconds, soundLen = frames * 4;
    const bytes = new Uint8Array(54 + soundLen); const view = new DataView(bytes.buffer);
    const tag = (at, text) => { for (let i = 0; i < 4; i += 1) bytes[at + i] = text.charCodeAt(i); };
    tag(0, 'FORM'); view.setUint32(4, 46 + soundLen); tag(8, 'AIFF'); tag(12, 'COMM'); view.setUint32(16, 18);
    view.setUint16(20, 2); view.setUint32(22, frames); view.setUint16(26, 16);
    bytes.set([0x40, 0x0E, 0xAC, 0x44, 0, 0, 0, 0, 0, 0], 28); tag(38, 'SSND'); view.setUint32(42, 8 + soundLen);
    for (let i = 54; i < bytes.length; i += 1) bytes[i] = i & 0xff;`;

try {
    // The upload reads the duration from the header: no clip is loaded in the engine, nothing decoded.
    const web = await app(page, `${AIFF}
        const media = await import('/eVe/domains/media/asset_box_media.js');
        const { getPlayRecordCore } = await import('/atome/src/application/audio_runtime/play_record_core.js');
        await (await import('/eVe/eVe.js')).loadDeferredModules();
        const facade = getPlayRecordCore(window).facade();
        const original = facade.__call_backend_method; const calls = [];
        facade.__call_backend_method = function (name, arg) { calls.push(name); return original.call(this, name, arg); };
        const started = performance.now();
        let probed;
        try { probed = await media.probeAudioDurationFromBlob(new Blob([bytes], { type: 'audio/aiff' })); }
        finally { facade.__call_backend_method = original; }
        return { size: bytes.length, duration: probed?.duration ?? null, ms: Math.round(performance.now() - started), calls };`);
    report.notes.web = web;
    check('PE-26 the sound is over 90 MB', web.size > 90_000_000, web);
    check('PE-26 the Web upload reads its duration, 520 s', Math.abs(web.duration - 520) < 0.01, web);
    check('PE-26 the duration is read from the header: probe_duration, no clip created', web.calls.includes('probe_duration') && !web.calls.includes('create_clip'), web.calls);
    // An MP3 without a frame count in its header (the app's alarms): the length read packet by packet.
    const mp3 = await app(page, `const media = await import('/eVe/domains/media/asset_box_media.js');
        const blob = await (await fetch('/atome/src/assets/audios/alarms/alarm_chime.mp3')).blob();
        const probed = await media.probeAudioDurationFromBlob(blob);
        const element = await new Promise((resolve) => { const a = new Audio(URL.createObjectURL(blob)); a.onloadedmetadata = () => resolve(a.duration); a.onerror = () => resolve(null); });
        return { probed: probed?.duration ?? null, element };`);
    report.notes.mp3 = mp3;
    check('PE-26 an MP3 upload reads its duration like the browser does (±0.1 s)', mp3.probed > 0 && Math.abs(mp3.probed - mp3.element) < 0.1, mp3);

    // The native route of the duration (iOS, Tauri): one call, its bytes in base64.
    const nativeProbe = await app(page, `${AIFF}
        const { getPlayRecordCore } = await import('/atome/src/application/audio_runtime/play_record_core.js');
        const core = getPlayRecordCore(window); await core.init();
        const sent = []; const runtime = core.runtime; const invoke = core.invoke;
        core.runtime = () => ({ ...runtime.call(core), playback: 'ios_native_kira' });
        core.invoke = () => async (name, payload) => { sent.push({ name, keys: Object.keys(payload).sort(), length: payload.bytesBase64?.length }); return { success: true, duration_seconds: 520 }; };
        let duration;
        try { duration = await core.probeAudioDuration(bytes); } finally { core.runtime = runtime; core.invoke = invoke; }
        return { duration, sent };`);
    report.notes.native_probe = nativeProbe;
    check('PE-26 the native duration read is one audio_probe_duration_from_bytes { bytesBase64 }', (() => { const bytesCalls = nativeProbe.sent.filter((s) => s.name !== 'audio_init'); return bytesCalls.length === 1 && bytesCalls[0].name === 'audio_probe_duration_from_bytes' && bytesCalls[0].keys.join(',') === 'bytesBase64'; })() && nativeProbe.duration === 520, nativeProbe);

    // The native route as the page runs it, with a recording bridge in place of the native app's.
    const native = await app(page, `${AIFF}
        const { getPlayRecordCore } = await import('/atome/src/application/audio_runtime/play_record_core.js');
        const core = getPlayRecordCore(window);
        await core.init();
        const sent = [];
        const runtime = core.runtime; const invoke = core.invoke;
        core.runtime = () => ({ ...runtime.call(core), playback: 'ios_native_kira' });
        core.invoke = () => async (name, payload) => { sent.push({ name, payload }); return { success: true, duration_seconds: 520 }; };
        const started = performance.now();
        try { await core.loadTransientAsset({ assetId: 'probe_large_native', bytes, source_layer: 'probe' }); }
        finally { core.runtime = runtime; core.invoke = invoke; core.assetCache?.delete?.('probe_large_native'); }
        const ms = Math.round(performance.now() - started);
        const one = sent.find((s) => s.name === 'audio_load_clip_from_bytes') || {}; const payload = one.payload || {};
        const back = typeof payload.bytesBase64 === 'string' ? Uint8Array.fromBase64(payload.bytesBase64) : null;
        let same = back?.length === bytes.length;
        for (let i = 0; same && i < bytes.length; i += 4099) same = back[i] === bytes[i];
        same = same && back[bytes.length - 1] === bytes[bytes.length - 1];
        return { calls: sent.map((s) => s.name), keys: Object.keys(payload).sort(), base64Length: payload.bytesBase64?.length ?? null, same, ms };`);
    report.notes.native = native;
    check('PE-26 the native route sends the bytes once, by audio_load_clip_from_bytes', native.calls.filter((c) => c === 'audio_load_clip_from_bytes').length === 1, native);
    check('PE-26 its payload is { id, bytesBase64 }, no array of bytes', native.keys.join(',') === 'bytesBase64,id', native);
    check('PE-26 the base64 gives back the sound byte for byte', native.same === true, native);
    check('PE-26 the page is still alive', (await app(page, 'return 1 + 1;')) === 2);
} catch (error) {
    check('exception', false, String(error?.stack || error).slice(0, 900));
} finally {
    check('PE-26 no page error', report.errors.length === 0, report.errors.slice(0, 8));
    await close();
    const failed = report.checks.filter((c) => !c.ok);
    console.log(`large_sound_import: ${report.checks.length - failed.length}/${report.checks.length}`);
    process.exitCode = failed.length ? 1 : 0;
}
