import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEALTH_REFERENCE_CHUNK_BYTES, HEALTH_REFERENCE_FRAME, validateHealthReferenceManifest } from '../atome/src/shared/health_reference_contract.js';

// The health reference bundle (`health-reference` on /ws/api, no account): the medicines of the BDPM, the
// ANSM interaction thesaurus, the SmPC sections 4.2-4.6, the supplement ingredients and the food rules,
// built monthly by atome-health-ref (its schedule: atome-server src/health_reference.rs). A device downloads it
// and searches and checks everything on its own; nothing it looks up leaves it.
//   manifest {}                        → { manifest }
//   part {version, name, offset}       → { version, name, offset, total, next, base64 }
// `base64` holds at most HEALTH_REFERENCE_CHUNK_BYTES bytes of the part's gzipped file from `offset`;
// `next` is the offset to ask next, null after the last chunk. The device inflates the whole file and checks
// its sha256 against the manifest. A version replaced since the manifest was read answers VERSION_GONE.

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The bundles' folder: data/health_reference/bundles, or HEALTH_REFERENCE_BUNDLES_DIR (a probe's fixture bundle).
export const HEALTH_REFERENCE_BUNDLES_DIR = process.env.HEALTH_REFERENCE_BUNDLES_DIR
  ? path.resolve(process.env.HEALTH_REFERENCE_BUNDLES_DIR)
  : path.join(HERE, '..', 'data', 'health_reference', 'bundles');
const VERSION = /^[0-9a-f]{16}$/;
const RESPONSE = `${HEALTH_REFERENCE_FRAME}-response`;

const reply = (requestId, fields) => ({
  type: RESPONSE, requestId, request_id: requestId,
  success: fields.ok === true, ...fields
});
const failure = (code, cause = code) => Object.assign(new Error(cause), { code });

const missing = (error) => error?.code === 'ENOENT';

const readManifest = async (bundlesDir, version) => {
  const text = await fs.readFile(path.join(bundlesDir, version, 'manifest.json'), 'utf8').catch((error) => {
    throw missing(error) ? failure('VERSION_GONE', `bundle ${version} is no longer stored`) : error;
  });
  return validateHealthReferenceManifest(JSON.parse(text));
};

export const readCurrentHealthReferenceManifest = async (bundlesDir = HEALTH_REFERENCE_BUNDLES_DIR) => {
  const version = await fs.readFile(path.join(bundlesDir, 'current'), 'utf8').catch((error) => {
    throw missing(error) ? failure('NOT_BUILT', 'no health reference bundle has been built yet') : error;
  });
  if (!VERSION.test(version)) throw failure('NOT_BUILT', `bundles/current holds '${version}'`);
  return readManifest(bundlesDir, version);
};

const readChunk = async (bundlesDir, { version, name, offset }) => {
  if (!VERSION.test(String(version || ''))) throw failure('INVALID_ARGUMENT', 'version');
  if (!Number.isSafeInteger(offset) || offset < 0) throw failure('INVALID_ARGUMENT', 'offset');
  const manifest = await readManifest(bundlesDir, version);
  const entry = manifest.parts.find((part) => part.name === name);
  if (!entry) throw failure('INVALID_ARGUMENT', 'name');
  if (offset >= entry.bytes) throw failure('INVALID_ARGUMENT', 'offset');
  const length = Math.min(HEALTH_REFERENCE_CHUNK_BYTES, entry.bytes - offset);
  const handle = await fs.open(path.join(bundlesDir, version, entry.file), 'r').catch((error) => {
    throw missing(error) ? failure('VERSION_GONE', `bundle ${version} is no longer stored`) : error;
  });
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead !== length) throw failure('CORRUPT_BUNDLE', `${entry.file}: ${bytesRead} of ${length} bytes read at ${offset}`);
    const next = offset + length < entry.bytes ? offset + length : null;
    return { version, name, offset, total: entry.bytes, next, base64: buffer.toString('base64') };
  } finally {
    await handle.close();
  }
};

/** The `health-reference` frame; null for another type. `bundlesDir` is for probes only. */
export async function handleWsHealthReference(data, bundlesDir = HEALTH_REFERENCE_BUNDLES_DIR) {
  if (data?.type !== HEALTH_REFERENCE_FRAME) return null;
  const requestId = data.requestId || data.request_id || null;
  try {
    if (data.action === 'manifest') {
      return reply(requestId, { ok: true, manifest: await readCurrentHealthReferenceManifest(bundlesDir) });
    }
    if (data.action === 'part') {
      return reply(requestId, { ok: true, ...(await readChunk(bundlesDir, data)) });
    }
    throw failure('INVALID_ARGUMENT', 'action');
  } catch (error) {
    if (!error?.code || !['INVALID_ARGUMENT', 'NOT_BUILT', 'VERSION_GONE', 'CORRUPT_BUNDLE'].includes(error.code)) throw error;
    return reply(requestId, { ok: false, error: error.code, message: error.message });
  }
}
