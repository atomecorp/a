import { normalizeLocalVoiceCommand } from './session_runtime.js';

export const VOICE_INTENT_SCHEMA_VERSION = '1.0.0';
export const VOICE_INTENT_TYPES = Object.freeze([
    'local_command',
    'agent_tool',
    'agent_toolchain',
    'runtime_tool',
    'runtime_toolchain',
    'connector_tool',
    'connector_toolchain',
    'ambiguous'
]);
export const VOICE_INTENT_TARGETS = Object.freeze([
    'voice_runtime',
    'atome_ai',
    'runtime_v2',
    'mcp',
    'pending_connector',
    'none'
]);
export const VOICE_INTENT_DOMAINS = Object.freeze([
    'conversation_control',
    'ui_navigation',
    'calendar',
    'mail',
    'contacts',
    'bank',
    'media',
    'creative',
    'capture',
    'unknown'
]);

const DEFAULT_LOCALE = 'fr-FR';

const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueStrings = (values = []) => Array.from(new Set(
    (Array.isArray(values) ? values : [values])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
));

const hasAnyKeyword = (normalized, keywords = []) => {
    if (!normalized) return false;
    return keywords.some((keyword) => normalized.includes(keyword));
};

const hasUnreadMailQualifier = (normalized = '') => {
    if (!normalized) return false;
    return (
        hasAnyKeyword(normalized, [
            'non lu',
            'non lus',
            'non lue',
            'non lues',
            'nouveau mail',
            'nouveaux mails',
            'new mail',
            'new mails'
        ])
        || /\bn\w{1,4}\s+lu(?:e|es|s)?\b/.test(normalized)
    );
};

const hasMailStatusQuestion = (normalized = '') => {
    if (!normalized) return false;
    return (
        hasAnyKeyword(normalized, [
            'ai je',
            'ais je',
            'est ce que j ai',
            'y a t il',
            'il y a',
            'combien'
        ])
    );
};

const readTimeReference = (normalized) => {
    if (!normalized) return null;
    if (hasAnyKeyword(normalized, ['aujourd hui', 'today'])) return 'today';
    if (hasAnyKeyword(normalized, ['demain', 'tomorrow'])) return 'tomorrow';
    if (hasAnyKeyword(normalized, ['cette semaine', 'semaine'])) return 'this_week';
    if (hasAnyKeyword(normalized, ['ce mois', 'mois'])) return 'this_month';
    return null;
};

const readHourReference = (rawUtterance) => {
    const match = String(rawUtterance || '').match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/i);
    if (!match) return null;
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2] || 0)));
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const readParticipant = (rawUtterance) => {
    const match = String(rawUtterance || '').match(/\bavec\s+([^\n,.!?]+)/i);
    if (!match) return null;
    const value = String(match[1] || '').trim();
    return value || null;
};

const readReplyDraftDetails = (rawUtterance) => {
    const match = String(rawUtterance || '').match(/^\s*r(?:e|é)ponds?\s+(.+)$/i);
    if (!match) return null;
    const value = String(match[1] || '').trim();
    if (!value) return null;

    const targetedWithClause = value.match(/^(?:a|à)\s+(.+?)\s+que\s+(.+)$/i);
    if (targetedWithClause) {
        const replyTarget = String(targetedWithClause[1] || '').trim();
        const draftText = String(targetedWithClause[2] || '').trim();
        return {
            reply_target: replyTarget || null,
            draft_text: draftText || null
        };
    }

    const targetedDirect = value.match(/^(?:a|à)\s+(.+?)\s*[:,]\s*(.+)$/i);
    if (targetedDirect) {
        const replyTarget = String(targetedDirect[1] || '').trim();
        const draftText = String(targetedDirect[2] || '').trim();
        return {
            reply_target: replyTarget || null,
            draft_text: draftText || null
        };
    }

    return {
        reply_target: null,
        draft_text: value
    };
};

const readReplyDraft = (rawUtterance) => readReplyDraftDetails(rawUtterance)?.draft_text || null;

const shouldAutoSendReply = (rawUtterance, draftText) => {
    const normalized = normalizeText(rawUtterance);
    if (!String(draftText || '').trim()) return false;
    if (!normalized) return true;
    if (
        hasAnyKeyword(normalized, [
            'confirme moi',
            'confirme avant',
            'demande moi avant',
            'sans envoyer',
            'brouillon',
            'prepare un brouillon',
            'prepare la reponse'
        ])
    ) {
        return false;
    }
    return true;
};

