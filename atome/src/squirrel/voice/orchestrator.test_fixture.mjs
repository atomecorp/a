import { createGlobalMailApi } from '../mail/bootstrap.js';
import { normalizeVoiceIntent } from './intent_schema.js';
import { runtimeTools } from './orchestrator.planner_fixture.mjs';

export { createStructuredPlanner, runtimeTools } from './orchestrator.planner_fixture.mjs';

export const createMcpEnv = (calls = []) => ({
    async handleAtomeMCPRequestAsync(request = {}) {
        calls.push(request);
        if (request.method === 'runtime.tools.list') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: { tools: runtimeTools }
            };
        }
        if (request.method === 'runtime.tools.call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    mode: 'single',
                    tool_id: request.params.tool_id
                }
            };
        }
        if (request.method === 'runtime.tools.batch_call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    mode: 'batch',
                    tx_id: request.params.tx_id,
                    results: request.params.events.map((entry) => ({ ok: true, tool_id: entry.tool_id }))
                }
            };
        }
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: { message: `Unhandled ${request.method}` }
        };
    }
});

export const createMailApiWithMessages = (messages = []) => {
    const env = {};
    const mailApi = createGlobalMailApi({ env });
    mailApi.ingest(messages);
    return { env, mailApi };
};

export const createReadyMailEnv = () => ({
    atome: {
        mail: {
            __readyCalls: 0,
            async ensureReady() {
                this.__readyCalls += 1;
                return {
                    ok: true,
                    items: [{
                        message_id: 'voice_mail_ready_1',
                        mailbox: 'inbox',
                        subject: 'Mail distant disponible',
                        preview: 'Le miroir Fastify a hydrate l index local',
                        body_text: 'Le miroir Fastify a hydrate l index local',
                        unread: true,
                        from: { address: 'alice@example.test' },
                        received_at: '2026-03-17T13:00:00Z'
                    }]
                };
            },
            connectorStatus() {
                return { ok: true, configured: false, provider: null };
            },
            list() {
                return {
                    ok: true,
                    items: [{
                        message_id: 'voice_mail_ready_1',
                        mailbox: 'inbox',
                        subject: 'Mail distant disponible',
                        preview: 'Le miroir Fastify a hydrate l index local',
                        body_text: 'Le miroir Fastify a hydrate l index local',
                        unread: true,
                        from: { address: 'alice@example.test' },
                        received_at: '2026-03-17T13:00:00Z'
                    }]
                };
            },
            nextUnread() {
                return {
                    ok: true,
                    item: {
                        message_id: 'voice_mail_ready_1',
                        mailbox: 'inbox',
                        subject: 'Mail distant disponible',
                        preview: 'Le miroir Fastify a hydrate l index local',
                        body_text: 'Le miroir Fastify a hydrate l index local',
                        unread: true,
                        from: { address: 'alice@example.test' }
                    }
                };
            },
            buildReadout() {
                return {
                    ok: true,
                    text: 'De alice@example.test. Sujet: Mail distant disponible. Le miroir Fastify a hydrate l index local.'
                };
            },
            summarize() {
                return {
                    ok: true,
                    summary: '1 unread message out of 1.'
                };
            }
        }
    }
});

export const createHostWindowMailEnv = () => {
    const requests = [];
    const hostWindow = {
        location: {
            origin: 'http://127.0.0.1:3000',
            protocol: 'http:',
            hostname: '127.0.0.1'
        },
        fetch: async (url, options = {}) => {
            requests.push({ url, options });
            return {
                ok: true,
                async json() {
                    return {
                        ok: true,
                        provider: 'custom_imap_smtp',
                        mailbox: 'inbox',
                        items: [{
                            message_id: 'voice_mail_host_window_1',
                            mailbox: 'inbox',
                            subject: 'Mail via host window',
                            preview: 'Lecture depuis le host window',
                            body_text: 'Lecture depuis le host window',
                            unread: true,
                            from: { address: 'host@example.test' },
                            received_at: '2026-03-18T10:00:00Z'
                        }]
                    };
                }
            };
        },
        Squirrel: {},
        atome: {},
        __eveProfilePreferences: {
            mail: {
                provider: 'custom_imap_smtp',
                email: 'jeezs@atome.one',
                username: 'jeezs@atome.one',
                password: 'secret-pass',
                mailbox: 'INBOX',
                imap: { host: 'rousse.o2switch.net', port: 993, security: 'tls' },
                smtp: { host: 'rousse.o2switch.net', port: 587, security: 'starttls' }
            }
        }
    };
    return {
        env: {
            window: hostWindow,
            Squirrel: {},
            atome: {}
        },
        requests
    };
};

export const createStalledMailEnv = () => ({
    __SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS: 5,
    Squirrel: {
        mail: {
            connectorStatus() {
                return { ok: true, configured: true, provider: 'icloud_imap_smtp' };
            },
            syncPull() {
                return new Promise(() => { });
            },
            list() {
                return {
                    ok: true,
                    items: [{
                        message_id: 'voice_mail_stalled_1',
                        subject: 'Resume hebdomadaire',
                        preview: 'Voici le resume',
                        body_text: 'Voici le resume',
                        from: { name: 'Alice', address: 'alice@example.test' }
                    }]
                };
            },
            nextUnread() {
                return {
                    ok: true,
                    item: {
                        message_id: 'voice_mail_stalled_1',
                        subject: 'Resume hebdomadaire',
                        preview: 'Voici le resume',
                        body_text: 'Voici le resume',
                        from: { name: 'Alice', address: 'alice@example.test' }
                    }
                };
            },
            buildReadout() {
                return {
                    ok: true,
                    text: 'De Alice. Sujet: Resume hebdomadaire. Voici le resume'
                };
            }
        }
    }
});

export const createContextualReplyPlanner = () => ({
    async planUtterance(utterance, options = {}) {
        if (/j ai de nouveaux mails/i.test(String(utterance))) {
            return normalizeVoiceIntent({
                intent_id: options.intent_id,
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                source: options.source,
                context: options.context,
                type: 'agent_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.status',
                        params: { unread_only: true, status_only: true }
                    }]
                }
            });
        }
        return normalizeVoiceIntent({
            intent_id: options.intent_id,
            utterance: { raw: utterance },
            locale: options.locale || 'fr-FR',
            source: options.source,
            context: options.context,
            type: 'connector_tool',
            domain: 'mail',
            action: 'reply_current',
            status: 'ready',
            assistant_reply: '',
            entities: {
                draft_text: 'oui tout va bien',
                auto_send: true
            },
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: []
            }
        });
    }
});
