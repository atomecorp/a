import { execFile } from 'node:child_process';
import { mkdir, open, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { sniffMediaMime } from '../../atome/src/squirrel/social/capabilities.js';
import { SOCIAL_MEDIA_CONSTRAINTS } from '../../atome/src/squirrel/social/contracts.js';
import { transcodeVideoToMp4 } from '../server_media.js';
import { SocialError } from './social_http.js';

// Inspection and preparation of the asset handed to a social destination. The
// original asset is only ever read: every variant is written to the job's own
// temporary directory and deleted with the job.

const run = (command, args, timeout = 120000) => new Promise((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message).trim().slice(0, 300)));
        else resolve(stdout);
    });
});

const rate = (value) => {
    const [num, den] = String(value || '0/1').split('/').map(Number);
    return den ? num / den : 0;
};

export async function probeMedia(filePath) {
    let size;
    let head = new Uint8Array(16);
    try {
        size = (await stat(filePath)).size;
        const handle = await open(filePath, 'r');
        try { await handle.read(head, 0, 16, 0); } finally { await handle.close(); }
    } catch { throw new SocialError('social_media_missing'); }
    const mime = sniffMediaMime(head);
    if (!mime) throw new SocialError('social_media_type_unsupported');
    let info;
    try { info = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath])); }
    catch { throw new SocialError('social_media_unreadable'); }
    const video = (info.streams || []).find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
    const audio = (info.streams || []).find((stream) => stream.codec_type === 'audio');
    if (!video?.width || !video?.height) throw new SocialError('social_media_unreadable');
    const kind = mime.startsWith('image/') ? 'image' : 'video';
    return { kind, mime, size, width: Number(video.width), height: Number(video.height),
        codec: String(video.codec_name || ''), pixFmt: String(video.pix_fmt || ''),
        // Formats that carry (or, for palettes, may carry) transparency.
        alpha: /^(rgba|bgra|argb|abgr|ya8|ya16|gbrap|yuva|pal8)/.test(String(video.pix_fmt || '')),
        container: String(info.format?.format_name || ''),
        duration: kind === 'video' ? Number(info.format?.duration || video.duration || 0) : 0,
        fps: kind === 'video' ? rate(video.avg_frame_rate || video.r_frame_rate) : 0,
        audio: audio ? { codec: String(audio.codec_name || ''), sampleRate: Number(audio.sample_rate || 0), channels: Number(audio.channels || 0) } : null };
}

const ext = (mime) => ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[mime] || '';
const containerOf = (probe) => (probe.mime === 'video/webm' ? 'webm' : probe.mime === 'video/quicktime' ? 'mov' : 'mp4');
const fit = (width, height, maxWidth, maxHeight) => {
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) };
};

// What a destination needs from this asset: `violations` refuse it (nothing is
// cropped, trimmed or slowed down silently); `steps` are real conversions,
// announced in the preview. An empty `steps` reuses the original file.
export function assessMedia(network, probe) {
    const limits = SOCIAL_MEDIA_CONSTRAINTS[network]?.[probe.kind];
    const violations = [];
    const steps = [];
    if (!limits) return { violations, steps };
    if (probe.kind === 'image') {
        const format = ext(probe.mime);
        let target = { width: probe.width, height: probe.height };
        if (limits.minWidth && probe.width < limits.minWidth) violations.push('width_below_minimum');
        const aspect = probe.width / probe.height;
        if (limits.minAspect && (aspect < limits.minAspect - 0.005 || aspect > limits.maxAspect + 0.005)) violations.push('aspect_ratio_out_of_range');
        if (limits.maxWidth && probe.width > limits.maxWidth) target = fit(probe.width, probe.height, limits.maxWidth, Infinity);
        // TikTok documents photos up to 1080p: longest side 1920, shortest 1080.
        if (limits.maxSide) {
            const landscape = probe.width >= probe.height;
            target = fit(target.width, target.height, landscape ? 1920 : limits.maxSide, landscape ? limits.maxSide : 1920);
        }
        const resize = target.width !== probe.width || target.height !== probe.height;
        const convert = !limits.formats.includes(format) || (limits.maxBytes && probe.size > limits.maxBytes);
        if (convert || resize) steps.push({ type: 'image_jpeg', width: target.width, height: target.height,
            flatten: probe.alpha === true, resized: resize, converted: format !== 'jpeg' });
        return { violations, steps };
    }
    const codecOk = limits.codecs.includes(probe.codec) && limits.containers.includes(containerOf(probe))
        && (!probe.audio || !limits.audioCodecs || limits.audioCodecs.includes(probe.audio.codec));
    if (!codecOk) steps.push({ type: 'video_h264' });
    if (probe.fps && (probe.fps < limits.minFps - 0.5 || probe.fps > limits.maxFps + 0.5)) violations.push('frame_rate_out_of_range');
    if (limits.minDuration && probe.duration < limits.minDuration) violations.push('duration_below_minimum');
    if (limits.maxDuration && probe.duration > limits.maxDuration) violations.push('duration_above_maximum');
    if (limits.maxWidth && probe.width > limits.maxWidth) violations.push('width_above_maximum');
    if (limits.minSide && Math.min(probe.width, probe.height) < limits.minSide) violations.push('resolution_below_minimum');
    if (limits.maxSide && Math.max(probe.width, probe.height) > limits.maxSide) violations.push('resolution_above_maximum');
    if (probe.audio && limits.maxAudioRate && probe.audio.sampleRate > limits.maxAudioRate) violations.push('audio_sample_rate_above_maximum');
    if (codecOk && probe.size > limits.maxBytes) violations.push('file_too_large');
    return { violations, steps };
}

