import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OUTPUT_DIR = path.join(process.cwd(), 'tools', 'headless_output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase9_icloud_live_bundle.json');

const runNode = (script) => {
    const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env
    });
    return {
        script,
        ok: result.status === 0,
        status: result.status,
        stdout: String(result.stdout || '').trim(),
        stderr: String(result.stderr || '').trim()
    };
};

const mail = runNode('scripts/phase9_icloud_mail_live_smoke.mjs');
const calendar = runNode('scripts/phase9_icloud_calendar_live_smoke.mjs');

const report = {
    generated_at: new Date().toISOString(),
    passed: mail.ok && calendar.ok,
    checks: {
        mail,
        calendar
    }
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
    process.exitCode = 1;
}
