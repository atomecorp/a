import {
    MEDIA_CASES,
    captureLocatorStats,
    resolvePlaybackProbeLongRunMs,
    safeEval,
    sleep,
    waitFor
} from './browser_media_acceptance_probe_runtime.mjs';
import {
    buildCaseMap,
    resolveDesktopTargetRect,
    resolveDesktopTargetSelector,
    resolveVisibleDesktopEntry
} from './browser_media_acceptance_probe_inventory.mjs';

export const resolveResizeGesture = async (page, atomeId, mediaKind, scale = null, explicitWidth = null, explicitHeight = null) => safeEval(page, async ({ atomeId, mediaKind, scale, explicitWidth, explicitHeight }) => {
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

export const performMouseDrag = async (page, geometry, options = {}) => {
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

export const ensureSingleSelection = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const selectionMod = await import('/eVe/intuition/runtime/selection.js');
    const selectedId = selectionMod?.applySelectionIntent?.(atomeId, 'replace') || null;
    const snapshot = window.__DEBUG__?.getSelectionState?.() || null;
    return {
        ok: String(selectedId || '') === String(atomeId || ''),
        selectedId: String(selectedId || ''),
        selection: snapshot
    };
}, atomeId, 12000);

export const readCurrentTargetRect = async (page, atomeId, mediaKind) => safeEval(page, async ({ atomeId, mediaKind }) => {
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

export const readCurrentHostRect = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'atome_host_missing' };
    const rect = host.getBoundingClientRect?.();
    if (!rect) return { ok: false, error: 'host_rect_missing' };
    return { ok: true, rect: { width: Math.round(rect.width), height: Math.round(rect.height) } };
}, atomeId, 10000);

