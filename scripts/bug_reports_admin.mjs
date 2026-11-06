#!/usr/bin/env node
// Operator tool for the bug reports the apps send (server/ws_bug_reports.js keeps one JSON
// file per report under logs/bug_reports/<YYYY-MM-DD>/). Run on the server from the project root:
//   node scripts/bug_reports_admin.mjs <command>
// Commands:
//   list [--open|--resolved] [--since YYYY-MM-DD]   one line per report, oldest first
//   show <id>                                       the whole report file
//   resolve <id> [<id>…] --note "<cause → fix>" [--fixed-in <version>]
//       writes the report's `resolution` into its file (the report's log; `list --open` no
//       longer shows it); the device that filed it shows it fixed the next time Réglages ›
//       Avancé opens (`bug-report-status`), and its user deletes it from the list. `--fixed-in` defaults to the atome/eVe versions of this checkout.
//   requests [--pending|--roadmap]                  the feature requests (kind `request`), their review and Roadmap state
//   roadmap <id> [<id>…] --state planned|in_progress|done
//       moves a validated request on the Roadmap (server/ws_feature_requests.js); its requester and
//       everyone's Roadmap in Réglages › Avancé show the new state.
// `--root <dir>` reads another copy of the folder (a copy of the production logs).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUG_REPORTS_ROOT, listBugReportFiles } from '../server/ws_bug_reports.js';
import { listFeatureRequests, moveFeatureRequest } from '../server/ws_feature_requests.js';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const fail = (message) => { console.error(message); process.exit(1); };
const root = path.resolve(option('--root') || BUG_REPORTS_ROOT);
const optionValues = new Set(['--note', '--fixed-in', '--since', '--root', '--state'].map(option).filter(Boolean));
const ids = args.filter(arg => !arg.startsWith('--') && !optionValues.has(arg));

const findReport = async (id) => {
    const found = (await listBugReportFiles(root)).find(entry => entry.report?.id === id);
    if (!found) fail(`No report ${id} under ${root}.`);
    return found;
};

const checkoutVersions = async () => {
    const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const read = async file => (await readFile(path.join(project, file), 'utf8')).trim();
    return `atome ${await read('atome/version.txt')} · eVe ${await read('eVe/version.txt')}`;
};

const line = report => [report.created_iso.slice(0, 16), report.id, report.kind === 'request' ? 'request' : 'bug',
    report.resolution ? 'fixed' : 'open', report.origin, report.platform || '-', `atome ${report.versions?.atome || '?'}`, report.title].join('  ');
const requestLine = report => [report.created_iso.slice(0, 16), report.id, report.review?.state || 'pending',
    report.roadmap?.state || '-', report.title, report.review?.reason ? `— ${report.review.reason}` : ''].join('  ').trim();
const operator = () => `script:${process.env.USER || 'operator'}`;

if (command === 'list') {
    const since = option('--since') || '';
    for (const { report } of await listBugReportFiles(root)) {
        if (report.created_iso.slice(0, 10) < since) continue;
        if (args.includes('--open') && report.resolution) continue;
        if (args.includes('--resolved') && !report.resolution) continue;
        console.log(line(report));
    }
} else if (command === 'show') {
    if (!ids.length) fail('A report id is required.');
    for (const id of ids) console.log(JSON.stringify((await findReport(id)).report, null, 2));
} else if (command === 'resolve') {
    const note = String(option('--note') || '').trim();
    if (!ids.length || !note) fail('resolve <id> [<id>…] --note "<cause → fix>" [--fixed-in <version>]');
    const fixedIn = option('--fixed-in') || await checkoutVersions();
    for (const id of ids) {
        const { file, report } = await findReport(id);
        report.resolution = { resolved_at: new Date().toISOString(), note, fixed_in: fixedIn };
        await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`fixed  ${line(report)}  — ${note} (${fixedIn})`);
    }
} else if (command === 'requests') {
    for (const { report } of await listFeatureRequests(root)) {
        if (args.includes('--pending') && report.review) continue;
        if (args.includes('--roadmap') && report.review?.state !== 'validated') continue;
        console.log(requestLine(report));
    }
} else if (command === 'roadmap') {
    const state = option('--state');
    if (!ids.length || !state) fail('roadmap <id> [<id>…] --state planned|in_progress|done');
    for (const id of ids) {
        const moved = await moveFeatureRequest(root, { id }, { state, by: operator() });
        if (!moved.ok) fail(`${id}: ${moved.error}`);
        console.log(`${state}  ${id}`);
    }
} else {
    fail('Commands: list [--open|--resolved] [--since YYYY-MM-DD] | show <id> | resolve <id>… --note "…" [--fixed-in <version>] | requests [--pending|--roadmap] | roadmap <id>… --state planned|in_progress|done (all take --root <dir>)');
}
