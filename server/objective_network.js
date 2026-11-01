// The objectives network (validated mockups MD3b–MD3e, P022–P025): the people who may be found for an objective,
// for those who share it. The truth is each person's own `objective_visibility` Atome in their vault (« Visib. »
// lit, and what they chose to show: the objective's shown name, its moments, a language, an approximate zone) and
// their `objective_network` switch (Réglages › Confidentialité); this service only PROJECTS what a lit « Visib. »
// shows into the shared base (database/adole_objective_network_schema.js) after every commit touching them
// (server/ws_api_commit_effects.js). Never a health value, a precise place or the person's notebook.
// Like Rencontre, it is for adults only, on both sides. Searching is not being findable: the searcher need not be visible.
// A report is recorded once per reporter; three distinct ones hide the person from the network and their case waits
// in eVe's moderation queue (`moderation_cases`): the reporter is told it is recorded, never « sent » to anyone.
import crypto from 'node:crypto';

const VISIBILITY_TYPE = 'objective_visibility';
const NETWORK_TYPE = 'objective_network';
const CASE_KIND = 'objective_network_person';
const REPORTS_TO_HIDE = 3;
const REPORT_REASONS = Object.freeze(['spam', 'abuse', 'fake', 'other']);
const MOMENTS = Object.freeze(['morning', 'noon', 'evening']);
const PEOPLE_LIMIT = 200;

const text = (value, max = 80) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
export const objectiveNetworkSwitchId = ownerId => `${NETWORK_TYPE}:${ownerId}`;

// `profileOf(id)`: the person's card as the directory reads it ({ display_name, user_face, adult }).
export function createObjectiveNetwork({ query, vaultRouter, relations, profileOf }) {
    const remove = atomeId => query('run', 'DELETE FROM objective_network_entries WHERE objective_atome_id = ?', [atomeId]);
    const leaveAll = ownerId => query('run', 'DELETE FROM objective_network_entries WHERE principal_id = ?', [ownerId]);
    const stateOf = (ownerId, atomeId) => vaultRouter.getState(ownerId, atomeId).catch(() => null);
    const joinAll = async (ownerId) => {
        for (const state of await vaultRouter.listStates(ownerId, { atomeType: VISIBILITY_TYPE, limit: 1000 }) || []) await project(ownerId, String(state.atome_id || state.id));
    };
    const hidden = async (principalId) => !!(await query('get', 'SELECT hidden_at FROM moderation_cases WHERE kind = ? AND target_id = ? AND hidden_at IS NOT NULL',
        [CASE_KIND, principalId]));

    // After a commit touching `atomeId` (in `ownerId`'s vault): the base follows the Atome. The switch turned on projects
    // every « Visib. » of the owner again: a « Visib. » lit while the switch was still off (its commit reaching the
    // server first, the outbox sending a batch's rows in any order) was taken out and must come back.
    const project = async (ownerId, atomeId) => {
        const state = await stateOf(ownerId, atomeId);
        const properties = state?.properties || {}, type = String(state?.type || '').toLowerCase();
        if (type === NETWORK_TYPE) return properties.enabled === false || properties.__deleted === true ? leaveAll(ownerId) : joinAll(ownerId);
        if (type !== VISIBILITY_TYPE || properties.__deleted === true || properties.visible !== true) return remove(atomeId);
        if ((await stateOf(ownerId, objectiveNetworkSwitchId(ownerId)))?.properties?.enabled === false) return remove(atomeId);
        if (!(await profileOf(ownerId))?.adult) return remove(atomeId);
        const key = text(properties.objective_key, 120);
        if (!key) return remove(atomeId);
        const payload = { shown_name: text(properties.shown_name), language: text(properties.language, 16), zone: text(properties.zone),
            moments: (Array.isArray(parse(properties.moments)) ? parse(properties.moments) : []).filter(moment => MOMENTS.includes(moment)) };
        return query('run', `INSERT INTO objective_network_entries (objective_atome_id, principal_id, objective_key, payload_json)
            VALUES (?, ?, ?, ?) ON CONFLICT(objective_atome_id) DO UPDATE SET principal_id = excluded.principal_id,
            objective_key = excluded.objective_key, payload_json = excluded.payload_json, updated_at = datetime('now')`,
        [atomeId, ownerId, key, JSON.stringify(payload)]);
    };

    // The commits of one request: each `objective_visibility` or `objective_network` Atome, or one already projected.
    const afterCommit = async (events = []) => {
        for (const event of events) {
            const atomeId = text(event?.atome_id, 300);
            if (!atomeId.startsWith(`${VISIBILITY_TYPE}:`) && !atomeId.startsWith(`${NETWORK_TYPE}:`)) continue;
            const ownerId = await vaultRouter.vaultPrincipalForAtome(atomeId, null);
            if (ownerId) await project(String(ownerId), atomeId);
        }
    };

    // The people who show themselves for `objectiveKey`, as the searcher may see them.
    const people = async (viewerId, objectiveKey) => {
        if (!(await profileOf(viewerId))?.adult) return { ok: false, error: 'objective_network_adult_required' };
        const rows = await query('all', `SELECT principal_id, payload_json FROM objective_network_entries WHERE objective_key = ? AND principal_id != ?
            ORDER BY updated_at DESC LIMIT ?`, [text(objectiveKey, 120), viewerId, PEOPLE_LIMIT]) || [];
        const entries = [];
        for (const row of rows) {
            const principalId = String(row.principal_id);
            if (await hidden(principalId) || await relations.blockedEitherWay(viewerId, principalId)) continue;
            const card = await profileOf(principalId);
            if (!card?.adult) continue;
            const payload = parse(row.payload_json) || {};
            entries.push({ principal_id: principalId, display_name: text(card.display_name) || payload.shown_name, user_face: card.user_face || null,
                shown_name: payload.shown_name, moments: payload.moments || [], language: payload.language, zone: payload.zone });
        }
        return { ok: true, entries };
    };

    // One report by an account on another (never themselves); the third distinct one hides them and opens their case.
    const report = async (viewerId, targetId, reason) => {
        const target = text(targetId, 200);
        if (!target || target === viewerId) return { ok: false, error: 'objective_network_report_target_invalid' };
        await query('run', `INSERT INTO objective_network_reports (target_id, reporter_id, reason) VALUES (?, ?, ?)
            ON CONFLICT(target_id, reporter_id) DO NOTHING`, [target, viewerId, REPORT_REASONS.includes(reason) ? reason : 'other']);
        const total = Number((await query('get', 'SELECT COUNT(*) AS total FROM objective_network_reports WHERE target_id = ?', [target]))?.total || 0);
        await query('run', `INSERT INTO moderation_cases (case_id, kind, target_id, reports, hidden_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(kind, target_id) DO UPDATE SET reports = excluded.reports, updated_at = datetime('now'),
            hidden_at = COALESCE(moderation_cases.hidden_at, excluded.hidden_at), status = 'open'`,
        [crypto.randomUUID(), CASE_KIND, target, total, total >= REPORTS_TO_HIDE ? new Date().toISOString() : null]);
        return { ok: true, status: 'recorded' };
    };

    // The `objective-network` frame of /ws/api (an account only): `people`, `report`.
    const handle = async (message, viewerId) => {
        const action = text(message.action, 40);
        if (action === 'people') return people(viewerId, message.objectiveKey || message.objective_key);
        if (action === 'report') return report(viewerId, message.userId || message.peerId, text(message.reason, 40));
        return { ok: false, error: 'objective_network_action_invalid' };
    };

    return { project, afterCommit, people, report, handle };
}
