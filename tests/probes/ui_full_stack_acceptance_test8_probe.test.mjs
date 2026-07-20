import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.resolve('temp/probe_reports/ui_full_stack_acceptance_test8');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const BROWSER_URL = process.env.ADOLE_TEST_BROWSER_URL || process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const TAURI_URL = process.env.ADOLE_TEST_TAURI_URL || 'http://127.0.0.1:3000';
const IOS_URL = process.env.ADOLE_TEST_IOS_URL || '';
const RUN_TAURI = process.env.ADOLE_TEST8_SKIP_TAURI !== '1';
const RUN_BROWSER = process.env.ADOLE_TEST8_SKIP_BROWSER !== '1';
const RUN_IOS = IOS_URL && process.env.ADOLE_TEST8_SKIP_IOS !== '1';
const basePhone = String(process.env.ADOLE_TEST_PHONE_PREFIX || `${Date.now()}`).replace(/\D+/g, '').slice(-7).padStart(7, '8');

fs.mkdirSync(OUT_DIR, { recursive: true });

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  } catch (error) {
    return { ok: false, error: error?.message || String(error || 'read_failed') };
  }
};

const redact = (text) => String(text || '')
  .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const writeReport = (report) => {
  fs.writeFileSync(REPORT_FILE, `${redact(JSON.stringify(report, null, 2))}\n`, 'utf8');
};

const phoneFor = (suffix) => `${basePhone}${suffix}`.slice(-10).padStart(10, String(suffix));
const allowedHttpDiagnostic = (url) => /\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(String(url || ''));

const textLooksLikeFailure = (text) => /Failed to load resource|Unhandled Promise Rejection|Cross origin requests|Fetch API cannot load|requestfailed|pageerror|\b(?:401|403|404|429|500|502|503)\b/i.test(String(text || ''));

const collectLogFailures = (value, pathParts = [], failures = []) => {
  if (value === null || value === undefined) return failures;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLogFailures(item, pathParts.concat(String(index)), failures));
    return failures;
  }
  if (typeof value === 'object') {
    const status = Number(value.status || value.status_code || 0);
    const url = String(value.url || '');
    const type = String(value.type || value.kind || '').toLowerCase();
    const text = String(value.text || value.message || value.error || '');
    if (status >= 400 && !allowedHttpDiagnostic(url)) {
      failures.push({ path: pathParts.join('.'), status, url: redact(url) });
    } else if ((type === 'error' || type === 'pageerror' || type === 'requestfailed') && textLooksLikeFailure(text)) {
      failures.push({ path: pathParts.join('.'), type, text: redact(text).slice(0, 500) });
    } else if (textLooksLikeFailure(text) && /console|error|network|http|request|stderr|stdout/i.test(pathParts.join('.'))) {
      failures.push({ path: pathParts.join('.'), text: redact(text).slice(0, 500) });
    }
    for (const [key, child] of Object.entries(value)) {
      collectLogFailures(child, pathParts.concat(key), failures);
    }
    return failures;
  }
  if (typeof value === 'string' && textLooksLikeFailure(value) && /console|error|network|http|request|stderr|stdout/i.test(pathParts.join('.'))) {
    failures.push({ path: pathParts.join('.'), text: redact(value).slice(0, 500) });
  }
  return failures;
};

const auditProbeLogs = (stepResult) => collectLogFailures({
  report: stepResult.report,
  stdout_tail: stepResult.stdout_tail,
  stderr_tail: stepResult.stderr_tail
});

const runProbe = (step) => {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [step.file], {
    cwd: ROOT,
    env: { ...process.env, ...step.env },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 12
  });
  const finishedAt = new Date().toISOString();
  const report = step.report ? readJson(step.report) : null;
  const stepResult = {
    id: step.id,
    label: step.label,
    required: step.required !== false,
    command: `node ${step.file}`,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: result.status,
    signal: result.signal,
    ok: false,
    stdout_tail: redact((result.stdout || '').split('\n').slice(-18).join('\n')),
    stderr_tail: redact((result.stderr || '').split('\n').slice(-18).join('\n')),
    report_file: step.report || null,
    report
  };
  stepResult.log_failures = auditProbeLogs(stepResult);
  stepResult.ok = result.status === 0 && report?.ok !== false && stepResult.log_failures.length === 0;
  return stepResult;
};

const steps = [];

