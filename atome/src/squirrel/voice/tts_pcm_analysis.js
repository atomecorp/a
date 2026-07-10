const VOWEL_FAMILY = Object.freeze({
    a: 'A', 'ɑ': 'A', 'ɐ': 'A', æ: 'A',
    e: 'E', 'ɛ': 'E', 'ə': 'E', 'œ': 'E', 'ø': 'E',
    i: 'I', y: 'I', 'ɪ': 'I', 'ʏ': 'I',
    o: 'O', 'ɔ': 'O', 'ɵ': 'O',
    u: 'U', 'ʊ': 'U'
});

export const vowelFamilyForPhoneme = (phoneme = '') => VOWEL_FAMILY[String(phoneme)] || '';

export const analyzePcmWindow = (samples) => {
    if (!(samples instanceof Float32Array) || samples.length === 0) {
        return { peak: 0, rms: 0, voiced: false };
    }
    let energy = 0;
    let peak = 0;
    let crossings = 0;
    for (let index = 0; index < samples.length; index += 1) {
        const value = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
        energy += value * value;
        peak = Math.max(peak, Math.abs(value));
        if (index > 0 && (samples[index - 1] < 0) !== (value < 0)) crossings += 1;
    }
    const rms = Math.sqrt(energy / samples.length);
    const zeroCrossingRate = crossings / samples.length;
    return { peak, rms, voiced: rms > 0.012 && zeroCrossingRate < 0.32 };
};

export const analyzePcmRange = (samples, start, end) => {
    if (!(samples instanceof Float32Array)) return { peak: 0, rms: 0, voiced: false };
    const from = Math.max(0, Math.trunc(start));
    const to = Math.min(samples.length, Math.max(from, Math.trunc(end)));
    if (to <= from) return { peak: 0, rms: 0, voiced: false };
    let energy = 0;
    let peak = 0;
    let crossings = 0;
    for (let index = from; index < to; index += 1) {
        const value = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
        energy += value * value;
        peak = Math.max(peak, Math.abs(value));
        if (index > from && (samples[index - 1] < 0) !== (value < 0)) crossings += 1;
    }
    const rms = Math.sqrt(energy / (to - from));
    return { peak, rms, voiced: rms > 0.012 && crossings / (to - from) < 0.32 };
};

export const pcm16WavBytes = (pcm, sampleRate) => {
    if (!(pcm instanceof Float32Array) || pcm.length === 0) throw new Error('tts_pcm_required');
    const rate = Math.trunc(Number(sampleRate));
    if (rate <= 0) throw new Error('tts_sample_rate_required');
    const bytes = new Uint8Array(44 + pcm.length * 2);
    const view = new DataView(bytes.buffer);
    const ascii = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, 'data'); view.setUint32(40, pcm.length * 2, true);
    pcm.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
    return bytes;
};
