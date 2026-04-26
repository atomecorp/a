import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const MEDIA_DIR = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'temp_import_tests');
const OUT_DIR = path.resolve('tools/headless_output/browser_media_acceptance_probe');
const LOG_FILE = path.join(OUT_DIR, 'run.log');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const HEADLESS = process.env.BROWSER_MEDIA_PROBE_HEADLESS !== '0';

const MEDIA_CASES = [
    { name: '0000.png', kind: 'image' },
    { name: 'atome.svg', kind: 'svg' },
    { name: "Jeezs's fire.m4v", kind: 'video' },
    { name: 'Vampire.m4v', kind: 'video' },
    { name: 'test.m4a', kind: 'audio' }
];

const MEDIA_PATHS = MEDIA_CASES.map((entry) => path.join(MEDIA_DIR, entry.name));

fs.mkdirSync(OUT_DIR, { recursive: true });

const redactSecrets = (text) => String(text || '')
    .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const log = (message, detail = null) => {
    const line = redactSecrets(`[${new Date().toISOString()}] ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
    fs.appendFileSync(LOG_FILE, `${line}\n`);
    console.log(line);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeJson = (fileName, value) => {
    fs.writeFileSync(path.join(OUT_DIR, fileName), redactSecrets(JSON.stringify(value, null, 2)));
};

const safeName = (value) => String(value || '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const compareName = (value) => safeName(
    String(value || '')
        .split('?')[0]
        .split('#')[0]
        .split('/')
        .pop()
        .split('\\')
        .pop()
);

const withTimeout = async (promise, timeoutMs, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs))
]);

const safeEval = async (page, fn, arg = null, timeoutMs = 15000) => {
    try {
        return await withTimeout(page.evaluate(fn, arg), timeoutMs, 'page_eval');
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, predicate, arg, Math.min(timeoutMs, intervalMs + 3000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const analyzePngBuffer = (buffer) => {
    const png = PNG.sync.read(buffer);
    let opaquePixels = 0;
    let lumaMin = Number.POSITIVE_INFINITY;
    let lumaMax = Number.NEGATIVE_INFINITY;
    let lumaSum = 0;
    let hash = 2166136261;
    for (let index = 0; index < png.data.length; index += 4) {
        const red = png.data[index];
        const green = png.data[index + 1];
        const blue = png.data[index + 2];
        const alpha = png.data[index + 3];
        if (alpha > 0) opaquePixels += 1;
        const luma = red + green + blue;
        lumaMin = Math.min(lumaMin, luma);
        lumaMax = Math.max(lumaMax, luma);
        lumaSum += luma;
        hash ^= red + (green << 8) + (blue << 16) + (alpha << 24);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return {
        width: png.width,
        height: png.height,
        opaque_pixels: opaquePixels,
        opaque_ratio: Number((opaquePixels / Math.max(1, png.width * png.height)).toFixed(6)),
        luma_range: Number.isFinite(lumaMin) && Number.isFinite(lumaMax) ? (lumaMax - lumaMin) : 0,
        luma_mean: Number((lumaSum / Math.max(1, png.width * png.height * 3)).toFixed(6)),
        hash
    };
};

const captureLocatorStats = async (locator, filePath) => {
    const buffer = await locator.screenshot({ path: filePath });
    return analyzePngBuffer(buffer);
};

const ensureFilesExist = () => {
    for (const mediaPath of MEDIA_PATHS) {
        if (!fs.existsSync(mediaPath)) {
            throw new Error(`missing_test_media:${mediaPath}`);
        }
    }
};

const tryLogin = async (page) => {
    const loginResult = await safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
        try {
            const result = await api.auth.login(phone, password, phone);
            return {
                ok: !!(result?.fastify?.success || result?.tauri?.success),
                method: 'login',
                result
            };
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'auth_login_failed') };
        }
    }, { phone: PHONE, password: PASSWORD }, 15000);
    if (loginResult?.ok) return loginResult;
    return safeEval(page, async ({ phone, password, prior }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable', prior };
        try {
            const result = await api.auth.create(phone, password, phone, { autoLogin: true });
            return {
                ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
                method: 'create',
                result,
                prior
            };
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'auth_create_failed'), prior };
        }
    }, { phone: PHONE, password: PASSWORD, prior: loginResult }, 25000);
};

const bootstrapImport = async (page) => {
    const bootstrap = await safeEval(page, async () => {
        window.__CHECK_DEBUG__ = true;
        window.__EVE_MEDIA_DIAG_HEADLESS__ = true;
        window.__EVE_MTRACK_DEBUG__ = true;
        window.__EVE_MTRACK_TRACE__ = true;
        window.__EVE_MTRACK_BRIDGE_LOGS__ = true;
        if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
            await import('/application/eVe/intuition/tools/project_drop.js');
        }
        if (typeof window.__DEBUG__?.setDeterministicTestMode === 'function') {
            window.__DEBUG__.setDeterministicTestMode(true);
        }
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        return {
            ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && projectEl && projectId),
            project_id: projectId,
            project_el_id: projectEl?.id || null,
            debug_ready: !!window.__DEBUG__
        };
    }, null, 25000);
    if (!bootstrap?.ok) {
        throw new Error(`bootstrap_failed:${bootstrap?.error || JSON.stringify(bootstrap)}`);
    }
    await page.evaluate(() => {
        document.getElementById('browser_media_acceptance_input')?.remove();
        const input = document.createElement('input');
        input.id = 'browser_media_acceptance_input';
        input.type = 'file';
        input.multiple = true;
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#browser_media_acceptance_input', MEDIA_PATHS);
    return bootstrap;
};

const importMedia = async (page) => {
    const importResult = await safeEval(page, async () => {
        const input = document.getElementById('browser_media_acceptance_input');
        const entries = Array.from(input?.files || []);
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        if (!entries.length) return { ok: false, error: 'no_files_selected' };
        if (!projectEl || !projectId) return { ok: false, error: 'project_target_missing', projectId, hasProjectEl: !!projectEl };
        const rect = projectEl.getBoundingClientRect();
        return window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            event: {
                clientX: rect.left + Math.min(280, Math.max(40, rect.width / 3)),
                clientY: rect.top + Math.min(220, Math.max(40, rect.height / 3))
            },
            projectId,
            projectEl,
            origin: 'headless_browser_media_acceptance_probe',
            sourceLayer: 'headless_browser_media_acceptance_probe',
            actorType: 'headless_probe'
        });
    }, null, 180000);
    if (!importResult?.ok) {
        throw new Error(`import_failed:${importResult?.error || JSON.stringify(importResult)}`);
    }
    return importResult;
};

const collectDesktopInventory = async (page) => safeEval(page, async () => {
    const safeString = (value) => String(value || '').trim();
    const compareName = (value) => String(value || '')
        .split('?')[0]
        .split('#')[0]
        .split('/')
        .pop()
        .split('\\')
        .pop()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const inferKind = (value = '', source = '') => {
        const rawKind = safeString(value).toLowerCase();
        const rawSource = safeString(source).toLowerCase();
        if (rawKind === 'sound') return 'audio';
        if (rawKind === 'audio' || rawKind === 'video' || rawKind === 'image' || rawKind === 'svg') return rawKind;
        if (/\.(m4a|mp3|wav|aac|ogg|opus)(\?.*)?$/i.test(rawSource)) return 'audio';
        if (/\.(mp4|m4v|mov|webm)(\?.*)?$/i.test(rawSource)) return 'video';
        if (/\.svg(\?.*)?$/i.test(rawSource)) return 'svg';
        if (/\.(png|jpe?g|gif|bmp|webp|avif)(\?.*)?$/i.test(rawSource)) return 'image';
        return rawKind || 'unknown';
    };
    const summarizeRect = (node) => {
        const rect = node?.getBoundingClientRect?.();
        if (!rect) return null;
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            on_screen: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight
        };
    };
    const stateApi = window.Atome?.getStateCurrent || null;
    const hosts = Array.from(document.querySelectorAll('[data-atome-id]'));
    const entries = [];
    for (const host of hosts) {
        const atomeId = safeString(host.dataset?.atomeId || host.getAttribute('data-atome-id'));
        if (!atomeId) continue;
        let state = null;
        try {
            state = typeof stateApi === 'function' ? await stateApi(atomeId) : null;
        } catch (error) {
        console.warn("[cleanup] operation failed", error);
            state = null;
        }
        const props = (state && typeof state === 'object' && (state.properties || state.props || state)) || {};
        const source = safeString(
            host.dataset?.eveMediaSource
            || props.media_url
            || props.mediaUrl
            || props.src
            || props.file_path
            || props.filePath
            || ''
        );
        const fileName = safeString(props.file_name || props.fileName || '');
        const originalName = safeString(props.original_name || props.originalName || '');
        const kind = inferKind(host.dataset?.atomeKind || props.kind || props.type || '', source || fileName || originalName);
        if (!['image', 'svg', 'video', 'audio'].includes(kind)) continue;
        const imageNode = host.querySelector('img');
        const svgNode = host.querySelector('svg,[data-role="atome-shape-svg"]');
        const htmlVideoNode = host.querySelector('video');
        const htmlAudioNode = host.querySelector('audio');
        const moleculeVideoCanvas = host.querySelector('canvas[data-role="eve-media-api-webgpu-canvas"]');
        const moleculeAudioHost = host.querySelector('[data-role="eve-media-api-audio"]');
        entries.push({
            id: atomeId,
            kind,
            source,
            source_key: compareName(source || fileName || originalName),
            file_name: fileName,
            original_name: originalName,
            group_id: safeString(host.dataset?.groupId || host.dataset?.group_id || ''),
            group_member: safeString(host.dataset?.groupMember || host.dataset?.group_member || '') === 'true',
            rect: summarizeRect(host),
            renderer: safeString(host.dataset?.eveMediaRenderer || ''),
            markers: {
                has_img: !!imageNode,
                has_svg: !!svgNode,
                has_html_video: !!htmlVideoNode,
                has_html_audio: !!htmlAudioNode,
                has_molecule_video_canvas: !!moleculeVideoCanvas,
                has_molecule_audio_host: !!moleculeAudioHost
            },
            media_rect: summarizeRect(imageNode || svgNode || htmlVideoNode || htmlAudioNode || moleculeVideoCanvas || moleculeAudioHost || null)
        });
    }
    return { ok: true, entries };
}, null, 30000);

const buildCaseMap = (inventory, importResult = null) => {
    const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
    const byCase = new Map();
    const importedEntries = Array.isArray(importResult?.results) ? importResult.results : [];
    for (const [index, mediaCase] of MEDIA_CASES.entries()) {
        const importedAtomeId = String(importedEntries[index]?.atomeId || '').trim();
        if (importedAtomeId) {
            const importedMatch = entries.find((entry) => String(entry?.id || '').trim() === importedAtomeId) || null;
            if (importedMatch) {
                byCase.set(mediaCase.name, importedMatch);
                continue;
            }
        }
        const key = compareName(mediaCase.name);
        const match = entries.find((entry) => {
            if (entry.kind !== mediaCase.kind) return false;
            const candidates = [entry.source_key, compareName(entry.file_name), compareName(entry.original_name)];
            return candidates.includes(key);
        }) || null;
        byCase.set(mediaCase.name, match);
    }
    return byCase;
};

const resolveResizeOwnerId = (entry) => String(entry?.group_id || entry?.id || '').trim();

const resolveVisibleDesktopEntry = (entry, inventory, importResult, mediaCase) => {
    if (!entry) return null;
    if (entry.rect?.on_screen === true || entry.media_rect?.on_screen === true) return entry;
    const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
    const ownerId = resolveResizeOwnerId(entry);
    if (ownerId && ownerId !== entry.id) {
        const ownerEntry = entries.find((candidate) => String(candidate?.id || '').trim() === ownerId) || null;
        if (ownerEntry) return ownerEntry;
    }
    return buildCaseMap(inventory, importResult).get(mediaCase.name) || entry;
};

const resolveDesktopTargetSelector = (entry, mediaCase) => {
    if (mediaCase.kind === 'audio' && entry?.markers?.has_molecule_audio_host) {
        return `[data-atome-id="${entry.id}"] [data-role="eve-media-api-audio"]`;
    }
    if (mediaCase.kind === 'video' && entry?.markers?.has_molecule_video_canvas) {
        return `[data-atome-id="${entry.id}"] canvas[data-role="eve-media-api-webgpu-canvas"]`;
    }
    if (mediaCase.kind === 'image' && entry?.markers?.has_img) {
        return `[data-atome-id="${entry.id}"] img`;
    }
    if (mediaCase.kind === 'svg' && entry?.markers?.has_svg) {
        return `[data-atome-id="${entry.id}"] svg, [data-atome-id="${entry.id}"] [data-role="atome-shape-svg"]`;
    }
    return `[data-atome-id="${entry.id}"]`;
};

const resolveDesktopTargetRect = (entry, mediaCase) => (
    mediaCase.kind === 'audio'
        ? (entry?.media_rect || entry?.rect || null)
        : (entry?.media_rect || entry?.rect || null)
);

const resolveResizeGesture = async (page, atomeId, mediaKind, scale = null, explicitWidth = null, explicitHeight = null) => safeEval(page, async ({ atomeId, mediaKind, scale, explicitWidth, explicitHeight }) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'atome_host_missing' };
    const resolveTarget = () => {
        if (mediaKind === 'audio') {
            return host.querySelector('[data-role="eve-media-api-audio"]') || host;
        }
        if (mediaKind === 'video') {
            return host.querySelector('canvas[data-role="eve-media-api-webgpu-canvas"],video') || host;
        }
        if (mediaKind === 'image') {
            return host.querySelector('img') || host;
        }
        if (mediaKind === 'svg') {
            return host.querySelector('svg,[data-role="atome-shape-svg"]') || host;
        }
        return host;
    };
    const summarizeRect = (node) => {
        const rect = node?.getBoundingClientRect?.();
        if (!rect) return null;
        return {
            left: Number(rect.left || 0),
            top: Number(rect.top || 0),
            right: Number(rect.right || 0),
            bottom: Number(rect.bottom || 0),
            width: Number(rect.width || 0),
            height: Number(rect.height || 0)
        };
    };
    const target = resolveTarget();
    const hostRect = summarizeRect(host);
    const targetRect = summarizeRect(target);
    if (!hostRect || !targetRect) return { ok: false, error: 'resize_rect_missing' };
    const hasExplicitWidth = explicitWidth !== null && explicitWidth !== undefined && Number.isFinite(Number(explicitWidth));
    const hasExplicitHeight = explicitHeight !== null && explicitHeight !== undefined && Number.isFinite(Number(explicitHeight));
    const requestedWidth = hasExplicitWidth
        ? Math.max(48, Math.round(Number(explicitWidth)))
        : Math.max(48, Math.round(targetRect.width * Number(scale || 1)));
    const requestedHeight = hasExplicitHeight
        ? Math.max(48, Math.round(Number(explicitHeight)))
        : Math.max(48, Math.round(targetRect.height * Number(scale || 1)));
    const inset = 6;
    const startX = Math.max(hostRect.left + 2, hostRect.right - inset);
    const startY = Math.max(hostRect.top + 2, hostRect.bottom - inset);
    const endX = Math.round(startX + (requestedWidth - hostRect.width));
    const endY = Math.round(startY + (requestedHeight - hostRect.height));
    const hitNode = document.elementFromPoint(Math.round(startX), Math.round(startY));
    const hitHost = hitNode?.closest?.('[data-atome-id]') || null;
    return {
        ok: true,
        startX: Math.round(startX),
        startY: Math.round(startY),
        endX,
        endY,
        before: { width: Math.round(targetRect.width), height: Math.round(targetRect.height) },
        host_before: { width: Math.round(hostRect.width), height: Math.round(hostRect.height) },
        host_dataset: {
            atome_id: String(host.dataset?.atomeId || ''),
            atome_kind: String(host.dataset?.atomeKind || ''),
            eve_resize_bound: String(host.dataset?.eveResizeBound || ''),
            group_member: String(host.dataset?.groupMember || ''),
            media_renderer: String(host.dataset?.eveMediaRenderer || ''),
            media_api_ready: String(host.dataset?.mediaApiReady || '')
        },
        start_hit: hitNode ? {
            tag: String(hitNode.tagName || ''),
            role: String(hitNode.getAttribute?.('data-role') || ''),
            atome_id: String(hitNode.getAttribute?.('data-atome-id') || ''),
            closest_atome_id: String(hitHost?.getAttribute?.('data-atome-id') || ''),
            pointer_events: String((typeof getComputedStyle === 'function' ? getComputedStyle(hitNode).pointerEvents : '') || '')
        } : null,
        requested: { width: requestedWidth, height: requestedHeight }
    };
}, { atomeId, mediaKind, scale, explicitWidth, explicitHeight }, 20000);

const performMouseDrag = async (page, geometry, options = {}) => {
    const steps = Math.max(4, Number(options.steps) || 14);
    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    for (let index = 1; index <= steps; index += 1) {
        const progress = index / steps;
        const nextX = Math.round(geometry.startX + ((geometry.endX - geometry.startX) * progress));
        const nextY = Math.round(geometry.startY + ((geometry.endY - geometry.startY) * progress));
        await page.mouse.move(nextX, nextY);
    }
    await page.mouse.up();
    await sleep(120);
};

const ensureSingleSelection = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const selectionMod = await import('/application/eVe/intuition/runtime/selection.js');
    const selectedId = selectionMod?.applySelectionIntent?.(atomeId, 'replace') || null;
    const snapshot = window.__DEBUG__?.getSelectionState?.() || null;
    return {
        ok: String(selectedId || '') === String(atomeId || ''),
        selectedId: String(selectedId || ''),
        selection: snapshot
    };
}, atomeId, 12000);

const readCurrentTargetRect = async (page, atomeId, mediaKind) => safeEval(page, async ({ atomeId, mediaKind }) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'atome_host_missing' };
    const target = mediaKind === 'audio'
        ? (host.querySelector('[data-role="eve-media-api-audio"]') || host)
        : mediaKind === 'video'
            ? (host.querySelector('canvas[data-role="eve-media-api-webgpu-canvas"],video') || host)
            : mediaKind === 'image'
                ? (host.querySelector('img') || host)
                : mediaKind === 'svg'
                    ? (host.querySelector('svg,[data-role="atome-shape-svg"]') || host)
                    : host;
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return { ok: false, error: 'target_rect_missing' };
    return { ok: true, rect: { width: Math.round(rect.width), height: Math.round(rect.height) } };
}, { atomeId, mediaKind }, 10000);

const readCurrentHostRect = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'atome_host_missing' };
    const rect = host.getBoundingClientRect?.();
    if (!rect) return { ok: false, error: 'host_rect_missing' };
    return { ok: true, rect: { width: Math.round(rect.width), height: Math.round(rect.height) } };
}, atomeId, 10000);

const resizeAtomeTo = async (page, atomeId, mediaKind, targetWidth, targetHeight) => {
    await ensureSingleSelection(page, atomeId);
    const geometry = await resolveResizeGesture(page, atomeId, mediaKind, null, targetWidth, targetHeight);
    if (geometry?.ok !== true) return geometry;
    await performMouseDrag(page, geometry);
    const after = await readCurrentTargetRect(page, atomeId, mediaKind);
    const hostAfter = await readCurrentHostRect(page, atomeId);
    return {
        ok: after?.ok === true,
        before: geometry.before,
        after: after?.rect || null,
        host_after: hostAfter?.rect || null,
        requested: geometry.requested,
        result: {
            ok: after?.ok === true,
            via: 'pointer_resize_drag',
            host_before: geometry.host_before,
            host_dataset: geometry.host_dataset,
            start_hit: geometry.start_hit,
            drag: {
                startX: geometry.startX,
                startY: geometry.startY,
                endX: geometry.endX,
                endY: geometry.endY
            }
        }
    };
};

const resizeAtome = async (page, atomeId, mediaKind, scale) => {
    await ensureSingleSelection(page, atomeId);
    const geometry = await resolveResizeGesture(page, atomeId, mediaKind, scale, null, null);
    if (geometry?.ok !== true) return geometry;
    await performMouseDrag(page, geometry);
    const after = await readCurrentTargetRect(page, atomeId, mediaKind);
    const hostAfter = await readCurrentHostRect(page, atomeId);
    return {
        ok: after?.ok === true,
        before: geometry.before,
        after: after?.rect || null,
        host_after: hostAfter?.rect || null,
        requested: geometry.requested,
        result: {
            ok: after?.ok === true,
            via: 'pointer_resize_drag',
            host_before: geometry.host_before,
            host_dataset: geometry.host_dataset,
            start_hit: geometry.start_hit,
            drag: {
                startX: geometry.startX,
                startY: geometry.startY,
                endX: geometry.endX,
                endY: geometry.endY
            }
        }
    };
};

const waitForRectChange = async (page, atomeId, mediaKind, previousWidth, previousHeight) => waitFor(page, ({ atomeId, mediaKind, previousWidth, previousHeight }) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!host) return { ok: false, error: 'host_missing' };
    const target = mediaKind === 'audio'
        ? (host.querySelector('[data-role="eve-media-api-audio"]') || host)
        : mediaKind === 'video'
            ? (host.querySelector('canvas[data-role="eve-media-api-webgpu-canvas"],video') || host)
            : mediaKind === 'image'
                ? (host.querySelector('img') || host)
                : mediaKind === 'svg'
                    ? (host.querySelector('svg,[data-role="atome-shape-svg"]') || host)
                    : host;
    const rect = target.getBoundingClientRect();
    const changed = Math.round(rect.width) !== Math.round(previousWidth) || Math.round(rect.height) !== Math.round(previousHeight);
    return { ok: changed, rect: { width: Math.round(rect.width), height: Math.round(rect.height) } };
}, 10000, 250, { atomeId, mediaKind, previousWidth, previousHeight });

const waitForHostRectChange = async (page, atomeId, previousWidth, previousHeight) => waitFor(page, ({ atomeId, previousWidth, previousHeight }) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'host_missing' };
    const rect = host.getBoundingClientRect?.();
    if (!rect) return { ok: false, error: 'host_rect_missing' };
    const changed = Math.round(rect.width) !== Math.round(previousWidth) || Math.round(rect.height) !== Math.round(previousHeight);
    return { ok: changed, rect: { width: Math.round(rect.width), height: Math.round(rect.height) } };
}, 10000, 250, { atomeId, previousWidth, previousHeight });

const raiseDesktopAtomeForInteraction = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'atome_host_missing' };
    const allHosts = Array.from(document.querySelectorAll('[data-atome-id]'));
    allHosts.forEach((node, index) => {
        if (!(node instanceof HTMLElement)) return;
        if (node === host) return;
        if (!node.style.zIndex) {
            node.style.zIndex = String(1000 + index);
        }
    });
    host.style.zIndex = '999999';
    return { ok: true, atomeId: String(atomeId || ''), zIndex: host.style.zIndex };
}, atomeId, 10000);

const getDesktopMediaState = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const overlayMod = await import('/application/eVe/domains/media/media_control_overlay.js');
    overlayMod?.showMediaControlOverlay?.(atomeId);
    const api = window.Molecule?.media || window.Molecule?.api || null;
    if (!api?.getAssetState) return { ok: false, error: 'molecule_media_api_unavailable' };
    return { ok: true, state: api.getAssetState(atomeId) || null };
}, atomeId, 12000);

const desktopTransport = async (page, atomeId, action, options = {}) => safeEval(page, async ({ atomeId, action, options }) => {
    const overlayMod = await import('/application/eVe/domains/media/media_control_overlay.js');
    const shown = overlayMod?.showMediaControlOverlay?.(atomeId);
    if (shown?.ok !== true) return { ok: false, error: shown?.error || 'media_control_overlay_unavailable', action };
    const api = window.Molecule?.media || window.Molecule?.api || null;
    if (!api) return { ok: false, error: 'molecule_media_api_unavailable', action };
    const escapedId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
        ? CSS.escape(String(atomeId || ''))
        : String(atomeId || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const control = document.querySelector(`[data-role="eve-media-control-overlay"][data-atome-id="${escapedId}"]`);
    if (!(control instanceof HTMLElement)) return { ok: false, error: 'media_control_overlay_missing', action };
    const before = typeof api.getAssetState === 'function' ? api.getAssetState(atomeId) : null;
    let result = null;
    if (action === 'play') {
        const button = control.querySelector('[data-media-control="play"]');
        if (!(button instanceof HTMLButtonElement)) return { ok: false, error: 'media_control_play_missing', action };
        button.click();
        result = { ok: true, via: 'media_control_overlay' };
    } else if (action === 'play_at') {
        const input = control.querySelector('[data-media-control="play-at-value"]');
        if (input instanceof HTMLInputElement) {
            input.value = String(Number(options.start_seconds || options.startSeconds || 0));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const button = control.querySelector('[data-media-control="play-at"]');
        if (!(button instanceof HTMLButtonElement)) return { ok: false, error: 'media_control_play_at_missing', action };
        button.click();
        result = { ok: true, via: 'media_control_overlay' };
    } else if (action === 'pause') {
        if (before?.playing === true) {
            const button = control.querySelector('[data-media-control="play"]');
            if (!(button instanceof HTMLButtonElement)) return { ok: false, error: 'media_control_pause_missing', action };
            button.click();
            result = { ok: true, via: 'media_control_overlay' };
        } else {
            result = await api.pause(atomeId);
        }
    } else if (action === 'stop') {
        const button = control.querySelector('[data-media-control="stop"]');
        if (!(button instanceof HTMLButtonElement)) return { ok: false, error: 'media_control_stop_missing', action };
        button.click();
        result = { ok: true, via: 'media_control_overlay' };
    } else if (action === 'scrub') {
        result = await api.scrub(atomeId, Number(options.seconds || 0), options || {});
    } else {
        if (typeof api[action] !== 'function') return { ok: false, error: `molecule_media_action_missing:${action}`, action };
        result = await api[action](atomeId, options || {});
    }
    const after = typeof api.getAssetState === 'function' ? api.getAssetState(atomeId) : null;
    return { ok: result?.ok !== false, action, options, before, after, result };
}, { atomeId, action, options }, 20000);

const openMtrack = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const mod = await import('/application/eVe/intuition/runtime/group_timeline_api.js');
    const result = await mod.openGroupTimeline({
        action: 'open',
        atome_id: atomeId,
        target_id: atomeId,
        selection_ids: [atomeId],
        toggle: false,
        source: 'headless_probe',
        source_layer: 'browser_media_acceptance_probe.mtrack',
        footer_coupled: false
    });
    return { ok: result?.ok === true, result };
}, atomeId, 30000);

const waitForMtrackReady = async (page, groupId) => waitFor(page, (groupId) => {
    const panel = document.getElementById('eve_mtrack_dialog');
    const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
    const api = window.eveMtrackApi || null;
    const state = typeof api?.getState === 'function' ? api.getState() : null;
    const clipCount = Number.isFinite(Number(state?.clipCount))
        ? Number(state.clipCount)
        : (Array.isArray(state?.clips) ? state.clips.length : 0);
    return {
        ok: visible && String(state?.activeGroupId || '') === String(groupId || '') && clipCount > 0,
        state: state ? {
            activeGroupId: state.activeGroupId || null,
            clipCount,
            playhead: Number(state.playhead || 0)
        } : null
    };
}, 30000, 300, groupId);

const readMtrackState = async (page) => safeEval(page, async () => {
    const api = window.eveMtrackApi || null;
    const state = typeof api?.getState === 'function' ? api.getState() : null;
    let timelineClips = [];
    try {
        const parsed = typeof state?.activeTimelineHash === 'string' ? JSON.parse(state.activeTimelineHash) : null;
        if (Array.isArray(parsed?.clips)) timelineClips = parsed.clips;
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    const clips = Array.isArray(state?.clips) && state.clips.length ? state.clips : timelineClips;
    const previewHost = document.getElementById('eve_mtrack_dialog__preview_host') || document.querySelector('#eve_mtrack_dialog');
    const previewMedia = previewHost?.querySelector?.('[data-role="mtrax-gpu-overlay"] canvas')
        || document.querySelector('#eve_mtrack_dialog [data-role="mtrax-gpu-overlay"] canvas')
        || previewHost?.querySelector?.('[data-role="mtrack-preview-host"] canvas')
        || document.querySelector('#eve_mtrack_dialog [data-role="mtrack-preview-host"] canvas')
        || previewHost?.querySelector?.('[data-role="mtrax-gpu-overlay"]')
        || document.querySelector('#eve_mtrack_dialog [data-role="mtrax-gpu-overlay"]')
        || previewHost?.querySelector?.('[data-role="mtrack-preview-host"]')
        || document.querySelector('#eve_mtrack_dialog [data-role="mtrack-preview-host"]')
        || previewHost?.querySelector?.('.eve-mtrack-preview-surface,.eve-mtrack-preview')
        || document.querySelector('#eve_mtrack_dialog .eve-mtrack-preview-surface, #eve_mtrack_dialog .eve-mtrack-preview')
        || previewHost?.querySelector?.('canvas,video,img,svg,audio')
        || document.querySelector('#eve_mtrack_dialog canvas, #eve_mtrack_dialog video, #eve_mtrack_dialog img, #eve_mtrack_dialog svg, #eve_mtrack_dialog audio')
        || null;
    const summarizeRect = (node) => {
        const rect = node?.getBoundingClientRect?.();
        if (!rect) return null;
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            on_screen: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        };
    };
    return {
        ok: true,
        state: state ? {
            activeGroupId: state.activeGroupId || null,
            playhead: Number(state.playhead || 0),
            clipCount: Number.isFinite(Number(state?.clipCount)) ? Number(state.clipCount) : clips.length,
            playing: state.isPlaying === true || state.playing === true,
            loadedClipAtomeIds: Array.isArray(state?.loadedClipAtomeIds) ? state.loadedClipAtomeIds.slice() : [],
            clips: clips.map((clip) => ({
                id: clip.id || null,
                atome_id: clip.atomeId || clip.atome_id || null,
                kind: clip.kind || null,
                src: clip.src || null,
                playback_src: clip.playback_src || clip.runtimePlaybackSource || null,
                duration: Number(clip.duration || 0),
                runtime_last_play_error: clip.runtimeLastPlayError || null
            }))
        } : null,
        preview: {
            hostRect: summarizeRect(previewHost),
            mediaRect: summarizeRect(previewMedia),
            mediaTag: previewMedia?.tagName || null
        }
    };
}, null, 12000);

const mtrackTransport = async (page, method, payload = null) => safeEval(page, async ({ method, payload }) => {
    const api = window.eveMtrackApi || null;
    if (!api || typeof api[method] !== 'function') {
        return { ok: false, error: `mtrack_method_missing:${method}` };
    }
    const before = typeof api.getState === 'function' ? api.getState() : null;
    const result = payload == null ? await api[method]() : await api[method](payload);
    const after = typeof api.getState === 'function' ? api.getState() : null;
    return { ok: result?.ok !== false, method, payload, before, after, result };
}, { method, payload }, 20000);

const closeMtrack = async (page, groupId) => safeEval(page, async (groupId) => {
    const mod = await import('/application/eVe/intuition/runtime/group_timeline_api.js');
    const result = await mod.closeGroupTimeline(groupId);
    return { ok: result?.ok !== false, result };
}, groupId, 20000);

const waitForMtrackClosed = async (page) => waitFor(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
    return { ok: !visible };
}, 15000, 300, null);

const verifyDesktopCase = async (page, mediaCase, entry, report) => {
    await raiseDesktopAtomeForInteraction(page, entry.id);
    const selector = resolveDesktopTargetSelector(entry, mediaCase);
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    const initialFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_initial.png`);
    const initialStats = await captureLocatorStats(locator, initialFile);
    const baseRect = resolveDesktopTargetRect(entry, mediaCase);
    const resizeOwnerId = resolveResizeOwnerId(entry);
    const resizeUp = await resizeAtome(page, resizeOwnerId, mediaCase.kind, 1.45);
    const resizeUpWait = resizeUp?.ok
        ? await waitForRectChange(page, entry.id, mediaCase.kind, resizeUp.before?.width || baseRect?.width || 0, resizeUp.before?.height || baseRect?.height || 0)
        : { ok: false, last: resizeUp };
    const resizeUpHostWait = resizeUp?.ok
        ? await waitForHostRectChange(page, entry.id, resizeUp.result?.host_before?.width || entry?.rect?.width || 0, resizeUp.result?.host_before?.height || entry?.rect?.height || 0)
        : { ok: false, last: resizeUp };
    const resizedUpFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_resized_up.png`);
    const resizedUpStats = await captureLocatorStats(locator, resizedUpFile);
    const resizeDown = await resizeAtome(page, resizeOwnerId, mediaCase.kind, 0.55);
    const resizeDownWait = resizeDown?.ok
        ? await waitForRectChange(page, entry.id, mediaCase.kind, resizeDown.before?.width || baseRect?.width || 0, resizeDown.before?.height || baseRect?.height || 0)
        : { ok: false, last: resizeDown };
    const resizeDownHostWait = resizeDown?.ok
        ? await waitForHostRectChange(page, entry.id, resizeDown.result?.host_before?.width || entry?.rect?.width || 0, resizeDown.result?.host_before?.height || entry?.rect?.height || 0)
        : { ok: false, last: resizeDown };
    const resizedDownFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_resized_down.png`);
    const resizedDownStats = await captureLocatorStats(locator, resizedDownFile);
    let restored = null;
    if (resizeUp?.ok) {
        restored = await resizeAtomeTo(
            page,
            resizeOwnerId,
            mediaCase.kind,
            resizeUp.before?.width || 0,
            resizeUp.before?.height || 0
        );
        await sleep(600);
    }
    const restoredFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_restored.png`);
    const restoredStats = await captureLocatorStats(locator, restoredFile);

    let transport = null;
    if (mediaCase.kind === 'video' || mediaCase.kind === 'audio') {
        const initialState = await getDesktopMediaState(page, entry.id);
        const duration = Number(initialState?.state?.duration || 0);
        const firstStart = mediaCase.kind === 'video' ? 0.15 : 0;
        const secondStart = Math.min(Math.max(1.25, duration > 0 ? duration * 0.35 : 1.25), Math.max(1.25, duration - 0.5));
        const play1 = await desktopTransport(page, entry.id, 'play', { start_seconds: firstStart });
        await sleep(1400);
        const play1State = await getDesktopMediaState(page, entry.id);
        const firstFrameFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_play_1.png`);
        const firstFrameStats = await captureLocatorStats(locator, firstFrameFile);
        await desktopTransport(page, entry.id, 'pause');
        await sleep(300);
        await desktopTransport(page, entry.id, 'stop');
        await sleep(300);
        const play2 = await desktopTransport(page, entry.id, 'play_at', { start_seconds: secondStart });
        await sleep(1400);
        const play2State = await getDesktopMediaState(page, entry.id);
        const secondFrameFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_play_2.png`);
        const secondFrameStats = await captureLocatorStats(locator, secondFrameFile);
        const longRunMs = Math.max(10000, Number(process.env.BROWSER_MEDIA_PROBE_MIN_PLAY_MS || 10000));
        await sleep(longRunMs);
        const afterLongRunState = await getDesktopMediaState(page, entry.id);
        const longRunFrameFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_play_long_run.png`);
        const longRunFrameStats = await captureLocatorStats(locator, longRunFrameFile);
        await desktopTransport(page, entry.id, 'pause');
        await sleep(300);
        await desktopTransport(page, entry.id, 'stop');
        const visualProgressedAfterPlay = firstFrameStats.hash !== initialStats.hash;
        const visualDistinctStartPositions = firstFrameStats.hash !== secondFrameStats.hash;
        const visualLongRunProgressed = longRunFrameStats.hash !== secondFrameStats.hash;
        transport = {
            initial_state: initialState,
            play: play1,
            play_at: play2,
            state_after_play: play1State,
            state_after_play_at: play2State,
            state_after_long_run: afterLongRunState,
            first_frame: firstFrameStats,
            second_frame: secondFrameStats,
            long_run_frame: longRunFrameStats,
            long_run_ms: longRunMs,
            second_start_seconds: secondStart,
            duration,
            progressed_after_play: Number(play1State?.state?.position || 0) > firstStart + 0.2,
            progressed_after_play_at: Number(play2State?.state?.position || 0) > secondStart + 0.2,
            distinct_start_positions: Math.abs(Number(play2State?.state?.position || 0) - Number(play1State?.state?.position || 0)) > 0.5,
            long_run_progressed: Number(afterLongRunState?.state?.position || 0) > Math.max(Number(play2State?.state?.position || 0), secondStart) + 1,
            frame_changed: firstFrameStats.hash !== secondFrameStats.hash,
            visual_progressed_after_play: visualProgressedAfterPlay,
            visual_distinct_start_positions: visualDistinctStartPositions,
            visual_long_run_progressed: visualLongRunProgressed
        };
    }

    const desktopResult = {
        ok: true,
        media: mediaCase,
        entry,
        screenshots: {
            initial: path.basename(initialFile),
            resized_up: path.basename(resizedUpFile),
            resized_down: path.basename(resizedDownFile),
            restored: path.basename(restoredFile)
        },
        stats: {
            initial: initialStats,
            resized_up: resizedUpStats,
            resized_down: resizedDownStats,
            restored: restoredStats
        },
        resize: {
            up: resizeUp,
            up_wait: resizeUpWait,
            up_host_wait: resizeUpHostWait,
            down: resizeDown,
            down_wait: resizeDownWait,
            down_host_wait: resizeDownHostWait,
            restore: restored
        },
        transport
    };

    if (mediaCase.kind === 'image' || mediaCase.kind === 'svg') {
        desktopResult.ok = resolveDesktopTargetRect(entry, mediaCase)?.on_screen === true
            && initialStats.opaque_ratio > 0.02
            && resizeUpWait.ok === true
            && resizeDownWait.ok === true;
    } else if (mediaCase.kind === 'audio') {
        desktopResult.ok = resolveDesktopTargetRect(entry, mediaCase)?.on_screen === true
            && entry.markers?.has_molecule_audio_host === true
            && resizeUpWait.ok === true
            && resizeDownWait.ok === true
            && (transport?.progressed_after_play === true || transport?.visual_progressed_after_play === true)
            && (transport?.progressed_after_play_at === true || transport?.visual_distinct_start_positions === true)
            && (transport?.distinct_start_positions === true || transport?.visual_distinct_start_positions === true)
            && (transport?.long_run_progressed === true || transport?.visual_long_run_progressed === true);
    } else {
        desktopResult.ok = resolveDesktopTargetRect(entry, mediaCase)?.on_screen === true
            && entry.markers?.has_molecule_video_canvas === true
            && resizeUpWait.ok === true
            && resizeDownWait.ok === true
            && (transport?.progressed_after_play === true || transport?.visual_progressed_after_play === true)
            && (transport?.progressed_after_play_at === true || transport?.visual_distinct_start_positions === true)
            && (transport?.distinct_start_positions === true || transport?.visual_distinct_start_positions === true)
            && (transport?.long_run_progressed === true || transport?.visual_long_run_progressed === true)
            && transport?.frame_changed === true;
    }

    report.desktop[mediaCase.name] = desktopResult;
    return desktopResult;
};

