import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const count = Math.max(1, Number.parseInt(process.env.MOLECULE_UI_REPEAT || '10', 10) || 10);
const campaign = String(process.env.MOLECULE_UI_CAMPAIGN || 'repeat').replace(/[^a-zA-Z0-9_-]+/g, '_');
const results = [];

for (let index = 1; index <= count; index += 1) {
    const tag = `${campaign}_${String(index).padStart(2, '0')}`;
    const run = spawnSync(process.execPath, ['tests/probes/molecule_eve_ui_acceptance_probe.mjs'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, MOLECULE_UI_REPORT_TAG: tag }
    });
    results.push({ index, tag, ok: run.status === 0, exit_code: run.status });
    if (run.status !== 0) break;
}

const report = {
    created_at: new Date().toISOString(),
    campaign,
    requested_runs: count,
    completed_runs: results.length,
    ok: results.length === count && results.every((entry) => entry.ok),
    results
};
const directory = path.resolve('temp/probe_reports/molecule_eve_ui_acceptance');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, `repeat_report_${campaign}.json`), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
