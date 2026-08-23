// Sonde de CAPACITE — un navigateur sans fenetre peut-il peindre ce canvas ?
//
// Les sondes visuelles du depot tournent en mode FENETRE par defaut, ce qui vole
// l'ecran a chaque run. La raison invoquee — « le headless de Playwright n'a pas
// de GPU » — n'avait jamais ete mesuree ici.
//
// Mesure du 22 août 2026 : elle est FAUSSE sur cette machine. `headless: true` nu,
// avec les arguments `--use-angle=swiftshader` deja presents, obtient un adaptateur
// WebGPU (`google` / `swiftshader`) et peint tout — `non_black_pixel_ratio: 1`,
// 4096 couleurs. `channel: 'chromium'` n'y change rien de mesurable.
//
// C'est precisement pourquoi cette sonde existe : materiel, pilotes et versions de
// Playwright bougent, et une affirmation sur le headless ne vaut que le jour ou on
// l'a mesuree. Elle ne teste pas le produit — elle tranche une question
// d'outillage, avec les SEUILS DE PRODUCTION de
// `molecule_eve_ui_acceptance_probe.mjs`, pour qu'un « ca marche » ici signifie
// exactement « ca marchera la-bas ».
//
//   A  headless nu            — ce que font les sondes aujourd'hui
//   B  headless + channel     — l'alternative souvent recommandee
//   C  fenetre hors ecran     — le repli si le headless regresse
//   D  fenetre visible        — temoin
//
// `recommended` nomme le premier mode SANS fenetre visible qui peint vraiment.
//
// Usage (opt-in, ~1 min par variante) :
//   WEBGPU_CAPABILITY_VARIANTS=A,B node tests/probes/webgpu_headless_capability_probe.probe.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { analyzePngSignal } from './molecule_ui_acceptance_support.mjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('temp/probe_reports/webgpu_headless_capability');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 980 });
const NAV_TIMEOUT_MS = 45000;

fs.mkdirSync(OUT_DIR, { recursive: true });

// Les memes drapeaux que la sonde phare, pour qu'aucune difference d'argument ne
// vienne polluer la comparaison.
const BASE_ARGS = Object.freeze([
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox',
    '--enable-precise-memory-info', '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'
]);
const SOFTWARE_GPU_ARGS = Object.freeze(['--use-angle=swiftshader', '--enable-features=Vulkan']);
// Hors ecran : la fenetre existe et compose vraiment, mais aucun pixel n'atteint
// l'ecran de l'utilisateur. `page.screenshot` passe par `Page.captureScreenshot`
// du CDP, qui lit le compositeur et non l'ecran — il fonctionne donc encore.
const OFFSCREEN_ARGS = Object.freeze(['--window-position=-32000,-32000']);

const VARIANTS = Object.freeze([
    {
        key: 'A', label: 'headless nu (comportement actuel)',
        launch: { headless: true, args: [...BASE_ARGS, ...SOFTWARE_GPU_ARGS] }
    },
    {
        key: 'B', label: "headless + channel:'chromium' (headless nouvelle generation)",
        launch: { headless: true, channel: 'chromium', args: [...BASE_ARGS, ...SOFTWARE_GPU_ARGS] }
    },
    {
        key: 'C', label: 'fenetre hors ecran',
        launch: { headless: false, args: [...BASE_ARGS, ...OFFSCREEN_ARGS] }
    },
    {
        key: 'D', label: 'fenetre visible (temoin)',
        launch: { headless: false, args: [...BASE_ARGS] }
    }
]);

// OPT-IN EXPLICITE. Cette sonde lance jusqu'a quatre navigateurs et met environ une
// minute par variante : `scripts/run_probes.mjs` la tuerait a 60 s et compterait un
// echec, et les variantes C/D ouvriraient des fenetres au milieu d'un balayage. Elle
// repond donc « ignoree », avec sa raison, tant qu'on ne la demande pas — jamais un
// saut silencieux.
const requestedRaw = String(process.env.WEBGPU_CAPABILITY_VARIANTS || '').trim();
if (!requestedRaw) {
    process.stdout.write(
        '[capability] ignoree : mesure de capacite a la demande, ~1 min par variante.\n'
        + '[capability] pour la lancer : WEBGPU_CAPABILITY_VARIANTS=A,B node '
        + 'tests/probes/webgpu_headless_capability_probe.probe.mjs\n'
    );
    process.exit(0);
}
const requested = requestedRaw.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const selected = VARIANTS.filter((variant) => requested.includes(variant.key));
if (!selected.length) {
    process.stdout.write(`[capability] aucune variante connue dans "${requestedRaw}" (attendu A, B, C ou D)\n`);
    process.exit(1);
}

