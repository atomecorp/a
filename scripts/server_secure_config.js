import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    createServerIdentityId,
    createServerIdentityKeyPair,
    validateServerIdentityKeyPair
} from '../server/serverIdentity.js';

function fileExists(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function readEnvValue(content, key) {
    const line = content
        .split(/\r?\n/)
        .find((candidate) => candidate.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : '';
}

function upsertEnvValue(content, key, value) {
    const lines = content.split(/\r?\n/);
    let replaced = false;
    const nextLines = lines.map((line) => {
        if (line.startsWith(`${key}=`)) {
            replaced = true;
            return `${key}=${value}`;
        }
        return line;
    });
    if (!replaced) {
        if (nextLines.at(-1) !== '') nextLines.push('');
        nextLines.push(`${key}=${value}`);
    }
    return nextLines.join('\n').replace(/\n*$/, '\n');
}

function writeSecureEnv(envFile, content) {
    fs.writeFileSync(envFile, content, { mode: 0o600 });
    fs.chmodSync(envFile, 0o600);
}

function ensureEnvSecret(envFile, key, log) {
    const content = fileExists(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    const current = readEnvValue(content, key);
    const weak = current.length < 32
        || current.includes('change_me')
        || current.includes('change_in_production');
    if (!weak) {
        log(`${key} is configured`);
        return;
    }
    writeSecureEnv(envFile, upsertEnvValue(content, key, crypto.randomBytes(32).toString('hex')));
    log(`${key} generated in ${envFile}`);
}

function resolveIdentityPath(projectRoot, configuredPath) {
    return path.resolve(projectRoot, configuredPath);
}

function readAndValidateIdentity(privateKeyPath, publicKeyPath) {
    if (!fileExists(privateKeyPath) || !fileExists(publicKeyPath)) {
        throw new Error('server_identity_key_files_missing');
    }
    return validateServerIdentityKeyPair(
        fs.readFileSync(privateKeyPath, 'utf8'),
        fs.readFileSync(publicKeyPath, 'utf8')
    );
}

function writeIdentityPair(identityDir, keyPair) {
    fs.mkdirSync(identityDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(identityDir, 0o700);
    const privateKeyPath = path.join(identityDir, 'server.key');
    const publicKeyPath = path.join(identityDir, 'server.pub');
    const privateExists = fileExists(privateKeyPath);
    const publicExists = fileExists(publicKeyPath);
    if (privateExists !== publicExists) throw new Error('server_identity_key_pair_incomplete');
    if (!privateExists) {
        fs.writeFileSync(privateKeyPath, keyPair.privateKey, { mode: 0o600, flag: 'wx' });
        try {
            fs.writeFileSync(publicKeyPath, keyPair.publicKey, { mode: 0o644, flag: 'wx' });
        } catch (error) {
            fs.unlinkSync(privateKeyPath);
            throw error;
        }
    }
    fs.chmodSync(privateKeyPath, 0o600);
    fs.chmodSync(publicKeyPath, 0o644);
    return { privateKeyPath, publicKeyPath };
}

function ensureIdentityMetadata(envFile, content) {
    let nextContent = content;
    nextContent = upsertEnvValue(nextContent, 'SERVER_ID', readEnvValue(content, 'SERVER_ID') || createServerIdentityId());
    nextContent = upsertEnvValue(nextContent, 'SERVER_NAME', readEnvValue(content, 'SERVER_NAME') || 'Squirrel Server');
    if (nextContent !== content) writeSecureEnv(envFile, nextContent);
    return nextContent;
}

export function ensureServerIdentity({ envFile, identityDir, projectRoot, log = () => {} }) {
    const content = fileExists(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    const configuredPrivatePath = readEnvValue(content, 'SERVER_PRIVATE_KEY_PATH');
    const configuredPublicPath = readEnvValue(content, 'SERVER_PUBLIC_KEY_PATH');
    if (Boolean(configuredPrivatePath) !== Boolean(configuredPublicPath)) {
        throw new Error('server_identity_key_paths_incomplete');
    }

    if (configuredPrivatePath && configuredPublicPath) {
        const privateKeyPath = resolveIdentityPath(projectRoot, configuredPrivatePath);
        const publicKeyPath = resolveIdentityPath(projectRoot, configuredPublicPath);
        const { fingerprint } = readAndValidateIdentity(privateKeyPath, publicKeyPath);
        fs.chmodSync(privateKeyPath, 0o600);
        fs.chmodSync(publicKeyPath, 0o644);
        ensureIdentityMetadata(envFile, content);
        log(`Server identity configured fingerprint=${fingerprint}`);
        return { privateKeyPath, publicKeyPath, fingerprint, generated: false };
    }

    const defaultPrivatePath = path.join(identityDir, 'server.key');
    const defaultPublicPath = path.join(identityDir, 'server.pub');
    const privateExists = fileExists(defaultPrivatePath);
    const publicExists = fileExists(defaultPublicPath);
    if (privateExists !== publicExists) throw new Error('server_identity_key_pair_incomplete');
    const generated = !privateExists;
    const paths = writeIdentityPair(identityDir, generated ? createServerIdentityKeyPair() : {
        privateKey: fs.readFileSync(defaultPrivatePath, 'utf8'),
        publicKey: fs.readFileSync(defaultPublicPath, 'utf8')
    });
    const { fingerprint } = readAndValidateIdentity(paths.privateKeyPath, paths.publicKeyPath);
    let nextContent = ensureIdentityMetadata(envFile, content);
    nextContent = upsertEnvValue(nextContent, 'SERVER_PRIVATE_KEY_PATH', paths.privateKeyPath);
    nextContent = upsertEnvValue(nextContent, 'SERVER_PUBLIC_KEY_PATH', paths.publicKeyPath);
    writeSecureEnv(envFile, nextContent);
    log(`Server identity ${generated ? 'generated' : 'adopted'} fingerprint=${fingerprint}`);
    return { ...paths, fingerprint, generated };
}

export function ensureProductionSecureConfig({ envFile, identityDir, projectRoot, log = () => {} }) {
    ensureEnvSecret(envFile, 'JWT_SECRET', log);
    ensureEnvSecret(envFile, 'COOKIE_SECRET', log);
    return ensureServerIdentity({ envFile, identityDir, projectRoot, log });
}

export function backupServerIdentity({ envFile, backupDir, projectRoot }) {
    const content = fs.readFileSync(envFile, 'utf8');
    const privateKeyPath = resolveIdentityPath(projectRoot, readEnvValue(content, 'SERVER_PRIVATE_KEY_PATH'));
    const publicKeyPath = resolveIdentityPath(projectRoot, readEnvValue(content, 'SERVER_PUBLIC_KEY_PATH'));
    readAndValidateIdentity(privateKeyPath, publicKeyPath);
    const targetDir = path.join(backupDir, 'server-identity');
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(privateKeyPath, path.join(targetDir, 'server.key'));
    fs.copyFileSync(publicKeyPath, path.join(targetDir, 'server.pub'));
    fs.chmodSync(path.join(targetDir, 'server.key'), 0o600);
    fs.chmodSync(path.join(targetDir, 'server.pub'), 0o644);
}
