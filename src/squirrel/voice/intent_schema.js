import { normalizeLocalVoiceCommand } from './session_runtime.js';
import { normalizeSTTUtterance } from './stt_normalizer.js';
import { readNormalizedAtomeColorToken } from '../../application/eVe/intuition/shared/color_value.js';

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
            'dis moi si',
            'dis moi si j ai',
            'dis moi s il y a',
            'tell me if',
            'y a t il',
            'il y a',
            'combien'
        ])
    );
};

const readMailAction = (normalized = '') => {
    if (!normalized) return 'list';
    if (
        hasMailStatusQuestion(normalized)
        && hasAnyKeyword(normalized, [
            'nouveau', 'nouveaux', 'nouvelle', 'nouvelles',
            'non lu', 'non lus', 'message', 'messages',
            'courrier', 'courriers', 'courriel', 'courriels',
            'mail', 'mails', 'new', 'unread'
        ])
    ) {
        return 'list';
    }
    if (hasAnyKeyword(normalized, ['archive', 'archiver', 'range', 'classe', 'classer', 'ranger', 'de cote'])) return 'archive';
    if (hasAnyKeyword(normalized, [
        'supprime', 'supprimer', 'efface', 'effacer', 'poubelle', 'corbeille',
        'delete', 'trash', 'remove', 'vire', 'virer', 'degager', 'degage',
        'jette', 'jeter', 'debarrasse', 'debarrasser'
    ])) return 'delete';
    if (
        hasAnyKeyword(normalized, ['marque', 'marquer', 'remets', 'remet', 'repasse', 'repasser'])
        && hasAnyKeyword(normalized, ['non lu', 'non lus', 'non lue', 'non lues', 'unread'])
    ) {
        return 'mark_unread';
    }
    if (
        hasAnyKeyword(normalized, ['marque', 'marquer', 'note', 'noter', 'met en lu', 'mets en lu'])
        && hasAnyKeyword(normalized, ['lu', 'lue', 'lus', 'lues', 'read'])
    ) {
        return 'mark_read';
    }
    if (hasAnyKeyword(normalized, ['reponds', 'repond', 'reponse', 'repondre', 'reply', 'respond'])) return 'reply';
    if (/\b(?:demande|dis|ecris)\s+(?:a|à)\b/i.test(normalized)) return 'reply';
    if (hasAnyKeyword(normalized, ['envoie', 'envoyer', 'send', 'expedie', 'expedier', 'ecris', 'ecrire'])) return 'send';
    if (hasAnyKeyword(normalized, ['cherche', 'recherche', 'trouve', 'trouver', 'search', 'find', 'look for'])) return 'search';
    if (hasAnyKeyword(normalized, [
        'lis', 'lire', 'lecture', 'suivant', 'prochain', 'read',
        'ouvre', 'ouvrir', 'affiche', 'afficher', 'montre', 'montrer',
        'show', 'open', 'display', 'c est quoi', 'dis moi'
    ])) return 'read';
    if (hasAnyKeyword(normalized, [
        'resume', 'resumer', 'summary', 'summarize', 'summarise',
        'un point', 'le point',
        'en resume', 'en bref', 'raconte', 'raconter',
        'de quoi ca parle', 'de quoi il parle', 'de quoi parle',
        'ca dit quoi', 'il dit quoi', 'elle dit quoi',
        'qu est ce que ca dit', 'que dit', 'contenu'
    ])) return 'summarize';
    return 'list';
};

const readCommunicationSurfaces = (normalized = '') => {
    if (!normalized) return ['mail'];
    const surfaces = new Set();
    if (hasAnyKeyword(normalized, ['message', 'messages', 'sms', 'texto', 'textos', 'conversation', 'conversations'])) {
        surfaces.add('messages');
        surfaces.add('mail');
    }
    if (hasAnyKeyword(normalized, ['courrier', 'courriers', 'courriel', 'courriels'])) {
        surfaces.add('messages');
        surfaces.add('mail');
    }
    if (hasAnyKeyword(normalized, ['mail', 'mails', 'email', 'e mail', 'inbox', 'boite de reception', 'boite mail'])) {
        surfaces.add('mail');
    }
    if (!surfaces.size) surfaces.add('mail');
    return Array.from(surfaces);
};

