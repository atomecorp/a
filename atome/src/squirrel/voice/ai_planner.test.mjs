import assert from 'node:assert/strict';

import { createVoiceAiPlanner } from './ai_planner.js';

const env = {
    fetch: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            reply: 'J ouvre Home.',
                            domain: 'ui_navigation',
                            action: 'open_tool',
                            target: 'runtime_v2',
                            actions: [{
                                target: 'runtime_v2',
                                tool_id: 'tool.main.home',
                                action: 'pointer.click',
                                input: {}
                            }]
                        })
                    }
                }]
            };
        }
    }),
    AtomeAI: {
        listTools() {
            return [{ name: 'contacts.list', description: 'List contacts' }];
        }
    }
};

const planner = createVoiceAiPlanner({
    env,
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'voice-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: env.fetch
});

const planned = await planner.planUtterance('Ouvre Home', {
    locale: 'fr-FR',
    runtime_tools: [{ tool_id: 'tool.main.home', tool_key: 'main_home' }],
    heuristic_intent: {
        domain: 'ui_navigation',
        action: 'open_tool'
    }
});

assert.equal(planned.execution.target, 'runtime_v2', 'voice ai planner should preserve runtime target planning');
assert.equal(planned.execution.toolchain[0]?.tool_id, 'tool.main.home', 'voice ai planner should return runtime tool ids from the provider plan');
assert.equal(planned.assistant_reply, 'J ouvre Home.', 'voice ai planner should preserve the provider spoken reply');
assert.equal(planned.domain, 'ui_navigation', 'voice ai planner should preserve the domain selected by the provider');
assert.equal(planned.action, 'open_tool', 'voice ai planner should preserve the action selected by the provider');

const mailPlanner = createVoiceAiPlanner({
    env: {
        ...env,
        fetch: async () => ({
            ok: true,
            async json() {
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                reply: '',
                                domain: 'mail',
                                action: 'list',
                                target: 'atome_ai',
                                actions: [{
                                    target: 'atome_ai',
                                    tool_name: 'mail.list',
                                    params: {
                                        status_only: true,
                                        not_from: 'Jean-Eric'
                                    }
                                }]
                            })
                        }
                    }]
                };
            }
        })
    },
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'voice-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            reply: '',
                                domain: 'mail',
                                action: 'list',
                                target: 'atome_ai',
                                actions: [{
                                    target: 'atome_ai',
                                    tool_name: 'mail.list',
                                    params: {
                                        status_only: true,
                                        not_from: 'Jean-Eric'
                                    }
                                }]
                        })
                    }
                }]
            };
        }
    })
});

const plannedMailFilter = await mailPlanner.planUtterance('Ai je des messages d autres personnes que Jean-Eric ?', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'mail',
        action: 'list'
    }
});
assert.equal(plannedMailFilter.execution.target, 'atome_ai', 'voice ai planner should preserve mail tool targets');
assert.equal(plannedMailFilter.execution.toolchain[0]?.tool_name, 'mail.list', 'voice ai planner should preserve planned mail tools');
assert.equal(plannedMailFilter.execution.toolchain[0]?.params?.not_from, 'Jean-Eric', 'voice ai planner should preserve semantic sender exclusion filters');
assert.equal(plannedMailFilter.execution.toolchain[0]?.params?.unread_only, undefined, 'voice ai planner should not inject unread_only when the request only excludes a sender');

let capturedSystemPrompt = '';
const contactsPlanner = createVoiceAiPlanner({
    env: {
        ...env,
        fetch: async (_url, options = {}) => {
            const body = JSON.parse(String(options?.body || '{}'));
            capturedSystemPrompt = String(body?.messages?.[0]?.content || '');
            return {
                ok: true,
                async json() {
                    return {
                        choices: [{
                            message: {
                                content: JSON.stringify({
                                    reply: 'Je mets a jour le contact.',
                                    domain: 'contacts',
                                    action: 'update',
                                    target: 'atome_ai',
                                    query_text: 'Regis',
                                    email: 'jeezs@jeezs.net',
                                    actions: [{
                                        target: 'atome_ai',
                                        tool_name: 'contacts.update',
                                        params: {}
                                    }]
                                })
                            }
                        }]
                    };
                }
            };
        }
    },
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'voice-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: async (_url, options = {}) => {
        const body = JSON.parse(String(options?.body || '{}'));
        capturedSystemPrompt = String(body?.messages?.[0]?.content || '');
        return {
            ok: true,
            async json() {
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                reply: 'Je mets a jour le contact.',
                                domain: 'contacts',
                                action: 'update',
                                target: 'atome_ai',
                                query_text: 'Regis',
                                email: 'jeezs@jeezs.net',
                                actions: [{
                                    target: 'atome_ai',
                                    tool_name: 'contacts.update',
                                    params: {}
                                }]
                            })
                        }
                    }]
                };
            }
        };
    }
});