if (RUN_BROWSER) {
  steps.push(
    {
      id: 'browser_audio_record_playback',
      label: 'Browser account creation, audio recording, audio decode/playable media',
      file: 'tests/probes/audio_recording_bevy_capture_probe.test.mjs',
      report: 'temp/probe_reports/audio_recording_bevy_capture_probe/report.json',
      env: {
        ADOLE_TEST_URL: BROWSER_URL,
        ADOLE_TEST_PHONE: phoneFor('01'),
        ADOLE_TEST_PASSWORD: phoneFor('01')
      }
    },
    {
      id: 'browser_session_project_persistence',
      label: 'Browser session refresh and atome persistence',
      file: 'tests/probes/atome_persistence_probe.test.mjs',
      report: 'temp/probe_reports/atome_persistence_probe.json',
      env: {
        ADOLE_TEST_URL: BROWSER_URL,
        ADOLE_TEST_PHONE: phoneFor('03'),
        ADOLE_TEST_PASSWORD: phoneFor('03'),
        ADOLE_TEST_USERNAME: `test8_browser_${phoneFor('03')}`,
        ADOLE_TEST_PROJECT_NAME: `Test 8 Browser ${phoneFor('03')}`,
        ADOLE_TEST_CREATE_USER: '1'
      }
    },
    {
      id: 'browser_fixture_import_playback',
      label: 'Browser fixture media import, display, video playback, and audio decode',
      file: 'tests/probes/media_fixture_import_playback_probe.test.mjs',
      report: 'temp/probe_reports/media_fixture_import_playback_probe/browser/report.json',
      env: {
        ADOLE_TEST_URL: BROWSER_URL,
        ADOLE_TEST_MODE: 'browser',
        ADOLE_TEST_PHONE: phoneFor('05'),
        ADOLE_TEST_PASSWORD: phoneFor('05')
      }
    }
  );
}

if (RUN_TAURI) {
  steps.push(
    {
      id: 'tauri_fixture_import_playback',
      label: 'Tauri fixture media import, display, video playback, and audio decode',
      file: 'tests/probes/media_fixture_import_playback_probe.test.mjs',
      report: 'temp/probe_reports/media_fixture_import_playback_probe/tauri/report.json',
      env: {
        ADOLE_TEST_URL: TAURI_URL,
        ADOLE_TEST_MODE: 'tauri',
        ADOLE_TEST_PHONE: phoneFor('06'),
        ADOLE_TEST_PASSWORD: phoneFor('06'),
        HEADLESS: process.env.ADOLE_TEST8_TAURI_HEADLESS || '0'
      }
    }
  );
}

if (RUN_IOS) {
  steps.push({
    id: 'ios_fixture_import_playback',
    label: 'iOS fixture media import, display, video playback, and audio decode',
    file: 'tests/probes/media_fixture_import_playback_probe.test.mjs',
    report: 'temp/probe_reports/media_fixture_import_playback_probe/ios/report.json',
    env: {
      ADOLE_TEST_URL: IOS_URL,
      ADOLE_TEST_MODE: 'ios',
      ADOLE_TEST_PHONE: phoneFor('07'),
      ADOLE_TEST_PASSWORD: phoneFor('07'),
      HEADLESS: process.env.ADOLE_TEST8_IOS_HEADLESS || '0'
    },
    required: process.env.ADOLE_TEST8_IOS_REQUIRED === '1'
  });
}

const report = {
  ok: false,
  created_at: new Date().toISOString(),
  browser_url: BROWSER_URL,
  tauri_url: RUN_TAURI ? TAURI_URL : null,
  ios_url: RUN_IOS ? IOS_URL : null,
  scope: [
    'account_creation',
    'audio_recording_and_playback',
    'video_recording_and_playback',
    'session_refresh_persistence',
    'project_atom_persistence',
    'fixture_media_import_display_playback',
    'log_error_audit'
  ],
  steps: []
};

for (const step of steps) {
  const result = runProbe(step);
  report.steps.push(result);
  writeReport(report);
}

report.ok = report.steps.every((step) => step.ok || step.required === false);
report.summary = report.steps.map((step) => ({
  id: step.id,
  ok: step.ok,
  exit_code: step.exit_code,
  log_failure_count: step.log_failures?.length || 0,
  fatal: step.report?.fatal || null
}));
writeReport(report);

if (!report.ok) {
  console.error(JSON.stringify({ ok: false, report: REPORT_FILE, summary: report.summary }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, report: REPORT_FILE, summary: report.summary }, null, 2));
