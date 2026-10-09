import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const MAPS = ['CODEMAP', 'API_MAP', 'ARCHITECTURE_MAP', 'DESIGN_MAP'];

const checkFixture = ({ citation = '', present = false, omitMap = false } = {}) => {
    const directory = mkdtempSync(path.join(ROOT, 'temp/map-paths-'));
    try {
        mkdirSync(path.join(directory, 'maps'));
        for (const name of MAPS) {
            if (omitMap && name === 'CODEMAP') continue;
            writeFileSync(path.join(directory, `maps/${name}.md`), citation);
        }
        if (present) {
            mkdirSync(path.join(directory, 'server'));
            writeFileSync(path.join(directory, 'server/owner.js'), '');
        }
        return spawnSync(process.execPath, [path.join(ROOT, 'scripts/check_map_paths.mjs')], {
            cwd: directory, encoding: 'utf8'
        });
    } finally { rmSync(directory, { recursive: true, force: true }); }
};

test('map paths reject even one missing active owner and accept an existing owner', () => {
    const missing = checkFixture({ citation: '`server/owner.js`' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /server\/owner\.js/);
    assert.equal(checkFixture({ citation: '`server/owner.js`', present: true }).status, 0);
});

test('an explicitly retired path stays absent while active paths on the same line are checked', () => {
    assert.equal(checkFixture({ citation: 'Removed `retired:server/owner.js`.' }).status, 0);
    const invalid = checkFixture({ citation: 'Removed `retired:server/old.js`; owner `server/owner.js`.' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /server\/owner\.js/);
});

test('a retired annotation cannot conceal a file that actually exists', () => {
    const invalid = checkFixture({ citation: '`retired:server/owner.js`', present: true });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /marked retired but exists/);
});

test('a missing architecture map cannot silently pass the guard', () => {
    const invalid = checkFixture({ omitMap: true });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /required map missing/);
});