export async function prepareVariant({ sourcePath, probe, steps, outDir }) {
    if (!steps.length) return { path: sourcePath, probe, original: true };
    await mkdir(outDir, { recursive: true, mode: 0o700 });
    const step = steps[0];
    const target = path.join(outDir, `${randomBytes(8).toString('hex')}.${step.type === 'image_jpeg' ? 'jpg' : 'mp4'}`);
    try {
        if (step.type === 'image_jpeg') {
            const { width, height } = step;
            // Transparency is composited on white, explicitly: JPEG has no alpha.
            const graph = `color=c=white:s=${width}x${height}[bg];[0:v]scale=${width}:${height}:flags=lanczos,format=rgba[fg];`
                + '[bg][fg]overlay=format=auto:shortest=1,format=yuvj420p';
            await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-filter_complex', graph,
                '-frames:v', '1', '-q:v', '2', target]);
        } else {
            await transcodeVideoToMp4(sourcePath, target);
        }
    } catch { throw new SocialError('social_media_unreadable', { detail: `${step.type}_failed` }); }
    return { path: target, probe: await probeMedia(target), original: false };
}

// Short-lived public URLs for providers that pull the file themselves
// (Instagram images, TikTok photos). Unguessable, bound to one prepared file,
// expiring, and revoked with the job.
const publicFiles = new Map();
const PUBLIC_TTL_MS = 30 * 60 * 1000;

export function issuePublicMediaUrl({ baseUrl, filePath, mime, owner, now = Date.now() }) {
    if (!/^https:\/\//.test(String(baseUrl || ''))) return null;
    const token = randomBytes(24).toString('hex');
    publicFiles.set(token, { filePath, mime, owner, expiresAt: now + PUBLIC_TTL_MS });
    return `${baseUrl.replace(/\/+$/, '')}/api/social/media/${token}.${mime === 'image/jpeg' ? 'jpg' : 'bin'}`;
}

export function revokePublicMedia(owner) {
    for (const [token, entry] of publicFiles) if (entry.owner === owner) publicFiles.delete(token);
}

export function resolvePublicMedia(name, now = Date.now()) {
    const token = /^([a-f0-9]{48})\.(jpg|bin)$/.exec(String(name || ''))?.[1];
    const entry = token ? publicFiles.get(token) : null;
    if (!entry) return null;
    if (now > entry.expiresAt) { publicFiles.delete(token); return null; }
    return entry;
}

// A small JPEG of exactly what will be sent (the prepared variant, or the
// original when it is reused), for the preview the user validates.
export async function previewThumbnail(filePath, kind) {
    const args = ['-hide_banner', '-loglevel', 'error', ...(kind === 'video' ? ['-ss', '0.5'] : []), '-i', filePath,
        '-frames:v', '1', '-vf', 'scale=320:320:force_original_aspect_ratio=decrease', '-q:v', '5', '-f', 'mjpeg', 'pipe:1'];
    const bytes = await new Promise((resolve, reject) => {
        execFile('ffmpeg', args, { encoding: 'buffer', timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
            if (error) reject(new SocialError('social_media_unreadable')); else resolve(stdout);
        });
    });
    return bytes.length ? `data:image/jpeg;base64,${bytes.toString('base64')}` : null;
}
