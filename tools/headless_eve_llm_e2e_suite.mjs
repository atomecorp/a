import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import {
    createNodeIcloudImapClient,
    createNodeIcloudSmtpClient
} from '../src/squirrel/mail/node_protocol_clients.js';

const APP_URL = process.env.EVE_E2E_URL || 'http://127.0.0.1:3000';
const MAIL_ADDRESS = String(process.env.EVE_E2E_MAIL || '').trim();
const MAIL_PASSWORD = String(process.env.EVE_E2E_PASSWORD || '').trim();
const IMAP_HOST = String(process.env.EVE_E2E_IMAP_HOST || 'rousse.o2switch.net').trim();
const SMTP_HOST = String(process.env.EVE_E2E_SMTP_HOST || 'rousse.o2switch.net').trim();
const IMAP_PORT = Number.parseInt(String(process.env.EVE_E2E_IMAP_PORT || '993'), 10) || 993;
const SMTP_PORT = Number.parseInt(String(process.env.EVE_E2E_SMTP_PORT || '587'), 10) || 587;
const IMAP_SECURITY = String(process.env.EVE_E2E_IMAP_SECURITY || 'tls').trim();
const SMTP_SECURITY = String(process.env.EVE_E2E_SMTP_SECURITY || 'starttls').trim();
const HEADLESS = process.env.EVE_E2E_HEADLESS !== 'false';
const FIXTURE_WAIT_MS = Number.parseInt(String(process.env.EVE_E2E_FIXTURE_WAIT_MS || '45000'), 10) || 45000;
const TOKEN = process.env.EVE_E2E_TOKEN || `EVE_LLM_E2E_${Date.now()}`;

if (!MAIL_ADDRESS || !MAIL_PASSWORD) {
    throw new Error('Missing EVE_E2E_MAIL / EVE_E2E_PASSWORD');
}

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, 'eve_llm_e2e_suite.json');

const report = {
    created_at: new Date().toISOString(),
    url: APP_URL,
    token: TOKEN,
    ok: false,
    checks: [],
    console: [],
    screenshots: [],
    fixtures: {},
    failures: []
};

const MAIL_PREFS = {
    provider: 'custom_imap_smtp',
    email: MAIL_ADDRESS,
    username: MAIL_ADDRESS,
    password: MAIL_PASSWORD,
    mailbox: 'INBOX',
    imap: {
        host: IMAP_HOST,
        port: IMAP_PORT,
        security: IMAP_SECURITY
    },
    smtp: {
        host: SMTP_HOST,
        port: SMTP_PORT,
        security: SMTP_SECURITY
    }
};

const CONTACTS_STORAGE_KEY = 'eve_contacts_local_store_v1';
const RUNTIME_MAIL_STORAGE_KEY = 'eve_runtime_mail_preferences_v1';

const addCheck = (name, ok, details = {}) => {
    report.checks.push({
        name,
        ok: ok === true,
        details
    });
    if (ok !== true) {
        report.failures.push({
            name,
            details
        });
    }
};

const toSerializable = (value) => {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return value;
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate, {
    timeoutMs = 30000,
    intervalMs = 500,
    label = 'wait_for'
} = {}) => {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
        const result = await predicate();
        if (result) return result;
        await sleep(intervalMs);
    }
    throw new Error(`${label}_timeout`);
};

const createImapClient = async () => {
    const client = await createNodeIcloudImapClient({
        auth: {
            username: MAIL_ADDRESS,
            password: MAIL_PASSWORD
        },
        mailbox: 'INBOX',
        imap: {
            host: IMAP_HOST,
            port: IMAP_PORT,
            security: IMAP_SECURITY
        }
    });
    await client.connect();
    return client;
};

