import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
const page = await browser.newPage();
const report = { errors: [], platform: 'web', live_provider: false };
// Opt-in real local ONNX/Kira playback; never started by CI or a provider test.
page.setDefaultTimeout(60000);
page.on('pageerror', e => report.errors.push(e.message));
try {
 await page.goto(process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001', { waitUntil: 'commit' });
 await page.waitForFunction(() => window.new_menu_v2 || window.__DEBUG__ || document.getElementById('intuition'), null, { timeout: 60000 });
 await page.mouse.click(400, 400);
 report.result = await page.evaluate(async () => {
  await window.__atomeLoadOptionalIntegrations?.();
  const api = window.AtomeVoice;
  if (!api) throw new Error('voice_api_missing');
  const session = await api.createSession({ source_layer: 'local_voice_acceptance' });
  const before = { audioFacade: Boolean(window.Squirrel?.av?.audio), provider: api.providers?.tts?.selected };
  try {
   const started = await api.speak('Vérification de la voix locale.', { session_id: session.session_id, engine: 'local_onnx' });
   const finished = await started.promise;
   return { before, provider: started.provider, completed: Boolean(finished) };
  } catch (error) { return { before, error: error.message }; }
  finally { await api.stopSpeaking(session.session_id); }
 });
 if (report.result?.error || !report.result?.completed || report.errors.length) throw new Error(report.result?.error || 'local_voice_acceptance_failed');
 report.status = 'passed';
} catch (error) { report.status = 'failed'; process.exitCode = 1; report.failure = error.message; }
finally { fs.writeFileSync('temp/openai-local-voice-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); await browser.close(); }