const readTimeReference = (normalized) => {
    if (!normalized) return null;
    if (hasAnyKeyword(normalized, ['aujourd hui', 'today'])) return 'today';
    if (hasAnyKeyword(normalized, ['demain', 'tomorrow'])) return 'tomorrow';
    if (hasAnyKeyword(normalized, ['cette semaine', 'semaine'])) return 'this_week';
    if (hasAnyKeyword(normalized, ['ce mois', 'mois'])) return 'this_month';
    return null;
};

const readExplicitColor = (rawUtterance = '') => {
    const raw = String(rawUtterance || '').trim();
    if (!raw) return null;
    const cssLikeMatch = raw.match(/(#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|lab\([^)]+\)|lch\([^)]+\)|color\([^)]+\)|var\([^)]+\))/i);
    if (cssLikeMatch) {
        return readNormalizedAtomeColorToken(cssLikeMatch[1]) || cssLikeMatch[1];
    }
    const tokens = String(rawUtterance || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9#(),.%\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    for (const token of tokens) {
        const resolved = readNormalizedAtomeColorToken(token);
        if (resolved) return resolved;
    }
    return null;
};

const readActiveRuntimeAtomeId = (context = {}) => {
    const candidates = [
        context?.active_intent?.meta?.atome_id,
        context?.active_intent?.meta?.result?.atome_id,
        context?.active_intent?.entities?.current_atome_id,
        context?.focused_atome_id,
        context?.selected_atome_id
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return null;
};

const wantsRuntimeColorApply = (normalized = '') => {
    if (!normalized) return false;
    if (hasAnyKeyword(normalized, ['couleur', 'color', 'colour', 'peins', 'peint', 'colore', 'colorie'])) return true;
    return (
        normalized.startsWith('met le en ')
        || normalized.startsWith('mets le en ')
        || normalized.startsWith('met la en ')
        || normalized.startsWith('mets la en ')
        || normalized.startsWith('mets le ')
        || normalized.startsWith('met le ')
        || normalized.startsWith('rends le ')
        || normalized.startsWith('rend le ')
        || normalized.startsWith('change le en ')
        || normalized.startsWith('change la en ')
    );
};

export const readMailOrderReference = (normalized = '') => {
    if (!normalized) return null;
    if (hasAnyKeyword(normalized, [
        'plus ancien', 'plus ancienne', 'plus vieille', 'plus vieux',
        'le premier', 'la premiere', 'premier arrive', 'premiere arrivee',
        'tout premier', 'toute premiere',
        'oldest', 'earliest', 'first',
        'plis ancien', 'pliss ancien'
    ])) return 'oldest';
    if (hasAnyKeyword(normalized, [
        'plus recent', 'plus recente', 'plus recents', 'plus recentes',
        'dernier', 'derniere', 'derniers', 'dernieres',
        'le tout dernier', 'la toute derniere',
        'latest', 'newest', 'most recent', 'last',
        'tout frais', 'le plus frais', 'la plus fraiche',
        'plis recent', 'pliss recent'
    ])) return 'newest';
    return null;
};

const cleanSenderReference = (value = '') => String(value || '')
    .replace(/^(?:ceux|celles|mails|mail|messages|message)\s+de\s+/i, '')
    .replace(/\s*\?+\s*$/, '')
    .trim();

const readMailSenderFilters = (normalized = '') => {
    if (!normalized) return { from: null, not_from: null };
    const notFromPatterns = [
        /\bd?\s*autres personnes que\s+(.+)$/i,
        /\bautres que\s+(.+)$/i,
        /\bqui ne viennent pas de\s+(.+)$/i,
        /\bqui ne viennent pas d\s+(.+)$/i
    ];
    for (const pattern of notFromPatterns) {
        const match = normalized.match(pattern);
        if (match) {
            const value = cleanSenderReference(match[1]);
            if (value) return { from: null, not_from: value };
        }
    }
    const fromPatterns = [
        /\bmessages?\s+de\s+(.+)$/i,
        /\bmails?\s+de\s+(.+)$/i,
        /\bcourriels?\s+de\s+(.+)$/i
    ];
    for (const pattern of fromPatterns) {
        const match = normalized.match(pattern);
        if (match) {
            const value = cleanSenderReference(match[1]);
            if (value) return { from: value, not_from: null };
        }
    }
    return { from: null, not_from: null };
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
    const raw = String(rawUtterance || '').trim();
    if (!raw) return null;

    // "demande a X si/de/que Y", "dis a X de/que Y", "ecris a X que Y"
    const demandeMatch = raw.match(/^\s*(?:demande|dis|ecris)\s+(?:a|à)\s+(.+?)\s+((?:si|de|que|d')\s+.+)$/i);
    if (demandeMatch) {
        return {
            reply_target: String(demandeMatch[1] || '').trim() || null,
            draft_text: String(demandeMatch[2] || '').trim() || null
        };
    }
    // "demande a X" / "dis a X" / "ecris a X" with no body
    const demandeTargetOnly = raw.match(/^\s*(?:demande|dis|ecris)\s+(?:a|à)\s+(\S+.*)$/i);
    if (demandeTargetOnly) {
        return {
            reply_target: String(demandeTargetOnly[1] || '').trim() || null,
            draft_text: null
        };
    }

    // Match direct forms: "reponds a X que Y", "reponds a X, Y"
    const directMatch = raw.match(/^\s*r(?:e|é)ponds?\s+(.+)$/i);
    // Match polite/indirect forms: "peux tu repondre a X ...", "tu peux repondre a X ...",
    // "est ce que tu peux repondre a X ...", "pourrais tu repondre a X ..."
    const indirectMatch = !directMatch
        ? raw.match(/(?:peux[- ]tu|tu peux|pourrais[- ]tu|tu pourrais|(?:est[- ]ce que )?tu (?:peux|pourrais))\s+r(?:e|é)pondr?e?\s+(.+)$/i)
        : null;

    const match = directMatch || indirectMatch;
    if (!match) return null;
    const value = String(match[1] || '').trim();
    if (!value) return null;

    // "a X que Y" — e.g. "reponds a Alice que je suis ok"
    const targetedWithQue = value.match(/^(?:a|à)\s+(.+?)\s+que\s+(.+)$/i);
    if (targetedWithQue) {
        return {
            reply_target: String(targetedWithQue[1] || '').trim() || null,
            draft_text: String(targetedWithQue[2] || '').trim() || null
        };
    }

    // "a X pour lui demander si/de/que Y" — e.g. "reponds a jean-eric pour lui demander si il travaille"
    const targetedWithPour = value.match(/^(?:a|à)\s+(.+?)\s+pour\s+(?:lui|leur|elle|eux)\s+(?:demander|dire|signaler|indiquer|confirmer|rappeler)\s+(.+)$/i);
    if (targetedWithPour) {
        return {
            reply_target: String(targetedWithPour[1] || '').trim() || null,
            draft_text: String(targetedWithPour[2] || '').trim() || null
        };
    }

    // "a X: Y" or "a X, Y" — e.g. "reponds a Alice: oui je suis dispo"
    const targetedDirect = value.match(/^(?:a|à)\s+(.+?)\s*[:,]\s*(.+)$/i);
    if (targetedDirect) {
        return {
            reply_target: String(targetedDirect[1] || '').trim() || null,
            draft_text: String(targetedDirect[2] || '').trim() || null
        };
    }

    // "a X pour Y" (generic) — e.g. "reponds a jean-eric pour confirmer la reunion"
    const targetedWithPourGeneric = value.match(/^(?:a|à)\s+(.+?)\s+pour\s+(.+)$/i);
    if (targetedWithPourGeneric) {
        return {
            reply_target: String(targetedWithPourGeneric[1] || '').trim() || null,
            draft_text: String(targetedWithPourGeneric[2] || '').trim() || null
        };
    }

    // "a X" only (no body) — just a target with no draft text
    const targetOnly = value.match(/^(?:a|à)\s+(\S+.*)$/i);
    if (targetOnly) {
        return {
            reply_target: String(targetOnly[1] || '').trim() || null,
            draft_text: null
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
    if (
        normalized.includes('reponds lui')
        || normalized.includes('repond lui')
        || normalized.includes('reply to it')
        || normalized.includes('reply to him')
        || normalized.includes('reply to her')
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

const readActiveContactId = (context = {}) => {
    const candidates = [
        context?.active_intent?.entities?.current_contact_id,
        context?.current_contact_id,
        context?.contact_id
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return null;
};

const hasContactFieldQuestion = (normalized = '') => {
    if (!normalized) return false;
    return hasAnyKeyword(normalized, [
        'numero de telephone',
        'telephone',
        'numero',
        'phone number',
        'phone',
        'mobile',
        'email',
        'mail',
        'adresse mail',
        'adresse e mail',
        'societe',
        'company',
        'organisation',
        'organization',
        'entreprise',
        'mise a jour',
        'mis a jour',
        'updated',
        'last update',
        'nom',
        'name'
    ]);
};

const normalizeContactQueryText = (value = '') => String(value || '')
    .replace(/\b(?:dans|de|parmi)\s+(?:mes\s+)?contacts?\b.*$/i, '')
    .replace(/\b(?:dans|sur)\s+eve\b.*$/i, '')
    .replace(/\b(?:dans|sur)\s+mon\s+carnet(?:\s+d\s+adresses?)?\b.*$/i, '')
    .replace(/[?!.,;:]+$/g, '')
    .replace(/^(?:le|la|les|du|de la|de l|des|un|une)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const readContactQueryText = (rawUtterance = '', utteranceNormalized = '', context = {}) => {
    const normalized = String(utteranceNormalized || '').trim();
    const raw = String(rawUtterance || '').trim();
    if (!normalized && !raw) return '';
    if (
        readActiveContactId(context)
        && (
            normalized.startsWith('son ')
            || normalized.startsWith('sa ')
            || normalized.startsWith('ses ')
            || normalized.startsWith('donne moi son ')
            || normalized.startsWith('donne moi sa ')
        )
    ) {
        return '';
    }

    const queryPatterns = [
        /(?:numero(?: de telephone)?|telephone|phone(?: number)?|mobile|email|adresse e mail|adresse mail|societe|entreprise|organisation|organization|mise a jour|updated|nom|name)\s+(?:de|du|d)\s+(.+)$/i,
        /(?:cherche|recherche|trouve|trouver|find|search|montre|affiche|ouvre|lis|lire)\s+(?:le\s+|la\s+|les\s+)?(?:contact|contacts|user|users|fiche(?:\s+de)?)\s+(.+)$/i,
        /(?:quel est|quelle est|c est quoi|c'est quoi|donne moi|dis moi|what is|show me)\s+.+?\s+(?:de|du|d)\s+(.+)$/i
    ];

    const sources = [raw, normalized].filter(Boolean);
    for (const source of sources) {
        for (const pattern of queryPatterns) {
            const match = source.match(pattern);
            if (!match?.[1]) continue;
            const value = normalizeContactQueryText(match[1]);
            if (value) return value;
        }
    }

    if (hasAnyKeyword(normalized, ['contact', 'contacts', 'user', 'users'])) {
        const stripped = normalizeContactQueryText(
            normalized
                .replace(/\b(?:liste|list|montre|affiche|cherche|recherche|trouve|trouver|find|search|ouvre|ouvre moi|lis|lire)\b/gi, ' ')
                .replace(/\b(?:contact|contacts|user|users|fiche)\b/gi, ' ')
        );
        if (stripped) return stripped;
    }

    return '';
};

const looksLikeContactsContext = (normalized = '', context = {}) => {
    if (!normalized) return false;
    if (hasAnyKeyword(normalized, [
        'contact',
        'contacts',
        'user',
        'users',
        'carnet d adresse',
        'carnet d adresses',
        'repertoire telephonique',
        'repertoire'
    ])) return true;
    if (hasContactFieldQuestion(normalized)) {
        if (readContactQueryText('', normalized, context)) return true;
        if (readActiveDomain(context) === 'contacts' || readActiveContactId(context)) return true;
    }
    if (
        (readActiveDomain(context) === 'contacts' || readActiveContactId(context))
        && hasAnyKeyword(normalized, ['son ', 'sa ', 'ses ', 'ce contact', 'le contact', 'la fiche'])
    ) {
        return true;
    }
    return false;
};

const readContactsAction = (normalized = '', context = {}) => {
    if (!normalized) return 'list_contacts';
    if (
        hasAnyKeyword(normalized, ['cree', 'creer', 'ajoute', 'nouveau', 'nouvelle'])
        && hasAnyKeyword(normalized, ['contact', 'contacts', 'user', 'users'])
    ) {
        return 'create';
    }
    if (
        readActiveContactId(context)
        && hasAnyKeyword(normalized, ['supprime', 'supprimer', 'efface', 'effacer', 'retire', 'retirer', 'delete', 'remove'])
    ) {
        return 'delete';
    }
    if (
        readActiveContactId(context)
        && hasAnyKeyword(normalized, ['change', 'modifie', 'modifier', 'mets a jour', 'met a jour', 'update'])
    ) {
        return 'update';
    }
    if (
        hasAnyKeyword(normalized, ['liste', 'list', 'tous', 'toutes', 'donne moi la liste', 'affiche', 'montre'])
        && hasAnyKeyword(normalized, ['contact', 'contacts', 'user', 'users'])
    ) {
        return 'list_contacts';
    }
    if (hasContactFieldQuestion(normalized)) {
        return readContactQueryText('', normalized, context) ? 'search_contacts' : 'read_contact';
    }
    if (hasAnyKeyword(normalized, ['cherche', 'recherche', 'trouve', 'trouver', 'find', 'search'])) {
        return readContactQueryText('', normalized, context) ? 'search_contacts' : 'list_contacts';
    }
    if (readActiveContactId(context) && hasAnyKeyword(normalized, ['lis', 'lire', 'ouvre', 'ouvrir', 'montre', 'affiche'])) {
        return 'read_contact';
    }
    return 'list_contacts';
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
    const safe = intent && typeof intent === 'object' ? intent : {};
    const base = buildBaseIntent({
        intent_id: safe.intent_id,
        utterance: safe?.utterance?.raw || safe.utterance || '',
        locale: safe.locale,
        source: safe.source,
        context: safe.context
    });

    const normalized = {
        ...base,
        ...safe,
        schema_version: VOICE_INTENT_SCHEMA_VERSION,
        type: VOICE_INTENT_TYPES.includes(safe.type) ? safe.type : base.type,
        domain: VOICE_INTENT_DOMAINS.includes(safe.domain) ? safe.domain : base.domain,
        confidence: Number.isFinite(Number(safe.confidence)) ? Number(safe.confidence) : base.confidence,
        status: String(safe.status || base.status),
        utterance: {
            raw: String(safe?.utterance?.raw || safe.utterance?.raw || base.utterance.raw),
            normalized: normalizeText(safe?.utterance?.normalized || safe?.utterance?.raw || safe.utterance || base.utterance.raw)
        },
        source: {
            type: String(safe?.source?.type || base.source.type),
            layer: String(safe?.source?.layer || base.source.layer)
        },
        context: safe?.context && typeof safe.context === 'object' ? { ...safe.context } : base.context,
        entities: safe?.entities && typeof safe.entities === 'object' ? { ...safe.entities } : {},
        requested_capabilities: uniqueStrings(safe.requested_capabilities),
        execution: {
            target: VOICE_INTENT_TARGETS.includes(safe?.execution?.target) ? safe.execution.target : base.execution.target,
            toolchain: Array.isArray(safe?.execution?.toolchain)
                ? safe.execution.toolchain.map((step) => ({ ...step }))
                : [],
            confirmation_required: safe?.execution?.confirmation_required === true
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
    const order = readMailOrderReference(normalized);

    if (
        hasAnyKeyword(normalized, [
            'que contient ce mail',
            'que contient ce message',
            'resume ce mail',
            'resume ce message',
            'resumer ce mail',
            'resumer ce message'
        ])
        || (
            hasAnyKeyword(normalized, ['resume', 'resumer', 'summary', 'summarize'])
            && hasAnyKeyword(normalized, ['ce mail', 'ce message'])
        )
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'summarize_current',
            confidence: 0.92,
            status: 'pending_connector',
            entities: {
                ...(order ? { order } : {})
            },
            requested_capabilities: ['mail_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_read',
                    description: 'Summarize the current mail in context.',
                    input: {
                        context: 'current',
                        ...(order ? { order } : {})
                    }
                })]
            }
        });
    }

    if (
        normalized === 'lis le'
        || normalized === 'lis le mail'
        || normalized === 'lis le message'
        || normalized === 'lis'
        || normalized === 'lire le'
        || normalized === 'lire le mail'
        || normalized === 'lire le message'
        || normalized.includes('lis moi le mail le plus ancien')
        || normalized.includes('lis moi le plus ancien')
        || normalized.includes('lis le mail le plus ancien')
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'read_current',
            confidence: 0.92,
            status: 'pending_connector',
            requested_capabilities: ['mail_read', 'mail_mark_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [
                    buildPendingConnectorStep({
                        capability: 'mail_read',
                        description: 'Read the current mail in context.',
                        input: {
                            context: 'current',
                            ...(order ? { order } : {})
                        }
                    }),
                    buildPendingConnectorStep({
                        capability: 'mail_mark_read',
                        description: 'Mark the current mail as read after reading it.',
                        input: {
                            context: 'current',
                            ...(order ? { order } : {})
                        }
                    })
                ]
            }
        });
    }

    if (
        normalized === 'archive le'
        || normalized === 'archive le mail'
        || normalized === 'archive le message'
        || normalized === 'archive'
        || normalized === 'archiver le'
        || normalized === 'archiver le mail'
        || normalized === 'archiver le message'
        || normalized === 'range le'
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'archive_current',
            confidence: 0.92,
            status: 'pending_connector',
            requested_capabilities: ['mail_archive'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_archive',
                    description: 'Archive the current mail in context.',
                    input: { context: 'current' }
                })]
            }
        });
    }

    if (
        normalized === 'supprime le'
        || normalized === 'supprime le mail'
        || normalized === 'supprime le message'
        || normalized === 'supprimer le'
        || normalized === 'supprimer le mail'
        || normalized === 'supprimer le message'
        || normalized === 'efface le'
        || normalized === 'mets le a la poubelle'
        || normalized === 'supprime'
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'delete_current',
            confidence: 0.92,
            status: 'pending_connector',
            requested_capabilities: ['mail_delete'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_delete',
                    description: 'Delete the current mail in context.',
                    input: { context: 'current' }
                })]
            }
        });
    }

    if (
        normalized === 'marque le comme non lu'
        || normalized === 'remets le en non lu'
        || normalized === 'marque le non lu'
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'mark_unread_current',
            confidence: 0.92,
            status: 'pending_connector',
            entities: {
                read: false
            },
            requested_capabilities: ['mail_mark_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_mark_read',
                    description: 'Mark the current mail as unread.',
                    input: { context: 'current', read: false }
                })]
            }
        });
    }

    if (
        normalized === 'marque le comme lu'
        || normalized === 'marque le lu'
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'connector_tool',
            domain: 'mail',
            action: 'mark_read_current',
            confidence: 0.92,
            status: 'pending_connector',
            entities: {
                read: true
            },
            requested_capabilities: ['mail_mark_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep({
                    capability: 'mail_mark_read',
                    description: 'Mark the current mail as read.',
                    input: { context: 'current', read: true }
                })]
            }
        });
    }

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

