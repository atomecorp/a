import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_SCOPE = 'src/application/examples';
const TARGET_MANIFEST = path.join('src', 'manifest.json');
const SKIP_NAMES = new Set(['.DS_Store']);

const scope = process.env.MANIFEST_SCOPE || DEFAULT_SCOPE;
const scopeAbs = path.join(projectRoot, scope);
const manifestAbs = path.join(projectRoot, TARGET_MANIFEST);

function shouldSkip(name) {
  return SKIP_NAMES.has(name);
}

async function collectFiles(dirAbs) {
  const entries = [];
  const queue = [dirAbs];

  while (queue.length) {
    const current = queue.pop();
    const dirents = await fs.readdir(current, { withFileTypes: true });

    for (const dirent of dirents) {
      if (shouldSkip(dirent.name)) continue;
      const entryAbs = path.join(current, dirent.name);

      if (dirent.isDirectory()) {
        queue.push(entryAbs);
        continue;
      }

      const data = await fs.readFile(entryAbs);
      entries.push({
        path: path.relative(projectRoot, entryAbs).replace(/\\/g, '/'),
        size: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex')
      });
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  try {
    await fs.access(scopeAbs);
  } catch (error) {
    console.error(`❌ Scope directory "${scope}" not found (${scopeAbs}).`);
    process.exitCode = 1;
    return;
  }

  const files = await collectFiles(scopeAbs);

  const manifest = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    scope,
    description: `Hot-update manifest limited strictly to ${scope}/**. Do not touch other src/application modules.`,
    rules: {
      protectedRoots: ['src/application'],
      allowedOverrides: [scope],
      notes: [
        `Never push hot patches outside ${scope}`,
        'If a file is missing from this manifest, skip updating it'
      ]
    },
    filters: {
      excludedExtensions: [],
      excludedNames: [...SKIP_NAMES]
    },
    files
  };

  await fs.writeFile(manifestAbs, JSON.stringify(manifest, null, 2));
  console.log(
    `✅ Updated ${path.relative(projectRoot, manifestAbs)} with ${files.length} entries (scope: ${scope})`
  );
}

main().catch((error) => {
  console.error('❌ Failed to update manifest:', error);
  process.exitCode = 1;
});
