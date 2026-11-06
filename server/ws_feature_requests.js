// The feature requests (« Demandes »): bug reports of kind `request`
// (atome/src/shared/bug_report_contract.js), kept in the same JSON files as the bugs
// (server/ws_bug_reports.js, logs/bug_reports/<day>/). An account with the `admin` role
// (server/auth_account_roles.js) validates or refuses them: a refusal writes `review`
// `{ state: 'refused', at, by, reason }`, a validation `review` `{ state: 'validated' }` and
// `roadmap` `{ state: 'planned' }`. The Roadmap then moves planned → in_progress → done,
// in the app by an admin or on the server by scripts/bug_reports_admin.mjs (`roadmap`).
// Every move is appended to the file's `steps`. The requester's device reads its
// requests' states with `bug-report-status`; the Roadmap (validated requests, titles
// only) is public (`feature-request-roadmap`); the admin frames check the role on the
// server, whatever the app shows.
import { writeFile } from 'node:fs/promises';
import { FEATURE_REQUEST_ADMIN, FEATURE_REQUEST_REVIEWS, FEATURE_REQUEST_ROADMAP, ROADMAP_STATES, normalizeBugReportRefs,
    normalizeRefusalReason } from '../atome/src/shared/bug_report_contract.js';
import { createAccountRoles, wsSignedInPrincipal } from './auth_account_roles.js';
import { createAddressRateLimit } from './public_source_fetch.js';
import { BUG_REPORTS_ROOT, bugReportFilePath, featureRequestStateOf, listBugReportFiles, readBugReportFile } from './ws_bug_reports.js';
import { wsResponse } from './wsResponse.js';

const roadmapLimited = createAddressRateLimit({ windowMs: 60_000, max: 30 });
const fail = error => ({ ok: false, error });
const isRequest = report => report?.kind === 'request';

export const listFeatureRequests = async (root = BUG_REPORTS_ROOT) => (await listBugReportFiles(root)).filter(entry => isRequest(entry.report));

const save = async (file, report) => writeFile(file, `${JSON.stringify(report, null, 2)}\n`);

// A request named by its id alone (the script), or by its id and day (the app).
export const findFeatureRequest = async (root, { id, created_iso: createdIso }) => {
    if (createdIso) {
        const file = bugReportFilePath(root, { id, created_iso: createdIso });
        const report = await readBugReportFile(file);
        return report?.id === id && isRequest(report) ? { file, report } : null;
    }
    return (await listFeatureRequests(root)).find(entry => entry.report.id === id) || null;
};

// `decision`: validated | refused; a request is reviewed once.
export const reviewFeatureRequest = async (root, ref, { decision, reason = '', by, now = Date.now }) => {
    if (!FEATURE_REQUEST_REVIEWS.includes(decision)) return fail('feature_request_decision_invalid');
    const found = await findFeatureRequest(root, ref);
    if (!found) return fail('feature_request_unknown');
    const { file, report } = found;
    if (report.review) return fail('feature_request_already_reviewed');
    const at = new Date(now()).toISOString();
    report.review = decision === 'refused' ? { state: 'refused', at, by, reason: normalizeRefusalReason(reason) } : { state: 'validated', at, by };
    if (decision === 'validated') report.roadmap = { state: 'planned', at, by };
    report.steps = [...(report.steps || []), { at, by, review: decision, ...(decision === 'validated' ? { roadmap: 'planned' } : {}) }];
    await save(file, report);
    return { ok: true, request: featureRequestStateOf(report) };
};

export const moveFeatureRequest = async (root, ref, { state, by, now = Date.now }) => {
    if (!ROADMAP_STATES.includes(state)) return fail('feature_request_state_invalid');
    const found = await findFeatureRequest(root, ref);
    if (!found) return fail('feature_request_unknown');
    const { file, report } = found;
    if (report.review?.state !== 'validated') return fail('feature_request_not_validated');
    const at = new Date(now()).toISOString();
    report.roadmap = { state, at, by };
    report.steps = [...(report.steps || []), { at, by, roadmap: state }];
    await save(file, report);
    return { ok: true, request: featureRequestStateOf(report) };
};

// The Roadmap everyone reads: the validated requests, their title, day and state.
export const featureRoadmap = async (root = BUG_REPORTS_ROOT) => (await listFeatureRequests(root))
    .filter(({ report }) => report.review?.state === 'validated')
    .map(({ report }) => ({ id: report.id, created_iso: report.created_iso, title: report.title, state: report.roadmap.state,
        state_at: report.roadmap.at }))
    .sort((a, b) => b.created_iso.localeCompare(a.created_iso));

// The requests from every account still waiting for an admin, without who filed them.
const pendingRequests = async root => (await listFeatureRequests(root)).filter(({ report }) => !report.review)
    .map(({ report }) => ({ id: report.id, created_iso: report.created_iso, title: report.title, description: report.description,
        platform: report.platform, versions: report.versions }))
    .sort((a, b) => b.created_iso.localeCompare(a.created_iso));

const refOf = (data) => {
    const normalized = normalizeBugReportRefs([{ id: data.id, created_iso: data.created_iso }]);
    return normalized.ok ? normalized.refs[0] : null;
};
const ADMIN_ACTIONS = Object.freeze({
    pending: async root => ({ ok: true, requests: await pendingRequests(root) }),
    review: async (root, data, by) => {
        const ref = refOf(data);
        return ref ? reviewFeatureRequest(root, ref, { decision: data.decision, reason: data.reason, by }) : fail('bug_report_refs_invalid');
    },
    roadmap: async (root, data, by) => {
        const ref = refOf(data);
        return ref ? moveFeatureRequest(root, ref, { state: data.state, by }) : fail('bug_report_refs_invalid');
    }
});

export async function handleWsFeatureRequest(data, connection, address, { root = BUG_REPORTS_ROOT, roles = createAccountRoles(), now = Date.now } = {}) {
    if (data?.type === FEATURE_REQUEST_ROADMAP) {
        if (roadmapLimited(address, now())) return wsResponse(FEATURE_REQUEST_ROADMAP, data, false, fail('bug_report_rate_limited'));
        return wsResponse(FEATURE_REQUEST_ROADMAP, data, true, { ok: true, roadmap: await featureRoadmap(root) });
    }
    if (data?.type !== FEATURE_REQUEST_ADMIN) return null;
    const action = String(data.action || '');
    if (!Object.hasOwn(ADMIN_ACTIONS, action)) return wsResponse(FEATURE_REQUEST_ADMIN, data, false, fail('feature_request_action_invalid'));
    // The role is the server's to check: an app showing the admin's tools proves nothing.
    const principalId = await wsSignedInPrincipal(connection, data);
    if (!principalId || !await roles.has(principalId, 'admin')) return wsResponse(FEATURE_REQUEST_ADMIN, data, false, fail('admin_required'));
    try {
        const result = await ADMIN_ACTIONS[action](root, data, principalId);
        return wsResponse(FEATURE_REQUEST_ADMIN, data, result.ok === true, result);
    } catch (error) {
        console.error('[feature_requests] admin action failed', error);
        return wsResponse(FEATURE_REQUEST_ADMIN, data, false, fail('feature_request_storage_failed'));
    }
}
