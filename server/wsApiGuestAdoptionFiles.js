import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureUserDownloadsDir, sanitizeFileName } from './fileStorage.js';

const DIGEST_RE = /^[a-f0-9]{64}$/i;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const operationDirectory = (projectRoot, operationDigest) => path.join(projectRoot, 'data', 'guest-adoptions', operationDigest);

function descriptor(file) {
    const fileId = String(file?.file_id || file?.fileId || file?.id || '').trim();
    const fileName = sanitizeFileName(file?.file_name || file?.fileName || file?.name || '');
    const contentDigest = String(file?.content_digest || file?.contentDigest || file?.digest || '').trim();
    const byteLength = Number(file?.byte_length ?? file?.byteLength ?? file?.size);
    if (!UUID_V4_RE.test(fileId) || !DIGEST_RE.test(contentDigest) || !Number.isSafeInteger(byteLength) || byteLength < 0 || !fileName) {
        throw new Error('guest_adoption_file_invalid');
    }
    return { fileId, fileName, contentDigest: contentDigest.toLowerCase(), byteLength };
}

async function row(dataSource, sql, params) {
    const rows = await dataSource.query(sql, params);
    return rows?.[0] || null;
}

async function targetMatches(file, targetPath) {
    try {
        const bytes = await fs.readFile(targetPath);
        return bytes.length === Number(file.byte_length) && hash(bytes) === file.content_digest;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
}

function isOperationStagedPath(projectRoot, operationDigest, stagedPath) {
    const directory = operationDirectory(projectRoot, operationDigest);
    const relative = path.relative(directory, stagedPath);
    return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function adoptionFiles(files) {
    const seen = new Set();
    return (files || []).map(descriptor).map((file) => {
        if (seen.has(file.fileId)) throw new Error('guest_adoption_file_duplicate');
        seen.add(file.fileId);
        return file;
    });
}

export async function declareAdoptionFiles(dataSource, operationDigest, files) {
    for (const file of adoptionFiles(files)) {
        const existing = await row(dataSource, `SELECT file_name, content_digest, byte_length FROM guest_adoption_files WHERE operation_digest = ? AND file_id = ?`, [operationDigest, file.fileId]);
        if (existing && (existing.file_name !== file.fileName || existing.content_digest !== file.contentDigest || Number(existing.byte_length) !== file.byteLength)) {
            throw new Error('guest_adoption_file_conflict');
        }
        if (!existing) await dataSource.query(`INSERT INTO guest_adoption_files
            (operation_digest, file_id, file_name, content_digest, byte_length, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'declared', datetime('now'), datetime('now'))`,
        [operationDigest, file.fileId, file.fileName, file.contentDigest, file.byteLength]);
    }
}

export async function stageAdoptionFile({ dataSource, projectRoot, operationDigest, fileId, contentBase64 }) {
    const file = await row(dataSource, `SELECT * FROM guest_adoption_files WHERE operation_digest = ? AND file_id = ?`, [operationDigest, fileId]);
    if (!file) throw new Error('guest_adoption_file_not_declared');
    const bytes = Buffer.from(String(contentBase64 || ''), 'base64');
    if (bytes.length !== Number(file.byte_length) || hash(bytes) !== file.content_digest) throw new Error('guest_adoption_file_digest_invalid');
    const directory = operationDirectory(projectRoot, operationDigest);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stagedPath = path.join(directory, `${file.file_id}.bin`);
    const temporaryPath = `${stagedPath}.partial`;
    await fs.writeFile(temporaryPath, bytes, { mode: 0o600 });
    await fs.rename(temporaryPath, stagedPath);
    await dataSource.query(`UPDATE guest_adoption_files SET status = 'staged', staged_path = ?, updated_at = datetime('now')
        WHERE operation_digest = ? AND file_id = ?`, [stagedPath, operationDigest, file.file_id]);
}

export async function ensureAdoptionFilesStaged(dataSource, operationDigest) {
    const files = await dataSource.query(`SELECT * FROM guest_adoption_files WHERE operation_digest = ?`, [operationDigest]);
    if ((files || []).some((file) => file.status !== 'staged' && file.status !== 'moved')) throw new Error('guest_adoption_files_incomplete');
    return files || [];
}

export async function completeAdoptionFiles({ dataSource, projectRoot, operationDigest, targetPrincipalId }) {
    const files = await ensureAdoptionFilesStaged(dataSource, operationDigest);
    const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, { id: targetPrincipalId });
    for (const file of files) {
        const targetPath = file.target_path || path.join(downloadsDir, file.file_name);
        if (file.status === 'moved') {
            if (!await targetMatches(file, targetPath)) throw new Error('guest_adoption_file_missing');
            continue;
        }
        await dataSource.query(`UPDATE guest_adoption_files SET target_path = ?, updated_at = datetime('now')
            WHERE operation_digest = ? AND file_id = ?`, [targetPath, operationDigest, file.file_id]);
        if (file.target_path && await targetMatches(file, targetPath)) {
            await dataSource.query(`UPDATE guest_adoption_files SET status = 'moved', target_path = ?, updated_at = datetime('now')
                WHERE operation_digest = ? AND file_id = ?`, [targetPath, operationDigest, file.file_id]);
            continue;
        }
        try { await fs.access(targetPath); throw new Error('guest_adoption_file_collision'); }
        catch (error) { if (error.message === 'guest_adoption_file_collision' || error.code !== 'ENOENT') throw error; }
        const stagedPath = String(file.staged_path || '');
        if (!isOperationStagedPath(projectRoot, operationDigest, stagedPath)) throw new Error('guest_adoption_file_stage_invalid');
        await fs.rename(stagedPath, targetPath);
        await dataSource.query(`UPDATE guest_adoption_files SET status = 'moved', target_path = ?, updated_at = datetime('now')
            WHERE operation_digest = ? AND file_id = ?`, [targetPath, operationDigest, file.file_id]);
    }
}
