/**
 * Mock audio provider — proves a provider can replace MusicGPT without any UI
 * change. Registered only when `ATOME_AI_AUDIO_MOCK=1`. It renders a short
 * sine arpeggio as a real 16-bit WAV so the whole import chain is exercised.
 */

const renderWav = ({ seconds = 2, sampleRate = 22050 } = {}) => {
    const frames = Math.round(seconds * sampleRate);
    const buffer = Buffer.alloc(44 + frames * 2);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + frames * 2, 4); buffer.write('WAVE', 8);
    buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36); buffer.writeUInt32LE(frames * 2, 40);
    const notes = [440, 554.37, 659.25, 880];
    for (let i = 0; i < frames; i += 1) {
        const note = notes[Math.floor((i / frames) * notes.length)];
        const envelope = Math.min(1, (frames - i) / 2000);
        buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * note * i) / sampleRate) * 9000 * envelope), 44 + i * 2);
    }
    return buffer;
};

export const createMockAudioProvider = ({ pollsUntilDone = 1 } = {}) => ({
    id: 'mock',
    label: 'Mock audio',
    remote: false,
    credentialId: null,
    capabilities: Object.freeze({ textToMusic: true, instrumentalGeneration: true, vocalGeneration: false, asyncJobs: true }),
    async submit() {
        return { providerJobId: `mock-${Date.now()}`, model: 'mock-sine', eta: 1, costEstimate: { amount: 0, unit: 'credits' }, variants: [], warnings: [] };
    },
    async poll(job) {
        job.providerState = (job.providerState || 0) + 1;
        if (job.providerState < pollsUntilDone) return { status: 'running', outputs: [] };
        return { status: 'completed', outputs: [{ index: 0, format: 'wav', formats: {}, url: null, duration: 2, title: 'Mock' }] };
    },
    async readOutput() {
        return { bytes: renderWav(), mime: 'audio/wav' };
    }
});
