import fs from 'node:fs';
import { PNG } from 'pngjs';

const PROJECT_CARD_FILL = '#3d754d';
const CONTACT_PROBE_NAME = 'Dashboard Photo Probe';
const CONTACT_PROBE_PHONE = '0666999901';
const CONTACT_PROBE_FACE = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22160%22%20height%3D%22160%22%20viewBox%3D%220%200%20160%20160%22%3E%3Crect%20width%3D%22160%22%20height%3D%22160%22%20fill%3D%22%230b1d2b%22%2F%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%2268%22%20r%3D%2242%22%20fill%3D%22%23f59e0b%22%2F%3E%3Crect%20x%3D%2228%22%20y%3D%22108%22%20width%3D%22104%22%20height%3D%2234%22%20rx%3D%2217%22%20fill%3D%22%2338bdf8%22%2F%3E%3C%2Fsvg%3E';

const hexToRgb = (hex) => {
    const value = String(hex || '').replace('#', '');
    return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16)
    ];
};

const pixelAt = (png, x, y) => {
    const px = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    const index = (py * png.width + px) * 4;
    return [png.data[index], png.data[index + 1], png.data[index + 2], png.data[index + 3]];
};

const colorDistance = (left, right) => Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2])
);

const countPixelsInRect = (png, rect, predicate, step = 2) => {
    let count = 0;
    const left = Math.max(0, Math.floor(Number(rect?.x || 0)));
    const top = Math.max(0, Math.floor(Number(rect?.y || 0)));
    const right = Math.min(png.width - 1, Math.ceil(left + Number(rect?.width || 0)));
    const bottom = Math.min(png.height - 1, Math.ceil(top + Number(rect?.height || 0)));
    for (let y = top; y <= bottom; y += step) {
        for (let x = left; x <= right; x += step) {
            if (predicate(pixelAt(png, x, y))) count += 1;
        }
    }
    return count;
};

export const ensureProjectPreviewFixture = async (page) => page.evaluate(async () => {
    const projectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
    if (!projectId) return { ok: false, error: 'project_id_missing' };
    if (typeof window.eveToolBase?.createAtome !== 'function') return { ok: false, error: 'create_atome_missing', projectId };
    const prefix = 'dashboard_probe_preview';
    const created = [];
    created.push(await window.eveToolBase.createAtome({
        id: `${prefix}_shape`,
        atome_id: `${prefix}_shape`,
        kind: 'shape',
        type: 'shape',
        projectId,
        parentId: projectId,
        left: 120,
        top: 92,
        width: 260,
        height: 150,
        background: '#d6b93f',
        backgroundColor: '#d6b93f',
        shape_variant: 'box'
    }));
    created.push(await window.eveToolBase.createAtome({
        id: `${prefix}_text`,
        atome_id: `${prefix}_text`,
        kind: 'text',
        type: 'text',
        projectId,
        parentId: projectId,
        left: 150,
        top: 128,
        width: 210,
        height: 76,
        text: 'Preview OK',
        content: 'Preview OK',
        color: '#ffffff',
        background: '#202733',
        backgroundColor: '#202733'
    }));
    const failed = created.find((result) => result?.ok !== true);
    if (failed) return { ok: false, error: failed.error || 'dashboard_preview_fixture_create_failed', projectId, created };
    const expectedIds = [`${prefix}_shape`, `${prefix}_text`];
    const startedAt = Date.now();
    let ids = [];
    while (Date.now() - startedAt < 10000) {
        const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
        ids = (scene?.records || []).map((record) => String(record.id || record.atome_id || ''));
        if (expectedIds.every((id) => ids.includes(id))) break;
        await new Promise((resolve) => setTimeout(resolve, 160));
    }
    return {
        ok: expectedIds.every((id) => ids.includes(id)),
        projectId,
        created,
        ids
    };
});

export const ensureContactPhotoFixture = async (page) => page.evaluate(async ({ name, phone, face }) => {
    const api = window.atome?.contacts || window.Squirrel?.contacts || null;
    if (!api || typeof api.createLocalContact !== 'function') return { ok: false, error: 'contacts_api_missing' };
    if (typeof api.ensureReady === 'function') {
        const ready = await api.ensureReady({ source_id: 'eve_contacts_local', import_legacy_if_empty: false });
        if (ready?.ok === false) return { ok: false, error: ready.error || 'contacts_ready_failed' };
    }
    const result = await api.createLocalContact({
        name,
        phone,
        user_face: face,
        visibility: 'private'
    }, { source_id: 'eve_contacts_local' });
    return {
        ok: result?.ok === true,
        error: result?.error || '',
        contact: result?.contact || null
    };
}, { name: CONTACT_PROBE_NAME, phone: CONTACT_PROBE_PHONE, face: CONTACT_PROBE_FACE });