const plannedContactUpdate = await contactsPlanner.planUtterance('Ajoute jeezs@jeezs.net a Regis', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'contacts',
        action: 'update'
    }
});
assert.equal(plannedContactUpdate.domain, 'contacts');
assert.equal(plannedContactUpdate.action, 'update');
assert.equal(plannedContactUpdate.entities.query_text, 'Regis', 'voice ai planner should keep top-level contact query_text fields');
assert.equal(plannedContactUpdate.entities.email, 'jeezs@jeezs.net', 'voice ai planner should keep top-level contact update fields');
assert.match(capturedSystemPrompt, /Pour les contacts, choisis parmi list_contacts, search_contacts, read_contact, create, update ou delete\./, 'planner system prompt should include explicit contacts guidance');

const calendarPlanner = createVoiceAiPlanner({
    env: {
        ...env,
        fetch: async () => ({
            ok: true,
            async json() {
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                reply: 'Je cree le rendez-vous.',
                                domain: 'calendar',
                                action: 'create_event',
                                target: 'atome_ai',
                                temporal_ref: 'tomorrow',
                                time_hint: '15:00',
                                participant_hint: 'Paul',
                                actions: [{
                                    target: 'atome_ai',
                                    tool_name: 'calendar.create',
                                    params: {}
                                }]
                            })
                        }
                    }]
                };
            }
        })
    },
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'voice-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            reply: 'Je cree le rendez-vous.',
                            domain: 'calendar',
                            action: 'create_event',
                            target: 'atome_ai',
                            temporal_ref: 'tomorrow',
                            time_hint: '15:00',
                            participant_hint: 'Paul',
                            actions: [{
                                target: 'atome_ai',
                                tool_name: 'calendar.create',
                                params: {}
                            }]
                        })
                    }
                }]
            };
        }
    })
});

const plannedCalendarCreate = await calendarPlanner.planUtterance('Ajoute un rendez-vous demain a 15h avec Paul', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'calendar',
        action: 'create_event'
    }
});
assert.equal(plannedCalendarCreate.domain, 'calendar');
assert.equal(plannedCalendarCreate.entities.temporal_ref, 'tomorrow', 'voice ai planner should keep top-level calendar temporal refs');
assert.equal(plannedCalendarCreate.entities.time_hint, '15:00', 'voice ai planner should keep top-level calendar time hints');
assert.equal(plannedCalendarCreate.entities.participant_hint, 'Paul', 'voice ai planner should keep top-level calendar participant hints');

const structuredBusinessPlanner = createVoiceAiPlanner({
    env: {
        ...env,
        fetch: async () => ({
            ok: true,
            async json() {
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                reply: '',
                                domain: 'contacts',
                                action: 'read_contact',
                                target: 'atome_ai',
                                query_text: 'Sylvain'
                            })
                        }
                    }]
                };
            }
        })
    },
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'voice-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            reply: '',
                            domain: 'contacts',
                            action: 'read_contact',
                            target: 'atome_ai',
                            query_text: 'Sylvain'
                        })
                    }
                }]
            };
        }
    })
});

const plannedStructuredBusiness = await structuredBusinessPlanner.planUtterance('Quel est le numero de Sylvain ?', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'contacts',
        action: 'read_contact'
    }
});
assert.equal(plannedStructuredBusiness.execution.target, 'pending_connector', 'voice ai planner should preserve structured business intents even when the provider omitted actions');
assert.equal(plannedStructuredBusiness.type, 'connector_tool', 'voice ai planner should convert action-less business plans into connector intents');
assert.equal(plannedStructuredBusiness.entities.query_text, 'Sylvain', 'voice ai planner should preserve structured business entities without an explicit action list');

const failingPlanner = createVoiceAiPlanner({
    env: {
        ...env,
        fetch: async () => {
            throw new Error('Unauthorized');
        }
    },
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [{ provider: 'openai', model: 'gpt-4o-mini', key: 'bad-key' }]
                }
            }
        };
    },
    fetchImpl: async () => {
        throw new Error('Unauthorized');
    }
});

const failed = await failingPlanner.planUtterance('Open Home', {
    locale: 'en-US',
    heuristic_intent: {
        domain: 'ui_navigation',
        action: 'open_tool'
    }
});

assert.equal(failed.status, 'failed', 'voice ai planner should surface provider failures as failed intents');
assert.equal(failed.context.ai_error, 'provider_auth_failed', 'voice ai planner should expose the normalized provider error');
assert.equal(failed.assistant_reply, 'The AI is not responding.', 'voice ai planner should localize spoken failure replies');

console.log('voice_ai_planner: ok');
