import {
    ensureBankApi,
    ensureCalendarApi,
    ensureContactsApi,
    ensureMailApi,
    ensureRuntimeCommandBus,
    getOptionalVoiceApi
} from './mcp_bridges.js';

export function listMcpResourceEntries() {
    const resources = [{
        uri: 'security://journal/recent',
        name: 'Security Journal',
        description: 'Recent sensitive-flow security decisions, confirmations, and idempotency hits.',
        mime_type: 'application/json',
        source: 'mcp'
    }];
    try {
        ensureRuntimeCommandBus();
        resources.push({
            uri: 'runtime://audit/recent',
            name: 'Runtime Audit Stream',
            description: 'Recent runtime command-bus events.',
            mime_type: 'application/json',
            source: 'runtime_v2'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureMailApi();
        resources.push({
            uri: 'mail://summary/default',
            name: 'Mail Summary',
            description: 'Summary of the local indexed mailbox.',
            mime_type: 'application/json',
            source: 'mail'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureContactsApi();
        resources.push({
            uri: 'contacts://sources',
            name: 'Contacts Sources',
            description: 'Registered contact sources bridged into the shared eVe contacts service.',
            mime_type: 'application/json',
            source: 'contacts'
        });
        resources.push({
            uri: 'contacts://directory/default',
            name: 'Contacts Directory',
            description: 'Unified contacts directory currently available in eVe.',
            mime_type: 'application/json',
            source: 'contacts'
        });
        resources.push({
            uri: 'contacts://directory/local',
            name: 'Local Contacts Directory',
            description: 'Contacts currently stored in the local eVe primary contacts store.',
            mime_type: 'application/json',
            source: 'contacts'
        });
        resources.push({
            uri: 'contacts://status/default',
            name: 'Contacts Sync Status',
            description: 'Current contacts sync status and registered source states.',
            mime_type: 'application/json',
            source: 'contacts'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureCalendarApi();
        resources.push({
            uri: 'calendar://sources',
            name: 'Calendar Sources',
            description: 'Registered unified calendar sources.',
            mime_type: 'application/json',
            source: 'calendar'
        });
        resources.push({
            uri: 'calendar://today',
            name: 'Calendar Today',
            description: 'Unified calendar events for today.',
            mime_type: 'application/json',
            source: 'calendar'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureBankApi();
        resources.push({
            uri: 'bank://summary/default',
            name: 'Bank Summary',
            description: 'Analytical summary of normalized banking data.',
            mime_type: 'application/json',
            source: 'bank'
        });
    } catch (_) {
        // Optional.
    }
    const voice = getOptionalVoiceApi();
    if (voice && typeof voice.listSessions === 'function') {
        resources.push({
            uri: 'voice://sessions/active',
            name: 'Voice Sessions',
            description: 'Active voice sessions exposed by the shared voice runtime.',
            mime_type: 'application/json',
            source: 'voice'
        });
    }
    return resources;
}

export async function readMcpResource(uri, params = {}, handlers = {}) {
    const normalizedUri = String(uri || '').trim();
    if (!normalizedUri) {
        throw new Error('Missing resource uri');
    }
    if (normalizedUri === 'security://journal/recent') {
        return handlers['mcp.security.journal.list']({
            limit: Number.isFinite(Number(params?.limit)) ? Number(params.limit) : 50
        });
    }
    if (normalizedUri === 'runtime://audit/recent') {
        return handlers['runtime.audit.list']({
            limit: Number.isFinite(Number(params?.limit)) ? Number(params.limit) : 50
        });
    }
    if (normalizedUri === 'mail://summary/default') {
        return handlers['mail.summarize'](params || {});
    }
    if (normalizedUri === 'contacts://sources') {
        return handlers['contacts.sources'](params || {});
    }
    if (normalizedUri === 'contacts://directory/default') {
        return handlers['contacts.list'](params || {});
    }
    if (normalizedUri === 'contacts://directory/local') {
        return handlers['contacts.list']({
            ...(params || {}),
            source_id: 'eve_contacts_local'
        });
    }
    if (normalizedUri === 'contacts://status/default') {
        const contacts = ensureContactsApi();
        return contacts.syncStatus();
    }
    if (normalizedUri === 'calendar://sources') {
        return handlers['calendar.sources'](params || {});
    }
    if (normalizedUri === 'calendar://today') {
        return handlers['calendar.today'](params || {});
    }
    if (normalizedUri === 'voice://sessions/active') {
        const voice = getOptionalVoiceApi();
        if (!voice || typeof voice.listSessions !== 'function') {
            throw new Error('Voice API is not available');
        }
        return voice.listSessions({
            includeClosed: params?.includeClosed === true
        });
    }
    if (normalizedUri === 'bank://summary/default') {
        return handlers['bank.summary'](params || {});
    }
    throw new Error(`Unknown MCP resource: ${normalizedUri}`);
}

export function listMcpPromptEntries() {
    const prompts = [
        {
            name: 'confirm_sensitive_action',
            description: 'Prompt template asking for explicit confirmation before a sensitive action.',
            source: 'mcp'
        }
    ];
    try {
        ensureMailApi();
        prompts.push({
            name: 'mail_reply_brief',
            description: 'Prompt template for a concise spoken or typed mail reply.',
            source: 'mail'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureContactsApi();
        prompts.push({
            name: 'contacts_lookup_brief',
            description: 'Prompt template for concise contact lookup answers.',
            source: 'contacts'
        });
        prompts.push({
            name: 'contacts_import_summary',
            description: 'Prompt template for summarizing a contact import result.',
            source: 'contacts'
        });
        prompts.push({
            name: 'contacts_push_confirmation',
            description: 'Prompt template for confirming an explicit contact push to iCloud.',
            source: 'contacts'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureCalendarApi();
        prompts.push({
            name: 'calendar_event_brief',
            description: 'Prompt template for presenting or confirming a calendar event.',
            source: 'calendar'
        });
    } catch (_) {
        // Optional.
    }
    try {
        ensureBankApi();
        prompts.push({
            name: 'bank_analytics_brief',
            description: 'Prompt template for concise banking analysis answers.',
            source: 'bank'
        });
    } catch (_) {
        // Optional.
    }
    const voice = getOptionalVoiceApi();
    if (voice) {
        prompts.push({
            name: 'voice_interrupt_hint',
            description: 'Prompt template reminding the available interruption commands.',
            source: 'voice'
        });
    }
    return prompts;
}

export function renderPrompt(name, params = {}) {
    const promptName = String(name || '').trim();
    if (!promptName) {
        throw new Error('Missing prompt name');
    }
    if (promptName === 'confirm_sensitive_action') {
        const action = String(params?.action || params?.tool || 'cette action').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Confirmation requise: voulez-vous vraiment executer ${action} ? Repondez explicitement par oui pour continuer.`
        };
    }
    if (promptName === 'mail_reply_brief') {
        const topic = String(params?.topic || params?.subject || 'ce mail').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Redige une reponse courte, polie et claire a propos de ${topic}. Conserve un ton direct et actionnable.`
        };
    }
    if (promptName === 'contacts_lookup_brief') {
        const topic = String(params?.topic || params?.contact || 'ce contact').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Donne une reponse concise a propos de ${topic}, avec le nom, le telephone principal, l'adresse mail principale et la source de synchronisation si elle existe.`
        };
    }
    if (promptName === 'contacts_import_summary') {
        const source = String(params?.source || params?.provider || 'la source contacts').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Resume l'import realise depuis ${source} avec le nombre de contacts importes, les doublons probables, et ce qui reste stocke localement dans eVe.`
        };
    }
    if (promptName === 'contacts_push_confirmation') {
        const contact = String(params?.contact || params?.name || 'ce contact').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Confirmation requise: voulez-vous vraiment pousser ${contact} vers iCloud Contacts ? Repondez explicitement par oui pour continuer.`
        };
    }
    if (promptName === 'calendar_event_brief') {
        const title = String(params?.title || 'cet evenement').trim();
        return {
            ok: true,
            name: promptName,
            prompt: `Resume ${title} en une phrase, puis confirme la date, l'heure et le lieu de facon concise.`
        };
    }
    if (promptName === 'voice_interrupt_hint') {
        return {
            ok: true,
            name: promptName,
            prompt: 'Commandes vocales locales disponibles: stop, passe au suivant, resume, annule, reponds.'
        };
    }
    if (promptName === 'bank_analytics_brief') {
        return {
            ok: true,
            name: promptName,
            prompt: 'Donne une reponse bancaire courte, factuelle, avec les montants, la periode, et les contreparties les plus importantes.'
        };
    }
    throw new Error(`Unknown MCP prompt: ${promptName}`);
}
