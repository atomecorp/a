import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const requestedRuns = Math.max(1, Number.parseInt(process.env.MOLECULE_ACCEPTANCE_REPEAT || '3', 10) || 3);
const campaign = String(process.env.MOLECULE_ACCEPTANCE_CAMPAIGN || 'final')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
const reportDirectory = path.resolve('temp/probe_reports/molecule_acceptance');
const results = [];

fs.mkdirSync(reportDirectory, { recursive: true });

for (let index = 1; index <= requestedRuns; index += 1) {
    const tag = `${campaign}_${String(index).padStart(2, '0')}`;
    const startedAt = Date.now();
    const run = spawnSync('npm', ['run', 'quality:acceptance'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
            ...process.env,
            MOLECULE_UI_CAMPAIGN: `${tag}_visual`,
            MOLECULE_UI_REPORT_TAG: `${tag}_endurance`
        }
    });
    results.push({
        index,
        tag,
        ok: run.status === 0,
        exit_code: run.status,
        duration_ms: Date.now() - startedAt
    });
    const partial = {
        created_at: new Date().toISOString(),
        campaign,
        requested_runs: requestedRuns,
        completed_runs: results.length,
        ok: results.length === requestedRuns && results.every((entry) => entry.ok),
        results
    };
    fs.writeFileSync(
        path.join(reportDirectory, `repeat_report_${campaign}.json`),
        `${JSON.stringify(partial, null, 2)}\n`
    );
    if (run.status !== 0) break;
}

if (results.length !== requestedRuns || results.some((entry) => !entry.ok)) process.exitCode = 1;
