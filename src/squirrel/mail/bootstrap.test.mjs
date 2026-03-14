import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';

const env = {};
const api = createGlobalMailApi({ env });

assert.equal(env.Squirrel.mail, api, 'mail bootstrap should expose a global Squirrel mail API');
assert.equal(env.atome.mail, api, 'mail bootstrap should expose a global atome mail API');
assert.equal(env.atome.tools.mail, api, 'mail bootstrap should expose mail under atome.tools');

api.ingest([
    {
        message_id: 'mail_bootstrap_1',
        mailbox: 'inbox',
        subject: 'Bootstrap',
        body_text: 'Mail bootstrap test',
        unread: true,
        from: { address: 'bootstrap@example.test' },
        received_at: '2026-03-13T10:00:00Z'
    }
]);

assert.equal(api.list().items[0].message_id, 'mail_bootstrap_1', 'mail bootstrap should use the shared service singleton');
assert.equal(api.summarize().ok, true, 'mail bootstrap should expose local summary methods');

const sync = api.syncApply([
    {
        message_id: 'mail_bootstrap_2',
        mailbox: 'inbox',
        subject: 'Sync',
        body_text: 'Mail sync bootstrap test',
        unread: true,
        from: { address: 'sync@example.test' },
        received_at: '2026-03-13T11:00:00Z'
    }
], {
    cursor: 'cursor_bootstrap_1'
});
assert.equal(sync.sync.cursor, 'cursor_bootstrap_1', 'mail bootstrap should expose sync application helpers');
assert.equal(api.syncStatus().sync.ingested, 1, 'mail bootstrap should expose sync state');

const readout = api.buildReadout('mail_bootstrap_2');
assert.equal(readout.ok, true, 'mail bootstrap should expose mail readout generation');

let spokenText = null;
env.Squirrel.voice = {
    async speak(text) {
        spokenText = text;
        return { ok: true, text };
    }
};
const spoken = await api.voiceReadout('mail_bootstrap_2');
assert.equal(spoken.spoken, true, 'mail bootstrap should reuse the global voice API for mail readout');
assert.equal(typeof spokenText, 'string', 'mail bootstrap should pass readout text into the voice API');

console.log('mail_bootstrap: ok');
