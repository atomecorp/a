import assert from 'node:assert/strict';

const runtimeCalls = [];
const runtimeBatchCalls = [];
let contactsConfigured = 0;
let contactsSynced = 0;
const contactsReadyOptions = [];
let contactsImported = 0;
let contactsIcloudImported = 0;
let contactsIcloudPushed = 0;
let contactsCreated = 0;
let contactsUpdated = 0;
let contactsDeleted = 0;
let calendarDeleted = 0;

globalThis.AtomeAI = {
    listTools() {
        return [{ name: 'demo.echo' }];
    },
    async callTool(request = {}) {
        return { ok: true, request };
    },
    audit: {
        list() {
            return [];
        }
    }
};

globalThis.atome = {
    bank: {
        accounts() {
            return { ok: true, items: [{ account_id: 'bank_mcp_1' }] };
        },
        balance() {
            return { ok: true, total_balance: 1234.56, currency: 'EUR' };
        },
        transactions() {
            return { ok: true, items: [{ transaction_id: 'bank_tx_mcp_1' }] };
        },
        summary() {
            return { ok: true, summary: 'Depenses: 10.00 EUR.' };
        },
        searchTransactions(query) {
            return { ok: true, query, items: [{ transaction_id: 'bank_tx_mcp_1' }] };
        },
        findPayer(name) {
            return { ok: true, name, paid: true, items: [{ transaction_id: 'bank_tx_mcp_2' }] };
        },
        spendingByPeriod() {
            return { ok: true, total_spent: 42.5, breakdown: [{ bucket: '2026-03-13', amount: 42.5 }] };
        },
        topMerchants() {
            return { ok: true, items: [{ merchant: 'netflix', amount: 19.99 }] };
        },
        recurringPayments() {
            return { ok: true, items: [{ merchant: 'spotify', occurrences: 2 }] };
        }
    },
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
                items: [{ id: 'calendar_mcp_1', title: 'Calendar MCP event' }]
            };
        },
        today() {
            return {
                ok: true,
                items: [{ id: 'calendar_mcp_1', title: 'Calendar MCP event' }]
            };
        },
        next() {
            return {
                ok: true,
                items: [{ id: 'calendar_mcp_2', title: 'Calendar next event' }]
            };
        },
        create(input = {}) {
            return {
                ok: true,
                event: { id: 'calendar_mcp_created_1', title: input.title || '' }
            };
        },
        update(eventId, changes = {}) {
            return {
                ok: true,
                event: { id: eventId, title: changes.title || '' }
            };
        },
        delete(eventId) {
            calendarDeleted += 1;
            return {
                ok: true,
                deleted: true,
                event_id: eventId
            };
        }
    },
    mail: {
        list() {
            return { ok: true, items: [{ message_id: 'mail_mcp_1' }] };
        },
        read(messageId) {
            return { ok: true, item: { message_id: messageId } };
        },
        search(query) {
            return { ok: true, query, items: [{ message_id: 'mail_mcp_1' }] };
        },
        nextUnread() {
            return { ok: true, item: { message_id: 'mail_mcp_1' } };
        },
        summarize() {
            return { ok: true, summary: '1 unread message.' };
        },
        replyDraft(messageId, options = {}) {
            return { ok: true, draft: { draft_id: 'mail_draft_mcp_1', in_reply_to: messageId, body_text: options.reply_text || '' } };
        },
        send(draftId, options = {}) {
            return options.confirmed === true
                ? { ok: true, draft: { draft_id: draftId, status: 'queued_local_only' } }
                : { ok: false, confirmation_required: true };
        }
    },
    contacts: {
        ensureReady(options = {}) {
            contactsConfigured += 1;
            contactsSynced += 1;
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
                items: [{ source_contact_id: 'mac_contact_mcp_1', name: 'Chloe Bernard', email: 'chloe@example.test' }]
            };
        },
        search(query) {
            return {
                ok: true,
                query,
                items: [{ source_contact_id: 'mac_contact_mcp_1', name: 'Chloe Bernard', email: 'chloe@example.test' }]
            };
        },
        read(contactId) {
            return {
                ok: true,
                contact: { source_contact_id: contactId, name: 'Chloe Bernard', email: 'chloe@example.test' }
            };
        },
        createLocalContact(contact = {}) {
            contactsCreated += 1;
            return {
                ok: true,
                created: true,
                contact: {
                    source_contact_id: 'local_contact_mcp_created_1',
                    source_provider: 'eve_contacts_local',
                    ...contact
                }
            };
        },
        updateLocalContact(contactId, changes = {}) {
            contactsUpdated += 1;
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
        deleteLocalContact(contactId) {
            contactsDeleted += 1;
            return {
                ok: true,
                deleted: true,
                contact_id: contactId
            };
        },
        syncStatus() {
            return {
                ok: true,
                sync: {
                    mode: 'initial',
                    cursor: 'contacts_sync_cursor_1',
                    ingested: 1,
                    source_count: 2
                },
                sources: [
                    { source_id: 'eve_contacts_local', provider: 'eve_contacts_local', writable: false },
                    { source_id: 'icloud_contacts_legacy', provider: 'icloud_carddav_legacy', writable: true }
                ]
            };
        },
        importMacosContacts() {
            contactsImported += 1;
            return {
                ok: true,
                imported: 1,
                items: [{ source_contact_id: 'mac_contact_mcp_1', source_provider: 'eve_contacts_local' }]
            };
        },
        importIcloudContacts() {
            contactsIcloudImported += 1;
            return {
                ok: true,
                imported: 1,
                items: [{ source_contact_id: 'icloud_contact_mcp_1', source_provider: 'eve_contacts_local' }]
            };
        },
        pushContactToIcloud() {
            contactsIcloudPushed += 1;
            return {
                ok: true,
                created: true,
                contact: { source_contact_id: 'icloud_contact_mcp_2', name: 'Chloe Bernard' }
            };
        }
    },
    tools: {
        v2CommandBus: {
            listEvents(filters = {}) {
                return [{
                    seq: 1,
                    kind: filters?.kind || 'tool_execution_result',
                    source: { type: 'mcp', layer: 'atome_mcp_runtime_call' }
                }];
            }
        },
        v2Runtime: {
            async listTools() {
                return [{
                    id: 'ui.circle',
                    tool_key: 'circle',
                    visibility: 'visible',
                    meta: { name: 'Circle' },
                    capabilities: {
                        contexts: ['project', 'mcp'],
                        selection_required: false,
                        disabled: false
                    },
                    runtime: {
                        execution_mode: 'v2_circle_create'
                    }
                }];
            },
            async invokeById(payload = {}) {
                runtimeCalls.push(payload);
                return {
                    ok: true,
                    bridged: true,
                    tool_id: payload.tool_id,
                    action: payload.action
                };
            },
            async invokeBatch(events = [], options = {}) {
                runtimeBatchCalls.push({ events, options });
                return {
                    ok: true,
                    count: events.length,
                    tx_id: options.tx_id || null
                };
            }
        }
    }
};