const buildRuntimeToolStep = ({
    tool_id,
    action = 'pointer.click',
    input = {},
    description = null
} = {}) => ({
    source: 'runtime_v2',
    tool_id: String(tool_id || '').trim() || null,
    action: String(action || 'pointer.click'),
    input: input && typeof input === 'object' ? { ...input } : {},
    description: description ? String(description) : null
});

const buildPendingConnectorStep = ({
    capability,
    description = null,
    input = {}
} = {}) => ({
    source: 'pending_connector',
    capability: String(capability || '').trim() || null,
    input: input && typeof input === 'object' ? { ...input } : {},
    description: description ? String(description) : null
});

const getRuntimeToolSet = (runtimeTools = []) => {
    const set = new Set();
    for (const tool of Array.isArray(runtimeTools) ? runtimeTools : []) {
        const id = String(tool?.tool_id || tool?.id || '').trim();
        const key = String(tool?.tool_key || '').trim();
        if (id) set.add(id);
        if (key) set.add(key);
    }
    return set;
};

const runtimeToolExists = (toolId, runtimeToolSet) => {
    if (!toolId) return false;
    if (!(runtimeToolSet instanceof Set) || runtimeToolSet.size === 0) return true;
    return runtimeToolSet.has(String(toolId));
};

const readActiveDomain = (context = {}) => {
    const candidates = [
        context?.active_intent?.domain,
        context?.active_domain,
        context?.domain,
        context?.current_domain
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return null;
};

const buildBaseIntent = ({
    intent_id = null,
    utterance = '',
    locale = DEFAULT_LOCALE,
    source = null,
    context = {}
} = {}) => ({
    schema_version: VOICE_INTENT_SCHEMA_VERSION,
    intent_id: String(intent_id || '').trim() || null,
    type: 'ambiguous',
    domain: 'unknown',
    action: 'unknown',
    locale: String(locale || DEFAULT_LOCALE),
    confidence: 0,
    status: 'ambiguous',
    utterance: {
        raw: String(utterance || ''),
        normalized: normalizeText(utterance)
    },
    source: {
        type: String(source?.type || 'voice'),
        layer: String(source?.layer || 'voice_intent_schema')
    },
    context: context && typeof context === 'object' ? { ...context } : {},
    entities: {},
    requested_capabilities: [],
    execution: {
        target: 'none',
        toolchain: [],
        confirmation_required: false
    }
});

export const normalizeVoiceIntent = (intent = {}) => {
    const base = buildBaseIntent({
        intent_id: intent.intent_id,
        utterance: intent?.utterance?.raw || intent.utterance || '',
        locale: intent.locale,
        source: intent.source,
        context: intent.context
    });

    const normalized = {
        ...base,
        ...intent,
        schema_version: VOICE_INTENT_SCHEMA_VERSION,
        type: VOICE_INTENT_TYPES.includes(intent.type) ? intent.type : base.type,
        domain: VOICE_INTENT_DOMAINS.includes(intent.domain) ? intent.domain : base.domain,
        confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : base.confidence,
        status: String(intent.status || base.status),
        utterance: {
            raw: String(intent?.utterance?.raw || intent.utterance?.raw || base.utterance.raw),
            normalized: normalizeText(intent?.utterance?.normalized || intent?.utterance?.raw || intent.utterance || base.utterance.raw)
        },
        source: {
            type: String(intent?.source?.type || base.source.type),
            layer: String(intent?.source?.layer || base.source.layer)
        },
        context: intent?.context && typeof intent.context === 'object' ? { ...intent.context } : base.context,
        entities: intent?.entities && typeof intent.entities === 'object' ? { ...intent.entities } : {},
        requested_capabilities: uniqueStrings(intent.requested_capabilities),
        execution: {
            target: VOICE_INTENT_TARGETS.includes(intent?.execution?.target) ? intent.execution.target : base.execution.target,
            toolchain: Array.isArray(intent?.execution?.toolchain)
                ? intent.execution.toolchain.map((step) => ({ ...step }))
                : [],
            confirmation_required: intent?.execution?.confirmation_required === true
        }
    };

    if (!normalized.execution.toolchain.length && normalized.execution.target === 'none' && normalized.status === 'ready') {
        normalized.status = 'ambiguous';
    }
    return normalized;
};

const buildLocalCommandIntent = (rawUtterance, parsed, options = {}) => normalizeVoiceIntent({
    intent_id: options.intent_id,
    utterance: { raw: rawUtterance },
    locale: options.locale,
    source: options.source,
    context: options.context,
    type: 'local_command',
    domain: 'conversation_control',
    action: parsed.command,
    confidence: 0.99,
    status: 'ready',
    entities: {
        command: parsed.command,
        matched_alias: parsed.matched_alias
    },
    execution: {
        target: 'voice_runtime',
        toolchain: [{
            source: 'voice_runtime',
            command: parsed.command,
            utterance: rawUtterance
        }],
        confirmation_required: false
    }
});

const tryBuildContextualMailIntent = (base) => {
    const activeDomain = readActiveDomain(base.context);
    const normalized = base.utterance.normalized;
    if (activeDomain !== 'mail') return null;

    if (normalized.startsWith('lis le suivant') || normalized.startsWith('lis suivant')) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'read_next',
            confidence: 0.9,
            status: 'pending_connector',
            requested_capabilities: ['mail_next_unread'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_next_unread',
                    description: 'Read the next unread mail in the current context.',
                    input: { context: 'current' }
                })]
            }
        });
    }

    const replyDraft = readReplyDraftDetails(base.utterance.raw);
    if (normalized.startsWith('reponds ') || normalized === 'reponds' || normalized === 'repond') {
        const autoSend = shouldAutoSendReply(base.utterance.raw, replyDraft?.draft_text);
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'reply_current',
            confidence: 0.92,
            status: 'pending_connector',
            entities: {
                draft_text: replyDraft?.draft_text || null,
                auto_send: autoSend,
                ...(replyDraft?.reply_target ? { reply_target: replyDraft.reply_target } : {})
            },
            requested_capabilities: ['mail_reply_draft'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_reply_draft',
                    description: 'Draft a reply for the current mail context.',
                    input: {
                        context: 'current',
                        draft_text: replyDraft?.draft_text || null,
                        auto_send: autoSend,
                        ...(replyDraft?.reply_target ? { reply_target: replyDraft.reply_target } : {})
                    }
                })]
            }
        });
    }

    return null;
};

