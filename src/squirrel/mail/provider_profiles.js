const DOMAIN_DEFAULTS = Object.freeze({
    'atome.one': Object.freeze({
        provider: 'custom_imap_smtp',
        imap: Object.freeze({
            host: 'rousse.o2switch.net',
            port: 993,
            security: 'tls'
        }),
        smtp: Object.freeze({
            host: 'rousse.o2switch.net',
            port: 587,
            security: 'starttls'
        })
    })
});

const normalizeDomain = (value = '') => {
    const email = String(value || '').trim().toLowerCase();
    const atIndex = email.lastIndexOf('@');
    if (atIndex < 0) return '';
    return email.slice(atIndex + 1).trim();
};

export const resolveMailProviderDefaults = ({ email = '' } = {}) => {
    const domain = normalizeDomain(email);
    if (!domain) return null;
    return DOMAIN_DEFAULTS[domain] || null;
};
