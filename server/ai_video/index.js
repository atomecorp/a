import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVideoAiService } from './service.js';
import { createRunwayProvider } from './providers/runway.js';
import { createMockVideoProvider } from './providers/mock.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Stores a generated video as a file of the principal, exactly like
 * `/api/uploads/remote-wallpaper` does: user Downloads folder + file registration.
 * The client then creates the atome from this stored file (no second upload).
 */
export const storeGeneratedVideo = async ({ principal, bytes, mime, fileName, projectRoot = PROJECT_ROOT, env = process.env }) => {
    const { resolveUserUploadPath } = await import('../fileStorage.js');
    const resolved = await resolveUserUploadPath(projectRoot, { id: principal }, fileName);
    await fs.writeFile(resolved.filePath, bytes);
    const relativePath = path.join('Downloads', resolved.fileName);
    let atomeId = null;
    if (env.SQLITE_PATH || env.LIBSQL_URL) {
        const { registerFileUpload } = await import('../userFiles.js');
        const registration = await registerFileUpload(resolved.fileName, principal, {
            atome_id: null, atome_type: 'video', original_name: resolved.fileName,
            mime_type: mime, size_bytes: bytes.length, file_path: relativePath
        });
        if (!registration?.success) {
            await fs.rm(resolved.filePath, { force: true });
            throw new Error('DOWNLOAD_FAILED');
        }
        atomeId = registration.atome_id || null;
    }
    return { file_name: resolved.fileName, owner_id: principal, file_path: relativePath, atome_id: atomeId, size_bytes: bytes.length };
};

let service = null;

/** Registration order = `auto` routing preference: Runway first, then the mock (probes only). */
export const getVideoAiService = ({ env = process.env } = {}) => {
    if (service) return service;
    service = createVideoAiService({ storeOutput: (args) => storeGeneratedVideo({ ...args, env }) });
    service.register(createRunwayProvider({ env }));
    if (env.ATOME_AI_VIDEO_MOCK === '1') service.register(createMockVideoProvider());
    return service;
};
