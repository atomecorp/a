// Run an async JS body in the iPad atome WebView and print its JSON result.
// Usage: node ipad_eval.mjs <file.js>   (body of an async function; `return` a value)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import os from 'node:os';
const require = createRequire(`${os.homedir()}/.appium/node_modules/appium-xcuitest-driver/package.json`);
const { createRemoteDebugger } = require('appium-remote-debugger');
const body = readFileSync(process.argv[2], 'utf8');
const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS || 60000);
const rd = createRemoteDebugger({ udid: process.env.UDID || '00008027-000520902E31802E', bundleId: process.env.BUNDLE || 'one.atome.app', platformVersion: process.env.IOS_VERSION || '27.0', isSafari: false }, true);
await rd.connect();
let apps = [];
for (let i = 0; i < 8 && !apps?.length; i++) { apps = await rd.selectApp(undefined, 5); if (!apps?.length) await new Promise(r => setTimeout(r, 1500)); }
// APP_BUNDLE: the process of that exact bundle (the app and its AUv3 extension share a prefix).
const wantedPid = process.env.APP_BUNDLE
    ? Object.entries(rd.appDict || {}).find(([, v]) => v.bundleId === process.env.APP_BUNDLE)?.[0]?.replace('PID:', '') : null;
const pool = process.env.APP_BUNDLE ? (apps || []).filter(p => p.bundleId === process.env.APP_BUNDLE || String(p.id).split('.')[0] === wantedPid) : (apps || []);
if (process.env.APP_DEBUG) console.log('@@' + JSON.stringify((apps || []).map(p => [p.id, p.bundleId, p.url])));
const page = pool.find(p => /index\.html/.test(p.url)) || pool[0];
if (!page) { console.error('no page'); process.exit(2); }
await rd.selectPage(`PID:${String(page.id).split('.')[0]}`, String(page.id).split('.')[1] ?? page.id, true);
const key = `__probe_${Date.now()}`;
await rd.execute(`(async () => { ${body} })().then(v => { window['${key}'] = JSON.stringify({ ok: true, value: v }); }, e => { window['${key}'] = JSON.stringify({ ok: false, error: String(e && e.message || e) + ' | ' + String(e && e.stack || '') }); }); 'started'`);
const started = Date.now();
let out = null;
while (Date.now() - started < timeoutMs) {
    out = await rd.execute(`window['${key}'] || ''`);
    if (out) break;
    await new Promise(r => setTimeout(r, 700));
}
console.log('@@' + (typeof out === 'string' ? out : JSON.stringify(out)) || 'timeout');
await rd.disconnect();
process.exit(0);