const tryBuildCalendarIntent = (base, runtimeToolSet) => {
    const normalized = base.utterance.normalized;
    if (!hasAnyKeyword(normalized, ['agenda', 'calendrier', 'rendez vous', 'rendez-vous'])) return null;

    const createIntent = hasAnyKeyword(normalized, ['ajoute', 'cree', 'creer', 'planifie', 'programme']);
    const updateIntent = hasAnyKeyword(normalized, ['decale', 'modifie', 'change', 'mets a jour']);
    const deleteIntent = hasAnyKeyword(normalized, ['supprime', 'annule', 'retire']);
    const action = createIntent
        ? 'create_event'
        : (updateIntent ? 'update_event' : (deleteIntent ? 'delete_event' : 'list_events'));

    const toolchain = [];
    if (action === 'create_event' && runtimeToolExists('calendar.ensure_calendar', runtimeToolSet)) {
        toolchain.push(buildRuntimeToolStep({
            tool_id: 'calendar.ensure_calendar',
            description: 'Ensure a writable calendar exists before creating the event.'
        }));
    }

    const actionToolId = `calendar.${action}`;
    if (runtimeToolExists(actionToolId, runtimeToolSet)) {
        toolchain.push(buildRuntimeToolStep({
            tool_id: actionToolId,
            input: {
                temporal_ref: readTimeReference(normalized),
                time_hint: readHourReference(base.utterance.raw),
                participant_hint: readParticipant(base.utterance.raw)
            },
            description: `Voice intent routed to ${actionToolId}.`
        }));
    }

    return normalizeVoiceIntent({
        ...base,
        type: toolchain.length > 1 ? 'runtime_toolchain' : 'runtime_tool',
        domain: 'calendar',
        action,
        confidence: 0.82,
        status: toolchain.length ? 'ready' : 'pending_connector',
        entities: {
            temporal_ref: readTimeReference(normalized),
            time_hint: readHourReference(base.utterance.raw),
            participant_hint: readParticipant(base.utterance.raw)
        },
        requested_capabilities: toolchain.length ? [] : [`calendar_${action}`],
        execution: {
            target: toolchain.length ? 'runtime_v2' : 'pending_connector',
            toolchain,
            confirmation_required: action === 'delete_event'
        }
    });
};

