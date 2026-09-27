import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const KEYS = new Set(['OVH_API_ENDPOINT', 'OVH_SMS_SERVICE_NAME', 'OVH_SMS_SENDER',
    'OVH_API_APPLICATION_KEY', 'OVH_API_APPLICATION_SECRET', 'OVH_API_CONSUMER_KEY', 'AUTH_SMS_DAILY_LIMIT']);

// The development source is never copied to an environment file or a bundle.
export function loadLocalSmsConfig(projectRoot, env = process.env) {
    if (env.NODE_ENV === 'production') return false;
    const file = env.ATOME_SMS_ENV_FILE || path.join(projectRoot, 'Private', 'ovh_sms.env');
    if (!existsSync(file)) return false;
    const metadata = statSync(file);
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new Error('sms_secret_file_permissions');
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const value = line.trim();
        if (!value || value.startsWith('#')) continue;
        const separator = value.indexOf('=');
        const key = value.slice(0, separator).trim();
        if (separator < 1 || !KEYS.has(key)) throw new Error('sms_secret_file_invalid');
        const raw = value.slice(separator + 1).trim();
        const parsed = /^(['"])(.*)\1$/.exec(raw);
        if (!(key in env)) env[key] = parsed ? parsed[2] : raw;
    }
    return true;
}