await import('./mcp.js');

const listed = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 1,
    method: 'runtime.tools.list',
    params: {}
});
assert.equal(listed.error, undefined, 'runtime.tools.list should succeed');
assert.equal(Array.isArray(listed.result?.tools), true, 'runtime.tools.list should return a tools array');
assert.equal(listed.result.tools[0]?.name, 'ui.circle', 'runtime.tools.list should expose runtime tool ids');
assert.equal(listed.result.tools[0]?.runtime?.execution_mode, 'v2_circle_create', 'runtime.tools.list should project runtime metadata');

const called = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 2,
    method: 'runtime.tools.call',
    params: {
        tool_id: 'ui.circle',
        action: 'pointer.click',
        input: { x: 10, y: 20 },
        actor: { user_id: 'user_test' },
        idempotency_key: 'circle:10:20',
        trace_id: 'trace_runtime_circle_1',
        intent_id: 'intent_runtime_circle_1'
    }
});
assert.equal(called.error, undefined, 'runtime.tools.call should succeed');
assert.equal(called.result?.ok, true, 'runtime.tools.call should bridge to runtime invokeById');
assert.equal(runtimeCalls.length, 1, 'runtime.tools.call should invoke runtime once');
assert.equal(runtimeCalls[0]?.tool_id, 'ui.circle', 'runtime.tools.call should forward tool_id');
assert.equal(runtimeCalls[0]?.meta?.idempotency_key, 'circle:10:20', 'runtime.tools.call should forward idempotency key into meta');
assert.equal(runtimeCalls[0]?.meta?.trace_id, 'trace_runtime_circle_1', 'runtime.tools.call should forward trace_id into meta');
assert.equal(runtimeCalls[0]?.meta?.intent_id, 'intent_runtime_circle_1', 'runtime.tools.call should forward intent_id into meta');
assert.equal(runtimeCalls[0]?.source?.type, 'mcp', 'runtime.tools.call should stamp MCP source');