const tryBuildMailIntent = (base) => {
    const normalized = base.utterance.normalized;
    if (!hasAnyKeyword(normalized, ['mail', 'mails', 'message', 'messages', 'courriel'])) return null;
    const unreadOnly = hasUnreadMailQualifier(normalized);
    const statusOnly = unreadOnly && hasMailStatusQuestion(normalized);

    let action = 'list';
    if (hasAnyKeyword(normalized, ['reponds', 'repond', 'reponse'])) action = 'reply';
    else if (hasAnyKeyword(normalized, ['envoie', 'envoyer'])) action = 'send';
    else if (hasAnyKeyword(normalized, ['cherche', 'recherche', 'trouve'])) action = 'search';
    else if (hasAnyKeyword(normalized, ['lis', 'lecture', 'suivant', 'prochain'])) action = 'read';
    else if (hasAnyKeyword(normalized, ['resume', 'resumer'])) action = 'summarize';

    const capabilityMap = {
        list: ['mail_list'],
        read: ['mail_read', 'mail_next_unread'],
        summarize: ['mail_list', 'mail_summarize'],
        reply: ['mail_reply_draft', 'mail_send'],
        send: ['mail_send'],
        search: ['mail_search']
    };
    const replyDraft = action === 'reply'
        ? readReplyDraftDetails(base.utterance.raw)
        : null;
    const autoSend = action === 'reply'
        ? shouldAutoSendReply(base.utterance.raw, replyDraft?.draft_text)
        : false;

    if (action === 'reply') {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action,
            confidence: 0.82,
            status: 'pending_connector',
            entities: {
                temporal_ref: readTimeReference(normalized),
                draft_text: replyDraft?.draft_text || null,
                auto_send: autoSend,
                ...(replyDraft?.reply_target ? { reply_target: replyDraft.reply_target } : {})
            },
            requested_capabilities: ['mail_reply_draft'],
            execution: {
                target: 'pending_connector',
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_reply_draft',
                    input: {
                        temporal_ref: readTimeReference(normalized),
                        draft_text: replyDraft?.draft_text || null,
                        auto_send: autoSend,
                        ...(replyDraft?.reply_target ? { reply_target: replyDraft.reply_target } : {})
                    }
                })],
                confirmation_required: false
            }
        });
    }

    return normalizeVoiceIntent({
        ...base,
        type: action === 'reply' || action === 'summarize' ? 'connector_toolchain' : 'connector_tool',
        domain: 'mail',
        action,
        confidence: 0.78,
        status: 'pending_connector',
        entities: {
            temporal_ref: readTimeReference(normalized),
            unread_only: unreadOnly,
            status_only: statusOnly
        },
        requested_capabilities: capabilityMap[action] || ['mail_list'],
        execution: {
            target: 'pending_connector',
            toolchain: (capabilityMap[action] || ['mail_list']).map((capability) => buildPendingConnectorStep({
                capability,
                input: {
                    temporal_ref: readTimeReference(normalized),
                    unread_only: unreadOnly,
                    status_only: statusOnly
                }
            })),
            confirmation_required: false
        }
    });
};

const tryBuildBankIntent = (base) => {
    const normalized = base.utterance.normalized;
    if (!hasAnyKeyword(normalized, ['banque', 'compte', 'solde', 'depense', 'depenses', 'virement', 'paye', 'payer'])) return null;

    let action = 'summary';
    if (hasAnyKeyword(normalized, ['solde', 'compte'])) action = 'balance';
    if (hasAnyKeyword(normalized, ['paye', 'payer', 'versement'])) action = 'find_payer';
    if (hasAnyKeyword(normalized, ['depense', 'depenses', 'commercant', 'marchand'])) action = 'top_spending';

    const capabilityMap = {
        balance: ['bank_balance', 'bank_summary'],
        summary: ['bank_summary'],
        find_payer: ['bank_find_payer'],
        top_spending: ['bank_spending_top_merchants']
    };

    return normalizeVoiceIntent({
        ...base,
        type: 'connector_toolchain',
        domain: 'bank',
        action,
        confidence: 0.8,
        status: 'pending_connector',
        entities: {
            temporal_ref: readTimeReference(normalized)
        },
        requested_capabilities: capabilityMap[action] || ['bank_summary'],
        execution: {
            target: 'pending_connector',
            toolchain: (capabilityMap[action] || ['bank_summary']).map((capability) => buildPendingConnectorStep({
                capability,
                input: {
                    temporal_ref: readTimeReference(normalized)
                }
            })),
            confirmation_required: false
        }
    });
};

