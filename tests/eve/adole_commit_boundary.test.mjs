import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Adole framework Atome APIs route durable writes through event commit', async () => {
    const [atomesSource, authEntry, authLogin, authSession, sharingSource, adapterSource] = await Promise.all([
        readSource('atome/src/squirrel/apis/unified/adole_api/atomes.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_session_account.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/sharing.js'),
        readSource('atome/src/squirrel/apis/unified/adole.js')
    ]);
    // The auth API surface is split across the facade entry + its two method-group modules.
    const authSource = `${authEntry}\n${authLogin}\n${authSession}`;

    assert.match(adapterSource, /async commit\(event = \{\}\)/);
    assert.match(adapterSource, /action: 'commit'/);
    assert.match(adapterSource, /async commitBatch\(events = \[\]\)/);
    assert.match(adapterSource, /action: 'commit-batch'/);
    assert.match(adapterSource, /from '\.\.\/\.\.\/\.\.\/shared\/atome_contract\.js'/);
    assert.doesNotMatch(adapterSource, /RESERVED_ATOME_PROPERTY_KEYS/);
    assert.doesNotMatch(adapterSource, /const sanitizeAtomeProperties = \(/);

    assert.doesNotMatch(atomesSource, /\.atome\.create\(/);
    assert.doesNotMatch(atomesSource, /\.atome\.alter\(/);
    assert.doesNotMatch(authSource, /\.atome\.alter\(/);
    assert.doesNotMatch(sharingSource, /\.atome\.create\(/);

    assert.match(atomesSource, /\.atome\.commit\(/);
    assert.match(authSource, /\.atome\.commit\(/);
    assert.match(sharingSource, /\.atome\.commit\(/);
});