export const projectPreviewMediaRecord = (snapshot) => (
    snapshot.dashboardMediaRecords?.find((record) => (
        record.visible
        && /^__eve_dashboard_card_media_projects_slot_/.test(record.id)
        && record.source.startsWith('data:image/png')
        && record.media_fit === 'contain'
    )) || null
);

export const contactPhotoMediaRecord = (snapshot) => (
    snapshot.dashboardMediaRecords?.find((record) => (
        record.visible
        && /^__eve_dashboard_card_media_contacts_slot_/.test(record.id)
        && record.media_fit === 'cover'
        && record.source === CONTACT_PROBE_FACE
    )) || null
);

const cardRecordForMedia = (snapshot, media) => {
    const cardId = String(media?.id || '').replace('__eve_dashboard_card_media_', '__eve_dashboard_card_');
    return snapshot.dashboardCardRecords?.find((record) => record.id === cardId) || null;
};

const assertMediaCornersClipped = (png, media, card, label) => {
    if (!media?.rect || !card?.color) throw new Error(`${label}_clip_record_missing`);
    const fill = hexToRgb(card.color);
    const rect = media.rect;
    const samples = [
        { x: rect.x + 2, y: rect.y + 2, outside: [rect.x - 3, rect.y - 3] },
        { x: rect.x + rect.width - 3, y: rect.y + 2, outside: [rect.x + rect.width + 3, rect.y - 3] },
        { x: rect.x + 2, y: rect.y + rect.height - 3, outside: [rect.x - 3, rect.y + rect.height + 3] },
        { x: rect.x + rect.width - 3, y: rect.y + rect.height - 3, outside: [rect.x + rect.width + 3, rect.y + rect.height + 3] }
    ].map((sample) => ({
        ...sample,
        pixel: pixelAt(png, sample.x, sample.y),
        outsidePixel: pixelAt(png, sample.outside[0], sample.outside[1])
    }));
    const leaking = samples.filter((sample) => (
        sample.pixel[3] > 200
        && colorDistance(sample.pixel, fill) > 44
        && colorDistance(sample.pixel, sample.outsidePixel) > 44
    ));
    if (leaking.length) {
        throw new Error(`${label}_rounded_clip_failed:${JSON.stringify({ media: media.id, card: card.color, leaking })}`);
    }
    return { samples };
};

const assertProjectPreviewPixels = (png, itemRect) => {
    const cardFill = hexToRgb(PROJECT_CARD_FILL);
    const sampleRect = {
        x: itemRect.x + Math.max(6, itemRect.width * 0.08),
        y: itemRect.y + Math.max(6, itemRect.height * 0.08),
        width: Math.max(12, itemRect.width * 0.84),
        height: Math.max(12, itemRect.height * 0.56)
    };
    const contrasted = countPixelsInRect(png, sampleRect, (pixel) => (
        pixel[3] > 200 && colorDistance(pixel, cardFill) > 36
    ));
    if (contrasted < 14) {
        throw new Error(`dashboard_projects_preview_project_preview_pixels_missing:${JSON.stringify({ contrasted, sampleRect })}`);
    }
    return { contrasted, sampleRect };
};

export const analyzeDashboardProjectPreviewVisual = (screenshotPath, snapshot) => {
    const png = PNG.sync.read(fs.readFileSync(screenshotPath));
    const projectLane = snapshot.layout?.lanes?.find((lane) => lane.categoryId === 'projects');
    const item = projectLane?.items?.[0];
    if (!item?.rect) throw new Error('dashboard_projects_preview_item_rect_missing');
    const media = projectPreviewMediaRecord(snapshot);
    if (!media) throw new Error(`dashboard_projects_preview_media_record_missing:${JSON.stringify(snapshot.dashboardMediaRecords || [])}`);
    const card = cardRecordForMedia(snapshot, media);
    return {
        label: 'dashboard_projects_preview',
        media,
        clipping: assertMediaCornersClipped(png, media, card, 'dashboard_project_preview'),
        pixels: assertProjectPreviewPixels(png, item.rect)
    };
};

export const analyzeDashboardContactPhotoVisual = (screenshotPath, snapshot) => {
    const png = PNG.sync.read(fs.readFileSync(screenshotPath));
    const media = contactPhotoMediaRecord(snapshot);
    if (!media) throw new Error(`dashboard_contacts_photo_media_record_missing:${JSON.stringify(snapshot.dashboardMediaRecords || [])}`);
    const card = cardRecordForMedia(snapshot, media);
    return {
        label: 'dashboard_contacts_photo',
        media,
        clipping: assertMediaCornersClipped(png, media, card, 'dashboard_contacts_photo')
    };
};
