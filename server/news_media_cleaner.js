// A media leaving its author through a News (a publication, a VideoTrain share or reply): the audience
// reads a clean copy, never the author's file (cahier FEAT-005 / O13, user default of 28 Oct. 2026: EXIF
// and GPS always stripped). A picture loses its metadata byte by byte (server/media_metadata_strip.js);
// a sound or a video is copied by ffmpeg (already the server's video normaliser, server/server_media.js)
// without its global and stream metadata, its chapters or its data tracks (a phone's location track).
// The copy lies under the author's `Downloads/news_shared/` (out of their own media list, which reads Downloads alone), registered as a file
// of theirs: what `canReadNewsMedia` opens to the audience is its id alone.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mediaFormatOf, stripImageMetadata } from './media_metadata_strip.js';

const CLEAN_DIR = 'Downloads/news_shared';
const MP4_FAMILY = /\.(mp4|m4v|mov|m4a)$/i;

const ffmpeg = args => new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 120000 }, (error, _stdout, stderr) => (error
        ? reject(new Error(`news_media_clean_failed: ${String(stderr || error.message).trim()}`)) : resolve()));
});
const cleanAvArgs = (source, target) => ['-y', '-hide_banner', '-loglevel', 'error', '-i', source,
    '-map', '0:v?', '-map', '0:a?', '-c', 'copy',
    '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_metadata:s:a', '-1', '-map_chapters', '-1', '-fflags', '+bitexact',
    ...(MP4_FAMILY.test(target) ? ['-movflags', '+faststart'] : []), target];

// `resolveSource(fileAtomeId, ownerId)` → `{ filePath }` (server/server_uploads.js#resolveDownloadTarget);
// `assetPath(ownerId, relative)` → `{ filePath, relativePath }` (server/fileStorage.js#resolveUserAssetPath);
// `registerFile(name, ownerId, options)` (server/userFiles.js#registerFileUpload).
export const createNewsMediaCleaner = ({ resolveSource, assetPath, registerFile }) => async (authorId, meta) => {
    const source = await resolveSource(meta.atome_id, authorId);
    if (!source?.filePath) throw new Error('news_media_source_missing');
    const bytes = await fs.readFile(source.filePath);
    const format = mediaFormatOf(bytes);
    if (format === 'heif' || format === 'unknown') throw new Error(`news_media_format_unsupported:${format}`);
    const ext = path.extname(String(meta.file_name || meta.original_name || source.filePath)).toLowerCase();
    if (!ext) throw new Error('news_media_extension_missing');
    // One clean copy per source file, written again at each publication (the source may have changed).
    const id = `newsclean_${meta.atome_id}`, name = `${id}${ext}`;
    const target = await assetPath(authorId, `${CLEAN_DIR}/${name}`);
    if (format === 'av') await ffmpeg(cleanAvArgs(source.filePath, target.filePath));
    else await fs.writeFile(target.filePath, format === 'svg' ? bytes : stripImageMetadata(bytes), { mode: 0o600 });
    const { size } = await fs.stat(target.filePath);
    const registered = await registerFile(name, authorId, { atome_id: id, file_path: target.relativePath, size,
        mime_type: meta.mime_type || null, original_name: meta.original_name || meta.file_name || name });
    if (!registered?.success) throw new Error(registered?.error || 'news_media_register_failed');
    return { atomeId: id };
};