const verifyMtrackCase = async (page, mediaCase, entry, report) => {
    const open = await openMtrack(page, entry.id);
    const targetGroupId = String(open?.result?.group_id || entry.id || '').trim();
    const ready = await waitForMtrackReady(page, targetGroupId);
    const stateAfterOpen = await readMtrackState(page);
    const panelLocator = page.locator('#eve_mtrack_dialog').first();
    await panelLocator.waitFor({ state: 'visible', timeout: 15000 });
    const initialFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_mtrack_initial.png`);
    const initialStats = await captureLocatorStats(panelLocator, initialFile);
    const play = (mediaCase.kind === 'video' || mediaCase.kind === 'audio')
        ? await mtrackTransport(page, 'play')
        : null;
    if (play) await sleep(1500);
    const afterPlayState = await readMtrackState(page);
    const afterPlayFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_mtrack_play.png`);
    const afterPlayStats = await captureLocatorStats(panelLocator, afterPlayFile);
    const stateDuration = Array.isArray(afterPlayState?.state?.clips)
        ? afterPlayState.state.clips.reduce((max, clip) => Math.max(max, Number(clip.duration || 0)), 0)
        : 0;
    const playAtSeconds = Math.min(Math.max(1.5, stateDuration * 0.35), Math.max(1.5, stateDuration - 0.5));
    const playAt = (mediaCase.kind === 'video' || mediaCase.kind === 'audio')
        ? await mtrackTransport(page, 'seek', { seconds: playAtSeconds })
        : null;
    if (playAt) await sleep(500);
    const replay = (mediaCase.kind === 'video' || mediaCase.kind === 'audio')
        ? await mtrackTransport(page, 'play')
        : null;
    if (replay) await sleep(1500);
    const afterPlayAtState = await readMtrackState(page);
    const afterPlayAtFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_mtrack_play_at.png`);
    const afterPlayAtStats = await captureLocatorStats(panelLocator, afterPlayAtFile);
    const longRunMs = Math.max(10000, Number(process.env.BROWSER_MEDIA_PROBE_MIN_PLAY_MS || 10000));
    if (replay) await sleep(longRunMs);
    const afterLongRunState = await readMtrackState(page);
    const pause = (mediaCase.kind === 'video' || mediaCase.kind === 'audio')
        ? await mtrackTransport(page, 'pause')
        : null;
    const close = await closeMtrack(page, targetGroupId);
    const closed = await waitForMtrackClosed(page);
    await sleep(1500);
    const desktopAfterClose = await collectDesktopInventory(page);
    const rematchedEntry = buildCaseMap(desktopAfterClose, report.import_result).get(mediaCase.name) || null;
    const closedEntry = resolveVisibleDesktopEntry(rematchedEntry, desktopAfterClose, report.import_result, mediaCase);
    const mtrackResult = {
        ok: true,
        media: mediaCase,
        open,
        ready,
        state_after_open: stateAfterOpen,
        play,
        play_at: playAt,
        replay,
        pause,
        state_after_play: afterPlayState,
        state_after_play_at: afterPlayAtState,
        state_after_long_run: afterLongRunState,
        close,
        closed,
        desktop_after_close: closedEntry,
        screenshots: {
            initial: path.basename(initialFile),
            play: path.basename(afterPlayFile),
            play_at: path.basename(afterPlayAtFile)
        },
        stats: {
            initial: initialStats,
            play: afterPlayStats,
            play_at: afterPlayAtStats
        }
    };
    if (mediaCase.kind === 'image' || mediaCase.kind === 'svg') {
        mtrackResult.ok = open?.ok === true
            && ready?.ok === true
            && Number(stateAfterOpen?.state?.clipCount || 0) > 0
            && stateAfterOpen?.preview?.hostRect?.on_screen === true
            && initialStats.opaque_ratio > 0.02
            && close?.ok === true
            && closed?.ok === true
            && closedEntry?.rect?.on_screen === true;
    } else {
        mtrackResult.ok = open?.ok === true
            && ready?.ok === true
            && Number(stateAfterOpen?.state?.clipCount || 0) > 0
            && stateAfterOpen?.preview?.hostRect?.on_screen === true
            && Number(afterPlayState?.state?.playhead || 0) > 0.2
            && Math.abs(Number(afterPlayAtState?.state?.playhead || 0) - Number(afterPlayState?.state?.playhead || 0)) > 0.4
            && Number(afterLongRunState?.state?.playhead || 0) > Number(afterPlayAtState?.state?.playhead || 0) + 1
            && afterPlayStats.hash !== afterPlayAtStats.hash
            && close?.ok === true
            && closed?.ok === true
            && closedEntry?.rect?.on_screen === true;
    }
    report.mtrack[mediaCase.name] = mtrackResult;
    return mtrackResult;
};

const buildSummary = (report) => {
    const desktop = Object.values(report.desktop || {});
    const mtrack = Object.values(report.mtrack || {});
    const desktopFailed = desktop.filter((entry) => entry.ok !== true).map((entry) => entry.media?.name || entry.media?.key || 'unknown');
    const mtrackFailed = mtrack.filter((entry) => entry.ok !== true).map((entry) => entry.media?.name || entry.media?.key || 'unknown');
    return {
        ok: desktopFailed.length === 0 && mtrackFailed.length === 0,
        desktop: {
            total: desktop.length,
            failed: desktopFailed.length,
            failed_cases: desktopFailed
        },
        mtrack: {
            total: mtrack.length,
            failed: mtrackFailed.length,
            failed_cases: mtrackFailed
        }
    };
};

const run = async () => {
    fs.writeFileSync(LOG_FILE, '');
    ensureFilesExist();
    log('start', { APP_URL, MEDIA_DIR, HEADLESS, files: MEDIA_CASES.map((entry) => entry.name) });
    const report = {
        ok: false,
        created_at: new Date().toISOString(),
        app_url: APP_URL,
        media_dir: MEDIA_DIR,
        import_result: null,
        login: null,
        desktop_inventory: null,
        desktop: {},
        mtrack: {},
        summary: null,
        console_errors: [],
        http_errors: []
    };
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--autoplay-policy=no-user-gesture-required',
            '--enable-unsafe-webgpu',
            '--ignore-gpu-blocklist',
            '--enable-features=Vulkan,UseSkiaRenderer',
            '--disable-gpu-sandbox'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    await context.addInitScript(() => {
        window.__EVE_MTRAX_FORCE_WEBGPU__ = true;
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        const text = redactSecrets(msg.text());
        if (msg.type() === 'error' || msg.type() === 'warning') {
            report.console_errors.push({ type: msg.type(), text });
        }
        log('console', { type: msg.type(), text });
    });
    page.on('pageerror', (error) => {
        report.console_errors.push({ type: 'pageerror', text: error.message });
        log('pageerror', { message: error.message });
    });
    page.on('response', (response) => {
        if (response.status() >= 400) {
            const entry = { status: response.status(), url: redactSecrets(response.url()) };
            report.http_errors.push(entry);
            log('http_error', entry);
        }
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
        await page.screenshot({ path: path.join(OUT_DIR, '01_loaded.png'), fullPage: true });
        const ready = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000, 250);
        if (!ready.ok) throw new Error('app_not_ready');
        const login = await tryLogin(page);
        report.login = login;
        writeJson('login.json', login);
        if (!login?.ok) throw new Error(`login_failed:${login?.error || 'unknown'}`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        const authReload = await waitFor(page, () => window.__authCheckComplete === true, 20000, 250);
        if (!authReload.ok) throw new Error('auth_reload_incomplete');
        await page.screenshot({ path: path.join(OUT_DIR, '02_after_login.png'), fullPage: true });
        const bootstrap = await bootstrapImport(page);
        writeJson('bootstrap.json', bootstrap);
        const importResult = await importMedia(page);
        report.import_result = importResult;
        writeJson('import_result.json', importResult);
        await sleep(2000);
        await page.screenshot({ path: path.join(OUT_DIR, '03_after_import.png'), fullPage: true });

        const inventoryReady = await waitFor(page, async () => {
            const hosts = Array.from(document.querySelectorAll('[data-atome-id]'));
            const count = hosts.filter((host) => {
                const source = String(host.dataset?.eveMediaSource || '').toLowerCase();
                return ['0000.png', 'atome.svg', 'jeezs', 'vampire', 'test.m4a'].some((token) => source.includes(token));
            }).length;
            return { ok: count >= 5, count };
        }, 45000, 400);
        writeJson('inventory_ready.json', inventoryReady);

        const desktopInventory = await collectDesktopInventory(page);
        report.desktop_inventory = desktopInventory;
        writeJson('desktop_inventory.json', desktopInventory);
        const caseMap = buildCaseMap(desktopInventory, importResult);

        for (const mediaCase of MEDIA_CASES) {
            const entry = caseMap.get(mediaCase.name) || null;
            if (!entry) {
                report.desktop[mediaCase.name] = {
                    ok: false,
                    media: mediaCase,
                    error: 'desktop_entry_missing'
                };
                report.mtrack[mediaCase.name] = {
                    ok: false,
                    media: mediaCase,
                    error: 'desktop_entry_missing'
                };
                continue;
            }
            log('desktop_case:start', { name: mediaCase.name, atome_id: entry.id, kind: mediaCase.kind });
            const desktopResult = await verifyDesktopCase(page, mediaCase, entry, report);
            writeJson(`${safeName(mediaCase.name)}_desktop.json`, desktopResult);
            log('desktop_case:done', { name: mediaCase.name, ok: desktopResult.ok });
            const mtrackResult = await verifyMtrackCase(page, mediaCase, entry, report);
            writeJson(`${safeName(mediaCase.name)}_mtrack.json`, mtrackResult);
            log('mtrack_case:done', { name: mediaCase.name, ok: mtrackResult.ok });
        }

        await page.screenshot({ path: path.join(OUT_DIR, '04_final_desktop.png'), fullPage: true });
        report.summary = buildSummary(report);
        report.ok = report.summary.ok === true;
        writeJson('report.json', report);
        if (!report.ok) {
            throw new Error(`browser_media_acceptance_failed:${JSON.stringify(report.summary)}`);
        }
    } finally {
        writeJson('report.json', report);
        await browser.close();
    }
};

run().catch((error) => {
    log('fatal', { message: error?.message || String(error || 'fatal') });
    process.exit(1);
});