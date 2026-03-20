import assert from 'node:assert/strict';

const registeredTools = new Map();
const runtimeCalls = [];
let contactsReadyCalls = 0;
const contactsReadyOptions = [];
let contactsOpenPanelCalls = 0;
let contactsImportCalls = 0;
let contactsIcloudImportCalls = 0;
let contactsIcloudPushCalls = 0;

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
        }
    },
    contacts: {
        async ensureReady(options = {}) {
            contactsReadyCalls += 1;
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
        async openPanel() {
            contactsOpenPanelCalls += 1;
            return { ok: true };
        },
        async importMacosContacts() {
            contactsImportCalls += 1;
            return { ok: true, imported: 1, items: [{ source_contact_id: 'mac_contact_ai_1', source_provider: 'eve_contacts_local' }] };
        },
        async importIcloudContacts() {
            contactsIcloudImportCalls += 1;
            return { ok: true, imported: 1, items: [{ source_contact_id: 'icloud_contact_ai_1', source_provider: 'eve_contacts_local' }] };
        },
        async pushContactToIcloud() {
            contactsIcloudPushCalls += 1;
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
const { createGlobalMailApi } = await import('../mail/bootstrap.js');
const mailApi = createGlobalMailApi({ env: globalThis });
mailApi.ingest([
    {
        message_id: 'mail_ai_1',
        mailbox: 'inbox',
        subject: 'Hello AI',
        body_text: 'Premier message pour le bridge mail.',
        unread: true,
        from: { address: 'alice@example.test' },
        received_at: '2026-03-13T10:00:00Z'
    }
]);
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

const moveTool = registeredTools.get('eve.mtrack.clip.move');
const cropTool = registeredTools.get('eve.mtrack.clip.crop');
const calendarListTool = registeredTools.get('calendar.list_events');
const calendarGetTool = registeredTools.get('calendar.get_event');
const calendarCreateTool = registeredTools.get('calendar.create_event');
const calendarUpdateTool = registeredTools.get('calendar.update_event');
const calendarDeleteTool = registeredTools.get('calendar.delete_event');
const calendarEnsureTool = registeredTools.get('calendar.ensure_calendar');
const calendarSourcesTool = registeredTools.get('calendar.sources');
const calendarSearchTool = registeredTools.get('calendar.search');
const calendarTodayTool = registeredTools.get('calendar.today');
const calendarNextTool = registeredTools.get('calendar.next');
const calendarCreateUnifiedTool = registeredTools.get('calendar.create');
const calendarUpdateUnifiedTool = registeredTools.get('calendar.update');
const bankAccountsTool = registeredTools.get('bank.accounts');
const bankBalanceTool = registeredTools.get('bank.balance');
const bankTransactionsTool = registeredTools.get('bank.transactions');
const bankSummaryTool = registeredTools.get('bank.summary');
const bankSearchTransactionsTool = registeredTools.get('bank.search_transactions');
const bankFindPayerTool = registeredTools.get('bank.find_payer');
const bankSpendingByPeriodTool = registeredTools.get('bank.spending_by_period');
const bankTopMerchantsTool = registeredTools.get('bank.top_merchants');
const bankRecurringPaymentsTool = registeredTools.get('bank.recurring_payments');
const mailListTool = registeredTools.get('mail.list');
const mailReadTool = registeredTools.get('mail.read');
const mailSearchTool = registeredTools.get('mail.search');
const mailNextUnreadTool = registeredTools.get('mail.next_unread');
const mailSummarizeTool = registeredTools.get('mail.summarize');
const mailReplyDraftTool = registeredTools.get('mail.reply_draft');
const mailSendTool = registeredTools.get('mail.send');
const contactsSourcesTool = registeredTools.get('contacts.sources');
const contactsListTool = registeredTools.get('contacts.list');
const contactsSearchTool = registeredTools.get('contacts.search');
const contactsReadTool = registeredTools.get('contacts.read');
const contactsImportTool = registeredTools.get('contacts.import_macos');
const contactsImportIcloudTool = registeredTools.get('contacts.import_icloud');
const contactsPushIcloudTool = registeredTools.get('contacts.push_icloud');
const contactsOpenPanelTool = registeredTools.get('contacts.open_panel');

assert.ok(moveTool, 'eve.mtrack.clip.move should be registered');
assert.ok(cropTool, 'eve.mtrack.clip.crop should be registered');
assert.ok(calendarListTool, 'calendar.list_events should be registered');
assert.ok(calendarGetTool, 'calendar.get_event should be registered');
assert.ok(calendarCreateTool, 'calendar.create_event should be registered');
assert.ok(calendarUpdateTool, 'calendar.update_event should be registered');
assert.ok(calendarDeleteTool, 'calendar.delete_event should be registered');
assert.ok(calendarEnsureTool, 'calendar.ensure_calendar should be registered');
assert.ok(calendarSourcesTool, 'calendar.sources should be registered');
assert.ok(calendarSearchTool, 'calendar.search should be registered');
assert.ok(calendarTodayTool, 'calendar.today should be registered');
assert.ok(calendarNextTool, 'calendar.next should be registered');
assert.ok(calendarCreateUnifiedTool, 'calendar.create should be registered');
assert.ok(calendarUpdateUnifiedTool, 'calendar.update should be registered');
assert.ok(bankAccountsTool, 'bank.accounts should be registered');
assert.ok(bankBalanceTool, 'bank.balance should be registered');
assert.ok(bankTransactionsTool, 'bank.transactions should be registered');
assert.ok(bankSummaryTool, 'bank.summary should be registered');
assert.ok(bankSearchTransactionsTool, 'bank.search_transactions should be registered');
assert.ok(bankFindPayerTool, 'bank.find_payer should be registered');
assert.ok(bankSpendingByPeriodTool, 'bank.spending_by_period should be registered');
assert.ok(bankTopMerchantsTool, 'bank.top_merchants should be registered');
assert.ok(bankRecurringPaymentsTool, 'bank.recurring_payments should be registered');
assert.ok(mailListTool, 'mail.list should be registered');
assert.ok(mailReadTool, 'mail.read should be registered');
assert.ok(mailSearchTool, 'mail.search should be registered');
assert.ok(mailNextUnreadTool, 'mail.next_unread should be registered');
assert.ok(mailSummarizeTool, 'mail.summarize should be registered');
assert.ok(mailReplyDraftTool, 'mail.reply_draft should be registered');
assert.ok(mailSendTool, 'mail.send should be registered');
assert.ok(contactsSourcesTool, 'contacts.sources should be registered');
assert.ok(contactsListTool, 'contacts.list should be registered');
assert.ok(contactsSearchTool, 'contacts.search should be registered');
assert.ok(contactsReadTool, 'contacts.read should be registered');
assert.ok(contactsImportTool, 'contacts.import_macos should be registered');
assert.ok(contactsImportIcloudTool, 'contacts.import_icloud should be registered');
assert.ok(contactsPushIcloudTool, 'contacts.push_icloud should be registered');
assert.ok(contactsOpenPanelTool, 'contacts.open_panel should be registered');

const movePayload = { clip_id: 'clip_1', delta_seconds: 1.5 };
const moveContext = { trace_id: 'trace_move_1', intent_id: 'intent_move_1', idempotency_key: 'move_key_1' };
const moveResult = await moveTool.handler({ params: movePayload, context: moveContext });
assert.equal(moveResult?.ok, true, 'move tool should delegate to runtime');
assert.equal(runtimeCalls[0]?.tool_id, 'ui.move', 'move tool should target the canonical runtime tool id');
assert.equal(runtimeCalls[0]?.action, 'on_apply', 'move tool should keep the apply action');
assert.deepEqual(runtimeCalls[0]?.input, movePayload, 'move tool should forward params as runtime input');
assert.equal(runtimeCalls[0]?.source?.type, 'ai', 'move tool should stamp AI source');
assert.equal(runtimeCalls[0]?.meta?.trace_id, 'trace_move_1', 'move tool should forward trace_id to runtime');
assert.equal(runtimeCalls[0]?.meta?.intent_id, 'intent_move_1', 'move tool should forward intent_id to runtime');
assert.equal(runtimeCalls[0]?.meta?.idempotency_key, 'move_key_1', 'move tool should forward idempotency key to runtime');

const cropPayload = { clip_id: 'clip_2', in_delta_seconds: 0.25 };
const cropResult = await cropTool.handler({ params: cropPayload, context: { trace_id: 'trace_crop_1' } });
assert.equal(cropResult?.ok, true, 'crop tool should delegate to runtime');
assert.equal(runtimeCalls[1]?.tool_id, 'ui.crop', 'crop tool should target the canonical runtime tool id');
assert.equal(runtimeCalls[1]?.action, 'on_apply', 'crop tool should keep the apply action');
assert.deepEqual(runtimeCalls[1]?.input, cropPayload, 'crop tool should forward params as runtime input');
assert.equal(runtimeCalls[1]?.source?.tool, 'eve.mtrack.clip.crop', 'crop tool should preserve the AI source tool name');
assert.equal(runtimeCalls[1]?.source?.type, 'ai', 'crop tool should stamp AI source');

await calendarListTool.handler({ params: { projectId: 'project_runtime' }, context: { trace_id: 'trace_calendar_list_1' } });
assert.equal(runtimeCalls[2]?.tool_id, 'calendar.list_events', 'calendar.list_events should route through runtime');
assert.deepEqual(runtimeCalls[2]?.input, { projectId: 'project_runtime' }, 'calendar.list_events should forward the list payload');
assert.equal(runtimeCalls[2]?.meta?.trace_id, 'trace_calendar_list_1', 'calendar.list_events should forward trace_id');

await calendarGetTool.handler({ params: { eventId: 'event_runtime_1' }, context: { trace_id: 'trace_calendar_get_1' } });
assert.equal(runtimeCalls[3]?.tool_id, 'calendar.get_event', 'calendar.get_event should route through runtime');
assert.deepEqual(runtimeCalls[3]?.input, { eventId: 'event_runtime_1' }, 'calendar.get_event should forward eventId');

await calendarCreateTool.handler({
    params: {
        event: { title: 'Runtime event', start: '2026-03-12T10:00:00.000Z' },
        projectId: 'project_runtime'
    },
    context: { trace_id: 'trace_calendar_create_1' }
});
assert.equal(runtimeCalls[4]?.tool_id, 'calendar.create_event', 'calendar.create_event should route through runtime');
assert.deepEqual(
    runtimeCalls[4]?.input,
    { title: 'Runtime event', start: '2026-03-12T10:00:00.000Z', projectId: 'project_runtime' },
    'calendar.create_event should normalize event payloads before routing to runtime'
);

await calendarUpdateTool.handler({
    params: { eventId: 'event_runtime_1', changes: { title: 'Updated runtime event' } },
    context: { trace_id: 'trace_calendar_update_1' }
});
assert.equal(runtimeCalls[5]?.tool_id, 'calendar.update_event', 'calendar.update_event should route through runtime');
assert.deepEqual(
    runtimeCalls[5]?.input,
    { eventId: 'event_runtime_1', title: 'Updated runtime event' },
    'calendar.update_event should flatten changes into runtime input'
);

await calendarDeleteTool.handler({ params: { eventId: 'event_runtime_1' }, context: { trace_id: 'trace_calendar_delete_1' } });
assert.equal(runtimeCalls[6]?.tool_id, 'calendar.delete_event', 'calendar.delete_event should route through runtime');
assert.deepEqual(runtimeCalls[6]?.input, { eventId: 'event_runtime_1' }, 'calendar.delete_event should forward eventId');

await calendarEnsureTool.handler({ params: { calendarId: 'calendar_runtime_1' }, context: { trace_id: 'trace_calendar_ensure_1' } });
assert.equal(runtimeCalls[7]?.tool_id, 'calendar.ensure_calendar', 'calendar.ensure_calendar should route through runtime');
assert.deepEqual(runtimeCalls[7]?.input, { calendarId: 'calendar_runtime_1' }, 'calendar.ensure_calendar should forward calendarId');

const calendarSources = await calendarSourcesTool.handler({ params: {} });
assert.equal(calendarSources?.ok, true, 'calendar.sources should bridge to the unified calendar service');
assert.equal(calendarSources?.items?.[0]?.source_id, 'tauri_caldav_primary', 'calendar.sources should expose source metadata');

const calendarSearch = await calendarSearchTool.handler({ params: { query: 'calendar' } });
assert.equal(calendarSearch?.ok, true, 'calendar.search should bridge to the unified calendar service');
assert.equal(calendarSearch?.items?.[0]?.id, 'calendar_ai_1', 'calendar.search should return unified calendar items');

const calendarToday = await calendarTodayTool.handler({ params: {} });
assert.equal(calendarToday?.ok, true, 'calendar.today should bridge to the unified calendar service');
assert.equal(calendarToday?.items?.[0]?.id, 'calendar_ai_1', 'calendar.today should expose today unified calendar items');

const calendarNext = await calendarNextTool.handler({ params: {} });
assert.equal(calendarNext?.ok, true, 'calendar.next should bridge to the unified calendar service');
assert.equal(calendarNext?.items?.[0]?.id, 'calendar_ai_2', 'calendar.next should expose next unified calendar items');

const calendarUnifiedCreate = await calendarCreateUnifiedTool.handler({
    params: {
        title: 'Unified calendar create',
        start: '2026-03-13T09:00:00.000Z',
        end: '2026-03-13T10:00:00.000Z'
    }
});
assert.equal(calendarUnifiedCreate?.ok, true, 'calendar.create should bridge to the unified calendar service');
assert.equal(calendarUnifiedCreate?.event?.id, 'calendar_ai_created_1', 'calendar.create should expose the created unified calendar event');

const calendarUnifiedUpdate = await calendarUpdateUnifiedTool.handler({
    params: {
        event_id: 'calendar_ai_created_1',
        changes: { title: 'Unified calendar updated' }
    }
});
assert.equal(calendarUnifiedUpdate?.ok, true, 'calendar.update should bridge to the unified calendar service');
assert.equal(calendarUnifiedUpdate?.event?.title, 'Unified calendar updated', 'calendar.update should expose the updated unified calendar event');

const bankAccounts = await bankAccountsTool.handler({ params: {} });
assert.equal(bankAccounts?.items?.[0]?.account_id, 'bank_ai_1', 'bank.accounts should bridge to the local bank service');

const bankBalance = await bankBalanceTool.handler({ params: { account_id: 'bank_ai_1' } });
assert.equal(bankBalance?.account?.balance, 900, 'bank.balance should expose normalized balances');

const bankTransactions = await bankTransactionsTool.handler({ params: { period: 'current_month' } });
assert.equal(bankTransactions?.items?.length >= 3, true, 'bank.transactions should expose normalized transactions');

const bankSummary = await bankSummaryTool.handler({ params: { period: 'current_month' } });
assert.equal(bankSummary?.ok, true, 'bank.summary should expose analytical summaries');

const bankSearch = await bankSearchTransactionsTool.handler({ params: { query: 'netflix' } });
assert.equal(bankSearch?.items?.[0]?.transaction_id, 'bank_ai_tx_2', 'bank.search_transactions should query the local bank analytics index');

const bankPayer = await bankFindPayerTool.handler({ params: { name: 'Romeo', period: 'current_month' } });
assert.equal(bankPayer?.paid, true, 'bank.find_payer should expose payer detection');

const bankSpending = await bankSpendingByPeriodTool.handler({ params: { period: 'current_month' } });
assert.equal(bankSpending?.total_spent > 0, true, 'bank.spending_by_period should aggregate debit spending');

const bankTopMerchants = await bankTopMerchantsTool.handler({ params: { period: 'current_month' } });
assert.equal(bankTopMerchants?.items?.[0]?.merchant, 'netflix', 'bank.top_merchants should expose merchant aggregation');

const bankRecurring = await bankRecurringPaymentsTool.handler({ params: {} });
assert.equal(bankRecurring?.items?.[0]?.merchant, 'Spotify', 'bank.recurring_payments should expose recurring payment detection');

const mailList = await mailListTool.handler({ params: { mailbox: 'inbox' } });
assert.equal(mailList?.ok, true, 'mail.list should bridge to the local mail service');
assert.equal(mailList?.items?.[0]?.message_id, 'mail_ai_1', 'mail.list should expose indexed mail items');

const mailRead = await mailReadTool.handler({ params: { message_id: 'mail_ai_1' } });
assert.equal(mailRead?.item?.message_id, 'mail_ai_1', 'mail.read should read one indexed mail item');

const mailSearch = await mailSearchTool.handler({ params: { query: 'premier' } });
assert.equal(mailSearch?.items?.[0]?.message_id, 'mail_ai_1', 'mail.search should query the local mail index');

const mailNextUnread = await mailNextUnreadTool.handler({ params: { mailbox: 'inbox' } });
assert.equal(mailNextUnread?.item?.message_id, 'mail_ai_1', 'mail.next_unread should return the local unread message');

const mailSummary = await mailSummarizeTool.handler({ params: { mailbox: 'inbox' } });
assert.equal(mailSummary?.ok, true, 'mail.summarize should summarize indexed mail');

const mailDraft = await mailReplyDraftTool.handler({
    params: {
        message_id: 'mail_ai_1',
        reply_text: 'Je reviens demain.'
    }
});
assert.equal(mailDraft?.ok, true, 'mail.reply_draft should create a local reply draft');

const mailSendGate = await mailSendTool.handler({
    params: {
        draft_id: mailDraft?.draft?.draft_id
    }
});
assert.equal(mailSendGate?.confirmation_required, true, 'mail.send should keep the confirmation gate in the default tool bridge');

const contactsSources = await contactsSourcesTool.handler({ params: {} });
assert.equal(contactsSources?.ok, true, 'contacts.sources should bridge to the shared contacts service');
assert.equal(contactsSources?.items?.[0]?.source_id, 'macos_contacts', 'contacts.sources should expose the macOS source');

const contactsList = await contactsListTool.handler({ params: {} });
assert.equal(contactsList?.ok, true, 'contacts.list should bridge to the shared contacts service');
assert.equal(contactsList?.items?.[0]?.source_contact_id, 'mac_contact_ai_1', 'contacts.list should expose synchronized contacts');

const contactsSearch = await contactsSearchTool.handler({ params: { query: 'Chloe' } });
assert.equal(contactsSearch?.query, 'Chloe', 'contacts.search should keep the search query');

const contactsRead = await contactsReadTool.handler({ params: { contact_id: 'mac_contact_ai_1' } });
assert.equal(contactsRead?.contact?.source_contact_id, 'mac_contact_ai_1', 'contacts.read should expose one synchronized contact');

const contactsImport = await contactsImportTool.handler({ params: {} });
assert.equal(contactsImport?.imported, 1, 'contacts.import_macos should expose the explicit import action');

const contactsImportIcloud = await contactsImportIcloudTool.handler({ params: {} });
assert.equal(contactsImportIcloud?.imported, 1, 'contacts.import_icloud should expose the explicit direct iCloud import action');

const contactsPushIcloud = await contactsPushIcloudTool.handler({
    params: {
        contact: {
            name: 'Chloe Bernard',
            email: 'chloe@example.test'
        },
        confirmed: true
    }
});
assert.equal(contactsPushIcloud?.ok, true, 'contacts.push_icloud should expose the explicit direct iCloud write action');

const contactsOpenPanel = await contactsOpenPanelTool.handler({ params: {} });
assert.equal(contactsOpenPanel?.ok, true, 'contacts.open_panel should graft onto the existing contact panel');
assert.equal(contactsReadyCalls > 0, true, 'contacts default tools should prepare the shared contacts service before reads');
assert.equal(contactsImportCalls, 1, 'contacts.import_macos should call the shared contacts import bridge once');
assert.equal(contactsIcloudImportCalls, 1, 'contacts.import_icloud should call the shared iCloud contacts import bridge once');
assert.equal(contactsIcloudPushCalls, 1, 'contacts.push_icloud should call the shared iCloud write bridge once');
assert.equal(contactsOpenPanelCalls, 1, 'contacts.open_panel should call the shared contacts UI bridge once');
assert.equal(contactsReadyOptions.some((entry) => entry?.import_legacy_if_empty === false), true, 'contacts reads should not trigger an implicit macOS import');

console.log('default_tools.runtime_bridge.test: PASS');
