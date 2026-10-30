import { createNodeSmtpClient } from '../atome/src/squirrel/mail/node_protocol_clients.js';

// The server's own sender (noreply@atome.one), an authenticated SMTP account of the
// domain's mail host: SPF and DKIM are the host's. Configured by the environment only;
// a server without it sends nothing and says so (`system_mail_unconfigured`).
export function readSystemMailConfig(env = process.env) {
    const address = String(env.ATOME_MAIL_FROM || '').trim();
    const host = String(env.ATOME_MAIL_SMTP_HOST || '').trim();
    const password = String(env.ATOME_MAIL_SMTP_PASSWORD || '');
    if (!address || !host || !password) return null;
    const security = String(env.ATOME_MAIL_SMTP_SECURITY || 'tls').trim().toLowerCase();
    if (!['tls', 'starttls'].includes(security)) throw new Error('system_mail_security_invalid');
    return { address, auth: { username: String(env.ATOME_MAIL_SMTP_USER || address).trim(), password },
        smtp: { host, port: Number(env.ATOME_MAIL_SMTP_PORT || (security === 'tls' ? 465 : 587)), security } };
}

// `config`: read once at start; `clientFactory`: the internal SMTP client (a probe passes its own transport).
export function createSystemMailer({ config = readSystemMailConfig(), clientFactory = createNodeSmtpClient } = {}) {
    async function send({ to, fromName, subject, text }) {
        if (!config) throw new Error('system_mail_unconfigured');
        const client = await clientFactory({ smtp: config.smtp, auth: config.auth });
        await client.connect();
        try {
            return await client.sendDraft({ auth: config.auth, draft: { from: { name: fromName, address: config.address },
                to: [{ address: to }], subject, body_text: text } });
        } finally {
            await client.close();
        }
    }
    return { send, configured: () => !!config };
}
