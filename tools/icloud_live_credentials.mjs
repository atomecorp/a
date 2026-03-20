import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { selectIcloudAccount } from './icloud_account_discovery.mjs';

let envLoadedFromFiles = false;

const applyEnvFile = (filePath, { overrideExisting = false } = {}) => {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of raw.split(/\r?\n/)) {
        const line = String(rawLine || '').trim();
        if (!line || line.startsWith('#')) continue;
        const separatorIndex = line.indexOf('=');
        if (separatorIndex <= 0) continue;
        const key = line.slice(0, separatorIndex).trim();
        if (!key) continue;
        if (!overrideExisting && String(process.env[key] || '').trim()) continue;
        let value = line.slice(separatorIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith('\'') && value.endsWith('\''))
        ) {
            value = value.slice(1, -1);
        }
        process.env[key] = value.replace(/\\n/g, '\n');
    }
    return true;
};

const loadEnvFromProjectRootIfNeeded = () => {
    if (envLoadedFromFiles) return;
    envLoadedFromFiles = true;
    const candidates = [];
    const cwd = process.cwd();
    if (cwd) candidates.push(cwd);
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    if (scriptDir) candidates.push(path.resolve(scriptDir, '..'));

    for (const baseDir of candidates) {
        const envPath = path.join(baseDir, '.env');
        if (applyEnvFile(envPath, { overrideExisting: false })) {
            applyEnvFile(path.join(baseDir, '.env.local'), { overrideExisting: true });
            return;
        }
    }
};

export const readEnv = (...keys) => {
    loadEnvFromProjectRootIfNeeded();
    for (const key of keys) {
        const value = String(process.env[key] || '').trim();
        if (value) return value;
    }
    return '';
};

export const boolEnv = (...keys) => {
    const value = readEnv(...keys).toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value);
};

const readKeychainPassword = ({
    account,
    server,
    protocol
}) => {
    const args = ['find-internet-password', '-a', account, '-s', server];
    if (protocol) {
        args.push('-r', protocol);
    }
    args.push('-w');
    return execFileSync('security', args, {
        encoding: 'utf8'
    }).trim();
};

export const probeKeychainPassword = ({
    account,
    server,
    protocol
}) => {
    try {
        const password = readKeychainPassword({ account, server, protocol });
        return {
            ok: !!password,
            account,
            server,
            protocol: protocol || null
        };
    } catch (error) {
        return {
            ok: false,
            account,
            server,
            protocol: protocol || null,
            error: error?.message || String(error)
        };
    }
};

export const resolveIcloudMailCredentials = () => {
    const email = readEnv('ICLOUD_EMAIL', 'ICLOUD_MAIL_EMAIL');
    const appPassword = readEnv('ICLOUD_APP_PASSWORD', 'ICLOUD_MAIL_APP_PASSWORD');
    if (email && appPassword) {
        return {
            mode: 'env',
            email,
            appPassword
        };
    }

    const discovered = selectIcloudAccount({
        accountHint: readEnv('ICLOUD_ACCOUNT_ID', 'ICLOUD_KEYCHAIN_ACCOUNT', 'ICLOUD_MAIL_KEYCHAIN_ACCOUNT', 'ICLOUD_EMAIL')
    });
    if (appPassword && discovered) {
        return {
            mode: 'env+discovery',
            email: discovered.mail?.email || discovered.account_id,
            appPassword
        };
    }
    const account = readEnv('ICLOUD_KEYCHAIN_ACCOUNT', 'ICLOUD_MAIL_KEYCHAIN_ACCOUNT')
        || discovered?.mail?.email
        || discovered?.account_id
        || '';
    if (!account) {
        throw new Error('icloud_mail_live_smoke_missing_credentials');
    }

    const password = readKeychainPassword({
        account,
        server: readEnv('ICLOUD_IMAP_HOST') || discovered?.mail?.imap_hostname || 'imap.mail.me.com',
        protocol: 'imap'
    });
    return {
        mode: 'keychain',
        email: account,
        appPassword: password
    };
};

