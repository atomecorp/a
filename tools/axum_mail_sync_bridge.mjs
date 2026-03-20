import { createIcloudMailConnector } from '../src/squirrel/mail/icloud_connector.js';
import { createMailService } from '../src/squirrel/mail/service.js';
import { resolveMailCredentials, readEnv } from './icloud_live_credentials.mjs';

const readPayload = () => {
    const raw = String(process.argv[2] || '').trim();
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
};

const toLimit = (value, fallback = 20) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : fallback;
};

const payload = readPayload();

try {
    const credentials = resolveMailCredentials();
    const mailbox = String(payload.mailbox || readEnv('MAIL_MAILBOX', 'MAILBOX', 'ICLOUD_MAILBOX') || 'INBOX').trim() || 'INBOX';
    const connector = createIcloudMailConnector({
        provider: credentials.provider,
        auth: {
            email: credentials.email,
            username: credentials.username || credentials.email,
            password: credentials.password || credentials.appPassword,
            app_password: credentials.password || credentials.appPassword
        },
        imap: credentials.imap || {},
        smtp: credentials.smtp || {},
        mailbox
    });

    const service = createMailService();
    service.setConnector(connector);
    if (payload.action === 'send') {
        const draft = payload?.draft && typeof payload.draft === 'object' ? payload.draft : null;
        const delivery = await connector.sendDraft(draft, {
            confirmed: payload?.confirmed !== false
        });
        if (!delivery || delivery.ok !== true) {
            console.log(JSON.stringify({
                ok: false,
                error: delivery?.error || 'mail_send_failed',
                message: delivery?.message || null
            }));
            process.exit(1);
        }
        console.log(JSON.stringify({
            ok: true,
            sent: true,
            provider: connector.provider || credentials.provider || 'remote_imap_smtp',
            email: credentials.email || null,
            draft_id: draft?.draft_id || null,
            remote_id: delivery?.remote_id || delivery?.message_id || null,
            message_id: delivery?.message_id || delivery?.remote_id || null,
            accepted_at: delivery?.accepted_at || Date.now()
        }));
    } else {
        const shouldRunInitial = payload.initial === true;
        const syncResult = shouldRunInitial
            ? await service.syncInitial({
                mailbox,
                limit: toLimit(payload.limit, 20)
            })
            : await service.syncPull({
                mailbox,
                limit: toLimit(payload.limit, 20)
            });

        if (!syncResult || syncResult.ok !== true) {
            console.log(JSON.stringify({
                ok: false,
                error: syncResult?.error || 'mail_sync_failed',
                message: syncResult?.message || null
            }));
            process.exit(1);
        }

        const listed = service.mailList({
            mailbox: String(payload.mailbox || '').trim().toLowerCase() || null,
            unread_only: payload.unread_only === true,
            limit: toLimit(payload.limit, 20)
        });

        console.log(JSON.stringify({
            ok: true,
            provider: connector.provider || credentials.provider || 'remote_imap_smtp',
            mailbox: String(payload.mailbox || 'inbox').trim().toLowerCase() || 'inbox',
            mode: shouldRunInitial ? 'initial' : 'delta',
            cursor: service.syncStatus?.().sync?.cursor || null,
            items: listed?.items || [],
            stats: listed?.stats || null,
            email: credentials.email || null,
            credentials_mode: credentials.mode || null
        }));
    }
} catch (error) {
    const rawMessage = error?.message || String(error);
    const normalizedError = /find-internet-password|keychain/i.test(rawMessage)
        ? 'mail_credentials_missing'
        : rawMessage;
    console.log(JSON.stringify({
        ok: false,
        error: normalizedError,
        message: normalizedError === 'mail_credentials_missing'
            ? 'No usable mail credential was found in the environment or macOS keychain.'
            : rawMessage
    }));
    process.exit(1);
}
