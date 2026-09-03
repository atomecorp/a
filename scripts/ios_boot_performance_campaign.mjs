#!/usr/bin/env node

import { spawn } from 'node:child_process';

const valueFor = (name, fallback) => {
    const prefix = `--${name}=`;
    return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
};

const device = valueFor('device', process.env.ATOME_IOS_DEVICE);
if (!device) throw new Error('ios_boot_device_required');
const bundleId = valueFor('bundle-id', 'one.atome.app');
const runs = Math.max(1, Number(valueFor('runs', '20')));
const timeoutMs = Math.max(6_000, Number(valueFor('timeout-ms', '12000')));
const label = valueFor('label', 'unclassified');

const numberAfter = (source, key) => {
    const match = source.match(new RegExp(`${key}["']?\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)`));
    return match ? Number(match[1]) : null;
};

const runOnce = (index) => new Promise((resolve) => {
    const child = spawn('xcrun', [
        'devicectl', 'device', 'process', 'launch',
        '--device', device,
        '--terminate-existing', '--console', bundleId
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let settled = false;
    const finish = (status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill('SIGINT');
        const lines = output.split(/\r?\n/);
        const readyLine = lines.find((line) => (
            line.includes('[BOOT_PRESENTATION]') || line.includes('[BOOT_AUTHENTICATION]')
        )) || '';
        const failureLine = lines.find((line) => line.includes('[BOOT_FAILURE]')) || '';
        const milestones = lines
            .filter((line) => line.includes('[BOOT_MILESTONE]'))
            .map((line) => line.slice(line.indexOf('[BOOT_MILESTONE]') + '[BOOT_MILESTONE]'.length).trim());
        const evidence = readyLine || failureLine;
        const result = {
            label,
            run: index,
            status: failureLine ? 'failure' : status,
            elapsed_ms: numberAfter(evidence, 'native_elapsed_ms'),
            interactive_ms: numberAfter(readyLine, 'interactive_ms'),
            requests: numberAfter(evidence, 'request_count'),
            bytes: numberAfter(evidence, 'byte_count'),
            native_peak_memory_mb: numberAfter(evidence, 'native_peak_memory_mb'),
            route: /route["']?\s*[:=]\s*project/.test(readyLine)
                ? 'project'
                : (/route["']?\s*[:=]\s*login/.test(readyLine) ? 'login' : null),
            milestones,
            terminal: evidence || lines.filter(Boolean).at(-1) || ''
        };
        console.log(JSON.stringify(result));
        resolve(result);
    };
    const inspect = (chunk) => {
        output += chunk.toString();
        if (output.includes('[BOOT_PRESENTATION]') || output.includes('[BOOT_AUTHENTICATION]')) finish('ready');
        else if (output.includes('[BOOT_FAILURE]') || output.includes('failed to launch')) finish('failure');
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.on('exit', () => finish('exited'));
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
});

const results = [];
for (let index = 1; index <= runs; index += 1) {
    results.push(await runOnce(index));
}

const ready = results.filter((item) => item.status === 'ready' && Number.isFinite(item.elapsed_ms));
const sorted = ready.map((item) => item.elapsed_ms).sort((left, right) => left - right);
const percentile = (values, ratio) => values[Math.max(0, Math.ceil(values.length * ratio) - 1)] ?? null;
console.log(JSON.stringify({
    summary: true,
    label,
    runs,
    ready: ready.length,
    failures: results.filter((item) => item.status === 'failure').length,
    timeouts: results.filter((item) => item.status === 'timeout').length,
    median_ms: percentile(sorted, 0.5),
    p95_ms: percentile(sorted, 0.95),
    worst_ms: sorted.at(-1) ?? null,
    max_requests: Math.max(0, ...results.map((item) => item.requests || 0)),
    max_native_peak_memory_mb: Math.max(0, ...results.map((item) => item.native_peak_memory_mb || 0))
}));