const looksLikeMailContext = (normalized = '', context = {}) => {
    if (hasAnyKeyword(normalized, [
        'mail', 'mails', 'message', 'messages', 'courriel', 'courriels', 'courrier',
        'inbox', 'boite de reception', 'boite mail',
        'email', 'e mail'
    ])) return true;
    // Reply/respond/demand verbs are inherently mail actions even without explicit mail keyword
    if (hasAnyKeyword(normalized, [
        'reponds', 'repond', 'repondre', 'reponse',
        'reply', 'respond',
        'demande a', 'dis a', 'ecris a', 'envoie a'
    ])) return true;
    const activeMailDomain = context?.active_intent?.domain === 'mail';
    if (activeMailDomain && hasAnyKeyword(normalized, [
        'lis', 'lire', 'ouvre', 'ouvrir', 'supprime', 'supprimer',
        'archive', 'archiver', 'resume', 'resumer', 'suivant', 'prochain',
        'reponds', 'repondre', 'le dernier', 'le plus ancien', 'le plus recent',
        'celui la', 'celui ci', 'ceux la', 'ceux ci',
        'non lu', 'non lus', 'nouveau', 'nouveaux'
    ])) return true;
    return false;
};

const tryBuildMailIntent = (base) => {
    const normalized = base.utterance.normalized;
    if (!looksLikeMailContext(normalized, base.context)) return null;
    const unreadOnly = hasUnreadMailQualifier(normalized);
    const statusOnly = unreadOnly && hasMailStatusQuestion(normalized);
    const action = readMailAction(normalized);
    const order = readMailOrderReference(normalized);
    const senderFilters = readMailSenderFilters(normalized);
    const communicationSurfaces = readCommunicationSurfaces(normalized);

    const capabilityMap = {
        list: ['mail_list'],
        read: ['mail_read', 'mail_next_unread', 'mail_mark_read'],
        summarize: ['mail_list', 'mail_summarize'],
        reply: ['mail_reply_draft', 'mail_send'],
        send: ['mail_send'],
        search: ['mail_search'],
        archive: ['mail_archive'],
        delete: ['mail_delete'],
        mark_read: ['mail_mark_read'],
        mark_unread: ['mail_mark_read']
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
                communication_surfaces: communicationSurfaces,
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
                        communication_surfaces: communicationSurfaces,
                        ...(replyDraft?.reply_target ? { reply_target: replyDraft.reply_target } : {})
                    }
                })],
                confirmation_required: false
            }
        });
    }

    const commonInput = {
        temporal_ref: readTimeReference(normalized),
        communication_surfaces: communicationSurfaces,
        ...(order ? { order } : {}),
        unread_only: unreadOnly,
        status_only: statusOnly,
        ...(senderFilters.from ? { from: senderFilters.from } : {}),
        ...(senderFilters.not_from ? { not_from: senderFilters.not_from } : {}),
        ...(action === 'mark_unread' ? { read: false } : {}),
        ...(action === 'mark_read' ? { read: true } : {})
    };

    return normalizeVoiceIntent({
        ...base,
        type: action === 'summarize' ? 'connector_toolchain' : 'connector_tool',
        domain: 'mail',
        action,
        confidence: 0.78,
        status: 'pending_connector',
        entities: {
            temporal_ref: readTimeReference(normalized),
            communication_surfaces: communicationSurfaces,
            ...(order ? { order } : {}),
            unread_only: unreadOnly,
            status_only: statusOnly,
            ...(senderFilters.from ? { from: senderFilters.from } : {}),
            ...(senderFilters.not_from ? { not_from: senderFilters.not_from } : {}),
            ...(action === 'mark_unread' ? { read: false } : {}),
            ...(action === 'mark_read' ? { read: true } : {})
        },
        requested_capabilities: capabilityMap[action] || ['mail_list'],
        execution: {
            target: 'pending_connector',
            toolchain: (capabilityMap[action] || ['mail_list']).map((capability) => buildPendingConnectorStep({
                capability,
                input: commonInput
            })),
            confirmation_required: false
        }
    });
};

