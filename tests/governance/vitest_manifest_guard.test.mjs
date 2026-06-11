import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const MANIFEST_PATH = path.join(ROOT, 'tests', 'vitest.manifest.json');

const readManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

const listVitestSuites = () => {
    const out = execSync(
        'grep -rl "from .vitest." tests eVe atome server --include="*.test.mjs" 2>/dev/null || true',
        { encoding: 'utf8', cwd: ROOT }
    );
    return out
        .split('\n')
        .filter(Boolean)
        .filter((file) => !file.includes('node_modules'))
        .sort();
};

describe('vitest manifest convention', () => {
    it('every suite importing vitest is listed in tests/vitest.manifest.json', () => {
        const manifest = new Set(readManifest());
        const missing = listVitestSuites().filter((file) => !manifest.has(file));
        expect(
            missing,
            `Suites vitest absentes du manifest — ajoute-les à tests/vitest.manifest.json:\n${missing.join('\n')}`
        ).toEqual([]);
    });

    it('every manifest entry exists and imports vitest', () => {
        const suites = new Set(listVitestSuites());
        const stale = readManifest().filter((file) => !suites.has(file));
        expect(
            stale,
            `Entrées périmées dans tests/vitest.manifest.json (fichier supprimé ou devenu script node) — retire-les:\n${stale.join('\n')}`
        ).toEqual([]);
    });

    it('manifest stays sorted and duplicate-free', () => {
        const manifest = readManifest();
        const normalized = [...new Set(manifest)].sort();
        expect(manifest).toEqual(normalized);
    });
});
