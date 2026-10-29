// The bundled impulse responses of the convolution (todo/effets_generateurs_audio
// L4, D23-4): authored by atome, generated here deterministically, dedicated to
// the public domain (CC0). Cabinets are designed speaker responses (resonance,
// cone break-up, steep top end); rooms are decaying decorrelated noise, faster
// in the highs, after a few early reflections. Run: node scripts/generate_impulse_set.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 48000;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'atome', 'src', 'assets', 'impulses');

// A small deterministic generator: the same files on every run.
const random = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
};

// RBJ biquads, applied in place.
const biquad = (kind, frequency, q, gainDb = 0) => {
    const w = (2 * Math.PI * frequency) / RATE, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), a = 10 ** (gainDb / 40);
    const coefficients = {
        lowpass: [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha],
        highpass: [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha],
        peak: [1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a]
    }[kind];
    const [b0, b1, b2, a0, a1, a2] = coefficients;
    return (samples) => {
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let index = 0; index < samples.length; index += 1) {
            const x = samples[index];
            const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            samples[index] = y;
        }
    };
};

const normalize = (channels, peak = 0.7) => {
    const max = Math.max(...channels.map((samples) => samples.reduce((top, sample) => Math.max(top, Math.abs(sample)), 0)));
    channels.forEach((samples) => samples.forEach((sample, index) => { samples[index] = (sample / max) * peak; }));
    return channels;
};

const fade = (samples, frames) => {
    for (let index = 0; index < frames; index += 1) samples[samples.length - 1 - index] *= index / frames;
};

// A cabinet: an impulse through its speaker's filters, a touch of cone break-up.
const cabinet = ({ low, lowQ, body, presence, top, notch, seed }) => {
    const samples = new Float64Array(4096);
    samples[0] = 1;
    const noise = random(seed);
    for (let index = 1; index < 192; index += 1) samples[index] += noise() * 0.02 * Math.exp(-index / 40);
    [biquad('highpass', low, lowQ), biquad('peak', body.frequency, 1.1, body.gain), biquad('peak', notch.frequency, 2.2, notch.gain),
        biquad('peak', presence.frequency, 1.4, presence.gain), ...[0, 1, 2].map(() => biquad('lowpass', top, 0.7))]
        .forEach((filter) => filter(samples));
    fade(samples, 512);
    return normalize([samples]);
};

// A room: early reflections, then a decay split in three bands (the highs die first).
const room = ({ seconds, decay, reflections, seed }) => {
    const frames = Math.round(seconds * RATE);
    return normalize([0, 1].map((side) => {
        const noise = random(seed + side * 7919);
        const bands = [[null, 400, decay * 1.2], [400, 4000, decay], [4000, null, decay * 0.45]].map(([from, to, time]) => {
            const band = new Float64Array(frames);
            for (let index = 0; index < frames; index += 1) band[index] = noise() * Math.exp((-6.9 * index) / (time * RATE));
            if (from) biquad('highpass', from, 0.7)(band);
            if (to) biquad('lowpass', to, 0.7)(band);
            return band;
        });
        const samples = new Float64Array(frames);
        const onset = Math.round(0.012 * RATE);
        for (let index = onset; index < frames; index += 1) samples[index] = bands.reduce((sum, band) => sum + band[index - onset], 0) * 0.5;
        samples[0] = 1;
        reflections.forEach(([ms, gain], index) => { samples[Math.round((ms + side * (index % 3) * 0.7) * RATE / 1000)] += gain * (side ? -1 : 1) ** index; });
        fade(samples, Math.round(0.05 * RATE));
        return samples;
    }), 0.5);
};

// 24-bit PCM WAV.
const wav = (channels) => {
    const frames = channels[0].length, bytes = frames * channels.length * 3;
    const buffer = Buffer.alloc(44 + bytes);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + bytes, 4); buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels.length, 22);
    buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * channels.length * 3, 28);
    buffer.writeUInt16LE(channels.length * 3, 32); buffer.writeUInt16LE(24, 34); buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
    let offset = 44;
    for (let index = 0; index < frames; index += 1) {
        for (const samples of channels) {
            buffer.writeIntLE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 8388607), offset, 3);
            offset += 3;
        }
    }
    return buffer;
};

export const IMPULSE_SET = Object.freeze({
    cab_1x12_open: () => cabinet({ low: 90, lowQ: 1.2, body: { frequency: 180, gain: 2 }, notch: { frequency: 600, gain: -3 },
        presence: { frequency: 2400, gain: 5 }, top: 5600, seed: 11 }),
    cab_2x12: () => cabinet({ low: 80, lowQ: 1.5, body: { frequency: 140, gain: 3 }, notch: { frequency: 450, gain: -4 },
        presence: { frequency: 2200, gain: 6 }, top: 5200, seed: 23 }),
    cab_4x12_closed: () => cabinet({ low: 75, lowQ: 2, body: { frequency: 110, gain: 5 }, notch: { frequency: 380, gain: -6 },
        presence: { frequency: 1900, gain: 7 }, top: 4600, seed: 37 }),
    cab_bass_1x15: () => cabinet({ low: 40, lowQ: 1.1, body: { frequency: 80, gain: 4 }, notch: { frequency: 300, gain: -3 },
        presence: { frequency: 1200, gain: 3 }, top: 3200, seed: 41 }),
    room_small: () => room({ seconds: 0.8, decay: 0.45, reflections: [[3.1, 0.5], [5.3, 0.4], [7.9, 0.3], [11.2, 0.25]], seed: 53 }),
    room_hall: () => room({ seconds: 3, decay: 2.2, reflections: [[13, 0.35], [21, 0.3], [34, 0.25], [47, 0.2]], seed: 67 }),
    room_plate: () => room({ seconds: 2, decay: 1.5, reflections: [[1.1, 0.6], [1.9, 0.5], [2.7, 0.45]], seed: 79 })
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, build] of Object.entries(IMPULSE_SET)) fs.writeFileSync(path.join(OUT, `${name}.wav`), wav(build()));
    fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), 'These impulse responses are generated by scripts/generate_impulse_set.mjs (atome).\nTo the extent possible under law, atome waives all copyright to them: CC0 1.0 Universal\n(https://creativecommons.org/publicdomain/zero/1.0/).\n');
    console.log(`impulses written to ${OUT}`);
}