const batchCalled = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 3,
    method: 'runtime.tools.batch_call',
    params: {
        tx_id: 'tx_runtime_batch_1',
        events: [
            { tool_id: 'ui.circle', action: 'pointer.click', input: { x: 1, y: 2 } },
            { tool_id: 'ui.circle', action: 'pointer.click', input: { x: 3, y: 4 } }
        ]
    }
});
assert.equal(batchCalled.error, undefined, 'runtime.tools.batch_call should succeed');
assert.equal(batchCalled.result?.ok, true, 'runtime.tools.batch_call should bridge to runtime invokeBatch');
assert.equal(runtimeBatchCalls.length, 1, 'runtime.tools.batch_call should invoke runtime batch once');
assert.equal(runtimeBatchCalls[0]?.events?.length, 2, 'runtime.tools.batch_call should forward events');
assert.equal(runtimeBatchCalls[0]?.options?.tx_id, 'tx_runtime_batch_1', 'runtime.tools.batch_call should forward tx id');

const auditListed = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 4,
    method: 'runtime.audit.list',
    params: {
        limit: 5,
        kind: 'tool_execution_result'
    }
});
assert.equal(auditListed.error, undefined, 'runtime.audit.list should succeed');
assert.equal(Array.isArray(auditListed.result?.events), true, 'runtime.audit.list should return an events array');
assert.equal(auditListed.result?.events?.length, 1, 'runtime.audit.list should respect the mocked event stream');
assert.equal(auditListed.result?.events?.[0]?.kind, 'tool_execution_result', 'runtime.audit.list should forward filter arguments to the command bus');

const mailListed = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 5,
    method: 'mail.list',
    params: {}
});
assert.equal(mailListed.error, undefined, 'mail.list should succeed');
assert.equal(mailListed.result?.items?.[0]?.message_id, 'mail_mcp_1', 'mail.list should bridge to the global mail API');

const mailDraft = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 6,
    method: 'mail.reply_draft',
    params: {
        message_id: 'mail_mcp_1',
        reply_text: 'Je reviens vers toi demain.'
    }
});
assert.equal(mailDraft.error, undefined, 'mail.reply_draft should succeed');
assert.equal(mailDraft.result?.draft?.in_reply_to, 'mail_mcp_1', 'mail.reply_draft should bridge to the global mail API');

const mailSendGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 7,
    method: 'mail.send',
    params: {
        draft_id: 'mail_draft_mcp_1'
    }
});
assert.equal(mailSendGate.result?.confirmation_required, true, 'mail.send should require an MCP confirmation token before delivery');
assert.ok(mailSendGate.result?.confirmation_id, 'mail.send should expose an MCP confirmation id');

const mailSendConfirmed = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 8,
    method: 'mail.send',
    params: {
        draft_id: 'mail_draft_mcp_1',
        confirmed: true,
        confirmation_id: mailSendGate.result.confirmation_id
    }
});
assert.equal(mailSendConfirmed.error, undefined, 'confirmed mail.send should succeed');
assert.equal(mailSendConfirmed.result?.draft?.status, 'queued_local_only', 'confirmed mail.send should forward to the mail API');

const contactsSources = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 9,
    method: 'contacts.sources',
    params: {}
});
assert.equal(contactsSources.error, undefined, 'contacts.sources should succeed');
assert.equal(contactsSources.result?.items?.[0]?.source_id, 'macos_contacts', 'contacts.sources should bridge to the global contacts API');

const contactsList = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 10,
    method: 'contacts.list',
    params: {}
});
assert.equal(contactsList.error, undefined, 'contacts.list should succeed');
assert.equal(contactsList.result?.items?.[0]?.source_contact_id, 'mac_contact_mcp_1', 'contacts.list should bridge to the global contacts API');

const contactsSearch = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 11,
    method: 'contacts.search',
    params: {
        query: 'Chloe'
    }
});
assert.equal(contactsSearch.error, undefined, 'contacts.search should succeed');
assert.equal(contactsSearch.result?.query, 'Chloe', 'contacts.search should forward the search query');

const contactsRead = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 12,
    method: 'contacts.read',
    params: {
        contact_id: 'mac_contact_mcp_1'
    }
});
assert.equal(contactsRead.error, undefined, 'contacts.read should succeed');
assert.equal(contactsRead.result?.contact?.source_contact_id, 'mac_contact_mcp_1', 'contacts.read should bridge to the global contacts API');
assert.equal(contactsConfigured > 0, true, 'contacts MCP bridge should prepare the shared contacts service before reads');
assert.equal(contactsSynced > 0, true, 'contacts MCP bridge should trigger a readiness sync before reads');
assert.equal(contactsReadyOptions.some((entry) => entry?.import_legacy_if_empty === false), true, 'contacts MCP reads should avoid implicit macOS imports');

