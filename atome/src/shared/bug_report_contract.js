// One contract for the bug reports, read by the eVe client that files them
// (eVe/domains/diagnostics/bug_reports.js) and by the Fastify server that keeps
// them (server/ws_bug_reports.js): the frames, the origins and the bounded shape
// of a report. A report is filed by the user (the Avancé rubric of Réglages) or
// by the assistant on the user's request or after a request it could not do.
//
// The record Atomes keep the source domain the assistant's debug reports were
// first filed under, so the reports filed before the Avancé rubric still list.
export const BUG_REPORT_SOURCE_DOMAIN = 'assistant_debug';
export const BUG_REPORT_SUBMIT = 'bug-report-submit';
// Which of the device's sent reports the team marked fixed (scripts/bug_reports_admin.mjs).
export const BUG_REPORT_STATUS = 'bug-report-status';
export const BUG_REPORT_ORIGINS = Object.freeze(['user_requested', 'assistant_failure', 'manual']);
export const BUG_REPORT_STATUS_MAX = 50;

const ID = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_CONTEXT_BYTES = 32 * 1024;
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = error => ({ ok: false, error });

const conversationOf = (value) => {
    if (!plain(value)) return null;
    return { id: text(value.id, 80), model: text(value.model, 80), level: text(value.level, 40),
        turns: (Array.isArray(value.turns) ? value.turns : []).slice(-20).filter(plain).map(turn => ({
            role: text(turn.role, 20), ...(turn.name ? { name: text(turn.name, 120) } : {}), text: text(turn.text, 1000) })) };
};
// The contact rides along only when the user agreed to give it.
const contactOf = (value) => {
    if (!plain(value)) return null;
    const contact = { phone: text(value.phone, 40), name: text(value.name, 160), email: text(value.email, 200) };
    return contact.phone || contact.name || contact.email ? contact : null;
};

// `input` → `{ ok: true, report }` (the bounded report both sides keep) or `{ ok: false, error }`.
export const normalizeBugReport = (input = {}) => {
    if (!plain(input)) return fail('bug_report_invalid');
    const id = String(input.id || '');
    if (!ID.test(id)) return fail('bug_report_id_invalid');
    if (!BUG_REPORT_ORIGINS.includes(input.origin)) return fail('bug_report_origin_invalid');
    const created = new Date(String(input.created_iso || ''));
    if (Number.isNaN(created.getTime())) return fail('bug_report_date_invalid');
    const title = text(input.title, 200);
    if (!title) return fail('bug_report_title_required');
    const context = plain(input.context) ? input.context : null;
    if (context && JSON.stringify(context).length > MAX_CONTEXT_BYTES) return fail('bug_report_context_too_large');
    const consent = input.contact_consent === true;
    return { ok: true, report: {
        id, origin: input.origin, created_iso: created.toISOString(), title,
        description: text(input.description, 8000), request: text(input.request, 2000), reason: text(input.reason, 4000),
        attempted: (Array.isArray(input.attempted) ? input.attempted : []).slice(0, 20).map(entry => text(entry, 200)).filter(Boolean),
        platform: text(input.platform, 20),
        versions: { atome: text(input.versions?.atome, 40), eve: text(input.versions?.eve, 40) },
        context, conversation: conversationOf(input.conversation),
        contact_consent: consent, contact: consent ? contactOf(input.contact) : null
    } };
};

// `refs` (`[{ id, created_iso }]`, the id and day that name a report's file) → `{ ok: true, refs }` or `{ ok: false, error }`.
export const normalizeBugReportRefs = (refs) => {
    if (!Array.isArray(refs) || !refs.length || refs.length > BUG_REPORT_STATUS_MAX) return fail('bug_report_refs_invalid');
    const normalized = [];
    for (const ref of refs) {
        const id = String(ref?.id || '');
        const created = new Date(String(ref?.created_iso || ''));
        if (!ID.test(id) || Number.isNaN(created.getTime())) return fail('bug_report_refs_invalid');
        normalized.push({ id, created_iso: created.toISOString() });
    }
    return { ok: true, refs: normalized };
};
