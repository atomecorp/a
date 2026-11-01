#!/usr/bin/env node
// npm run registry:check (part of check:m0) — fails when the registry is broken or stale:
// unresolved ids, duplicate owners, orphan placements, alias collisions, forbidden cycles, schema violations,
// and a stale hash (an owner or a source changed since the last `npm run registry:build`).
import fs from 'node:fs';
import { generatedFile } from './registry_paths.mjs';
import { assembleRegistry } from './registry_assemble.mjs';
import { schemaErrors, integrityErrors } from './registry_integrity.mjs';
import { atomeTypesErrors } from './registry_atome_types.mjs';

export async function checkRegistry() {
    const file = generatedFile('full-map.json');
    if (!fs.existsSync(file)) return { ok: false, errors: ['registry_not_built: eVe/registry/generated/full-map.json is missing (npm run registry:build)'] };
    const generated = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { map, sources, findings } = await assembleRegistry();
    const errors = [...schemaErrors(map, sources), ...integrityErrors(map, sources, findings)];
    errors.push(...schemaErrors(generated, sources).filter(error => error.startsWith('schema:full-map')).map(error => `generated ${error}`));
    if (generated.inputs_hash !== map.inputs_hash) {
        const changed = Object.keys({ ...generated.inputs, ...map.inputs }).filter(name => generated.inputs?.[name] !== map.inputs[name]).sort();
        errors.push(`stale_hash: ${changed.join(', ')} changed since the last build (npm run registry:build)`);
    }
    errors.push(...await atomeTypesErrors());
    return { ok: errors.length === 0, errors, map };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await checkRegistry();
    if (!result.ok) {
        process.stderr.write(`registry:check failed (${result.errors.length})\n${result.errors.slice(0, 80).join('\n')}\n`);
        process.exit(1);
    }
    process.stdout.write(`registry:check ok (${Object.keys(result.map.entries).length} entries, hash ${result.map.inputs_hash.slice(0, 12)})\n`);
}
