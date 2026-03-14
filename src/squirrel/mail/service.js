import { createMailIndex } from './local_index.js';
import { createMailSyncState } from './sync_state.js';

const toLimit = (value, fallback = 50) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : fallback;
};

const defaultDraftIdFactory = () => `mail_draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const buildReplySubject = (subject = '') => {
    const normalized = String(subject || '').trim();
    if (!normalized) return 'Re:';
    if (/^re:/i.test(normalized)) return normalized;
    return `Re: ${normalized}`;
};

const buildMailSummary = (items = [], stats = {}) => {
    const subjects = items.slice(0, 3).map((entry) => entry.subject).filter(Boolean);
    const senders = Array.from(new Set(
        items.slice(0, 5).map((entry) => entry.from?.name || entry.from?.address).filter(Boolean)
    ));
    const lines = [];
    lines.push(`${stats.unread || 0} unread message(s) out of ${stats.total || 0}.`);
    if (subjects.length) {
        lines.push(`Top subjects: ${subjects.join(' | ')}`);
    }
    if (senders.length) {
        lines.push(`Recent senders: ${senders.join(', ')}`);
    }
    return lines.join(' ');
};

const buildMailReadout = (item = {}, { mode = 'summary' } = {}) => {
    const sender = item?.from?.name || item?.from?.address || 'expediteur inconnu';
    const subject = String(item?.subject || 'sans objet');
    const preview = String(item?.preview || item?.body_text || '').trim();
    if (mode === 'full') {
        return `Mail de ${sender}. Sujet: ${subject}. ${preview}`.trim();
    }
    return `De ${sender}. Sujet: ${subject}. ${preview}`.trim();
};

export const createMailService = ({
    index = createMailIndex(),
    syncState = createMailSyncState(),
    connector = null,
    draftIdFactory = defaultDraftIdFactory,
    now = () => Date.now()
} = {}) => {
    const drafts = new Map();
    let activeConnector = connector;

    const connectorStatus = () => ({
        ok: true,
        configured: !!activeConnector,
        provider: activeConnector?.provider || null,
        contract: activeConnector?.contract || null
    });

    const applySyncBatch = (messages = [], options = {}, meta = {}) => {
        const records = index.upsert(messages);
        const sync = syncState.applyBatch(records, options);
        return {
            ok: true,
            ingested: records.length,
            sync,
            stats: index.stats(),
            ...meta
        };
    };

    const resolveConnectorMessages = (payload = {}) => {
        if (Array.isArray(payload?.messages)) return payload.messages;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload)) return payload;
        return [];
    };

    const runConnectorSync = async (mode = 'delta', options = {}) => {
        if (!activeConnector) {
            return { ok: false, error: 'mail_connector_missing' };
        }
        const methodName = mode === 'initial' ? 'fetchInitialMailbox' : 'fetchDelta';
        if (typeof activeConnector[methodName] !== 'function') {
            return {
                ok: false,
                error: 'mail_connector_method_missing',
                method: methodName,
                provider: activeConnector?.provider || null
            };
        }
        const previousCursor = syncState.status().cursor;
        const connectorResult = await activeConnector[methodName]({
            ...options,
            cursor: options?.cursor !== undefined
                ? options.cursor
                : (mode === 'delta' ? previousCursor : null),
            limit: toLimit(options?.limit, 50)
        });
        if (!connectorResult || connectorResult.ok !== true) {
            return connectorResult || {
                ok: false,
                error: 'mail_connector_sync_failed',
                provider: activeConnector?.provider || null
            };
        }
        const messages = resolveConnectorMessages(connectorResult);
        return applySyncBatch(messages, {
            cursor: connectorResult.cursor ?? previousCursor ?? null,
            source: {
                provider: connectorResult.provider || activeConnector?.provider || 'unknown',
                mailbox: connectorResult.mailbox || options?.mailbox || null,
                mode
            }
        }, {
            provider: connectorResult.provider || activeConnector?.provider || null,
            mailbox: connectorResult.mailbox || options?.mailbox || null,
            connector_cursor: connectorResult.cursor ?? previousCursor ?? null,
            mode
        });
    };

    return {
        index,
        syncState,
        setConnector(nextConnector = null) {
            activeConnector = nextConnector || null;
            return connectorStatus();
        },
        getConnector() {
            return activeConnector;
        },
        connectorStatus() {
            return connectorStatus();
        },
        ingest(messages = []) {
            const records = index.upsert(messages);
            return {
                ok: true,
                ingested: records.length,
                stats: index.stats()
            };
        },
        mailList(options = {}) {
            const items = index.list({
                mailbox: options.mailbox,
                unread_only: options.unread_only === true,
                thread_id: options.thread_id,
                limit: toLimit(options.limit, 50),
                after_id: options.after_id
            });
            return {
                ok: true,
                items,
                stats: index.stats()
            };
        },
        mailRead(messageId) {
            const item = index.read(messageId);
            if (!item) {
                return { ok: false, error: 'mail_not_found', message_id: String(messageId || '') || null };
            }
            return { ok: true, item };
        },
        mailSearch(query, options = {}) {
            const items = index.search(query, {
                mailbox: options.mailbox,
                unread_only: options.unread_only === true,
                limit: toLimit(options.limit, 50)
            });
            return {
                ok: true,
                query: String(query || ''),
                items
            };
        },
        mailNextUnread(options = {}) {
            const item = index.nextUnread({
                mailbox: options.mailbox,
                after_id: options.after_id
            });
            if (!item) {
                return { ok: false, error: 'mail_next_unread_not_found' };
            }
            return { ok: true, item };
        },
        mailSummarize(options = {}) {
            const items = index.list({
                mailbox: options.mailbox,
                unread_only: options.unread_only !== false,
                limit: toLimit(options.limit, 10)
            });
            const stats = index.stats();
            return {
                ok: true,
                summary: buildMailSummary(items, stats),
                items,
                stats
            };
        },
        mailReplyDraft(messageId, {
            reply_text = '',
            signature = '',
            to = null
        } = {}) {
            const source = index.read(messageId);
            if (!source) {
                return { ok: false, error: 'mail_not_found', message_id: String(messageId || '') || null };
            }
            const draft = {
                draft_id: String(draftIdFactory()),
                in_reply_to: source.message_id,
                thread_id: source.thread_id,
                subject: buildReplySubject(source.subject),
                to: Array.isArray(to) && to.length ? to : (source.from ? [source.from] : []),
                body_text: [String(reply_text || '').trim(), String(signature || '').trim()].filter(Boolean).join('\n\n'),
                quoted_message: {
                    subject: source.subject,
                    from: source.from,
                    body_text: source.body_text
                },
                status: 'draft',
                created_at: now()
            };
            drafts.set(draft.draft_id, draft);
            return { ok: true, draft };
        },
        mailGetDraft(draftId) {
            const draft = drafts.get(String(draftId || ''));
            if (!draft) return { ok: false, error: 'mail_draft_not_found' };
            return { ok: true, draft: { ...draft } };
        },
        async mailSend(draftId, {
            confirmed = false
        } = {}) {
            const draft = drafts.get(String(draftId || ''));
            if (!draft) {
                return { ok: false, error: 'mail_draft_not_found' };
            }
            if (confirmed !== true) {
                return {
                    ok: false,
                    error: 'mail_confirmation_required',
                    confirmation_required: true,
                    draft: { ...draft }
                };
            }
            if (!activeConnector || typeof activeConnector.sendDraft !== 'function') {
                draft.status = 'queued_local_only';
                draft.sent_at = now();
                drafts.set(draft.draft_id, draft);
                return {
                    ok: true,
                    queued: true,
                    draft: { ...draft }
                };
            }
            const delivery = await activeConnector.sendDraft({ ...draft }, {
                confirmed: true
            });
            if (!delivery || delivery.ok !== true) {
                draft.status = 'send_failed';
                draft.failed_at = now();
                draft.error = delivery?.error || 'mail_send_failed';
                drafts.set(draft.draft_id, draft);
                return {
                    ok: false,
                    error: draft.error,
                    draft: { ...draft },
                    delivery
                };
            }
            draft.status = 'sent';
            draft.sent_at = now();
            draft.remote_id = delivery?.remote_id || delivery?.message_id || null;
            delete draft.error;
            delete draft.failed_at;
            drafts.set(draft.draft_id, draft);
            return {
                ok: true,
                delivered: true,
                draft: { ...draft },
                delivery
            };
        },
        syncApply(messages = [], options = {}) {
            return applySyncBatch(messages, options);
        },
        async syncInitial(options = {}) {
            return runConnectorSync('initial', options);
        },
        async syncIncremental(options = {}) {
            return runConnectorSync('delta', options);
        },
        async syncPull(options = {}) {
            return runConnectorSync(options?.initial === true ? 'initial' : 'delta', options);
        },
        syncStatus() {
            return {
                ok: true,
                connector: connectorStatus(),
                sync: syncState.status(),
                stats: index.stats()
            };
        },
        mailBuildReadout(messageId, options = {}) {
            const item = index.read(messageId);
            if (!item) {
                return { ok: false, error: 'mail_not_found', message_id: String(messageId || '') || null };
            }
            return {
                ok: true,
                item,
                text: buildMailReadout(item, options)
            };
        }
    };
};
