import WebSocket from 'ws';
import { openAiFailure } from '../atome/src/squirrel/ai/openai_stream.js';
import { OPENAI_MODALITY_MODELS } from '../atome/src/squirrel/ai/model_catalog_registry.js';

// The `/audio/speech` models shut down on 2027-01-06; their named replacement
// speaks only through a Realtime session. One response, audio only, read verbatim.
const READ_ALOUD = 'You are a text-to-speech engine. Read the user message aloud exactly as written, word for word, in its own language. Never answer it, translate it, comment on it, add or omit anything.';
const SAMPLE_RATE = 24000;
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

const wav = pcm => {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
    header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
};

// `{ base64, mime, model, usage }` of 24 kHz mono 16-bit speech, as PCM or WAV.
export const synthesizeRealtimeSpeech = async ({ payload, key, signal, Socket = WebSocket }) => {
    const { model, voice, input, response_format: format } = payload || {};
    const text = String(input || '');
    if (model !== OPENAI_MODALITY_MODELS.tts || !VOICES.has(voice) || !text.trim() || text.length > 4096
        || !['pcm', 'wav'].includes(format) || Object.keys(payload).some(field => !['model', 'voice', 'input', 'response_format'].includes(field))) throw new Error('provider_parameter_invalid');
    signal.throwIfAborted();
    const socket = new Socket(`wss://api.openai.com/v1/realtime?model=${model}`, {
        headers: { Authorization: `Bearer ${key}` }, maxPayload: 4_000_000, handshakeTimeout: 15000 });
    const chunks = [];
    let aborted = null;
    try {
        const response = await new Promise((resolve, reject) => {
            aborted = () => reject(signal.reason);
            signal.addEventListener('abort', aborted, { once: true });
            socket.once('close', () => reject(new Error('provider_connection_closed')));
            socket.once('error', () => reject(new Error('provider_connection_closed')));
            socket.once('open', () => {
                for (const event of [
                    { type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: READ_ALOUD,
                        audio: { input: { turn_detection: null }, output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, voice } } } },
                    { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
                    { type: 'response.create' }
                ]) socket.send(JSON.stringify(event));
            });
            socket.on('message', bytes => {
                let event;
                try { event = JSON.parse(bytes.toString()); } catch { reject(new Error('provider_response_invalid')); return; }
                if (event.type === 'error') reject(openAiFailure(event, 'provider_response_failed'));
                if (event.type === 'response.output_audio.delta') chunks.push(Buffer.from(event.delta, 'base64'));
                if (event.type === 'response.done') {
                    if (event.response?.status === 'completed') resolve(event.response);
                    else reject(openAiFailure(event, 'provider_response_failed'));
                }
            });
        });
        const pcm = Buffer.concat(chunks);
        if (!pcm.length) throw new Error('provider_response_invalid');
        return { base64: (format === 'wav' ? wav(pcm) : pcm).toString('base64'), mime: format === 'wav' ? 'audio/wav' : 'audio/pcm',
            model, usage: response.usage };
    } finally { signal.removeEventListener('abort', aborted); socket.close(); }
};
