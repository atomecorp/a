import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'tools', 'headless_output');

const runOne = (testPath) => {
    const result = spawnSync(process.execPath, [testPath], {
        cwd: ROOT,
        encoding: 'utf8'
    });
    return {
        test: testPath,
        ok: result.status === 0,
        status: result.status,
        stdout: String(result.stdout || '').trim(),
        stderr: String(result.stderr || '').trim()
    };
};

export const runSuite = ({ suite_name, tests = [], output_file }) => {
    const results = tests.map((entry) => runOne(entry));
    const report = {
        suite_name,
        generated_at: new Date().toISOString(),
        passed: results.every((entry) => entry.ok === true),
        total: results.length,
        passed_count: results.filter((entry) => entry.ok === true).length,
        failed_count: results.filter((entry) => entry.ok !== true).length,
        tests: results
    };
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, output_file), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) {
        process.exitCode = 1;
    }
};
