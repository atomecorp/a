// Renders every sentence eVe speaks on her own (startup, ready, assistant,
// voice-activation, first-launch guide and pairing request messages) with the shipped Siwis voice, so the
// app plays them without running a second ONNX engine next to the wake
// detector. `--check` prints the phonemes only; review them after any text change.
// `--missing` renders only the sentences the index lacks and keeps every other line
// as it is (the voice is not deterministic: a full run rewrites them all).
//
//   node scripts/generate_voice_lines.mjs [--check] [--missing]
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import { encodeFrenchPhonemes } from '../atome/src/squirrel/voice/french_phoneme_encoder.js';
import { pcm16WavBytes } from '../atome/src/squirrel/voice/tts_pcm_analysis.js';
import { AMBIENT_MS, FREE_SPEECH_MS, WAKE_ENROLLMENT_TAKES } from '../atome/src/squirrel/voice/wake_enrollment.js';
import { VOICE_LINES_ROOT } from '../atome/src/squirrel/voice/voice_lines.js';
import { eveI18n, eveT, eveTList, setEveLocale } from '../eVe/i18n/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = path.join(ROOT, 'atome/src/assets/voice/fr_FR-siwis-medium/fr_FR-siwis-medium.onnx');
const OUTPUT = path.join(ROOT, 'atome/src', VOICE_LINES_ROOT);

const spokenTexts = () => {
    setEveLocale('fr');
    const keys = Object.keys(eveI18n.messages.fr);
    const byPrefix = prefix => keys.filter(key => key.startsWith(prefix)).map(key => eveT(key));
    const enroll = (step, detail = {}) => eveT('eve.voice.wake.enroll.' + step, '', detail);
    const takes = WAKE_ENROLLMENT_TAKES;
    return [...new Set([
        eveT('eve.voice.assistant.startup_line'), eveT('eve.voice.assistant.idle_hang_up'), eveT('eve.voice.assistant.touch_response'),
        ...eveTList('eve.voice.assistant.ready_lines.after_wait'),
        ...eveTList('eve.voice.assistant.ready_lines.direct'),
        eveT('eve.voice.assistant.arrival.preparing'), ...eveTList('eve.voice.assistant.arrival.ready_first'), ...eveTList('eve.voice.assistant.arrival.ready'),
        ...byPrefix('eve.voice.assistant.error.'),
        ...byPrefix('eve.voice.wake.error.'),
        ...byPrefix('eve.first_launch.voice.'), eveT('eve.auth.pair_request_said'),
        enroll('intro', { takes }),
        ...Array.from({ length: takes }, (_, take) => [enroll('say', { take: take + 1, takes }), enroll('repeat', { take: take + 1, takes })]).flat(),
        enroll('speak_freely', { seconds: FREE_SPEECH_MS / 1000 }), enroll('silence', { seconds: AMBIENT_MS / 1000 }),
        enroll('training'), enroll('done')
    ])].filter(Boolean);
};

const config = JSON.parse(readFileSync(`${MODEL}.json`, 'utf8'));
const texts = spokenTexts();
if (process.argv.includes('--check')) {
    for (const text of texts) console.log(`${text}\n    ${encodeFrenchPhonemes(text, config.phoneme_id_map).phonemes.slice(1, -1).join('')}`);
    process.exit(0);
}

ort.env.wasm.numThreads = 1;
const modelBytes = readFileSync(MODEL);
const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
const { noise_scale: noise, length_scale: length, noise_w: noiseW } = config.inference;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const missing = process.argv.includes('--missing');
const previous = missing ? JSON.parse(readFileSync(path.join(OUTPUT, 'index.json'), 'utf8')).lines : {};
const lines = {};
mkdirSync(OUTPUT, { recursive: true });
for (const text of texts) {
    if (previous[text]) { lines[text] = previous[text]; continue; }
    const { ids, phonemes } = encodeFrenchPhonemes(text, config.phoneme_id_map);
    const result = await session.run({
        input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([noise, length, noiseW]), [3])
    });
    const pcm = Float32Array.from(result.output.data);
    const wav = pcm16WavBytes(pcm, config.audio.sample_rate);
    const file = `${sha256(text).slice(0, 16)}.wav`;
    writeFileSync(path.join(OUTPUT, file), wav);
    lines[text] = { file, samples: pcm.length, phonemes: phonemes.join(''), sha256: sha256(wav) };
}
const kept = new Set([...Object.values(lines).map(line => line.file), 'index.json']);
for (const name of readdirSync(OUTPUT)) if (!kept.has(name)) rmSync(path.join(OUTPUT, name));
writeFileSync(path.join(OUTPUT, 'index.json'), `${JSON.stringify({
    voice: 'fr_FR-siwis-medium', locale: 'fr', sampleRate: config.audio.sample_rate,
    model: { sha256: sha256(modelBytes), license: 'CC-BY-4.0', card: 'fr_FR-siwis-medium/MODEL_CARD',
        source: 'https://datashare.is.ed.ac.uk/handle/10283/2353' },
    lines
}, null, 1)}\n`);
console.log(`${texts.length} voice lines written to ${path.relative(ROOT, OUTPUT)}`);
