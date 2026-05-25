import { resolveNativeMediaLocalPath } from './runtime_audio_backend.js';

const safeString = (value) => String(value ?? '').trim();

const normalizeLocalMediaPath = (value = '') => {
    const raw = safeString(value);
    if (!raw) return '';
    try {
        const parsed = new URL(raw, 'http://127.0.0.1/');
        const path = decodeURIComponent(safeString(parsed.pathname));
        if (/^\/file\//i.test(path)) return path.slice('/file/'.length);
        if (/^\/data\/users\//i.test(path)) return path.slice(1);
        return raw;
    } catch (_) {
        if (/^\/file\//i.test(raw)) return raw.slice('/file/'.length);
        if (/^file\//i.test(raw)) return raw.slice('file/'.length);
        return raw;
    }
};

const readCanonicalSourceValue = (source = {}) => safeString(
    source.native_audio_path
    || source.nativeAudioPath
    || source.local_path
    || source.localPath
    || source.file_path
    || source.filePath
    || source.path_or_bookmark
    || source.pathOrBookmark
    || source.path
    || source.media_url
    || source.mediaUrl
    || source.url
    || source.source
);

export const canonicalizePlayRecordMediaSource = (input = {}) => {
    const source = input && typeof input === 'object' ? input : {};
    const sourceValue = readCanonicalSourceValue(source);
    const localPath = normalizeLocalMediaPath(resolveNativeMediaLocalPath(
        source.native_audio_path,
        source.nativeAudioPath,
        source.local_path,
        source.localPath,
        source.file_path,
        source.filePath,
        source.path_or_bookmark,
        source.pathOrBookmark,
        source.path,
        source.media_url,
        source.mediaUrl,
        source.url,
        source.source
    ));
    const mediaRef = safeString(
        source.media_ref
        || source.mediaRef
        || source.assetId
        || source.asset_id
        || source.clipId
        || source.clip_id
        || source.id
        || localPath
        || sourceValue
    );
    return Object.freeze({
        mediaRef,
        assetId: safeString(source.assetId || source.asset_id || source.clipId || source.clip_id || source.id || mediaRef),
        source: sourceValue,
        localPath,
        url: safeString(source.url || source.media_url || source.mediaUrl),
        bytes: source.bytes || null
    });
};
