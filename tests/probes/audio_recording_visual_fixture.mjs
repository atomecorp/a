import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SAMPLE_RATE = 48_000;

const sampleAt = (time) => {
    if (time < 0.6) return 0;
    if (time < 1.3) return Math.sin(time * 2 * Math.PI * 220) * 0.015;
    if (time < 2.5) {
        const carrier = Math.sin(time * 2 * Math.PI * 170) * 0.42
            + Math.sin(time * 2 * Math.PI * 310) * 0.18;
        return carrier * (0.35 + (0.65 * Math.abs(Math.sin(time * Math.PI * 3.1))));
    }
    if (time < 2.505) return 0.98;
    return 0;
};

export const createDeterministicAudioFixture = (filePath) => {
    const frameCount = SAMPLE_RATE * 30;
    const dataSize = frameCount * 2;
    const wav = Buffer.alloc(44 + dataSize);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(SAMPLE_RATE, 24);
    wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);
    for (let index = 0; index < frameCount; index += 1) {
        const value = Math.max(-1, Math.min(1, sampleAt(index / SAMPLE_RATE)));
        wav.writeInt16LE(Math.round(value * 32767), 44 + (index * 2));
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, wav);
    return filePath;
};

export const captureAudioToolPixels = async (page, outputPath = '') => {
    const bounds = await page.evaluate(() => {
        const surface = document.getElementById('eve_surface_project');
        const runtime = window.eveBevyUiRuntime;
        const rect = surface?.getBoundingClientRect?.();
        if (!runtime?.hitTestAtClientPoint || !rect) return null;
        const target = 'eve_bevy_ui_main_menu_tool_capture__audio';
        for (let y = Math.max(0, rect.height - 90); y < rect.height; y += 2) {
            for (let x = 0; x < rect.width; x += 2) {
                const hit = runtime.hitTestAtClientPoint({
                    surface, clientX: rect.left + x, clientY: rect.top + y
                });
                if (String(hit?.nodeId || hit?.node?.id || '') === target) {
                    return { x: rect.left + x - 1, y: rect.top + y - 1, width: 60, height: 60 };
                }
            }
        }
        return null;
    });
    if (!bounds) return { ok: false, error: 'audio_tool_bounds_missing' };
    const screenshot = await page.screenshot({ clip: bounds });
    if (outputPath) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, screenshot);
    }
    const png = PNG.sync.read(screenshot);
    const pixels = Uint8Array.from(png.data);
    return {
        ok: png.width === 60 && png.height === 60,
        width: png.width,
        height: png.height,
        bounds,
        digest: crypto.createHash('sha256').update(pixels).digest('hex'),
        pixels
    };
};

export const analyzeAudioToolPixels = (samples) => {
    const differences = samples.slice(1).map((sample, index) => {
        const previous = samples[index];
        let changed = 0;
        for (let pixel = 0; pixel < sample.pixels.length; pixel += 4) {
            if (sample.pixels[pixel] !== previous.pixels[pixel]
                || sample.pixels[pixel + 1] !== previous.pixels[pixel + 1]
                || sample.pixels[pixel + 2] !== previous.pixels[pixel + 2]) changed += 1;
        }
        return changed / (sample.width * sample.height);
    });
    return {
        ok: new Set(samples.map((sample) => sample.digest)).size >= 5
            && differences.filter((ratio) => ratio > 0.002).length >= 4
            && differences.filter((ratio) => ratio === 0).length >= 5
            && differences.slice(-3).every((ratio) => ratio === 0),
        distinct_frames: new Set(samples.map((sample) => sample.digest)).size,
        changing_frames: differences.filter((ratio) => ratio > 0.002).length,
        stable_frames: differences.filter((ratio) => ratio === 0).length,
        maximum_changed_pixel_ratio: Math.max(0, ...differences),
        bounds: samples[0]?.bounds || null,
        differences
    };
};