const tryBuildRuntimeUiIntent = (base, runtimeToolSet) => {
    const normalized = base.utterance.normalized;
    const rules = [
        {
            when: ['ouvre mtrack', 'ouvre le mtrack', 'montage', 'timeline', 'mtrack'],
            intent: {
                domain: 'media',
                action: 'open_mtrack',
                tool_id: 'tool.main.mtrack',
                description: 'Open the MTrack main tool.'
            }
        },
        {
            when: ['ouvre le calendrier', 'ouvre calendrier', 'agenda', 'calendrier'],
            intent: {
                domain: 'calendar',
                action: 'open_calendar',
                tool_id: 'tool.main.time',
                description: 'Open the time/calendar main tool.'
            }
        },
        {
            when: ['ouvre les messages', 'ouvre la communication', 'contacts', 'communique', 'message'],
            intent: {
                domain: 'ui_navigation',
                action: 'open_communicate',
                tool_id: 'tool.main.communicate',
                description: 'Open the communicate main tool.'
            }
        },
        {
            when: ['ouvre la capture', 'capture', 'enregistre', 'camera', 'micro'],
            intent: {
                domain: 'capture',
                action: 'open_capture',
                tool_id: 'tool.main.capture',
                description: 'Open the capture main tool.'
            }
        },
        {
            when: ['dessine un cercle', 'cree un cercle', 'ajoute un cercle'],
            intent: {
                domain: 'creative',
                action: 'draw_circle',
                tool_id: 'ui.circle',
                description: 'Create a circle with the runtime drawing tool.'
            }
        },
        {
            when: ['ajoute du texte', 'cree du texte', 'ecris du texte'],
            intent: {
                domain: 'creative',
                action: 'create_text',
                tool_id: 'ui.text.create',
                description: 'Create a text element through the runtime tool.'
            }
        },
        {
            when: ['selectionne', 'selection'],
            intent: {
                domain: 'ui_navigation',
                action: 'select',
                tool_id: 'ui.select',
                description: 'Select an item through the runtime tool.'
            }
        },
        {
            when: ['deplace', 'bouge'],
            intent: {
                domain: 'ui_navigation',
                action: 'move',
                tool_id: 'ui.move',
                description: 'Move the current selection.'
            }
        },
        {
            when: ['joue', 'lecture', 'play'],
            intent: {
                domain: 'media',
                action: 'play',
                tool_id: 'ui.play',
                description: 'Start playback.'
            }
        },
        {
            when: ['pause'],
            intent: {
                domain: 'media',
                action: 'pause',
                tool_id: 'ui.pause',
                description: 'Pause playback.'
            }
        }
    ];

    const match = rules.find((rule) => rule.when.some((keyword) => normalized.includes(keyword)));
    if (!match) return null;
    if (!runtimeToolExists(match.intent.tool_id, runtimeToolSet)) {
        return normalizeVoiceIntent({
            ...base,
            type: 'runtime_tool',
            domain: match.intent.domain,
            action: match.intent.action,
            confidence: 0.74,
            status: 'ambiguous',
            execution: {
                target: 'none',
                toolchain: [],
                confirmation_required: false
            }
        });
    }

    return normalizeVoiceIntent({
        ...base,
        type: 'runtime_tool',
        domain: match.intent.domain,
        action: match.intent.action,
        confidence: 0.84,
        status: 'ready',
        execution: {
            target: 'runtime_v2',
            toolchain: [buildRuntimeToolStep({
                tool_id: match.intent.tool_id,
                description: match.intent.description
            })],
            confirmation_required: false
        }
    });
};

export const classifyVoiceIntent = (utterance, {
    intent_id = null,
    locale = DEFAULT_LOCALE,
    source = null,
    context = {},
    runtime_tools = [],
    allow_business_heuristics = true
} = {}) => {
    const rawUtterance = String(utterance || '').trim();
    const base = buildBaseIntent({
        intent_id,
        utterance: rawUtterance,
        locale,
        source,
        context
    });
    const runtimeToolSet = getRuntimeToolSet(runtime_tools);

    const contextualMailIntent = tryBuildContextualMailIntent(base);
    if (contextualMailIntent) return contextualMailIntent;

    const localCommand = normalizeLocalVoiceCommand(rawUtterance);
    if (localCommand) {
        return buildLocalCommandIntent(rawUtterance, localCommand, {
            intent_id,
            locale,
            source,
            context
        });
    }

    if (allow_business_heuristics !== true) {
        return normalizeVoiceIntent({
            ...base,
            confidence: 0.18,
            status: 'ambiguous'
        });
    }

    const calendarIntent = tryBuildCalendarIntent(base, runtimeToolSet);
    if (calendarIntent) return calendarIntent;

    const runtimeIntent = tryBuildRuntimeUiIntent(base, runtimeToolSet);
    if (runtimeIntent) return runtimeIntent;

    const mailIntent = tryBuildMailIntent(base);
    if (mailIntent) return mailIntent;

    const bankIntent = tryBuildBankIntent(base);
    if (bankIntent) return bankIntent;

    return normalizeVoiceIntent({
        ...base,
        confidence: 0.18,
        status: 'ambiguous'
    });
};