const contactsCreate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 12.1,
    method: 'contacts.create',
    params: {
        name: 'Sylvain Godard',
        phone: '06 44 55 78 96'
    }
});
assert.equal(contactsCreate.error, undefined, 'contacts.create should succeed');
assert.equal(contactsCreate.result?.contact?.name, 'Sylvain Godard', 'contacts.create should bridge to the global local contacts API');
assert.equal(contactsCreated, 1, 'contacts.create should call the shared local contacts creation bridge');

const contactsUpdate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 12.2,
    method: 'contacts.update',
    params: {
        contact_id: 'local_contact_mcp_created_1',
        phone: '06 44 55 78 97'
    }
});
assert.equal(contactsUpdate.error, undefined, 'contacts.update should succeed');
assert.equal(contactsUpdate.result?.contact?.phone, '06 44 55 78 97', 'contacts.update should accept top-level change fields for MCP callers');
assert.equal(contactsUpdated, 1, 'contacts.update should call the shared local contacts update bridge');

const contactsDelete = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 12.3,
    method: 'contacts.delete',
    params: {
        contact_id: 'local_contact_mcp_created_1'
    }
});
assert.equal(contactsDelete.error, undefined, 'contacts.delete should succeed');
assert.equal(contactsDelete.result?.deleted, true, 'contacts.delete should bridge to the global local contacts delete API');
assert.equal(contactsDeleted, 1, 'contacts.delete should call the shared local contacts delete bridge');

const contactsImport = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 13,
    method: 'contacts.import_macos',
    params: {}
});
assert.equal(contactsImport.error, undefined, 'contacts.import_macos should succeed');
assert.equal(contactsImport.result?.imported, 1, 'contacts.import_macos should bridge to the global contacts import API');
assert.equal(contactsImported, 1, 'contacts.import_macos should call the shared contacts import bridge');

const contactsImportIcloud = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 14,
    method: 'contacts.import_icloud',
    params: {}
});
assert.equal(contactsImportIcloud.error, undefined, 'contacts.import_icloud should succeed');
assert.equal(contactsImportIcloud.result?.imported, 1, 'contacts.import_icloud should bridge to the global iCloud contacts import API');
assert.equal(contactsIcloudImported, 1, 'contacts.import_icloud should call the shared contacts iCloud import bridge');

const contactsPushIcloudGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 15,
    method: 'contacts.push_icloud',
    params: {
        contact: {
            name: 'Chloe Bernard',
            email: 'chloe@example.test'
        }
    }
});
assert.equal(contactsPushIcloudGate.error, undefined, 'contacts.push_icloud gate should succeed');
assert.equal(contactsPushIcloudGate.result?.confirmation_required, true, 'contacts.push_icloud should require confirmation');

const contactsPushIcloud = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16,
    method: 'contacts.push_icloud',
    params: {
        contact: {
            name: 'Chloe Bernard',
            email: 'chloe@example.test'
        },
        confirmed: true,
        confirmation_id: contactsPushIcloudGate.result.confirmation_id
    }
});
assert.equal(contactsPushIcloud.error, undefined, 'confirmed contacts.push_icloud should succeed');
assert.equal(contactsPushIcloud.result?.ok, true, 'contacts.push_icloud should bridge to the global iCloud contacts write API');
assert.equal(contactsIcloudPushed, 1, 'contacts.push_icloud should call the shared contacts iCloud write bridge');

const resources = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16.1,
    method: 'mcp.resources.list',
    params: {}
});
assert.equal(resources.error, undefined, 'mcp.resources.list should succeed');
assert.equal(resources.result?.resources?.some((entry) => entry.uri === 'contacts://status/default'), true, 'mcp.resources.list should expose the contacts status resource');
assert.equal(resources.result?.resources?.some((entry) => entry.uri === 'contacts://directory/local'), true, 'mcp.resources.list should expose the local contacts directory resource');

const contactsStatusResource = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16.2,
    method: 'mcp.resources.read',
    params: {
        uri: 'contacts://status/default'
    }
});
assert.equal(contactsStatusResource.error, undefined, 'mcp.resources.read should read contacts status');
assert.equal(contactsStatusResource.result?.content?.sync?.cursor, 'contacts_sync_cursor_1', 'contacts status resource should expose sync state');

const contactsLocalResource = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16.3,
    method: 'mcp.resources.read',
    params: {
        uri: 'contacts://directory/local'
    }
});
assert.equal(contactsLocalResource.error, undefined, 'mcp.resources.read should read the local contacts directory');
assert.equal(contactsLocalResource.result?.content?.ok, true, 'local contacts directory resource should bridge to contacts.list');

