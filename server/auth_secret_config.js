import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SMS_KEYS = new Set(['OVH_API_ENDPOINT', 'OVH_SMS_SERVICE_NAME', 'OVH_SMS_SENDER',
    'OVH_API_APPLICATION_KEY', 'OVH_API_APPLICATION_SECRET', 'OVH_API_CONSUMER_KEY', 'AUTH_SMS_DAILY_LIMIT']);

// Developer configuration of the atome application with the social networks
// (one app per network, registered by the atome operator — never by a user).
export const SOCIAL_CONFIG_KEYS = Object.freeze(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_AUDITED', 'TIKTOK_DIRECT_POST',
    'TIKTOK_PULL_FROM_URL_VERIFIED', 'INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET',
    'SOCIAL_PUBLIC_BASE_URL']);

// A development secret file: owner-only permissions, only whitelisted keys, and
// an existing environment variable always wins. The source is never copied to
// an environment file or a bundle, and production reads its environment only.
function loadLocalSecretFile({ file, keys, error, env }) {
    if (env.NODE_ENV === 'production') return false;
    if (!existsSync(file)) return false;
    const metadata = statSync(file);
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new Error(`${error}_permissions`);
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const value = line.trim();
        if (!value || value.startsWith('#')) continue;
        const separator = value.indexOf('=');
        const key = value.slice(0, separator).trim();
        if (separator < 1 || !keys.has(key)) throw new Error(`${error}_invalid`);
        const raw = value.slice(separator + 1).trim();
        const parsed = /^(['"])(.*)\1$/.exec(raw);
        if (!(key in env)) env[key] = parsed ? parsed[2] : raw;
    }
    return true;
}

export function loadLocalSmsConfig(projectRoot, env = process.env) {
    return loadLocalSecretFile({ env, keys: SMS_KEYS, error: 'sms_secret_file',
        file: env.ATOME_SMS_ENV_FILE || path.join(projectRoot, 'Private', 'ovh_sms.env') });
}

export function loadLocalSocialConfig(projectRoot, env = process.env) {
    return loadLocalSecretFile({ env, keys: new Set(SOCIAL_CONFIG_KEYS), error: 'social_secret_file',
        file: env.ATOME_SOCIAL_ENV_FILE || path.join(projectRoot, 'Private', 'social.env') });
}
