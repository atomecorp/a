import { normalizeVoiceIntent } from './intent_schema.js';

export const runtimeTools = [
    { tool_id: 'tool.main.home', tool_key: 'main_home' },
    { tool_id: 'calendar.ensure_calendar', tool_key: 'calendar_ensure_calendar' },
    { tool_id: 'calendar.create_event', tool_key: 'calendar_create_event' },
    { tool_id: 'calendar.list_events', tool_key: 'calendar_list_events' }
];

export const createStructuredPlanner = () => ({
    async planUtterance(utterance, options = {}) {
        const raw = String(utterance || '').trim();
        const normalized = raw.toLowerCase();
        const locale = options.locale || 'fr-FR';
        const base = {
            intent_id: options.intent_id || `voice_test_${normalized.replace(/[^a-z0-9]+/g, '_')}`,
            utterance: { raw },
            locale,
            source: options.source,
            context: options.context
        };

        if (normalized === 'ouvre home') {
            return normalizeVoiceIntent({
                ...base,
                type: 'runtime_tool',
                domain: 'ui_navigation',
                action: 'open_tool',
                status: 'ready',
                assistant_reply: 'J ouvre Home.',
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'runtime_v2',
                        tool_id: 'tool.main.home',
                        action: 'pointer.click',
                        input: {}
                    }]
                }
            });
        }

        if (normalized.includes('ajoute un rendez-vous demain a 15h avec paul')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'runtime_toolchain',
                domain: 'calendar',
                action: 'create_event',
                status: 'ready',
                entities: {
                    temporal_ref: 'tomorrow',
                    time_hint: '15:00',
                    participant_hint: 'Paul'
                },
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [
                        {
                            source: 'runtime_v2',
                            tool_id: 'calendar.ensure_calendar',
                            action: 'pointer.click',
                            input: {}
                        },
                        {
                            source: 'runtime_v2',
                            tool_id: 'calendar.create_event',
                            action: 'pointer.click',
                            input: {
                                temporal_ref: 'tomorrow',
                                time_hint: '15:00',
                                participant_hint: 'Paul'
                            }
                        }
                    ]
                }
            });
        }

        if (normalized === 'lis mes mails') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'marque le comme non lu') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'mark_unread_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'archive le') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'archive_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('resume de mes derniers mails') || normalized.includes('fais moi un resume de mes derniers mails')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'summarize',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('ais je de nouveaux mails') || normalized.includes('j ai de nouveaux mails')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                entities: {
                    unread_only: true,
                    status_only: true
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes("d autres personnes que jean-eric")) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                entities: {
                    status_only: true,
                    not_from: 'Jean-Eric'
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('que contient ce mail') || normalized.includes('fais moi un resume')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'summarize_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('mail le plus ancien')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'read_current',
                status: 'ready',
                entities: {
                    order: 'oldest'
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'lis le') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'read_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.startsWith('reponds a jean-eric que ')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
                entities: {
                    reply_target: 'Jean-Eric',
                    draft_text: 'j ai bien recu le mail',
                    auto_send: true
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'reponds oui tout va bien') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
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

        if (normalized === 'envoie le mail') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'send',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        return normalizeVoiceIntent({
            ...base,
            type: 'ambiguous',
            domain: 'unknown',
            action: 'unknown',
            status: 'failed',
            assistant_reply: "Le planner IA n'a pas su classifier cette demande de test.",
            context: {
                ...(options.context && typeof options.context === 'object' ? options.context : {}),
                ai_error: 'test_planner_unmatched'
            },
            execution: {
                target: 'none',
                confirmation_required: false,
                toolchain: []
            }
        });
    }
});

