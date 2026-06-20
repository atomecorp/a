export const setupDefaultToolsRuntimeBridgeFixture = async () => {
    const registeredTools = new Map();
    const runtimeCalls = [];
    const contactCounters = { ready: 0, openPanel: 0, importMacos: 0, importIcloud: 0, pushIcloud: 0, create: 0, update: 0, delete: 0 };
    const contactsReadyOptions = [];
    
    globalThis.AtomeAI = {
        registerTool(definition = {}) {
            registeredTools.set(definition.name, definition);
        }
    };
    
    globalThis.atome = {
        calendar: {
            sources() {
                return {
                    ok: true,
                    items: [{ source_id: 'tauri_caldav_primary', role: 'primary', writable: true }]
                };
            },
            search(query) {
                return {
                    ok: true,
                    query,
                    items: [{ id: 'calendar_ai_1', title: 'Calendar AI event' }]
                };
            },
            today() {
                return {
                    ok: true,
                    items: [{ id: 'calendar_ai_1', title: 'Calendar AI event' }]
                };
            },
            next() {
                return {
                    ok: true,
                    items: [{ id: 'calendar_ai_2', title: 'Calendar next AI event' }]
                };
            },
            create(input = {}) {
                return {
                    ok: true,
                    event: {
                        id: 'calendar_ai_created_1',
                        title: input.title || ''
                    }
                };
            },
            update(eventId, changes = {}) {
                return {
                    ok: true,
                    event: {
                        id: eventId,
                        title: changes.title || ''
                    }
                };
            },
            delete(eventId) {
                return {
                    ok: true,
                    deleted: true,
                    event_id: eventId
                };
            }
        },
        mail: {
            async ensureReady() {
                return { ok: true };
            },
            list() {
                return { ok: true, items: [{ message_id: 'mail_ai_1', mailbox: 'inbox', unread: true }] };
            },
            read(messageId) {
                return { ok: true, item: { message_id: messageId, mailbox: 'inbox' } };
            },
            search(query) {
                return { ok: true, query, items: [{ message_id: 'mail_ai_1' }] };
            },
            nextUnread() {
                return { ok: true, item: { message_id: 'mail_ai_1' } };
            },
            summarize() {
                return { ok: true, summary: '1 unread message.' };
            },
            replyDraft(messageId, options = {}) {
                return {
                    ok: true,
                    draft: {
                        draft_id: 'mail_draft_ai_1',
                        in_reply_to: messageId,
                        body_text: options.reply_text || ''
                    }
                };
            },
            send(draftId, options = {}) {
                return options.confirmed === true
                    ? { ok: true, draft: { draft_id: draftId, status: 'queued_local_only' } }
                    : { ok: false, confirmation_required: true };
            },
            markRead(messageId) {
                return { ok: true, item: { message_id: messageId, unread: false } };
            },
            markUnread(messageId) {
                return { ok: true, item: { message_id: messageId, unread: true } };
            },
            archive(messageId) {
                return { ok: true, item: { message_id: messageId, mailbox: 'archive' } };
            },
            delete(messageId) {
                return { ok: true, item: { message_id: messageId, mailbox: 'trash' } };
            }
        },
        contacts: {
            async ensureReady(options = {}) {
                contactCounters.ready += 1;
                contactsReadyOptions.push(options);
                return { ok: true };
            },
            sources() {
                return {
                    ok: true,
                    items: [{ source_id: 'macos_contacts', provider: 'macos_contacts', writable: false }]
                };
            },
            list() {
                return {
                    ok: true,
                    items: [{ source_contact_id: 'mac_contact_ai_1', name: 'Chloe Bernard', email: 'chloe@example.test' }]
                };
            },
            search(query) {
                return {
                    ok: true,
                    query,
                    items: [{ source_contact_id: 'mac_contact_ai_1', name: 'Chloe Bernard', email: 'chloe@example.test' }]
                };
            },
            read(contactId) {
                return {
                    ok: true,
                    contact: { source_contact_id: contactId, name: 'Chloe Bernard', email: 'chloe@example.test' }
                };
            },
            async createLocalContact(contact = {}) {
                contactCounters.create += 1;
                return {
                    ok: true,
                    created: true,
                    contact: {
                        source_contact_id: 'local_contact_ai_created_1',
                        source_provider: 'eve_contacts_local',
                        ...contact
                    }
                };
            },
            async updateLocalContact(contactId, changes = {}) {
                contactCounters.update += 1;
                return {
                    ok: true,
                    updated: true,
                    contact: {
                        source_contact_id: contactId,
                        source_provider: 'eve_contacts_local',
                        ...changes
                    }
                };
            },
            async deleteLocalContact(contactId) {
                contactCounters.delete += 1;
                return {
                    ok: true,
                    deleted: true,
                    contact_id: contactId
                };
            },
            async openPanel() {
                contactCounters.openPanel += 1;
                return { ok: true };
            },
            async importMacosContacts() {
                contactCounters.importMacos += 1;
                return { ok: true, imported: 1, items: [{ source_contact_id: 'mac_contact_ai_1', source_provider: 'eve_contacts_local' }] };
            },
            async importIcloudContacts() {
                contactCounters.importIcloud += 1;
                return { ok: true, imported: 1, items: [{ source_contact_id: 'icloud_contact_ai_1', source_provider: 'eve_contacts_local' }] };
            },
            async pushContactToIcloud() {
                contactCounters.pushIcloud += 1;
                return { ok: true, created: true, contact: { source_contact_id: 'icloud_contact_ai_2', name: 'Chloe Bernard' } };
            }
        },
        tools: {
            v2Runtime: {
                async invokeById(payload = {}) {
                    runtimeCalls.push(payload);
                    return {
                        ok: true,
                        tool_id: payload.tool_id,
                        action: payload.action,
                        input: payload.input
                    };
                }
            }
        }
    };
    
    await import('./default_tools.js');
    const { createGlobalBankApi } = await import('../bank/bootstrap.js');
    const bankApi = createGlobalBankApi({ env: globalThis });
    bankApi.ingestAccounts([
        {
            account_id: 'bank_ai_1',
            label: 'Compte courant',
            currency: 'EUR',
            balance: 900
        }
    ]);
    bankApi.ingestTransactions([
        {
            transaction_id: 'bank_ai_tx_1',
            account_id: 'bank_ai_1',
            amount: 400,
            payer: 'Romeo',
            label: 'Virement Romeo',
            booked_at: '2026-03-12T09:00:00Z'
        },
        {
            transaction_id: 'bank_ai_tx_2',
            account_id: 'bank_ai_1',
            amount: -24.9,
            merchant: 'Netflix',
            label: 'Netflix',
            booked_at: '2026-03-13T09:00:00Z'
        },
        {
            transaction_id: 'bank_ai_tx_3',
            account_id: 'bank_ai_1',
            amount: -9.99,
            merchant: 'Spotify',
            label: 'Spotify',
            booked_at: '2026-02-13T09:00:00Z'
        },
        {
            transaction_id: 'bank_ai_tx_4',
            account_id: 'bank_ai_1',
            amount: -9.99,
            merchant: 'Spotify',
            label: 'Spotify',
            booked_at: '2026-03-13T09:00:00Z'
        }
    ]);
    return { registeredTools, runtimeCalls, contactCounters, contactsReadyOptions };
};
