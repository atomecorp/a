// Explicit live acceptance of hosted services, using only disposable test data.
import fs from 'node:fs';
import { chromium } from 'playwright';
if (process.env.ATOME_OPENAI_LIVE !== '1' || Number(process.env.ATOME_LIVE_BUDGET_USD) < 2) throw Error('live_service_budget_required');
const context = await chromium.launchPersistentContext('temp/openai-live-browser', { headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
const report = { checks: [], errors: [], scope: 'provider services; UI dispatch not covered', reserved_usd: 2 };
try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3001', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__authCheckComplete && window.AdoleAPI, null, { timeout: 45000 });
    const result = await page.evaluate(async (corpusOnly) => {
        const { requestProviderService: call } = await import('#squirrel/ai/provider_broker.js');
        const { OPENAI_MODEL_PROFILES } = await import('#squirrel/ai/model_catalog_registry.js');
        const model = OPENAI_MODEL_PROFILES[0].model, checks = [], cleanup = [];
        const check = async (action, payload, verify = () => true) => {
            const started = performance.now();
            try {
                const data = await call(action, payload);
                if (!verify(data)) throw Error('service_result_assertion_failed');
                checks.push({ action, ok: true, ms: Math.round(performance.now() - started), usage: data.usage });
                return data;
            } catch (error) { checks.push({ action, ok: false, error: error.message, http_status: error.http_status }); return null; }
        };
        const collectContainers = value => {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                if (key === 'container_id' && typeof child === 'string') cleanup.push(['containers.delete', { id: child }]);
                else if (typeof child === 'object') collectContainers(child);
            }
        };
        try {
            const file = await check('files.create', { purpose: 'assistants', files: [{ field: 'file', name: 'atome-corpus.txt', mime: 'text/plain',
                base64: btoa('For this disposable Atome acceptance fixture, the laboratory password is APRICOT_741. This is fictional test data.') }] }, r => !!r.id);
            if (file) {
                cleanup.push(['files.delete', { id: file.id }]);
                const corpus = await check('vector_stores.create', { name: 'Atome disposable acceptance', file_ids: [file.id], expires_after: { anchor: 'last_active_at', days: 1 } }, r => !!r.id);
                if (corpus) {
                    cleanup.push(['vector_stores.delete', { id: corpus.id }]);
                    let indexed = false;
                    for (let i = 0; i < 12; i++) {
                        const state = await check('vector_stores.files.read', { id: corpus.id, file_id: file.id });
                        if (!state) { await new Promise(resolve=>setTimeout(resolve,1000)); continue; }
                        if (state.status === 'completed') { indexed = true; break; }
                        if (state.status === 'failed') break;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    checks.push({ action: 'corpus_indexing', ok: indexed });
                    if (indexed) {
                        await check('vector_stores.search', { id: corpus.id, query: 'What is the laboratory password?', max_num_results: 2 }, r => JSON.stringify(r.data).includes('APRICOT_741'));
                        await check('file_search.run', { vector_store_ids: [corpus.id], query: 'What is the fictional laboratory password in the provided corpus? Cite the file.' }, r => JSON.stringify(r.output).includes('APRICOT_741'));
                    }
                }
            }
            if (!corpusOnly) {
            const upload = await check('uploads.create', { filename: 'atome-upload.txt', bytes: 10, mime_type: 'text/plain', purpose: 'user_data' }, r => !!r.id);
            if (upload) {
                const part = await check('uploads.part', { id: upload.id, files: [{ field: 'data', name: 'part.txt', mime: 'text/plain', base64: btoa('ATOME_TEST') }] }, r => !!r.id);
                const complete = part && await check('uploads.complete', { id: upload.id, part_ids: [part.id] }, r => r.status === 'completed' && !!r.file?.id);
                if (complete) cleanup.push(['files.delete', { id: complete.file.id }]);
                else cleanup.push(['uploads.cancel', { id: upload.id }]);
            }
            await check('responses', { model, input: 'Search the web for the official OpenAI Responses API documentation and give its URL.', tools: [{ type: 'web_search' }], tool_choice: { type: 'web_search' }, max_output_tokens: 512 }, r => r.output?.some(x => x.type === 'web_search_call')); 
            const analysis = await check('analysis.run', { query: 'Use Code Interpreter to calculate the sum of squares of integers 1 through 10. Return the result.' }, r => r.output?.some(x => x.type === 'code_interpreter_call') && JSON.stringify(r.output).includes('385'));
            collectContainers(analysis);
            const shell = await check('shell.run', { query: 'In the isolated container, use the shell to print ATOME_SHELL_OK. Do not access the network or any user files.' }, r => JSON.stringify(r.output).includes('ATOME_SHELL_OK'));
            collectContainers(shell);
            }
        } catch (error) { checks.push({action:'campaign',ok:false,error:error.message}); } finally {
            const seen = new Set();
            for (const [action, payload] of cleanup.reverse()) {
                const key = action + payload.id; if (seen.has(key)) continue; seen.add(key);
                await check(action, payload);
            }
        }
        return checks;
    }, process.env.ATOME_LIVE_CORPUS_ONLY === '1');
    report.checks = result;
} catch (error) { report.errors.push(error.message); }
finally {
    report.status = report.errors.length || report.checks.some(x => !x.ok) ? 'partial' : 'passed';
    fs.writeFileSync(process.env.ATOME_LIVE_CORPUS_ONLY==='1'?'temp/openai-live-corpus.json':'temp/openai-live-services.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); await context.close();
}
