#!/usr/bin/env node
// Operator tool for the public events users declared (server/public_events.js, shared base
// database/adole_public_events_schema.js). Run on the server from the project root:
//   node scripts/public_events_admin.mjs <command>
// Commands:
//   reported            the reported events, most reported first (id, reports, hidden, author, title)
//   restore <event_id>  shows a hidden event again and forgets its reports
//   withdraw <event_id> hides an event (as three reports would)
// The author's own Atome keeps its last status until their next change of the event, which
// projects it again (the vaults are the server's to write, never this script's).
import db from '../database/adole.js';
import { createPublicEventsStore } from '../server/public_events_store.js';

const [command, eventId] = process.argv.slice(2);
const store = createPublicEventsStore({ query: db.query.bind(db) });
const fail = (message) => { console.error(message); process.exit(1); };

if (command === 'reported') {
    for (const row of await store.reported() || []) {
        const title = (() => { try { return JSON.parse(row.payload_json).title; } catch { return ''; } })();
        console.log([row.event_id, `reports=${row.reports}`, row.hidden_at ? `hidden=${row.hidden_at}` : 'visible', row.author_id, row.author_name, title].join('\t'));
    }
} else if (command === 'restore' || command === 'withdraw') {
    if (!eventId) fail(`Usage: ${command} <event_id>`);
    if (!await store.series(eventId)) fail(`No public event ${eventId}.`);
    await (command === 'restore' ? store.restore(eventId) : store.hide(eventId));
    console.log(`${command}: ${eventId}`);
} else {
    fail('Commands: reported | restore <event_id> | withdraw <event_id>');
}
process.exit(0);