export const resizeAtomeTo = async (page, atomeId, mediaKind, targetWidth, targetHeight) => {
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

export const resizeAtome = async (page, atomeId, mediaKind, scale) => {
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

export const waitForRectChange = async (page, atomeId, mediaKind, previousWidth, previousHeight) => waitFor(page, ({ atomeId, mediaKind, previousWidth, previousHeight }) => {
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

export const waitForHostRectChange = async (page, atomeId, previousWidth, previousHeight) => waitFor(page, ({ atomeId, previousWidth, previousHeight }) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'host_missing' };
    const rect = host.getBoundingClientRect?.();
    if (!rect) return { ok: false, error: 'host_rect_missing' };
    const changed = Math.round(rect.width) !== Math.round(previousWidth) || Math.round(rect.height) !== Math.round(previousHeight);
    return { ok: changed, rect: { width: Math.round(rect.width), height: Math.round(rect.height) } };
}, 10000, 250, { atomeId, previousWidth, previousHeight });

export const raiseDesktopAtomeForInteraction = async (page, atomeId) => safeEval(page, async (atomeId) => {
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

export const getDesktopMediaState = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const api = window.Molecule?.media || window.Molecule?.api || null;
    if (!api?.getAssetState) return { ok: false, error: 'molecule_media_api_unavailable' };
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (host instanceof HTMLElement && !api.getAssetState(atomeId) && typeof api.mountVisual === 'function') {
        const kind = String(host.dataset?.atomeKind || '').trim().toLowerCase();
        await api.mountVisual(host, {
            id: atomeId,
            atome_id: atomeId,
            atomeId,
            kind,
            src: host.dataset?.eveMediaSource || '',
            mediaUrl: host.dataset?.eveMediaSource || '',
            media_url: host.dataset?.eveMediaSource || ''
        }, { inspect: false });
    }
    return { ok: true, state: api.getAssetState(atomeId) || null };
}, atomeId, 12000);

export const desktopTransport = async (page, atomeId, action, options = {}) => safeEval(page, async ({ atomeId, action, options }) => {
    const api = window.Molecule?.media || window.Molecule?.api || null;
    if (!api) return { ok: false, error: 'molecule_media_api_unavailable', action };
    const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'media_host_missing', action };
    const kind = String(host.dataset?.atomeKind || '').trim().toLowerCase();
    if (!api.getAssetState?.(atomeId) && typeof api.mountVisual === 'function') {
        const mounted = await api.mountVisual(host, {
            id: atomeId,
            atome_id: atomeId,
            atomeId,
            kind,
            src: host.dataset?.eveMediaSource || '',
            mediaUrl: host.dataset?.eveMediaSource || '',
            media_url: host.dataset?.eveMediaSource || ''
        }, { inspect: false });
        if (mounted?.ok !== true) return { ok: false, error: mounted?.error || 'media_mount_failed', action };
    }
    const before = typeof api.getAssetState === 'function' ? api.getAssetState(atomeId) : null;
    let result = null;
    if (action === 'play') {
        result = await api.play(atomeId, { start_seconds: Number(before?.position || 0) });
    } else if (action === 'play_at') {
        result = await api.play(atomeId, { start_seconds: Number(options.start_seconds || options.startSeconds || 0) });
    } else if (action === 'pause') {
        result = await api.pause(atomeId);
    } else if (action === 'stop') {
        result = await api.stop(atomeId);
    } else if (action === 'scrub') {
        result = await api.scrub(atomeId, Number(options.seconds || 0), options || {});
    } else {
        if (typeof api[action] !== 'function') return { ok: false, error: `molecule_media_action_missing:${action}`, action };
        result = await api[action](atomeId, options || {});
    }
    const after = typeof api.getAssetState === 'function' ? api.getAssetState(atomeId) : null;
    return { ok: result?.ok !== false, action, options, before, after, result };
}, { atomeId, action, options }, 20000);

export const verifyDesktopCase = async (page, mediaCase, entry, report) => {
    await raiseDesktopAtomeForInteraction(page, entry.id);
    const selector = resolveDesktopTargetSelector(entry, mediaCase);
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    const initialFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_initial.png`);
    const initialStats = await captureLocatorStats(page, locator, initialFile);
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
    const resizedUpStats = await captureLocatorStats(page, locator, resizedUpFile);
    const resizeDown = await resizeAtome(page, resizeOwnerId, mediaCase.kind, 0.55);
    const resizeDownWait = resizeDown?.ok
        ? await waitForRectChange(page, entry.id, mediaCase.kind, resizeDown.before?.width || baseRect?.width || 0, resizeDown.before?.height || baseRect?.height || 0)
        : { ok: false, last: resizeDown };
    const resizeDownHostWait = resizeDown?.ok
        ? await waitForHostRectChange(page, entry.id, resizeDown.result?.host_before?.width || entry?.rect?.width || 0, resizeDown.result?.host_before?.height || entry?.rect?.height || 0)
        : { ok: false, last: resizeDown };
    const resizedDownFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_resized_down.png`);
    const resizedDownStats = await captureLocatorStats(page, locator, resizedDownFile);
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
    const restoredStats = await captureLocatorStats(page, locator, restoredFile);

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
        const firstFrameStats = await captureLocatorStats(page, locator, firstFrameFile);
        await desktopTransport(page, entry.id, 'pause');
        await sleep(300);
        await desktopTransport(page, entry.id, 'stop');
        await sleep(300);
        const play2 = await desktopTransport(page, entry.id, 'play_at', { start_seconds: secondStart });
        await sleep(1400);
        const play2State = await getDesktopMediaState(page, entry.id);
        const secondFrameFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_play_2.png`);
        const secondFrameStats = await captureLocatorStats(page, locator, secondFrameFile);
        const longRunMs = resolvePlaybackProbeLongRunMs(duration, Number(play2State?.state?.position || secondStart));
        await sleep(longRunMs);
        const afterLongRunState = await getDesktopMediaState(page, entry.id);
        const longRunFrameFile = path.join(OUT_DIR, `${safeName(mediaCase.name)}_desktop_play_long_run.png`);
        const longRunFrameStats = await captureLocatorStats(page, locator, longRunFrameFile);
        await desktopTransport(page, entry.id, 'pause');
        await sleep(300);
        await desktopTransport(page, entry.id, 'stop');
        const visualProgressedAfterPlay = firstFrameStats.hash !== initialStats.hash;
        const visualDistinctStartPositions = firstFrameStats.hash !== secondFrameStats.hash;
        const visualLongRunProgressed = longRunFrameStats.hash !== secondFrameStats.hash;
        const afterPlayAtPosition = Number(play2State?.state?.position || 0);
        const afterLongRunPosition = Number(afterLongRunState?.state?.position || 0);
        const longRunProgressed = afterLongRunPosition > Math.max(afterPlayAtPosition, secondStart) + 1
            || (duration > 0 && afterLongRunPosition >= duration - 0.15 && afterLongRunPosition > afterPlayAtPosition);
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
            long_run_progressed: longRunProgressed,
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
