/**
 * File atome-type classification — ADOLE v3.0
 *
 * Pure helpers that map a file name / MIME type to a canonical file atome_type
 * (image, video, sound, text, shape, raw, ...). No DB or runtime state: shared
 * by userFiles.js and any server surface that needs consistent file typing.
 */

import path from 'path';

export const FILE_ATOME_TYPES = Object.freeze([
    'file', 'image', 'video', 'sound',
    'audio_recording', 'video_recording',
    'text', 'shape', 'raw'
]);
const FILE_ATOME_TYPES_SQL = FILE_ATOME_TYPES.map(() => '?').join(', ');
const FILE_ATOME_TYPES_SET = new Set(FILE_ATOME_TYPES);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico']);
const SHAPE_EXTENSIONS = new Set(['.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.m4v']);
const SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.aiff', '.aif', '.opus', '.weba']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.log']);
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values']);

function normalizeMimeType(mimeType) {
    return typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
}

function normalizeExtension(fileName) {
    return typeof fileName === 'string' ? path.extname(fileName).toLowerCase() : '';
}

function normalizeFileAtomeType(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return FILE_ATOME_TYPES_SET.has(normalized) ? normalized : null;
}

function inferFileAtomeType(fileName, mimeType) {
    const ext = normalizeExtension(fileName);
    const mime = normalizeMimeType(mimeType);

    if (SHAPE_EXTENSIONS.has(ext) || mime === 'image/svg+xml') return 'shape';
    if (IMAGE_EXTENSIONS.has(ext) || (mime.startsWith('image/') && mime !== 'image/svg+xml')) return 'image';
    if (VIDEO_EXTENSIONS.has(ext) || mime.startsWith('video/')) return 'video';
    if (SOUND_EXTENSIONS.has(ext) || mime.startsWith('audio/')) return 'sound';
    if (TEXT_EXTENSIONS.has(ext) || TEXT_MIME_TYPES.has(mime)) return 'text';
    return 'raw';
}

export function resolveFileAtomeType(fileName, options = {}) {
    const explicit = normalizeFileAtomeType(options.atome_type || options.atomeType);
    if (explicit) return explicit;
    const sourceName = typeof options.original_name === 'string' && options.original_name.trim()
        ? options.original_name
        : (typeof options.originalName === 'string' && options.originalName.trim()
            ? options.originalName
            : fileName);
    const inferred = inferFileAtomeType(sourceName, options.mimeType || options.mime_type || options.mime);
    return normalizeFileAtomeType(inferred) || 'raw';
}

export function fileTypeWhere(alias = 'a') {
    return `${alias}.atome_type IN (${FILE_ATOME_TYPES_SQL})`;
}
