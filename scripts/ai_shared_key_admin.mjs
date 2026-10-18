#!/usr/bin/env node
// Operator tool for the shared OpenAI test seats (server/providerSharedGrant.js).
// Run on the server from the project root, with the service environment loaded:
//   set -a; . /etc/squirrel/squirrel.env; set +a; node scripts/ai_shared_key_admin.mjs <command>
// Commands:
//   list                                  seats, phone, state and consumption
//   find --phone <+33...>                 resolve a phone number to its principal
//   grant|revoke|unblock <principal> | --phone <+33...>
//   close | open                          stop / resume automatic seat claims
import db from '../database/adole.js';
import { findPrincipalByPhone, readPrincipalPhone } from '../server/auth_identity.js';
import { createProviderSharedGrant } from '../server/providerSharedGrant.js';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const fail = (message) => { console.error(message); process.exit(1); };

await db.initDatabase();
const dataSource = db.getDataSourceAdapter();
const grant = createProviderSharedGrant({ query: db.query });

const resolvePrincipal = async () => {
    const phone = option('--phone');
    if (!phone) return args[0] || fail('A principal id or --phone is required.');
    const account = await findPrincipalByPhone(dataSource, phone);
    return account?.user_id || fail(`No active account for ${phone}.`);
};
const describe = async (row) => {
    const account = await db.query('get', 'SELECT created_at FROM atomes WHERE atome_id = ?', [row.principal_id]);
    return {
        principal: row.principal_id,
        phone: await readPrincipalPhone(dataSource, row.principal_id),
        state: row.state,
        by: row.granted_by,
        claimed: new Date(Number(row.claimed_ms)).toISOString().slice(0, 16),
        account_created: account?.created_at || null,
        operations: row.operations,
        tokens: row.tokens,
        tokens_today: row.tokens_today,
        voice_sessions: row.realtime
    };
};

if (command === 'list') {
    const rows = await grant.list();
    console.log(`active seats ${await grant.activeCount()}/${grant.limits.seats}, auto enrollment ${await grant.autoEnrollment()}`);
    console.log(`daily limits per seat: ${grant.limits.operations} operations, ${grant.limits.tokens} tokens, ${grant.limits.realtime} voice sessions`);
    console.table(await Promise.all(rows.map(describe)));
} else if (command === 'find') {
    const account = await findPrincipalByPhone(dataSource, option('--phone') || fail('--phone is required.'));
    console.log(account ? { principal: account.user_id, created_at: account.created_at } : 'No active account.');
} else if (command === 'grant' || command === 'revoke' || command === 'unblock') {
    const principal = await resolvePrincipal();
    const result = await grant[command](principal).catch(error => fail(error.message));
    console.log(result ? await describe({ ...result, operations: null, tokens: null, tokens_today: null, realtime: null }) : `${principal} unblocked.`);
} else if (command === 'close' || command === 'open') {
    await grant.setAutoEnrollment(command === 'open');
    console.log(`auto enrollment ${await grant.autoEnrollment()}`);
} else {
    fail('Usage: list | find --phone <n> | grant|revoke|unblock <principal>|--phone <n> | close | open');
}
await db.closeDatabase?.();