const tryBuildContactsIntent = (base) => {
    const normalized = base.utterance.normalized;
    if (!looksLikeContactsContext(normalized, base.context)) return null;

    const action = readContactsAction(normalized, base.context);
    const queryText = readContactQueryText(base.utterance.raw, normalized, base.context);
    const currentContactId = readActiveContactId(base.context);
    const includeQuery = action !== 'list_contacts' && !!queryText;
    const capabilityMap = {
        list_contacts: ['contacts_list'],
        search_contacts: ['contacts_search'],
        read_contact: ['contacts_read'],
        create: ['contacts_create'],
        update: ['contacts_update'],
        delete: ['contacts_delete']
    };
    const toolInput = {
        ...(includeQuery ? { query_text: queryText, query: queryText } : {}),
        ...(currentContactId ? { contact_id: currentContactId } : {})
    };

    return normalizeVoiceIntent({
        ...base,
        type: 'connector_tool',
        domain: 'contacts',
        action,
        confidence: queryText || currentContactId ? 0.86 : 0.8,
        status: 'pending_connector',
        entities: {
            ...(includeQuery ? { query_text: queryText, query: queryText } : {}),
            ...(currentContactId ? { current_contact_id: currentContactId } : {})
        },
        requested_capabilities: capabilityMap[action] || ['contacts_search'],
        execution: {
            target: 'pending_connector',
            toolchain: [buildPendingConnectorStep({
                capability: (capabilityMap[action] || ['contacts_search'])[0],
                input: toolInput
            })],
            confirmation_required: action === 'delete'
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
    const rawUtterance = base.utterance.raw || '';
    const explicitColor = readExplicitColor(rawUtterance);
    const activeAtomeId = readActiveRuntimeAtomeId(base.context);

    if (
        explicitColor
        && wantsRuntimeColorApply(normalized)
        && runtimeToolExists('ui.couleur.apply', runtimeToolSet)
    ) {
        return normalizeVoiceIntent({
            ...base,
            type: 'runtime_tool',
            domain: 'creative',
            action: 'apply_color',
            confidence: 0.86,
            status: 'ready',
            entities: {
                color: explicitColor,
                ...(activeAtomeId ? { current_atome_id: activeAtomeId } : {})
            },
            execution: {
                target: 'runtime_v2',
                toolchain: [buildRuntimeToolStep({
                    tool_id: 'ui.couleur.apply',
                    input: {
                        color: explicitColor,
                        value: explicitColor,
                        ...(activeAtomeId ? { atome_id: activeAtomeId } : {})
                    },
                    description: 'Apply a color to the active runtime selection.'
                })],
                confirmation_required: false
            }
        });
    }

    const wantsCircleCreate = normalized.includes('cercle')
        && hasAnyKeyword(normalized, ['dessine', 'cree', 'creer', 'ajoute', 'draw', 'create', 'add']);
    if (wantsCircleCreate) {
        if (!runtimeToolExists('ui.circle', runtimeToolSet)) {
            return normalizeVoiceIntent({
                ...base,
                type: 'runtime_tool',
                domain: 'creative',
                action: 'draw_circle',
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
            domain: 'creative',
            action: 'draw_circle',
            confidence: 0.84,
            status: 'ready',
            entities: explicitColor ? { color: explicitColor } : {},
            execution: {
                target: 'runtime_v2',
                toolchain: [buildRuntimeToolStep({
                    tool_id: 'ui.circle',
                    input: explicitColor ? { color: explicitColor } : {},
                    description: 'Create a circle with the runtime drawing tool.'
                })],
                confirmation_required: false
            }
        });
    }

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
            when: ['ouvre les messages', 'ouvre la communication', 'contacts', 'communique'],
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
                input: match.intent.input || {},
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
    // Apply STT normalization before classification to handle noisy transcripts.
    const sttNormalized = normalizeSTTUtterance(rawUtterance, { locale });
    const effectiveUtterance = sttNormalized || rawUtterance;
    const base = buildBaseIntent({
        intent_id,
        utterance: effectiveUtterance,
        locale,
        source,
        context
    });
    // Preserve the original raw utterance in the intent for downstream use.
    if (base.utterance && typeof base.utterance === 'object') {
        base.utterance.raw = rawUtterance;
        base.utterance.stt_normalized = sttNormalized;
    }
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

    const contactsIntent = tryBuildContactsIntent(base);
    if (contactsIntent) return contactsIntent;

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