export const resolveMailCredentials = () => {
    const email = readEnv('MAIL_EMAIL', 'MAIL_ACCOUNT_EMAIL', 'MAIL_USERNAME', 'SMTP_USERNAME', 'IMAP_USERNAME');
    const password = readEnv('MAIL_PASSWORD', 'MAIL_APP_PASSWORD', 'SMTP_PASSWORD', 'IMAP_PASSWORD');
    const imapHost = readEnv('MAIL_IMAP_HOST', 'IMAP_HOST');
    const smtpHost = readEnv('MAIL_SMTP_HOST', 'SMTP_HOST');

    if (email && password && imapHost && smtpHost) {
        return {
            mode: 'env_generic',
            provider: readEnv('MAIL_PROVIDER') || 'custom_imap_smtp',
            email,
            username: readEnv('MAIL_USERNAME', 'IMAP_USERNAME', 'SMTP_USERNAME') || email,
            password,
            appPassword: password,
            mailbox: readEnv('MAIL_MAILBOX', 'MAILBOX', 'ICLOUD_MAILBOX') || 'INBOX',
            imap: {
                host: imapHost,
                port: Number(readEnv('MAIL_IMAP_PORT', 'IMAP_PORT') || 993),
                security: readEnv('MAIL_IMAP_SECURITY', 'IMAP_SECURITY') || 'tls'
            },
            smtp: {
                host: smtpHost,
                port: Number(readEnv('MAIL_SMTP_PORT', 'SMTP_PORT') || 587),
                security: readEnv('MAIL_SMTP_SECURITY', 'SMTP_SECURITY') || 'starttls'
            }
        };
    }

    const icloud = resolveIcloudMailCredentials();
    return {
        ...icloud,
        provider: 'icloud_imap_smtp',
        username: icloud.email,
        password: icloud.appPassword,
        mailbox: readEnv('ICLOUD_MAILBOX') || 'INBOX',
        imap: {
            host: readEnv('ICLOUD_IMAP_HOST') || 'imap.mail.me.com',
            port: Number(readEnv('ICLOUD_IMAP_PORT') || 993),
            security: readEnv('ICLOUD_IMAP_SECURITY') || 'tls'
        },
        smtp: {
            host: readEnv('ICLOUD_SMTP_HOST') || 'smtp.mail.me.com',
            port: Number(readEnv('ICLOUD_SMTP_PORT') || 587),
            security: readEnv('ICLOUD_SMTP_SECURITY') || 'starttls'
        }
    };
};

export const resolveIcloudCalendarCredentials = () => {
    const email = readEnv('ICLOUD_EMAIL', 'ICLOUD_CALENDAR_EMAIL');
    const appPassword = readEnv('ICLOUD_APP_PASSWORD', 'ICLOUD_CALENDAR_APP_PASSWORD');
    if (email && appPassword) {
        return {
            mode: 'env',
            email,
            appPassword
        };
    }

    const discovered = selectIcloudAccount({
        accountHint: readEnv('ICLOUD_ACCOUNT_ID', 'ICLOUD_KEYCHAIN_ACCOUNT', 'ICLOUD_CALENDAR_KEYCHAIN_ACCOUNT', 'ICLOUD_EMAIL')
    });
    if (appPassword && discovered) {
        return {
            mode: 'env+discovery',
            email: discovered.mail?.email || discovered.account_id,
            appPassword
        };
    }
    const account = readEnv('ICLOUD_KEYCHAIN_ACCOUNT', 'ICLOUD_CALENDAR_KEYCHAIN_ACCOUNT')
        || discovered?.mail?.email
        || discovered?.account_id
        || '';
    if (!account) {
        throw new Error('icloud_calendar_live_smoke_missing_credentials');
    }

    const password = readKeychainPassword({
        account,
        server: readEnv('ICLOUD_CALDAV_KEYCHAIN_SERVER', 'ICLOUD_CALENDAR_KEYCHAIN_SERVER')
            || discovered?.calendar?.url?.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
            || 'caldav.icloud.com',
        protocol: readEnv('ICLOUD_CALDAV_KEYCHAIN_PROTOCOL') || null
    });
    return {
        mode: 'keychain',
        email: account,
        appPassword: password
    };
};

const normalizeCandidate = (value) => String(value || '').trim();

export const buildIcloudAuthUserCandidates = ({
    explicitEmail = '',
    discovered = null
} = {}) => {
    const values = [
        explicitEmail,
        discovered?.account_id,
        discovered?.mail?.email,
        discovered?.mail?.username
    ]
        .map(normalizeCandidate)
        .filter(Boolean);

    values
        .flatMap((value) => {
            const local = value.includes('@') ? value.split('@')[0] : '';
            return local ? [local] : [];
        })
        .forEach((entry) => values.push(entry));

    return Array.from(new Set(values.filter(Boolean)));
};

export const buildIcloudPasswordCandidates = (value = '') => {
    const raw = String(value || '');
    const trimmed = raw.trim();
    const noSpaces = trimmed.replace(/\s+/g, '');
    const noSeparators = noSpaces.replace(/-/g, '');
    return Array.from(new Set([trimmed, noSpaces, noSeparators].filter(Boolean)));
};
