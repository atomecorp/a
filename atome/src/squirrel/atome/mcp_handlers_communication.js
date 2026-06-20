import {
    ensureBankApi,
    ensureCalendarApi,
    ensureContactsApi,
    ensureMailApi,
    ensureMessagesApi,
    prepareContactsApi
} from './mcp_bridges.js';
import {
    listCommunicationItems,
    readCommunicationItem,
    searchCommunicationItems
} from './mcp_communication.js';

export const createMcpCommunicationHandlers = () => ({
    async 'communication.list'(params = {}) {
        return listCommunicationItems(params);
    },
    async 'communication.search'(params = {}) {
        return searchCommunicationItems(params);
    },
    async 'communication.read'(params = {}) {
        return readCommunicationItem(params);
    },
    async 'communication.reply_draft'(params = {}) {
        const messageId = String(params?.message_id || params?.messageId || params?.id || '').trim();
        const match = messageId.match(/^(mail|messages):(.*)$/i);
        const surface = match ? String(match[1]).toLowerCase() : 'mail';
        const sourceId = match ? String(match[2] || '').trim() : messageId;
        if (!sourceId) {
            throw new Error('communication_message_id_missing');
        }
        if (surface === 'messages') {
            const messages = ensureMessagesApi();
            if (typeof messages.replyDraft !== 'function') {
                throw new Error('Messages replyDraft is not available');
            }
            return messages.replyDraft(sourceId, {
                reply_text: params?.reply_text || params?.replyText || params?.text || ''
            });
        }
        const mail = ensureMailApi();
        return mail.replyDraft(sourceId, {
            reply_text: params?.reply_text || params?.replyText || params?.text || '',
            signature: params?.signature || '',
            to: params?.to
        });
    },
    async 'communication.send'(params = {}) {
        const draftId = String(params?.draft_id || params?.draftId || params?.id || '').trim();
        const match = draftId.match(/^(mail|messages):(.*)$/i);
        const surface = match ? String(match[1]).toLowerCase() : null;
        const sourceId = match ? String(match[2] || '').trim() : draftId;
        if (!sourceId) {
            throw new Error('communication_draft_id_missing');
        }
        if (surface === 'messages') {
            const messages = ensureMessagesApi();
            if (typeof messages.send !== 'function') {
                throw new Error('Messages send is not available');
            }
            return messages.send(sourceId, {
                confirmed: params?.confirmed === true
            });
        }
        const mail = ensureMailApi();
        return mail.send(sourceId, {
            confirmed: params?.confirmed === true
        });
    },
    'mail.list'(params = {}) {
        const mail = ensureMailApi();
        return mail.list(params);
    },
    'mail.read'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.read(messageId);
    },
    'mail.search'(params = {}) {
        const mail = ensureMailApi();
        const query = params?.query || params?.q || '';
        return mail.search(query, params);
    },
    'mail.next_unread'(params = {}) {
        const mail = ensureMailApi();
        return mail.nextUnread(params);
    },
    'mail.summarize'(params = {}) {
        const mail = ensureMailApi();
        return mail.summarize(params);
    },
    'mail.reply_draft'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.replyDraft(messageId, {
            reply_text: params?.reply_text || params?.replyText || params?.text || '',
            signature: params?.signature || '',
            to: params?.to
        });
    },
    'mail.mark_read'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.markRead(messageId, { read: true });
    },
    'mail.mark_unread'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.markUnread(messageId, { read: false });
    },
    'mail.archive'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.archive(messageId, params || {});
    },
    'mail.delete'(params = {}) {
        const mail = ensureMailApi();
        const messageId = params?.message_id || params?.messageId || params?.id;
        return mail.delete(messageId, params || {});
    },
    'mail.send'(params = {}) {
        const mail = ensureMailApi();
        const draftId = params?.draft_id || params?.draftId || params?.id;
        return mail.send(draftId, {
            confirmed: params?.confirmed === true
        });
    },
    async 'contacts.sources'() {
        const contacts = await prepareContactsApi();
        return contacts.sources();
    },
    async 'contacts.list'(params = {}) {
        const contacts = await prepareContactsApi();
        return contacts.list(params || {});
    },
    async 'contacts.search'(params = {}) {
        const contacts = await prepareContactsApi();
        const query = params?.query || params?.q || '';
        return contacts.search(query, params || {});
    },
    async 'contacts.read'(params = {}) {
        const contacts = await prepareContactsApi();
        const contactId = params?.contact_id || params?.contactId || params?.id;
        return contacts.read(contactId);
    },
    async 'contacts.create'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.createLocalContact !== 'function') {
            throw new Error('Contacts create API is not available');
        }
        const contact = params?.contact && typeof params.contact === 'object'
            ? { ...params.contact }
            : { ...params };
        delete contact.contact;
        return contacts.createLocalContact(contact, params || {});
    },
    async 'contacts.update'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.updateLocalContact !== 'function') {
            throw new Error('Contacts update API is not available');
        }
        const contactId = params?.contact_id || params?.contactId || params?.id;
        const changes = params?.changes && typeof params.changes === 'object'
            ? { ...params.changes }
            : params?.contact && typeof params.contact === 'object'
                ? { ...params.contact }
            : { ...params };
        delete changes.contact_id;
        delete changes.contactId;
        delete changes.id;
        delete changes.changes;
        delete changes.contact;
        return contacts.updateLocalContact(contactId, changes, params || {});
    },
    async 'contacts.delete'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.deleteLocalContact !== 'function') {
            throw new Error('Contacts delete API is not available');
        }
        const contactId = params?.contact_id || params?.contactId || params?.id;
        return contacts.deleteLocalContact(contactId, params || {});
    },
    async 'contacts.import_macos'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.importMacosContacts !== 'function') {
            throw new Error('Contacts import API is not available');
        }
        return contacts.importMacosContacts(params || {});
    },
    async 'contacts.import_icloud'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.importIcloudContacts !== 'function') {
            throw new Error('iCloud contacts import API is not available');
        }
        return contacts.importIcloudContacts(params || {});
    },
    async 'contacts.push_icloud'(params = {}) {
        const contacts = ensureContactsApi();
        if (typeof contacts.pushContactToIcloud !== 'function') {
            throw new Error('iCloud contacts write API is not available');
        }
        return contacts.pushContactToIcloud(params || {});
    },
    'calendar.sources'() {
        const calendar = ensureCalendarApi();
        return calendar.sources();
    },
    'calendar.search'(params = {}) {
        const calendar = ensureCalendarApi();
        const query = params?.query || params?.q || '';
        return calendar.search(query, params);
    },
    'calendar.today'(params = {}) {
        const calendar = ensureCalendarApi();
        return calendar.today(params);
    },
    'calendar.next'(params = {}) {
        const calendar = ensureCalendarApi();
        return calendar.next(params);
    },
    'calendar.create'(params = {}) {
        const calendar = ensureCalendarApi();
        const input = params?.event && typeof params.event === 'object'
            ? { ...params.event }
            : { ...params };
        delete input.event;
        return calendar.create(input, params);
    },
    'calendar.update'(params = {}) {
        const calendar = ensureCalendarApi();
        const eventId = params?.event_id || params?.eventId || params?.id;
        const changes = params?.changes && typeof params.changes === 'object'
            ? { ...params.changes }
            : { ...params };
        delete changes.event_id;
        delete changes.eventId;
        delete changes.id;
        delete changes.changes;
        return calendar.update(eventId, changes, params);
    },
    'calendar.delete'(params = {}) {
        const calendar = ensureCalendarApi();
        const eventId = params?.event_id || params?.eventId || params?.id;
        return calendar.delete(eventId, params || {});
    },
    'bank.accounts'() {
        const bank = ensureBankApi();
        return bank.accounts();
    },
    'bank.balance'(params = {}) {
        const bank = ensureBankApi();
        return bank.balance(params);
    },
    'bank.transactions'(params = {}) {
        const bank = ensureBankApi();
        return bank.transactions(params);
    },
    'bank.summary'(params = {}) {
        const bank = ensureBankApi();
        return bank.summary(params);
    },
    'bank.search_transactions'(params = {}) {
        const bank = ensureBankApi();
        const query = params?.query || params?.q || '';
        return bank.searchTransactions(query, params);
    },
    'bank.find_payer'(params = {}) {
        const bank = ensureBankApi();
        const name = params?.name || params?.payer || params?.counterparty || '';
        return bank.findPayer(name, params);
    },
    'bank.spending_by_period'(params = {}) {
        const bank = ensureBankApi();
        return bank.spendingByPeriod(params);
    },
    'bank.top_merchants'(params = {}) {
        const bank = ensureBankApi();
        return bank.topMerchants(params);
    },
    'bank.recurring_payments'(params = {}) {
        const bank = ensureBankApi();
        return bank.recurringPayments(params);
    }
});