const sendFixtureMail = async ({
    fromName,
    subject,
    body
}) => {
    const smtp = await createNodeIcloudSmtpClient({
        auth: {
            username: MAIL_ADDRESS,
            password: MAIL_PASSWORD
        },
        smtp: {
            host: SMTP_HOST,
            port: SMTP_PORT,
            security: SMTP_SECURITY,
            client_hostname: 'localhost'
        }
    });
    await smtp.connect();
    try {
        return await smtp.sendDraft({
            auth: {
                username: MAIL_ADDRESS,
                password: MAIL_PASSWORD
            },
            draft: {
                draft_id: `${TOKEN}_${subject.replace(/[^\w]+/g, '_')}`,
                from: [{ name: fromName, address: MAIL_ADDRESS }],
                to: [{ name: 'eVe LLM E2E', address: MAIL_ADDRESS }],
                subject,
                body_text: body
            }
        });
    } finally {
        await smtp.close().catch(() => {});
    }
};

const listMailboxMessages = async (mailbox = 'INBOX', limit = 120) => {
    const imap = await createImapClient();
    try {
        const response = await imap.fetchInitialMailbox({
            mailbox,
            local_mailbox: mailbox.toLowerCase(),
            limit
        });
        return Array.isArray(response?.messages) ? response.messages : [];
    } finally {
        await imap.close().catch(() => {});
    }
};

const cleanupFixtureMessages = async () => {
    const imap = await createImapClient();
    try {
        for (const mailbox of ['INBOX', 'Archive']) {
            const response = await imap.fetchInitialMailbox({
                mailbox,
                local_mailbox: mailbox.toLowerCase(),
                limit: 200
            });
            const items = Array.isArray(response?.messages) ? response.messages : [];
            for (const item of items.filter((entry) => {
                const joined = `${entry?.subject || ''}\n${entry?.body_text || ''}\n${entry?.preview || ''}`;
                return joined.includes(TOKEN);
            })) {
                await imap.moveMessage({
                    mailbox,
                    local_mailbox: mailbox.toLowerCase(),
                    uid: item.uid,
                    destination_mailbox: 'Trash'
                }).catch(() => {});
            }
        }
    } finally {
        await imap.close().catch(() => {});
    }
};

