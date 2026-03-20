import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';

const requests = [];
const env = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    fetch: async (url) => {
        requests.push(url);
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'icloud_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_tauri_cursor_1',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};

const api = createGlobalMailApi({ env });
const ready = await api.ensureReady({ limit: 5 });

assert.equal(ready.ok, true, 'mail bootstrap should allow a successful mirrored sync in Tauri mode');
assert.equal(requests[0], 'http://127.0.0.1:3000/api/eve/mail/sync', 'mail bootstrap should target the local Axum server in Tauri mode');

console.log('mail_bootstrap_tauri_sync_target: ok');
