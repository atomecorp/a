// Lyrics import, pure (Node): the LRC, SRT, VTT and Lyrix readers over tests/fixtures/lyrics, their prompteur pages,
// the SRT/VTT round trip through the prompteur's own export, and the import table's routes.
// Run: node tests/probes/prompter/prompter_lyrics_import.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { lyricsToPrompterPage, readLyrics, decodeLyricsBytes } from '../../../eVe/intuition/tools/prompter/prompter_lyrics_import.js';
import { resolveLineTimes, lineKey } from '../../../eVe/intuition/tools/prompter/prompter_timing.js';
import { buildPrompterSubtitles } from '../../../eVe/intuition/tools/prompter/prompter_subtitles.js';
import { parseSubtitles } from '../../../eVe/intuition/tools/prompter/prompter_lyrics_subtitles.js';

const DIR = 'tests/fixtures/lyrics';
const OUT = 'temp/probe_reports/prompter/prompter_lyrics_import.json';
const report = { checks: [] };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail)); };
const fixture = (name) => decodeLyricsBytes(new Uint8Array(fs.readFileSync(path.join(DIR, name))));
const read = (name) => readLyrics(fixture(name), name.split('.').pop(), name);
const refusal = async (name) => { try { await read(name); return null; } catch (error) { return error.code || String(error); } };
const page0 = async (name) => (await read(name)).pages[0];
const lines = (page) => page.text.split('\n');
const cueAt = (page) => Object.fromEntries(page.cues.map((cue) => [Number(cue.key.split(':')[0]), cue.at_seconds]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// LRC
{
    const p = await page0('simple.lrc');
    check('lrc simple: title from [ti:]', p.title === 'Chanson simple', p.title);
    check('lrc simple: metadata never lyrics', same(lines(p), ['Première ligne', 'Deuxième ligne', 'Troisième ligne']), lines(p));
    check('lrc simple: cues at the file instants', same(cueAt(p), { 0: 1, 1: 4.5, 2: 8.25 }), p.cues);
    check('lrc simple: empty last tag is the end', p.duration === 12, p.duration);
    check('lrc simple: cue keys match the prompteur keys', p.cues.every((cue, i) => cue.key === lineKey(i, lines(p)[i])), p.cues);
}
{
    const p = await page0('multi_timestamp.lrc');
    check('lrc multi tags: one line per tag, in time order', same(lines(p), ['Couplet un', 'Refrain répété', 'Couplet deux', 'Refrain répété']), lines(p));
    check('lrc multi tags: instants', same(cueAt(p), { 0: 2, 1: 6, 2: 10, 3: 18 }), p.cues);
}
{
    const r = await read('offset_ms.lrc');
    const p = r.pages[0];
    check('lrc offset/ms/colon/no fraction', same(cueAt(p), { 0: 0.75, 1: 3, 2: 64.5 }), p.cues);
    check('lrc [length:] gives the duration', p.duration === 20 || p.duration > 64.5, p.duration);
    check('lrc no title: file name', p.title === 'offset_ms', p.title);
}
{
    const r = await read('enhanced.lrc');
    const p = r.pages[0];
    check('lrc enhanced: word tags stripped', same(lines(p), ['Mot par mot', 'Encore une']), lines(p));
    check('lrc enhanced: loss reported', r.notices.some((n) => n.code === 'word_timing_dropped' && n.count === 2), r.notices);
}
{
    const r = await read('unordered_duplicates.lrc');
    check('lrc unordered: sorted', same(lines(r.pages[0]), ['Un', 'Deux', 'Trois']), lines(r.pages[0]));
    check('lrc unordered: reordered + duplicates reported', ['reordered', 'duplicates'].every((c) => r.notices.some((n) => n.code === c)), r.notices);
}
{
    const p = await page0('unicode.lrc');
    check('lrc unicode + BOM: title', p.title === 'Ünïcødé 🎵', p.title);
    check('lrc unicode: text intact', lines(p)[0] === 'Ça été — « déjà » 日本語' && lines(p)[1] === 'Emoji 🎤 et accents éèà', lines(p));
    check('lrc note line kept, never timed', lines(p)[2] === '[Musique]' && cueAt(p)[2] === undefined, p.cues);
}
check('lrc empty refused', (await refusal('empty.lrc')) === 'lyrics_empty', await refusal('empty.lrc'));
check('lrc without time refused', (await refusal('no_timing.lrc')) === 'lyrics_lrc_no_timing', await refusal('no_timing.lrc'));

// SRT
{
    const r = await read('basic.srt');
    const p = r.pages[0];
    check('srt: tags stripped, multiline kept', same(lines(p), ['Première ligne', 'sur deux lignes', 'Deuxième', '', 'Après un silence', 'Chevauche']), lines(p));
    check('srt: instant on the first line of a cue, silence ≥ 3 s as empty line at the end', same(cueAt(p), { 0: 1, 2: 3.5, 3: 5, 4: 10, 5: 12 }), p.cues);
    check('srt: unnumbered block read; overlap cut + short gap merged', ['overlaps', 'short_gaps_merged'].every((c) => r.notices.some((n) => n.code === c)), r.notices);
    check('srt: duration = last end', p.duration === 14, p.duration);
}
// VTT
{
    const r = await read('basic.vtt');
    const p = r.pages[0];
    check('vtt: NOTE/STYLE never lyrics, voice tag and entity', same(lines(p), ['Bonjour & bienvenue', 'Mot par mot', '', '[applaudissements]', 'Fin']), lines(p));
    check('vtt: instants, note line untimed, spoken line timed', same(cueAt(p), { 0: 1, 1: 3, 2: 6, 4: 10 }), p.cues);
    check('vtt: inline word time reported', r.notices.some((n) => n.code === 'word_timing_dropped'), r.notices);
}
check('vtt without header refused', (await refusal('no_header.vtt')) === 'lyrics_vtt_header_missing');

// Round trip: the prompteur's own export gives back the source cues' starts and ends.
for (const [name, format] of [['basic.srt', 'srt'], ['basic.vtt', 'vtt']]) {
    const p = await page0(name);
    const ls = lines(p);
    const timing = resolveLineTimes({ lines: ls, prompter: { cues: p.cues, weight_by_length: true }, durationSeconds: p.duration });
    const exported = buildPrompterSubtitles({ lines: ls, times: timing.times, end: timing.end, format });
    const again = parseSubtitles(exported, format);
    const starts = again.lines.filter((l) => l.at !== null && l.text).map((l) => l.at);
    const source = p.cues.filter((cue) => ls[Number(cue.key.split(':')[0])]).map((cue) => cue.at_seconds);
    check(`${format} round trip: anchored starts kept`, source.every((at) => starts.includes(at)), { source, starts });
    check(`${format} round trip: end kept`, again.end === p.duration, { end: again.end, duration: p.duration });
    report[`${format}_export`] = exported;
}

// Lyrix
{
    const r = await read('lyrix_poil.lrx');
    const p = r.pages[0];
    check('lrx: title, lines, ms instants', p.title === 'poil' && same(lines(p), ['hi', 'jeezs', 'from', 'hope']) && same(cueAt(p), { 0: 0, 1: 2.594, 2: 8.838, 3: 231.295 }), { title: p.title, cues: p.cues });
    check('lrx: audio not imported reported', r.notices.some((n) => n.code === 'audio_not_imported'), r.notices);
    const s = await read('lyrix_so_good.lrx');
    check('lrx So good reads', s.pages.length === 1 && s.pages[0].cues.length >= 1, s.pages[0]);
    const pl = await read('lyrix_jeezs.prx');
    check('prx: one page per song, in key order', pl.pages.length >= 2 && pl.pages[0].title === 'After the war', pl.pages.map((x) => x.title));
    check('prx: raw text not imported reported', pl.notices.some((n) => n.code === 'raw_not_imported'), pl.notices);
    report.prx_titles = pl.pages.map((x) => x.title);
}
try { (await import('../../../eVe/intuition/tools/prompter/prompter_lyrics_lyrix.js')).parseLyrix('{"lyrics"=>`rm -rf`}', 'lrx'); check('lyrix: code is never run', false); }
catch (error) { check('lyrix: code is never run (refused)', error.code === 'lyrics_lyrix_invalid', error.code); }

// Pure page building
{
    const p = lyricsToPrompterPage({ lines: [{ text: '', at: 0 }, { text: 'A', at: 1 }, { text: '', at: null }], end: null });
    check('page: empty edges dropped, duration estimated (≥ 5 s)', p.text === 'A' && p.duration === 6, p);
    const first = JSON.stringify(await read('basic.vtt'));
    const twice = first === JSON.stringify(await read('basic.vtt'));
    check('deterministic', twice);
}
// Import table routes (no DOM needed for the route by name)
{
    const { fileImportRoute, CONVERTED_ACCEPT } = await import('../../../eVe/intuition/runtime/file_import_table.js');
    const routes = Object.fromEntries(['a.lrc', 'a.srt', 'a.vtt', 'a.lrx', 'a.prx', 'a.txt'].map((n) => [n, fileImportRoute({ name: n, type: n.endsWith('.txt') ? 'text/plain' : '' }).route]));
    check('table: lyrics route for lrc/srt/vtt/lrx/prx, txt stays document', same(routes, { 'a.lrc': 'lyrics', 'a.srt': 'lyrics', 'a.vtt': 'lyrics', 'a.lrx': 'lyrics', 'a.prx': 'lyrics', 'a.txt': 'document' }), routes);
    const plain = Object.fromEntries(['b.lrc', 'b.srt', 'b.vtt'].map((n) => [n, fileImportRoute({ name: n, type: 'text/plain' }).route]));
    check('table: a .lrc/.srt/.vtt typed text/plain still goes to lyrics', Object.values(plain).every((r) => r === 'lyrics'), plain);
    check('table: accept list carries the lyrics kinds', ['.lrc', '.srt', '.vtt', '.lrx', '.prx'].every((e) => CONVERTED_ACCEPT.split(',').includes(e)), CONVERTED_ACCEPT);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} PASS`);
process.exit(failed ? 1 : 0);
