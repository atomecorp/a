import assert from 'node:assert/strict';

const { resolveMailCredentials } = await import('./icloud_live_credentials.mjs');

const resolvedFromProfile = resolveMailCredentials({
    provider: 'custom_imap_smtp',
    email: 'profile@atome.one',
    username: 'profile-user',
    password: 'profile-secret',
    mailbox: 'Archive',
    imap: { host: 'imap.profile.test', port: 1993, security: 'tls' },
    smtp: { host: 'smtp.profile.test', port: 1587, security: 'starttls' }
});

assert.equal(resolvedFromProfile.mode, 'profile_generic', 'runtime profile mail config should take precedence over env values');
assert.equal(resolvedFromProfile.email, 'profile@atome.one', 'runtime profile mail config should expose the profile email');
assert.equal(resolvedFromProfile.username, 'profile-user', 'runtime profile mail config should preserve the explicit username');
assert.equal(resolvedFromProfile.mailbox, 'Archive', 'runtime profile mail config should preserve the explicit mailbox');
assert.equal(resolvedFromProfile.imap.port, 1993, 'runtime profile mail config should preserve the explicit IMAP port');
assert.equal(resolvedFromProfile.smtp.host, 'smtp.profile.test', 'runtime profile mail config should preserve the explicit SMTP host');

assert.throws(
    () => resolveMailCredentials(),
    /mail_credentials_missing/,
    'mail credentials resolution should fail without explicit profile configuration'
);

const resolvedAtomeDomainDefaults = resolveMailCredentials({
    email: 'missing-hosts@atome.one',
    password: 'secret',
    username: 'missing-hosts@atome.one'
});

assert.equal(resolvedAtomeDomainDefaults.username, 'missing-hosts@atome.one', 'mail credentials resolution should preserve the explicit username');
assert.equal(resolvedAtomeDomainDefaults.imap.host, 'rousse.o2switch.net', 'atome.one mail should infer the shared IMAP host automatically');
assert.equal(resolvedAtomeDomainDefaults.smtp.host, 'rousse.o2switch.net', 'atome.one mail should infer the shared SMTP host automatically');

console.log('icloud_live_credentials_profile_mail: ok');
