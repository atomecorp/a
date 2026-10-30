import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readManifest, verifyManifest } from './artifacts.mjs';

function publicHttps(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Release download requires HTTPS without embedded credentials');
  return url;
}

async function responseFor(value, request) {
  let url = publicHttps(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const result = await request(url, { redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(300000) });
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const next = result.headers.get('location');
      if (!next) throw new Error('Release redirect has no location');
      await result.body?.cancel();
      url = publicHttps(new URL(next, url));
    } else {
      if (!result.ok || !result.body) throw new Error(`Release download failed (${result.status})`);
      return result;
    }
  }
  throw new Error('Too many release redirects');
}

async function save(value, file, limit, request, expected) {
  const response = await responseFor(value, request);
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > limit) { await response.body.cancel(); throw new Error('Download exceeds its declared limit'); }
  const handle = await fs.promises.open(file, 'wx', 0o600);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const input of response.body) {
      const chunk = Buffer.from(input);
      bytes += chunk.length;
      if (bytes > limit) throw new Error('Download exceeds its declared limit');
      hash.update(chunk);
      let position = 0;
      while (position < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, position, chunk.length - position);
        if (!bytesWritten) throw new Error('Short release file write');
        position += bytesWritten;
      }
    }
    const sha256 = hash.digest('hex');
    if (expected && (bytes !== expected.bytes || sha256 !== expected.sha256)) throw new Error('Downloaded artifact checksum/length mismatch');
  } finally { await handle.close(); }
}

export function chooseArtifact(data, { image, format, target, mode } = {}) {
  if (target && data.target.id !== target) throw new Error('Release target does not match the requested target');
  if (mode && data.mode !== mode) throw new Error('Release mode does not match the requested mode');
  const candidates = data.artifacts.filter(item => (!image || item.file === path.basename(image)) && (!format || item.format === format));
  if (candidates.length !== 1) throw new Error('Select exactly one release artifact with --image or --format');
  return candidates[0];
}

export async function downloadRelease(url, root, selection = {}, { request = fetch } = {}) {
  publicHttps(url);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const folder = fs.mkdtempSync(path.join(root, 'download-'));
  const partialManifest = path.join(folder, 'manifest.partial.json');
  try {
    await save(url, partialManifest, 1024 * 1024, request);
    const data = readManifest(partialManifest);
    const artifact = chooseArtifact(data, selection);
    const available = fs.statfsSync(folder);
    if (available.bavail * available.bsize < artifact.bytes + artifact.payload.bytes + 1024 ** 3) throw new Error('Insufficient free space for download and verified decompression');
    const image = path.join(folder, artifact.file);
    const partial = path.join(folder, `${randomUUID()}.part`);
    // Artifacts live beside the supplied public manifest; it cannot redirect us
    // to a different arbitrary artifact URL or a local path via its JSON fields.
    await save(new URL(artifact.file, url), partial, artifact.bytes, request, artifact);
    fs.renameSync(partial, image);
    const manifest = path.join(folder, 'manifest.json');
    fs.renameSync(partialManifest, manifest);
    const verified = await verifyManifest(manifest, image);
    return { manifest, image, target: data.target.id, mode: data.mode, integrity: verified.integrity, authenticity: verified.authenticity };
  } catch (error) {
    // The newly allocated download directory is owned by this call only.
    fs.rmSync(folder, { recursive: true });
    throw error;
  }
}
