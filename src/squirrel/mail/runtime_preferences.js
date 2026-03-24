import { resolveMailProviderDefaults } from './provider_profiles.js';

const MAIL_RUNTIME_SETTINGS_KEY = 'eve_runtime_mail_preferences_v1';

export const DEFAULT_RUNTIME_MAIL_PREFERENCES = Object.freeze({
    provider: 'custom_imap_smtp',
    email: '',
    username: '',
    password: '',
    mailbox: 'INBOX',
    imap: {
        host: '',
        port: 993,
        security: 'tls'
    },
    smtp: {
        host: '',
        port: 587,
        security: 'starttls'
    }
});

const normalizeMailPortPreference = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
};

const normalizeMailSecurityPreference = (value, fallback) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['tls', 'starttls', 'ssl', 'none'].includes(normalized)) return normalized;
    return fallback;
};

export const normalizeRuntimeMailPreferences = (prefs = {}, fallbackEmail = '') => {
    const source = (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) ? prefs : {};
    const imapSource = (source.imap && typeof source.imap === 'object') ? source.imap : {};
    const smtpSource = (source.smtp && typeof source.smtp === 'object') ? source.smtp : {};
    const email = String(source.email || fallbackEmail || '').trim();
    const username = String(source.username || '').trim() || email;
    const providerDefaults = resolveMailProviderDefaults({ email }) || null;
    const defaultProvider = String(source.provider || providerDefaults?.provider || DEFAULT_RUNTIME_MAIL_PREFERENCES.provider).trim()
        || providerDefaults?.provider
        || DEFAULT_RUNTIME_MAIL_PREFERENCES.provider;
    return {
        provider: defaultProvider,
        email,
        username,
        password: String(source.password || '').trim(),
        mailbox: String(source.mailbox || DEFAULT_RUNTIME_MAIL_PREFERENCES.mailbox).trim() || DEFAULT_RUNTIME_MAIL_PREFERENCES.mailbox,
        imap: {
            host: String(imapSource.host || providerDefaults?.imap?.host || '').trim(),
            port: normalizeMailPortPreference(imapSource.port, providerDefaults?.imap?.port || DEFAULT_RUNTIME_MAIL_PREFERENCES.imap.port),
            security: normalizeMailSecurityPreference(imapSource.security, providerDefaults?.imap?.security || DEFAULT_RUNTIME_MAIL_PREFERENCES.imap.security)
        },
        smtp: {
            host: String(smtpSource.host || providerDefaults?.smtp?.host || '').trim(),
            port: normalizeMailPortPreference(smtpSource.port, providerDefaults?.smtp?.port || DEFAULT_RUNTIME_MAIL_PREFERENCES.smtp.port),
            security: normalizeMailSecurityPreference(smtpSource.security, providerDefaults?.smtp?.security || DEFAULT_RUNTIME_MAIL_PREFERENCES.smtp.security)
        }
    };
};

const readStorage = (env) => {
    try {
        return env?.localStorage || globalThis?.localStorage || null;
    } catch (_) {
        return null;
    }
};

export const readPersistedRuntimeMailPreferences = (env = globalThis) => {
    const inMemory = env?.__eveRuntimeMailPreferences;
    if (inMemory && typeof inMemory === 'object') {
        return normalizeRuntimeMailPreferences(inMemory);
    }
    const storage = readStorage(env);
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
        const raw = storage.getItem(MAIL_RUNTIME_SETTINGS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const normalized = normalizeRuntimeMailPreferences(parsed);
        if (env && typeof env === 'object') {
            env.__eveRuntimeMailPreferences = normalized;
        }
        return normalized;
    } catch (_) {
        return null;
    }
};

export const persistRuntimeMailPreferences = (env = globalThis, prefs = {}, fallbackEmail = '') => {
    const normalized = normalizeRuntimeMailPreferences(prefs, fallbackEmail);
    if (env && typeof env === 'object') {
        env.__eveRuntimeMailPreferences = normalized;
    }
    const storage = readStorage(env);
    if (storage && typeof storage.setItem === 'function') {
        try {
            storage.setItem(MAIL_RUNTIME_SETTINGS_KEY, JSON.stringify(normalized));
        } catch (_) {
            // Ignore storage quota or unavailability issues.
        }
    }
    return normalized;
};

export const clearPersistedRuntimeMailPreferences = (env = globalThis) => {
    if (env && typeof env === 'object' && '__eveRuntimeMailPreferences' in env) {
        delete env.__eveRuntimeMailPreferences;
    }
    const storage = readStorage(env);
    if (storage && typeof storage.removeItem === 'function') {
        try {
            storage.removeItem(MAIL_RUNTIME_SETTINGS_KEY);
        } catch (_) {
            // Ignore storage cleanup failures.
        }
    }
};
