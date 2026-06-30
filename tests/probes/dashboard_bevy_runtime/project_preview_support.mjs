import fs from 'node:fs';
import { PNG } from 'pngjs';

const PROJECT_CARD_FILL = '#3d754d';

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

export const projectPreviewMediaRecord = (snapshot) => (
    snapshot.dashboardMediaRecords?.find((record) => (
        record.visible
        && /^__eve_dashboard_card_media_projects_slot_/.test(record.id)
        && record.source.startsWith('data:image/png')
        && record.media_fit === 'contain'
    )) || null
);

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
    return {
        label: 'dashboard_projects_preview',
        media,
        pixels: assertProjectPreviewPixels(png, item.rect)
    };
};
