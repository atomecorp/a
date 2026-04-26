import { createIcloudMailConnector } from '../src/squirrel/mail/icloud_connector.js';
import { createMailService } from '../src/squirrel/mail/service.js';
import { resolveMailCredentials } from './icloud_live_credentials.mjs';

const readPayload = () => {
    const raw = String(process.argv[2] || '').trim();
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return {};
    }
};

const toLimit = (value, secondary = 20) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : secondary;
};

const payload = readPayload();

try {
    const credentials = resolveMailCredentials(payload.credentials || null);
    const mailbox = String(payload.mailbox || credentials?.mailbox || 'INBOX').trim() || 'INBOX';
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
    } else if (payload.action === 'mark_read') {
        const message = payload?.message && typeof payload.message === 'object' ? payload.message : null;
        const result = typeof connector.markRead === 'function'
            ? await connector.markRead(message, {
                read: payload?.read !== false
            })
            : { ok: false, error: 'mail_mark_read_not_supported' };
        if (!result || result.ok !== true) {
            console.log(JSON.stringify({
                ok: false,
                error: result?.error || 'mail_mark_read_failed',
                message: result?.message || null
            }));
            process.exit(1);
        }
        console.log(JSON.stringify({
            ok: true,
            read: payload?.read !== false,
            provider: connector.provider || credentials.provider || 'remote_imap_smtp',
            email: credentials.email || null,
            message_id: message?.message_id || null,
            uid: message?.meta?.uid || null
        }));
    } else if (payload.action === 'archive' || payload.action === 'delete') {
        const message = payload?.message && typeof payload.message === 'object' ? payload.message : null;
        const result = payload.action === 'archive'
            ? (typeof connector.archiveMessage === 'function'
                ? await connector.archiveMessage(message, {
                    remote_mailbox: payload?.remote_mailbox || 'Archive'
                })
                : (typeof connector.moveMessage === 'function'
                    ? await connector.moveMessage(message, {
                        destination_local_mailbox: 'archive',
                        destination_remote_mailbox: payload?.remote_mailbox || 'Archive'
                    })
                    : { ok: false, error: 'mail_archive_not_supported' }))
            : (typeof connector.deleteMessage === 'function'
                ? await connector.deleteMessage(message, {
                    remote_mailbox: payload?.remote_mailbox || 'Trash'
                })
                : (typeof connector.moveMessage === 'function'
                    ? await connector.moveMessage(message, {
                        destination_local_mailbox: 'trash',
                        destination_remote_mailbox: payload?.remote_mailbox || 'Trash'
                    })
                    : { ok: false, error: 'mail_delete_not_supported' }));
        if (!result || result.ok !== true) {
            console.log(JSON.stringify({
                ok: false,
                error: result?.error || `mail_${payload.action}_failed`,
                message: result?.message || null
            }));
            process.exit(1);
        }
        console.log(JSON.stringify({
            ok: true,
            ...(payload.action === 'archive' ? { archived: true } : { deleted: true }),
            provider: connector.provider || credentials.provider || 'remote_imap_smtp',
            email: credentials.email || null,
            message_id: message?.message_id || null,
            uid: message?.meta?.uid || null
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
    const missingFields = rawMessage.startsWith('mail_credentials_missing:')
        ? rawMessage.slice('mail_credentials_missing:'.length).split(',').map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    const normalizedError = rawMessage === 'mail_credentials_missing' || rawMessage.startsWith('mail_credentials_missing:')
        ? 'mail_credentials_missing'
        : rawMessage;
    console.log(JSON.stringify({
        ok: false,
        error: normalizedError,
        ...(missingFields.length > 0 ? { missing_fields: missingFields } : {}),
        message: normalizedError === 'mail_credentials_missing'
            ? (missingFields.length > 0
                ? `Missing mail settings: ${missingFields.join(', ')}`
                : 'No usable mail credential was provided by the user profile.')
            : rawMessage
    }));
    process.exit(1);
}
