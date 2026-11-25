// The Kira backend's offline render (R-349): a shared project's light proxy, its render plan (eVe's
// project_proxy_plan.js) played offline by the engine with the clips, samples and assets it has loaded
// (atome-mix-graph offline_render.rs, offline_proxy.rs) and coded to Opus: an Ogg Opus file for a project heard only,
// an MP4 for a project with a picture — its H.264 images (eVe project_proxy_video.js) and the Opus sound muxed by
// the engine (atome-mp4). The page's engine answers the file's bytes; a native engine (Tauri, iOS) takes the images
// and answers the file in base64, the one binary form a script message carries.
import { buildKiraScheduledVoices } from './kira_audio_commands.js';

export const PROXY_MIME = 'audio/ogg; codecs=opus';
export const PROXY_VIDEO_MIME = 'video/mp4';

// The plan in the engine's words: its voices as a live schedule sends them.
export const enginePlan = (plan) => ({ ...plan, voices: buildKiraScheduledVoices(plan.voices || []) });

// The picture's track without its bytes: `{ width, height, timescale, samples: [{ size, duration, key }] }`.
const videoMeta = ({ width, height, timescale, samples }) => ({ width, height, timescale, samples });

// Interleaved stereo samples as the two channels a take gives.
const channelsOf = (interleaved, rate) => {
    const frames = interleaved.length / 2;
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let index = 0; index < frames; index += 1) {
        left[index] = interleaved[index * 2];
        right[index] = interleaved[(index * 2) + 1];
    }
    return { left, right, frames, sample_rate: rate };
};

export const createKiraProxyMethods = ({ invoke, ensureRuntimeMode, readWasm }) => ({
    // `{ plan }` → `{ left, right, frames, sample_rate }`: the plan rendered offline, uncoded (R-370: « Figer »).
    render_pcm({ plan } = {}) {
        if (!plan || typeof plan !== 'object') return Promise.reject(new Error('render_plan_invalid:plan_required'));
        const asked = enginePlan(plan);
        return ensureRuntimeMode({ audioManager: true }).then(() => {
            const wasm = readWasm();
            if (wasm) return channelsOf(wasm.audio_render_pcm(asked), Number(asked.rate));
            return invoke('audio_render_pcm', { plan: asked }).then((answer) => {
                if (answer?.success !== true || typeof answer.pcm_base64 !== 'string') throw new Error(String(answer?.error || 'render_pcm_failed'));
                if (typeof Uint8Array.fromBase64 !== 'function') throw new Error('render_pcm_base64_decoder_missing');
                const bytes = Uint8Array.fromBase64(answer.pcm_base64);
                return channelsOf(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), Number(answer.sample_rate));
            });
        });
    },
    // `{ plan, bitrate?, video? }` → `{ bytes: Uint8Array, mime, duration_seconds }`. `video`: the coded picture,
    // `{ width, height, timescale, avcc: Uint8Array, data: Uint8Array, samples }` (project_proxy_video.js).
    render_proxy({ plan, bitrate = null, video = null } = {}) {
        if (!plan || typeof plan !== 'object') return Promise.reject(new Error('render_plan_invalid:plan_required'));
        const asked = enginePlan(plan);
        const seconds = Number(asked.duration_frames) / Number(asked.rate);
        return ensureRuntimeMode({ audioManager: true }).then(() => {
            const wasm = readWasm();
            if (wasm) {
                if (!video) {
                    if (typeof wasm.audio_render_proxy !== 'function') throw new Error('render_proxy_unavailable');
                    return { bytes: wasm.audio_render_proxy(asked, bitrate ?? undefined), mime: PROXY_MIME, duration_seconds: seconds };
                }
                if (typeof wasm.audio_render_proxy_mp4 !== 'function') throw new Error('render_proxy_mp4_unavailable');
                return { bytes: wasm.audio_render_proxy_mp4(asked, bitrate ?? undefined, videoMeta(video), video.avcc, video.data),
                    mime: PROXY_VIDEO_MIME, duration_seconds: seconds };
            }
            if (video && typeof Uint8Array.prototype.toBase64 !== 'function') throw new Error('render_proxy_base64_encoder_missing');
            const picture = video ? { ...videoMeta(video), avcc_base64: video.avcc.toBase64(), data_base64: video.data.toBase64() } : null;
            return invoke('audio_render_proxy', { plan: asked, bitrate, video: picture }).then((answer) => {
                if (answer?.success !== true || typeof answer.bytes_base64 !== 'string') throw new Error(String(answer?.error || 'render_proxy_failed'));
                if (typeof Uint8Array.fromBase64 !== 'function') throw new Error('render_proxy_base64_decoder_missing');
                return { bytes: Uint8Array.fromBase64(answer.bytes_base64), mime: answer.mime, duration_seconds: Number(answer.duration_seconds) };
            });
        });
    }
});
