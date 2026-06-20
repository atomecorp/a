import { compareName, safeEval } from './browser_media_acceptance_probe_runtime.mjs';

export const collectDesktopInventory = async (page, atomeIds = []) => safeEval(page, async (atomeIds) => {
    const safeString = (value) => String(value || '').trim();
    const allowedIds = new Set((Array.isArray(atomeIds) ? atomeIds : []).map(safeString).filter(Boolean));
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
    const readScopedState = async (atomeId) => {
        if (typeof stateApi !== 'function') return null;
        try {
            return await Promise.race([
                stateApi(atomeId),
                new Promise((resolve) => setTimeout(() => resolve({ __probe_state_timeout: true }), 1800))
            ]);
        } catch (error) {
            return { __probe_state_error: error?.message || String(error || 'state_error') };
        }
    };
    const hosts = allowedIds.size
        ? Array.from(allowedIds)
            .map((id) => document.querySelector(`[data-atome-id="${CSS.escape(id)}"]`))
            .filter(Boolean)
        : Array.from(document.querySelectorAll('[data-atome-id]'));
    const entries = [];
    for (const host of hosts) {
        const atomeId = safeString(host.dataset?.atomeId || host.getAttribute('data-atome-id'));
        if (!atomeId) continue;
        const state = await readScopedState(atomeId);
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
}, atomeIds, 30000);

export const buildCaseMap = (inventory, importResult = null) => {
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

export const resolveResizeOwnerId = (entry) => String(entry?.group_id || entry?.id || '').trim();

export const resolveVisibleDesktopEntry = (entry, inventory, importResult, mediaCase) => {
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

export const resolveDesktopTargetSelector = (entry, mediaCase) => {
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

export const resolveDesktopTargetRect = (entry, mediaCase) => (
    mediaCase.kind === 'audio'
        ? (entry?.media_rect || entry?.rect || null)
        : (entry?.media_rect || entry?.rect || null)
);