// Sans serveur joignable, la mesure ne veut rien dire : le dire, et ne pas
// pretendre avoir mesure.
const reachable = await fetch(`${APP_URL}/healthz`, { signal: AbortSignal.timeout(4000) })
    .then((response) => response.ok)
    .catch(() => false);
if (!reachable) {
    process.stdout.write(`[capability] ignoree : aucun serveur sur ${APP_URL} (lancer ./scripts/run_fastify.sh)\n`);
    process.exit(0);
}

// Les seuils sont ceux de la production, copies volontairement plutot que
// devines : molecule_eve_ui_acceptance_probe.mjs:630-632.
const MEETS_PRODUCTION_THRESHOLDS = (signal) => Boolean(signal)
    && signal.non_black_pixel_ratio >= 0.01
    && signal.luma_range >= 12
    && signal.sampled_color_count >= 12;

const readAdapter = (page) => page.evaluate(async () => {
    if (!navigator.gpu) return { ok: false, reason: 'navigator_gpu_absent' };
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { ok: false, reason: 'adapter_null' };
        const info = adapter.info || {};
        return {
            ok: true,
            vendor: String(info.vendor || ''),
            architecture: String(info.architecture || ''),
            description: String(info.description || '')
        };
    } catch (error) {
        return { ok: false, reason: String(error?.message || error) };
    }
});

// La page d'accueil suffit : elle monte deja le menu principal sur le canvas
// partage. Inutile de provisionner un compte pour savoir si le GPU peint —
// et cela garde la sonde independante du contrat d'authentification.
const measureVariant = async (variant) => {
    const started = Date.now();
    const result = {
        variant: variant.key, label: variant.label, ok: false,
        adapter: null, signal: null, screenshot: null, error: null, elapsed_ms: 0
    };
    let browser = null;
    try {
        browser = await chromium.launch(variant.launch);
        const context = await browser.newContext({ viewport: VIEWPORT });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400));
        });
        await page.goto(APP_URL, { waitUntil: 'commit', timeout: NAV_TIMEOUT_MS });
        result.adapter = await readAdapter(page);
        // Laisser au renderer le temps de peindre au moins un frame complet.
        await page.waitForFunction(
            () => Boolean(document.getElementById('eve_surface_project')),
            null,
            { timeout: NAV_TIMEOUT_MS }
        ).catch(() => null);
        await page.waitForTimeout(6000);
        const shot = path.join(OUT_DIR, `variant_${variant.key}.png`);
        await page.screenshot({ path: shot, animations: 'disabled' });
        result.screenshot = shot;
        result.signal = analyzePngSignal(shot);
        result.console_errors = consoleErrors.slice(0, 5);
        result.paints = MEETS_PRODUCTION_THRESHOLDS(result.signal);
        result.ok = result.adapter?.ok === true && result.paints === true;
        await context.close();
    } catch (error) {
        result.error = String(error?.message || error);
    } finally {
        await browser?.close().catch(() => null);
        result.elapsed_ms = Date.now() - started;
    }
    return result;
};

const report = {
    generated_at: new Date().toISOString(),
    app_url: APP_URL,
    viewport: VIEWPORT,
    variants: [],
    // Ce que la sonde CONCLUT, pour que l'appelant n'ait pas a interpreter des
    // chiffres : le premier mode sans fenetre visible qui peint vraiment.
    recommended: null,
    ok: false
};

for (const variant of selected) {
    process.stdout.write(`[capability] ${variant.key} — ${variant.label}\n`);
    const measured = await measureVariant(variant);
    report.variants.push(measured);
    process.stdout.write(
        `           adapter=${measured.adapter?.ok === true ? 'oui' : `non(${measured.adapter?.reason || measured.error})`}`
        + ` peint=${measured.paints === true ? 'OUI' : 'non'}`
        + ` non_black=${measured.signal ? measured.signal.non_black_pixel_ratio.toFixed(4) : 'n/a'}`
        + ` couleurs=${measured.signal?.sampled_color_count ?? 'n/a'}`
        + ` (${measured.elapsed_ms} ms)\n`
    );
}

// L'ordre de preference est celui du plan : invisible d'abord, fenetre visible
// en dernier recours seulement.
const preference = ['B', 'A', 'C', 'D'];
report.recommended = preference
    .map((key) => report.variants.find((entry) => entry.variant === key))
    .find((entry) => entry?.ok === true)?.variant || null;
report.ok = report.recommended != null;

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
process.stdout.write(`[capability] rapport : ${REPORT_FILE}\n`);
process.stdout.write(
    report.recommended
        ? `[capability] mode retenu : ${report.recommended}\n`
        : '[capability] AUCUN mode ne peint — voir les captures variant_*.png\n'
);
process.exit(report.ok ? 0 : 1);
