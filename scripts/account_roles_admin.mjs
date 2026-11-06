#!/usr/bin/env node
// Operator tool for the accounts' roles (server/auth_account_roles.js, table
// `auth_account_roles` of the account store). Run on the server from the project root,
// with the service environment loaded:
//   set -a; . /etc/squirrel/squirrel.env; set +a; node scripts/account_roles_admin.mjs <command>
// The account is named by its verified phone, its handle (the routing name used for pairing, `jean-4821`) or its principal id.
// Commands:
//   list [--role admin]                                          the accounts holding a role
//   show  --handle <h> | --phone <+33…> | <principal>            an account's roles
//   grant  <role> --handle <h> | --phone <+33…> | <principal>    gives the role (admin: validates the feature requests)
//   revoke <role> --handle <h> | --phone <+33…> | <principal>    takes it back
import db from '../database/adole.js';
import { ACCOUNT_ROLES, createAccountRoles } from '../server/auth_account_roles.js';
import { normalizeHandle } from '../server/auth_handles.js';
import { findPrincipalByPhone } from '../server/auth_identity.js';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const fail = (message) => { console.error(message); process.exit(1); };
const optionValues = new Set(['--handle', '--phone', '--role'].map(option).filter(Boolean));
const words = args.filter(arg => !arg.startsWith('--') && !optionValues.has(arg));

await db.initDatabase();
const roles = createAccountRoles({ query: db.query });

const resolvePrincipal = async (principal) => {
    const handle = option('--handle'), phone = option('--phone');
    if (handle) {
        const row = await db.query('get', 'SELECT principal_id FROM auth_handles WHERE handle = ?', [normalizeHandle(handle)]);
        return row?.principal_id || fail(`No account with the handle ${handle}.`);
    }
    if (phone) return (await findPrincipalByPhone(db.getDataSourceAdapter(), phone))?.user_id || fail(`No active account for ${phone}.`);
    if (!principal) fail('An account is required: --handle <h>, --phone <+33…> or a principal id.');
    const user = await db.getAtomeById(principal);
    return user?.atome_type === 'user' && !user.deleted_at ? principal : fail(`No account ${principal}.`);
};
const roleArg = () => {
    const role = words[0];
    return ACCOUNT_ROLES.includes(role) ? role : fail(`A role is required: ${ACCOUNT_ROLES.join(', ')}.`);
};
const handleOf = async principal => (await db.query('get', 'SELECT handle FROM auth_handles WHERE principal_id = ?', [principal]))?.handle || '-';

if (command === 'list') {
    for (const role of option('--role') ? [option('--role')] : ACCOUNT_ROLES) {
        for (const row of await roles.holders(role)) {
            console.log([role, row.principal_id, await handleOf(row.principal_id), new Date(Number(row.granted_ms)).toISOString().slice(0, 16), row.granted_by].join('  '));
        }
    }
} else if (command === 'show') {
    const principal = await resolvePrincipal(words[0]);
    console.log(`${principal}  ${await handleOf(principal)}  roles: ${(await roles.list(principal)).join(', ') || '-'}`);
} else if (command === 'grant' || command === 'revoke') {
    const role = roleArg();
    const principal = await resolvePrincipal(words[1]);
    const held = command === 'grant' ? await roles.grant(principal, role, `script:${process.env.USER || 'operator'}`) : await roles.revoke(principal, role);
    console.log(`${principal}  ${await handleOf(principal)}  roles: ${held.join(', ') || '-'}`);
} else {
    fail('Commands: list [--role admin] | show <account> | grant <role> <account> | revoke <role> <account>; <account>: --handle <h> | --phone <+33…> | <principal>');
}
await db.closeDatabase();
