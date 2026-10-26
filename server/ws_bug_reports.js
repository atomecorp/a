// The bug reports sent from the apps (atome/src/shared/bug_report_contract.js): a
// `bug-report-submit` frame on /ws/api writes one JSON file per report, for the team
// to read on the server, under
//
//     <project>/logs/bug_reports/<YYYY-MM-DD>/<created_iso>_<id>.json
//
// (the day and time the report was filed, `:` and `.` written `-`). The file holds the
// bounded report (origin, title, description, the assistant's request, reason, attempts
// and conversation excerpt, platform, app versions), the server's own versions, the
// account id when the frame comes from a signed-in Web page (the native apps relay the
// frame without any credential), and the phone, name and e-mail only when the user
// agreed to give them. A report sent again (a retry) keeps its first file. The frame is
// public, as the Médiathèque's: Tauri and iOS relay it to atome.one (public_relay.rs,
// frame there); each address may send a few per minute.
//
// The file is also the report's log: once fixed, the team writes its `resolution`
// (`{ resolved_at, note, fixed_in }`) into it with scripts/bug_reports_admin.mjs. A
// `bug-report-status` frame asks which of a device's sent reports are resolved, by
// their id and day (the ids are random, a report is only known to who filed it): the
// device then shows those as fixed, and the user removes them from their list.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAddressRateLimit } from './public_source_fetch.js';
import { EVE_VERSION, SERVER_VERSION } from './server_version.js';
import { BUG_REPORT_STATUS, BUG_REPORT_SUBMIT, normalizeBugReport, normalizeBugReportRefs } from '../atome/src/shared/bug_report_contract.js';

export const BUG_REPORTS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'bug_reports');
const limited = createAddressRateLimit({ windowMs: 60_000, max: 12 });
const statusLimited = createAddressRateLimit({ windowMs: 60_000, max: 30 });
const reply = (message, fields) => ({ type: `${message.type}-response`, requestId: message.requestId || message.request_id || null,
    request_id: message.requestId || message.request_id || null, success: fields.ok === true, ...fields });

export const bugReportFilePath = (root, report) => {
    const stamp = report.created_iso.replace(/[:.]/g, '-');
    return path.join(root, report.created_iso.slice(0, 10), `${stamp}_${report.id}.json`);
};

// A report's file, or null when the server never kept it.
export const readBugReportFile = async (file) => {
    try {
        return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
};

const handleStatus = async (message, address, root, now) => {
    if (statusLimited(address, now())) return reply(message, { ok: false, error: 'bug_report_rate_limited' });
    const normalized = normalizeBugReportRefs(message.refs);
    if (!normalized.ok) return reply(message, normalized);
    const resolved = [];
    try {
        for (const ref of normalized.refs) {
            const stored = await readBugReportFile(bugReportFilePath(root, ref));
            if (stored?.id === ref.id && stored.resolution?.resolved_at) resolved.push({ id: ref.id, ...stored.resolution });
        }
    } catch (error) {
        console.error('[bug_reports] status read failed', error);
        return reply(message, { ok: false, error: 'bug_report_status_failed' });
    }
    return reply(message, { ok: true, resolved });
};

export async function handleWsBugReport(message, connection, address, { root = BUG_REPORTS_ROOT, now = Date.now } = {}) {
    if (message?.type === BUG_REPORT_STATUS) return handleStatus(message, address, root, now);
    if (message?.type !== BUG_REPORT_SUBMIT) return null;
    if (limited(address, now())) return reply(message, { ok: false, error: 'bug_report_rate_limited' });
    const normalized = normalizeBugReport(message.report);
    if (!normalized.ok) return reply(message, normalized);
    const { report } = normalized;
    const file = bugReportFilePath(root, report);
    const authenticated = connection?._wsApiUserId && connection._wsApiAuthExpMs && now() < connection._wsApiAuthExpMs;
    const stored = { ...report, received_at: new Date(now()).toISOString(), ws_user_id: authenticated ? String(connection._wsApiUserId) : null,
        server_versions: { atome: SERVER_VERSION, eve: EVE_VERSION } };
    try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify(stored, null, 2)}\n`, { flag: 'wx' });
    } catch (error) {
        if (error?.code === 'EEXIST') return reply(message, { ok: true, id: report.id, duplicate: true });
        // The report stays unsent on the device, which sends it again later.
        console.error('[bug_reports] storage failed', error);
        return reply(message, { ok: false, error: 'bug_report_storage_failed' });
    }
    return reply(message, { ok: true, id: report.id });
}
