// Device identities are created on the device, never on the image builder.
import fs from 'node:fs';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const state = '/var/db/atome/identity';
const config = '/usr/local/etc/aos/runtime.env';
fs.mkdirSync(state, { recursive: true, mode: 0o700 });
if (!fs.existsSync(config)) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  // Replacing an incomplete first-boot key pair is safe before runtime.env exists.
  fs.writeFileSync(`${state}/server-private.pem`, keys.privateKey, { mode: 0o600 });
  fs.writeFileSync(`${state}/server-public.pem`, keys.publicKey, { mode: 0o644 });
  const values = { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3001', USE_HTTPS: 'false',
    JWT_SECRET: randomBytes(48).toString('hex'), COOKIE_SECRET: randomBytes(48).toString('hex'),
    SERVER_ID: randomUUID(), SERVER_NAME: 'atome', SERVER_PRIVATE_KEY_PATH: `${state}/server-private.pem`,
    SERVER_PUBLIC_KEY_PATH: `${state}/server-public.pem`, GITHUB_AUTO_SYNC: 'false', SQUIRREL_DISABLE_WATCHER: '1' };
  fs.writeFileSync(`${config}.new`, Object.entries(values).map(([key, value]) => `${key}='${value}'\n`).join(''), { mode: 0o640 });
  execFileSync('chown', ['root:atome', `${config}.new`]);
  execFileSync('chown', ['-R', 'atome:atome', state]);
  fs.renameSync(`${config}.new`, config);
}
fs.mkdirSync('/var/run/atome', { recursive: true, mode: 0o755 });
fs.mkdirSync('/var/run/atome/wayland', { recursive: true, mode: 0o700 });
fs.mkdirSync('/var/log/atome', { recursive: true, mode: 0o750 });
// The daemon pidfiles stay root-owned; the service owns only its socket/log paths.
execFileSync('chown', ['root:wheel', '/var/run/atome']);
execFileSync('chmod', ['755', '/var/run/atome']);
execFileSync('chown', ['-R', 'atome:atome', '/var/run/atome/wayland', '/var/log/atome']);
execFileSync('/usr/bin/ssh-keygen', ['-A'], { stdio: 'inherit' });