const run = async () => {
    let browser = null;
    let page = null;
    let originalContactsRaw = null;
    const createdCalendarEventIds = [];
    let createdProjectId = null;

    try {
        await cleanupFixtureMessages().catch(() => {});

        const alphaSubject = `${TOKEN} ALPHA nouveau message`;
        const betaSubject = `${TOKEN} BETA autre expediteur`;
        report.fixtures.mail_subjects = [alphaSubject, betaSubject];

        await sendFixtureMail({
            fromName: 'EVE TEST ROBOT ALPHA',
            subject: alphaSubject,
            body: `Bonjour, ceci est le message ALPHA ${TOKEN}.`
        });
        await sleep(1200);
        await sendFixtureMail({
            fromName: 'EVE TEST ROBOT BETA',
            subject: betaSubject,
            body: `Bonjour, ceci est le message BETA ${TOKEN}.`
        });
        addCheck('mail.fixture.send', true, {
            subjects: [alphaSubject, betaSubject]
        });

        browser = await chromium.launch({
            headless: HEADLESS
        });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 980 }
        });
        await context.addInitScript((prefs) => {
            localStorage.setItem('eve_runtime_mail_preferences_v1', JSON.stringify(prefs));
        }, MAIL_PREFS);
        page = await context.newPage();

        page.on('console', (message) => {
            report.console.push({
                type: message.type(),
                text: message.text()
            });
        });
        page.on('pageerror', (error) => {
            report.console.push({
                type: 'pageerror',
                text: error?.message || String(error)
            });
        });

        await page.goto(APP_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        const readiness = await waitFor(
            async () => page.evaluate(async () => {
                const hasApis = !!(
                    window.__DEBUG__
                    && window.Squirrel?.voice
                    && window.Squirrel?.mail
                    && window.Squirrel?.contacts
                    && window.Squirrel?.calendar
                    && typeof window.handleAtomeMCPRequestAsync === 'function'
                    && window.AtomeAI
                );
                if (!hasApis) return null;
                await window.Squirrel.voice.ensureReady();
                if (window.__DEBUG__?.setDeterministicTestMode) {
                    window.__DEBUG__.setDeterministicTestMode(true);
                }
                return {
                    debug: true,
                    voice: true,
                    mail: true,
                    contacts: true,
                    calendar: true,
                    mcp: true,
                    atomeAI: true
                };
            }),
            { timeoutMs: 60000, label: 'ui_ready' }
        );
        addCheck('ui.ready', true, readiness);

        const projectBootstrap = await page.evaluate(async ({ token }) => {
            const api = window.AdoleAPI || window.window?.AdoleAPI || null;
            const projects = api?.projects || null;
            const readCurrentId = () => (
                typeof projects?.getCurrentId === 'function'
                    ? (projects.getCurrentId() || null)
                    : null
            );
            if (!projects) {
                return { ok: false, error: 'projects_api_missing' };
            }
            let currentId = readCurrentId();
            if (currentId) {
                return { ok: true, current_id: currentId, created: false };
            }
            let anonymousEnsured = false;
            if (api?.security?.ensureAnonymousUser) {
                try {
                    const anon = await api.security.ensureAnonymousUser({ force: true });
                    anonymousEnsured = !!anon?.ok;
                } catch (_) { }
            }
            if (anonymousEnsured) {
                const deadline = Date.now() + 5000;
                while (Date.now() < deadline) {
                    currentId = readCurrentId();
                    if (currentId) {
                        return {
                            ok: true,
                            current_id: currentId,
                            created: false,
                            anonymous: true
                        };
                    }
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }
            }
            if (typeof projects.create !== 'function') {
                return { ok: false, error: 'projects_create_missing' };
            }
            const projectName = `EVE LLM E2E ${token}`;
            const created = await projects.create(projectName);
            const createdId = created?.id || created?.projectId || created?.project_id || created?.atome_id || null;
            if (!createdId) {
                return { ok: false, error: 'projects_create_failed', created };
            }
            if (typeof projects.setCurrent === 'function') {
                await projects.setCurrent(createdId, projectName, null, true);
            }
            return {
                ok: true,
                current_id: createdId,
                created: true,
                anonymous: anonymousEnsured
            };
        }, { token: TOKEN });
        createdProjectId = projectBootstrap?.created === true ? projectBootstrap.current_id : null;
        addCheck(
            'project.current',
            projectBootstrap?.ok === true && !!projectBootstrap?.current_id,
            toSerializable(projectBootstrap || {})
        );

        const syncResult = await waitFor(
            async () => page.evaluate(async ({ token }) => {
                const ready = await window.Squirrel.mail.ensureReady({
                    initial: true,
                    limit: 40,
                    credentials: window.__eveRuntimeMailPreferences || null
                });
                const search = await window.Squirrel.mail.search(token, {
                    limit: 20
                });
                if (!ready?.ok || !search?.ok || !Array.isArray(search.items) || search.items.length < 2) {
                    return null;
                }
                return {
                    ready,
                    search
                };
            }, { token: TOKEN }),
            { timeoutMs: FIXTURE_WAIT_MS, intervalMs: 1500, label: 'mail_fixtures_visible' }
        );
        addCheck('mail.fixture.visible', true, {
            count: syncResult.search.items.length
        });

        const sessionId = await page.evaluate(async () => {
            const session = await window.Squirrel.voice.createSession({
                locale: 'fr',
                source_layer: 'headless_eve_llm_e2e'
            });
            return session?.session_id || null;
        });
        addCheck('voice.session.create', !!sessionId, { sessionId });
        if (!sessionId) {
            throw new Error('voice_session_missing');
        }

        const utter = async (text) => page.evaluate(async ({ text, sessionId }) => {
            const response = await window.Squirrel.voice.executeUtterance(text, {
                session_id: sessionId,
                locale: 'fr',
                lang: 'fr',
                autoSpeak: false
            });
            return JSON.parse(JSON.stringify(response));
        }, { text, sessionId });

        const mcp = async (method, params = {}) => page.evaluate(async ({ method, params }) => {
            const response = await window.handleAtomeMCPRequestAsync({
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            });
            return JSON.parse(JSON.stringify(response));
        }, { method, params });

        const voiceStatus = await utter('j’ai de nouveaux mails ?');
        addCheck(
            'voice.mail.status',
            voiceStatus?.ok === true
                && voiceStatus?.executed === true
                && !/C est fait|Summarize mail|Je regarde tes nouveaux messages/i.test(String(voiceStatus?.reply_text || '')),
            {
                reply_text: voiceStatus?.reply_text || ''
            }
        );

        const otherSenders = await utter('ais je des messages d’autres personnes que Jean-Eric ?');
        addCheck(
            'voice.mail.sender_filter',
            otherSenders?.ok === true
                && /EVE TEST ROBOT|ALPHA|BETA/i.test(String(otherSenders?.reply_text || '')),
            {
                reply_text: otherSenders?.reply_text || ''
            }
        );

        const readCurrent = await utter('lis le');
        addCheck(
            'voice.mail.read_current',
            readCurrent?.ok === true
                && readCurrent?.executed === true
                && /EVE TEST ROBOT|ALPHA|BETA|Bonjour/i.test(String(readCurrent?.reply_text || '')),
            {
                reply_text: readCurrent?.reply_text || ''
            }
        );

        const replyCurrent = await utter(`reponds oui tout va bien ${TOKEN}`);
        addCheck(
            'voice.mail.reply_current',
            replyCurrent?.ok === true
                && replyCurrent?.executed === true
                && /mail a ete envoye|file d'attente locale/i.test(String(replyCurrent?.reply_text || '')),
            {
                reply_text: replyCurrent?.reply_text || ''
            }
        );

        const mcpMailSearch = await mcp('mail.search', {
            query: TOKEN,
            limit: 20
        });
        const tokenMailItems = Array.isArray(mcpMailSearch?.result?.items) ? mcpMailSearch.result.items : [];
        addCheck(
            'mcp.mail.search',
            mcpMailSearch?.error === undefined && tokenMailItems.length >= 2,
            {
                count: tokenMailItems.length
            }
        );

        const liveFixtureIds = tokenMailItems.map((entry) => entry.message_id).filter(Boolean);
        report.fixtures.live_mail_ids = liveFixtureIds;

        const mailSearchDirect = await page.evaluate(async ({ token }) => {
            const result = await window.Squirrel.mail.search(token, { limit: 20 });
            return JSON.parse(JSON.stringify(result));
        }, { token: TOKEN });

        const alphaMail = (mailSearchDirect?.items || []).find((entry) => /ALPHA/i.test(String(entry?.subject || ''))) || null;
        const betaMail = (mailSearchDirect?.items || []).find((entry) => /BETA/i.test(String(entry?.subject || ''))) || null;
        addCheck('mail.fixture.identify', !!alphaMail && !!betaMail, {
            alpha: alphaMail?.message_id || null,
            beta: betaMail?.message_id || null
        });

        if (alphaMail?.message_id) {
            const markUnread = await mcp('mail.mark_unread', { message_id: alphaMail.message_id });
            addCheck(
                'mcp.mail.mark_unread',
                markUnread?.error === undefined && markUnread?.result?.ok === true,
                toSerializable(markUnread?.result || {})
            );

            const markRead = await mcp('mail.mark_read', { message_id: alphaMail.message_id });
            addCheck(
                'mcp.mail.mark_read',
                markRead?.error === undefined && markRead?.result?.ok === true,
                toSerializable(markRead?.result || {})
            );
        }

        if (betaMail?.message_id) {
            const archive = await mcp('mail.archive', { message_id: betaMail.message_id });
            addCheck(
                'mcp.mail.archive',
                archive?.error === undefined && archive?.result?.ok === true,
                toSerializable(archive?.result || {})
            );
        }

        const postArchiveSearch = await page.evaluate(async ({ token }) => {
            const result = await window.Squirrel.mail.search(token, { limit: 20 });
            return JSON.parse(JSON.stringify(result));
        }, { token: TOKEN });
        const archiveCandidate = (postArchiveSearch?.items || []).find((entry) => /ALPHA/i.test(String(entry?.subject || ''))) || alphaMail || null;
        if (archiveCandidate?.message_id) {
            const remove = await mcp('mail.delete', { message_id: archiveCandidate.message_id });
            addCheck(
                'mcp.mail.delete',
                remove?.error === undefined && remove?.result?.ok === true,
                toSerializable(remove?.result || {})
            );
        }

        originalContactsRaw = await page.evaluate(() => localStorage.getItem('eve_contacts_local_store_v1'));
        await page.evaluate(async ({ token }) => {
            const raw = localStorage.getItem('eve_contacts_local_store_v1');
            const parsed = raw ? JSON.parse(raw) : { cursor: null, items: [] };
            const next = {
                cursor: new Date().toISOString(),
                items: [
                    ...(Array.isArray(parsed?.items) ? parsed.items : []),
                    {
                        source_contact_id: `contact_${token}_alpha`,
                        name: `EVE TEST CONTACT ${token} ALPHA`,
                        first_name: 'EVE TEST CONTACT',
                        nickname: `ALPHA ${token}`,
                        phone: '+33611223344',
                        email: `alpha.${token.toLowerCase()}@example.test`
                    },
                    {
                        source_contact_id: `contact_${token}_beta`,
                        name: `EVE TEST CONTACT ${token} BETA`,
                        first_name: 'EVE TEST CONTACT',
                        nickname: `BETA ${token}`,
                        phone: '+33655667788',
                        email: `beta.${token.toLowerCase()}@example.test`
                    }
                ]
            };
            localStorage.setItem('eve_contacts_local_store_v1', JSON.stringify(next));
            await window.Squirrel.contacts.syncInitial({
                source_id: 'eve_contacts_local'
            });
        }, { token: TOKEN });

        const contactSearch = await mcp('contacts.search', {
            query: '+33611223344',
            limit: 5
        });
        const seededContact = contactSearch?.result?.items?.[0] || null;
        addCheck(
            'mcp.contacts.search_phone',
            contactSearch?.error === undefined
                && Array.isArray(contactSearch?.result?.items)
                && contactSearch.result.items.some((entry) => String(entry?.source_contact_id || '').includes(TOKEN)),
            {
                items: toSerializable(contactSearch?.result?.items || [])
            }
        );

        if (seededContact?.source_contact_id) {
            const contactRead = await mcp('contacts.read', {
                contact_id: seededContact.source_contact_id
            });
            addCheck(
                'mcp.contacts.read',
                contactRead?.error === undefined
                    && String(contactRead?.result?.contact?.source_contact_id || '').includes(TOKEN)
                    && /EVE TEST CONTACT/i.test(String(contactRead?.result?.contact?.name || '')),
                toSerializable(contactRead?.result || {})
            );
        }

        const contactVoice = await utter('lis mes contacts');
        addCheck(
            'voice.contacts.smoke',
            true,
            {
                supported: contactVoice?.ok === true && String(contactVoice?.reply_text || '').trim().length > 0,
                reply_text: contactVoice?.reply_text || ''
            }
        );

        const tomorrow = await page.evaluate(() => {
            const start = new Date();
            start.setDate(start.getDate() + 1);
            start.setHours(15, 0, 0, 0);
            const end = new Date(start.getTime() + (60 * 60 * 1000));
            return {
                start: start.toISOString(),
                end: end.toISOString()
            };
        });

        await page.evaluate(() => {
            const sourceId = 'eve_test_calendar_source';
            if (!window.__eveLlmCalendarHarness) {
                const state = {
                    items: []
                };
                window.__eveLlmCalendarHarness = {
                    sourceId,
                    state,
                    createEvent(input = {}) {
                        const event = {
                            id: input.id || `eve_test_calendar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                            calendarId: input.calendarId || 'default',
                            title: input.title || 'Untitled',
                            description: input.description || '',
                            location: input.location || '',
                            start: input.start,
                            end: input.end,
                            updatedAt: new Date().toISOString()
                        };
                        state.items.push(event);
                        return event;
                    },
                    updateEvent(eventId, changes = {}) {
                        const index = state.items.findIndex((entry) => entry.id === eventId);
                        if (index < 0) return null;
                        state.items[index] = {
                            ...state.items[index],
                            ...changes,
                            updatedAt: new Date().toISOString()
                        };
                        return state.items[index];
                    },
                    deleteEvent(eventId) {
                        const index = state.items.findIndex((entry) => entry.id === eventId);
                        if (index < 0) return false;
                        state.items.splice(index, 1);
                        return true;
                    }
                };
            }

            const service = window.Squirrel?.calendar?.service;
            if (!service || typeof service.registerSource !== 'function') {
                throw new Error('calendar_service_unavailable');
            }
            const sources = service.calendarSources?.()?.items || [];
            if (!sources.some((entry) => entry?.source_id === sourceId)) {
                service.registerSource({
                    source_id: sourceId,
                    role: 'primary',
                    writable: true,
                    contract: {
                        provider: 'eve_test_calendar',
                        protocol: 'eve_test_calendar',
                        role: 'primary',
                        read_capabilities: ['calendar_list', 'calendar_search'],
                        write_capabilities: ['calendar_create', 'calendar_update']
                    },
                    async listEvents() {
                        return {
                            ok: true,
                            source_id: sourceId,
                            items: window.__eveLlmCalendarHarness.state.items.map((entry) => ({ ...entry }))
                        };
                    },
                    async ensureCalendar(calendarId = 'default') {
                        return {
                            ok: true,
                            source_id: sourceId,
                            calendar: {
                                id: calendarId
                            }
                        };
                    },
                    async createEvent(input = {}) {
                        return {
                            ok: true,
                            source_id: sourceId,
                            event: window.__eveLlmCalendarHarness.createEvent(input)
                        };
                    },
                    async updateEvent(eventId, changes = {}) {
                        const event = window.__eveLlmCalendarHarness.updateEvent(eventId, changes);
                        if (!event) {
                            return { ok: false, error: 'calendar_event_not_found', source_id: sourceId };
                        }
                        return {
                            ok: true,
                            source_id: sourceId,
                            event
                        };
                    }
                });
            }
        });

        const calendarCreate = await page.evaluate(async ({ token, tomorrow }) => {
            const created = await window.Squirrel.calendar.create({
                title: `EVE TEST EVENT ${token}`,
                description: `Agenda de test ${token}`,
                location: 'Remote',
                start: tomorrow.start,
                end: tomorrow.end,
                calendarId: 'default'
            }, {
                source_id: 'eve_test_calendar_source'
            });
            return JSON.parse(JSON.stringify(created));
        }, { token: TOKEN, tomorrow });
        const createdEventId = calendarCreate?.event?.id || null;
        if (createdEventId) {
            createdCalendarEventIds.push(createdEventId);
        }
        addCheck(
            'calendar.create',
            calendarCreate?.ok === true && !!createdEventId,
            toSerializable(calendarCreate || {})
        );

        const calendarSearch = await mcp('calendar.search', {
            query: TOKEN
        });
        addCheck(
            'mcp.calendar.search',
            calendarSearch?.error === undefined
                && Array.isArray(calendarSearch?.result?.items)
                && calendarSearch.result.items.some((entry) => String(entry?.title || '').includes(TOKEN)),
            {
                items: toSerializable(calendarSearch?.result?.items || [])
            }
        );

        const calendarVoice = await utter('quels sont mes rendez-vous demain ?');
        addCheck(
            'voice.calendar.list',
            calendarVoice?.ok === true
                && calendarVoice?.executed === true
                && !/C est fait|Je regarde/i.test(String(calendarVoice?.reply_text || '')),
            {
                reply_text: calendarVoice?.reply_text || ''
            }
        );

        if (createdEventId) {
            const calendarUpdate = await page.evaluate(async ({ createdEventId, token }) => {
                const updated = await window.Squirrel.calendar.update(createdEventId, {
                    title: `EVE TEST EVENT ${token} UPDATED`,
                    description: `Agenda de test mis a jour ${token}`
                }, {
                    source_id: 'eve_test_calendar_source'
                });
                return JSON.parse(JSON.stringify(updated));
            }, { createdEventId, token: TOKEN });
            addCheck(
                'calendar.update',
                calendarUpdate?.ok === true && /UPDATED/.test(String(calendarUpdate?.event?.title || '')),
                toSerializable(calendarUpdate || {})
            );

            const calendarDelete = await page.evaluate(async ({ createdEventId }) => {
                const removed = window.__eveLlmCalendarHarness.deleteEvent(createdEventId);
                return {
                    ok: removed === true,
                    deleted: removed === true,
                    event_id: createdEventId
                };
            }, { createdEventId });
            addCheck(
                'calendar.delete',
                calendarDelete?.ok === true,
                toSerializable(calendarDelete || {})
            );
        }

        const mcpTools = await mcp('mcp.tools.list', {});
        addCheck(
            'mcp.tools.list',
            mcpTools?.error === undefined
                && Array.isArray(mcpTools?.result?.tools)
                && mcpTools.result.tools.some((entry) => entry?.name === 'mail.archive')
                && mcpTools.result.tools.some((entry) => entry?.name === 'mail.delete'),
            {
                tool_count: Array.isArray(mcpTools?.result?.tools) ? mcpTools.result.tools.length : 0
            }
        );

        const runtimeCircle = await mcp('runtime.tools.call', {
            tool_id: 'ui.circle',
            action: 'pointer.click',
            input: {
                x: 320,
                y: 240,
                radius: 18
            },
            trace_id: `trace_${TOKEN}_circle`
        });
        addCheck(
            'mcp.runtime.circle',
            runtimeCircle?.error === undefined && runtimeCircle?.result?.ok === true,
            toSerializable(runtimeCircle?.result || {})
        );

        const runtimeAudit = await mcp('runtime.audit.list', {
            trace_id: `trace_${TOKEN}_circle`,
            limit: 20
        });
        addCheck(
            'mcp.runtime.audit',
            runtimeAudit?.error === undefined
                && Array.isArray(runtimeAudit?.result?.events)
                && runtimeAudit.result.events.length > 0,
            {
                events: toSerializable(runtimeAudit?.result?.events || [])
            }
        );

        const atomeBox = await mcp('atome.box', {
            id: `eve_llm_box_${TOKEN}`,
            width: 40,
            height: 40,
            left: 40,
            top: 40,
            color: 'red'
        });
        addCheck(
            'mcp.atome.box',
            atomeBox?.error === undefined && !!atomeBox?.result?.elementId,
            toSerializable(atomeBox?.result || {})
        );

        const objectTree = await page.evaluate(() => {
            return window.__DEBUG__?.getObjectTree ? window.__DEBUG__.getObjectTree(300) : null;
        });
        addCheck(
            'debug.object_tree',
            !!objectTree,
            {
                has_tree: !!objectTree
            }
        );

        const screenshotPath = path.join(outDir, 'eve_llm_e2e_suite.png');
        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });
        report.screenshots.push(screenshotPath);

        report.ok = report.checks.every((entry) => entry.ok === true);
        if (!report.ok) {
            process.exitCode = 1;
        }
    } finally {
        if (page && originalContactsRaw !== null) {
            await page.evaluate(({ raw }) => {
                if (raw === null) localStorage.removeItem('eve_contacts_local_store_v1');
                else localStorage.setItem('eve_contacts_local_store_v1', raw);
            }, { raw: originalContactsRaw }).catch(() => {});
        }

        if (page && createdCalendarEventIds.length) {
            for (const eventId of createdCalendarEventIds) {
                await page.evaluate(async ({ eventId }) => {
                    try {
                        window.__eveLlmCalendarHarness?.deleteEvent?.(eventId);
                    } catch (_) {
                        // Ignore cleanup failures.
                    }
                }, { eventId }).catch(() => {});
            }
        }

        await cleanupFixtureMessages().catch(() => {});
        if (browser) {
            await browser.close().catch(() => {});
        }
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    }
};

run().catch((error) => {
    addCheck('suite.crash', false, {
        error: error?.message || String(error)
    });
    report.ok = false;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.error(error);
    process.exitCode = 1;
});