const prompts = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16.4,
    method: 'mcp.prompts.list',
    params: {}
});
assert.equal(prompts.error, undefined, 'mcp.prompts.list should succeed');
assert.equal(prompts.result?.prompts?.some((entry) => entry.name === 'contacts_import_summary'), true, 'mcp.prompts.list should expose the contacts import prompt');
assert.equal(prompts.result?.prompts?.some((entry) => entry.name === 'contacts_push_confirmation'), true, 'mcp.prompts.list should expose the contacts push confirmation prompt');

const contactsPrompt = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16.5,
    method: 'mcp.prompts.get',
    params: {
        name: 'contacts_push_confirmation',
        contact: 'Chloe Bernard'
    }
});
assert.equal(contactsPrompt.error, undefined, 'mcp.prompts.get should render the contacts push confirmation prompt');
assert.match(contactsPrompt.result?.prompt || '', /Chloe Bernard/, 'contacts push confirmation prompt should include the contact name');

const calendarSources = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 17,
    method: 'calendar.sources',
    params: {}
});
assert.equal(calendarSources.error, undefined, 'calendar.sources should succeed');
assert.equal(calendarSources.result?.items?.[0]?.source_id, 'tauri_caldav_primary', 'calendar.sources should bridge to the global calendar API');

const calendarToday = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 16,
    method: 'calendar.today',
    params: {}
});
assert.equal(calendarToday.error, undefined, 'calendar.today should succeed');
assert.equal(calendarToday.result?.items?.[0]?.id, 'calendar_mcp_1', 'calendar.today should bridge to the global calendar API');

const calendarCreateGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 17,
    method: 'calendar.create',
    params: {
        title: 'Created from MCP',
        start: '2026-03-13T09:00:00.000Z',
        end: '2026-03-13T10:00:00.000Z'
    }
});
assert.equal(calendarCreateGate.error, undefined, 'calendar.create confirmation gate should succeed');
assert.equal(calendarCreateGate.result?.confirmation_required, true, 'calendar.create should require an MCP confirmation token');

const calendarCreate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 18,
    method: 'calendar.create',
    params: {
        title: 'Created from MCP',
        start: '2026-03-13T09:00:00.000Z',
        end: '2026-03-13T10:00:00.000Z',
        confirmed: true,
        confirmation_id: calendarCreateGate.result.confirmation_id
    }
});
assert.equal(calendarCreate.error, undefined, 'confirmed calendar.create should succeed');
assert.equal(calendarCreate.result?.event?.id, 'calendar_mcp_created_1', 'confirmed calendar.create should bridge to the global calendar API');

const calendarDeleteGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 18.1,
    method: 'calendar.delete',
    params: {
        event_id: 'calendar_mcp_created_1'
    }
});
assert.equal(calendarDeleteGate.error, undefined, 'calendar.delete confirmation gate should succeed');
assert.equal(calendarDeleteGate.result?.confirmation_required, true, 'calendar.delete should require an MCP confirmation token');

const calendarDelete = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 18.2,
    method: 'calendar.delete',
    params: {
        event_id: 'calendar_mcp_created_1',
        confirmed: true,
        confirmation_id: calendarDeleteGate.result.confirmation_id
    }
});
assert.equal(calendarDelete.error, undefined, 'confirmed calendar.delete should succeed');
assert.equal(calendarDelete.result?.deleted, true, 'confirmed calendar.delete should bridge to the global calendar API');
assert.equal(calendarDeleted, 1, 'calendar.delete should call the shared calendar delete bridge');

const bankAccounts = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 19,
    method: 'bank.accounts',
    params: {}
});
assert.equal(bankAccounts.error, undefined, 'bank.accounts should succeed');
assert.equal(bankAccounts.result?.items?.[0]?.account_id, 'bank_mcp_1', 'bank.accounts should bridge to the global bank API');

const bankSummary = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 20,
    method: 'bank.summary',
    params: {}
});
assert.equal(bankSummary.error, undefined, 'bank.summary should succeed');
assert.match(bankSummary.result?.summary || '', /Depenses:/, 'bank.summary should bridge to the global bank API');

const bankFindPayer = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 21,
    method: 'bank.find_payer',
    params: {
        name: 'Romeo'
    }
});
assert.equal(bankFindPayer.error, undefined, 'bank.find_payer should succeed');
assert.equal(bankFindPayer.result?.paid, true, 'bank.find_payer should bridge to the global bank API');

console.log('mcp.runtime_bridge.test: PASS');
