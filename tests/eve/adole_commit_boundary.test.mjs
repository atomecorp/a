import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Adole framework Atome APIs route durable writes through event commit', async () => {
    const [atomesSource, authSource, sharingSource, adapterSource] = await Promise.all([
        readSource('atome/src/squirrel/apis/unified/adole_api/atomes.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/sharing.js'),
        readSource('atome/src/squirrel/apis/unified/adole.js')
    ]);

    assert.match(adapterSource, /async commit\(event = \{\}\)/);
    assert.match(adapterSource, /action: 'commit'/);
    assert.match(adapterSource, /async commitBatch\(events = \[\]\)/);
    assert.match(adapterSource, /action: 'commit-batch'/);

    assert.doesNotMatch(atomesSource, /\.atome\.create\(/);
    assert.doesNotMatch(atomesSource, /\.atome\.alter\(/);
    assert.doesNotMatch(authSource, /\.atome\.alter\(/);
    assert.doesNotMatch(sharingSource, /\.atome\.create\(/);

    assert.match(atomesSource, /\.atome\.commit\(/);
    assert.match(authSource, /\.atome\.commit\(/);
    assert.match(sharingSource, /\.atome\.commit\(/);
});
