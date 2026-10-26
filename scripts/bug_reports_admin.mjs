#!/usr/bin/env node
// Operator tool for the bug reports the apps send (server/ws_bug_reports.js keeps one JSON
// file per report under logs/bug_reports/<YYYY-MM-DD>/). Run on the server from the project root:
//   node scripts/bug_reports_admin.mjs <command>
// Commands:
//   list [--open|--resolved] [--since YYYY-MM-DD]   one line per report, oldest first
//   show <id>                                       the whole report file
//   resolve <id> [<id>…] --note "<cause → fix>" [--fixed-in <version>]
//       writes the report's `resolution` into its file (the report's log); the devices that
//       filed it remove it from their list the next time Réglages › Avancé opens
//       (`bug-report-status`). `--fixed-in` defaults to the atome/eVe versions of this checkout.
// `--root <dir>` reads another copy of the folder (a copy of the production logs).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUG_REPORTS_ROOT, readBugReportFile } from '../server/ws_bug_reports.js';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const fail = (message) => { console.error(message); process.exit(1); };
const root = path.resolve(option('--root') || BUG_REPORTS_ROOT);
const optionValues = new Set(['--note', '--fixed-in', '--since', '--root'].map(option).filter(Boolean));
const ids = args.filter(arg => !arg.startsWith('--') && !optionValues.has(arg));

const days = async () => (await readdir(root, { withFileTypes: true }).catch(error => (error.code === 'ENOENT' ? [] : Promise.reject(error))))
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)).map(entry => entry.name).sort();
const reportFiles = async () => {
    const files = [];
    for (const day of await days()) {
        for (const name of (await readdir(path.join(root, day))).filter(name => name.endsWith('.json')).sort()) files.push(path.join(root, day, name));
    }
    return files;
};
const findReport = async (id) => {
    const file = (await reportFiles()).find(candidate => candidate.endsWith(`_${id}.json`));
    if (!file) fail(`No report ${id} under ${root}.`);
    return { file, report: await readBugReportFile(file) };
};

const checkoutVersions = async () => {
    const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const read = async file => (await readFile(path.join(project, file), 'utf8')).trim();
    return `atome ${await read('atome/version.txt')} · eVe ${await read('eVe/version.txt')}`;
};

const line = report => [report.created_iso.slice(0, 16), report.id, report.resolution ? 'fixed' : 'open',
    report.origin, report.platform || '-', `atome ${report.versions?.atome || '?'}`, report.title].join('  ');

if (command === 'list') {
    const since = option('--since') || '';
    for (const file of await reportFiles()) {
        const report = await readBugReportFile(file);
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
} else {
    fail('Commands: list [--open|--resolved] [--since YYYY-MM-DD] | show <id> | resolve <id>… --note "…" [--fixed-in <version>] (all take --root <dir>)');
}
