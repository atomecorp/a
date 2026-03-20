import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const previousEnv = { ...process.env };
const previousCwd = process.cwd();

process.env.MAIL_EMAIL = 'jeezs@atome.one';
process.env.MAIL_PASSWORD = 'secret-pass';
process.env.MAIL_IMAP_HOST = 'rousse.o2switch.net';
process.env.MAIL_IMAP_PORT = '993';
process.env.MAIL_SMTP_HOST = 'rousse.o2switch.net';
process.env.MAIL_SMTP_PORT = '587';
process.env.MAIL_MAILBOX = 'INBOX';

const { resolveMailCredentials } = await import('./icloud_live_credentials.mjs');

const resolved = resolveMailCredentials();

assert.equal(resolved.mode, 'env_generic', 'generic env mail config should take precedence');
assert.equal(resolved.provider, 'custom_imap_smtp', 'generic env config should advertise the generic provider');
assert.equal(resolved.email, 'jeezs@atome.one', 'generic env config should expose the mailbox email');
assert.equal(resolved.imap.host, 'rousse.o2switch.net', 'generic env config should keep the IMAP host');
assert.equal(resolved.smtp.host, 'rousse.o2switch.net', 'generic env config should keep the SMTP host');
assert.equal(resolved.mailbox, 'INBOX', 'generic env config should expose the mailbox');

for (const key of Object.keys(process.env)) {
    if (!(key in previousEnv)) delete process.env[key];
}
for (const [key, value] of Object.entries(previousEnv)) {
    process.env[key] = value;
}

console.log('icloud_live_credentials_generic_mail: ok');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icloud-mail-env-'));
const envPath = path.join(tempDir, '.env');
fs.writeFileSync(envPath, [
    'MAIL_EMAIL=filetest@atome.one',
    'MAIL_PASSWORD=file-secret',
    'MAIL_IMAP_HOST=imap.file.test',
    'MAIL_SMTP_HOST=smtp.file.test',
    'MAIL_MAILBOX=INBOX'
].join('\n'));

for (const key of [
    'MAIL_EMAIL',
    'MAIL_PASSWORD',
    'MAIL_IMAP_HOST',
    'MAIL_SMTP_HOST',
    'MAIL_MAILBOX'
]) {
    delete process.env[key];
}

process.chdir(tempDir);

const cacheBustedModule = await import(`./icloud_live_credentials.mjs?file-env=${Date.now()}`);
const resolvedFromFile = cacheBustedModule.resolveMailCredentials();

assert.equal(resolvedFromFile.mode, 'env_generic', 'generic mail config should load from .env when process env is empty');
assert.equal(resolvedFromFile.email, 'filetest@atome.one', 'file-loaded mail config should expose the mailbox email');
assert.equal(resolvedFromFile.imap.host, 'imap.file.test', 'file-loaded mail config should keep the IMAP host');
assert.equal(resolvedFromFile.smtp.host, 'smtp.file.test', 'file-loaded mail config should keep the SMTP host');

process.chdir(previousCwd);
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('icloud_live_credentials_file_mail: ok');
