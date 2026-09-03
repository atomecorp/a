import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('iOS boot keeps ONNX allocation outside the Bevy startup peak', () => {
    const assistantEntry = readSource('../../eVe/voice/assistant/index.js');
    const bootRuntime = readSource('../../eVe/intuition/runtime/eve_intuition/boot_runtime.js');

    assert.doesNotMatch(
        assistantEntry,
        /preloadLocalTts/,
        'assistant import must not allocate the ONNX engine during Bevy startup'
    );
    assert.match(
        bootRuntime,
        /bootPresentationPublished = true[\s\S]*?scheduleVoiceWarmup\(\)/,
        'voice warmup must start only after the first interactive workspace presentation'
    );
    assert.match(bootRuntime, /voiceWarmupScheduled[\s\S]*?preloadLocalTts\?\.\(\)/, 'voice warmup must be unique');
    assert.match(bootRuntime, /scheduleVoiceWarmup[\s\S]*?setTimeout[\s\S]*?12000/, 'ONNX warmup must remain delayed beyond initial stabilization');
});
