import { execFileSync } from 'node:child_process';

const readMobileMeAccounts = () => {
    const output = execFileSync('plutil', ['-convert', 'json', '-o', '-', `${process.env.HOME}/Library/Preferences/MobileMeAccounts.plist`], {
        encoding: 'utf8'
    });
    return JSON.parse(output);
};

const toArray = (value) => Array.isArray(value) ? value : [];

const normalizeService = (service = {}) => ({
    name: String(service.Name || '').trim(),
    service_id: String(service.ServiceID || '').trim(),
    enabled: service.Enabled !== false,
    url: String(service.url || '').trim() || null,
    protocol: String(service.protocol || '').trim() || null,
    email: String(service.EmailAddress || '').trim() || null,
    username: String(service.Username || '').trim() || null,
    imap_hostname: String(service.imapHostname || '').trim() || null,
    imap_port: Number(service.imapPort || 0) || null,
    smtp_hostname: String(service.smtpHostname || '').trim() || null,
    smtp_port: Number(service.smtpPort || 0) || null
});

export const discoverIcloudAccounts = () => {
    const parsed = readMobileMeAccounts();
    const accounts = toArray(parsed?.Accounts).map((account = {}) => {
        const services = toArray(account.Services).map(normalizeService);
        const mail = services.find((entry) => entry.service_id === 'com.apple.Dataclass.Mail' || entry.name === 'MAIL_AND_NOTES') || null;
        const calendar = services.find((entry) => entry.service_id === 'com.apple.Dataclass.Calendars' || entry.name === 'CALENDAR') || null;
        return {
            account_id: String(account.AccountID || '').trim() || null,
            description: String(account.AccountDescription || '').trim() || null,
            display_name: String(account.DisplayName || '').trim() || null,
            services,
            mail,
            calendar
        };
    });
    return accounts.filter((entry) => entry.account_id || entry.description);
};

export const selectIcloudAccount = ({
    accountHint = null
} = {}) => {
    const accounts = discoverIcloudAccounts();
    const hint = String(accountHint || '').trim().toLowerCase();
    if (hint) {
        const matched = accounts.find((entry) => {
            return [entry.account_id, entry.description, entry.mail?.email]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase() === hint);
        });
        if (matched) return matched;
    }
    return accounts.find((entry) => entry.mail || entry.calendar) || accounts[0] || null;
};
