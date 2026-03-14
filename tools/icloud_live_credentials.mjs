import { execFileSync } from 'node:child_process';
import { selectIcloudAccount } from './icloud_account_discovery.mjs';

export const readEnv = (...keys) => {
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
