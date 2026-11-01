// Shared locations and identity rules of the registry scripts (build, check).
// Every registry id is `<kind>:<native id>`: the kind keeps apart identities that share a native name
// (the tool `tv.list_channels` and the contract `tv.list_channels`, the doc brick and the health brick).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REGISTRY_DIR = path.join(ROOT, 'eVe/registry');
export const SCHEMA_FILE = path.join(REGISTRY_DIR, 'schema/registry.schema.json');
export const SOURCE_NAMES = ['taxonomy', 'placements', 'aliases', 'annotations', 'health'];
export const sourceFile = name => path.join(REGISTRY_DIR, 'source', `${name}.json`);
export const generatedFile = name => path.join(REGISTRY_DIR, 'generated', name);

export const entryId = (kind, nativeId) => `${kind}:${nativeId}`;
export const kindOf = id => String(id).slice(0, String(id).indexOf(':'));

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const readSources = () => Object.fromEntries(SOURCE_NAMES.map(name => [name, readJson(sourceFile(name))]));

// Stable JSON: object keys sorted at every depth, so equal data always hashes and writes the same way.
export const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
};
export const hashOf = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const relationKey = relation => `${relation.from}|${relation.type}|${relation.to}`;
