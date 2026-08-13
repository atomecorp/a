import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const variants = [
    [1440, 980, 1, 'right'], [1440, 980, 1, 'left'],
    [1280, 800, 2, 'right'], [1280, 800, 2, 'left'],
    [1024, 768, 1, 'right'], [1024, 768, 2, 'left'],
    [390, 844, 3, 'right'], [390, 844, 3, 'left'],
    [844, 390, 3, 'right'], [844, 390, 3, 'left']
];
const campaign = String(process.env.MOLECULE_UI_CAMPAIGN || 'latest').replace(/[^a-zA-Z0-9_-]+/g, '_');
const results = variants.map(([width, height, dpr, handedness]) => {
    const variant = `${width}x${height}_dpr${dpr}_${handedness}`;
    const tag = `${campaign}_${variant}`;
    const run = spawnSync(process.execPath, ['tests/probes/molecule_eve_ui_acceptance_probe.mjs'], {
        cwd: process.cwd(), stdio: 'inherit', env: {
            ...process.env,
            MOLECULE_UI_WIDTH: String(width), MOLECULE_UI_HEIGHT: String(height),
            MOLECULE_UI_DPR: String(dpr), MOLECULE_UI_HANDEDNESS: handedness,
            MOLECULE_UI_REPORT_TAG: tag
        }
    });
    return { tag, variant, width, height, dpr, handedness, ok: run.status === 0, exit_code: run.status };
});
const report = { created_at: new Date().toISOString(), campaign, ok: results.every((entry) => entry.ok), results };
const outputDirectory = path.resolve('temp/probe_reports/molecule_eve_ui_acceptance');
fs.mkdirSync(outputDirectory, { recursive: true });
for (const output of [
    path.join(outputDirectory, 'matrix_report.json'),
    path.join(outputDirectory, `matrix_report_${campaign}.json`)
]) {
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
if (!report.ok) process.exitCode = 1;
