import fs from 'node:fs';
import { PNG } from 'pngjs';

const CATEGORY_COLORS = {
    news: '#9f2f2f',
    calendar: '#245f94',
    projects: '#357245',
    contacts: '#673071',
    store: '#a65f1f',
    monitor: '#2f6f78',
    goals: '#6f5b24'
};

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

const countPixelsInRect = (png, rect, predicate, step = 4) => {
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

const assertBrightPixels = (png, rect, label, minimum = 4) => {
    const count = countPixelsInRect(png, rect, (pixel) => (
        pixel[0] > 205 && pixel[1] > 205 && pixel[2] > 205 && pixel[3] > 200
    ), 3);
    if (count < minimum) throw new Error(`${label}_bright_pixels_missing:${JSON.stringify({ count, minimum, rect })}`);
};

const assertLaneHasCardContrast = (png, lane, expectedHex, label) => {
    const sampleRect = {
        x: lane.header_rect.x > lane.lane_rect.x ? lane.lane_rect.x + 8 : lane.plus_rect.x + lane.plus_rect.width + 8,
        y: lane.lane_rect.y + Math.max(8, lane.lane_rect.height * 0.2),
        width: Math.max(20, Math.min(80, lane.lane_rect.width - 16)),
        height: Math.max(20, lane.lane_rect.height * 0.56)
    };
    const expected = hexToRgb(expectedHex);
    const contrasted = countPixelsInRect(png, sampleRect, (pixel) => colorDistance(pixel, expected) > 28 && pixel[3] > 200, 4);
    if (contrasted < 8) throw new Error(`${label}_card_contrast_missing:${JSON.stringify({ contrasted, sampleRect, expectedHex })}`);
};

const laneFillSampleX = (lane) => {
    const itemRects = Array.isArray(lane.items) ? lane.items.map((entry) => entry.rect).filter(Boolean) : [];
    const lastItemRight = itemRects.reduce((right, rect) => Math.max(right, Number(rect.x || 0) + Number(rect.width || 0)), Number(lane.lane_rect?.x || 0));
    const gapSample = lastItemRight + Math.max(12, Number(lane.lane_rect?.height || 0) * 0.2);
    const rightLimit = Number(lane.lane_rect.x || 0) + Number(lane.lane_rect.width || 0) - 12;
    if (gapSample < rightLimit) return gapSample;
    return lane.header_rect.x > lane.lane_rect.x
        ? lane.lane_rect.x + Math.min(Math.max(12, lane.lane_rect.width * 0.16), Math.max(12, lane.lane_rect.width - 12))
        : lane.plus_rect.x + lane.plus_rect.width + Math.min(Math.max(12, lane.lane_rect.width * 0.16), Math.max(12, lane.lane_rect.width - 12));
};

const assertNearColor = (actual, expectedHex, label, tolerance = 12) => {
    const expected = hexToRgb(expectedHex);
    const distance = colorDistance(actual, expected);
    if (distance > tolerance) throw new Error(`${label}_color_mismatch:${JSON.stringify({ actual, expected, distance, tolerance })}`);
};

const clampColor = (value) => Math.max(0, Math.min(255, value));

const shadeHex = (hex, percent) => {
    const value = String(hex || '#000000').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex || '#000000';
    const amount = Math.round(2.55 * percent);
    const red = clampColor(Number.parseInt(value.slice(0, 2), 16) + amount);
    const green = clampColor(Number.parseInt(value.slice(2, 4), 16) + amount);
    const blue = clampColor(Number.parseInt(value.slice(4, 6), 16) + amount);
    return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
};

const averageColumn = (png, x, y, height) => {
    const sampleX = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const y0 = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    const y1 = Math.max(y0 + 1, Math.min(png.height, Math.round(y + height)));
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let yy = y0; yy < y1; yy += 1) {
        const index = (yy * png.width + sampleX) * 4;
        red += png.data[index];
        green += png.data[index + 1];
        blue += png.data[index + 2];
        count += 1;
    }
    return [red / count, green / count, blue / count];
};

const assertHeaderInteriorIsFlat = (png, lane, label) => {
    const header = lane.header_rect;
    const y = header.y + Math.max(5, Math.min(10, header.height * 0.08));
    const height = Math.max(6, Math.min(12, header.height * 0.1));
    const edgeX = header.x + Math.max(3, header.width * 0.04);
    const cleanX = header.x + Math.max(12, header.width * 0.12);
    const edge = averageColumn(png, edgeX, y, height);
    const clean = averageColumn(png, cleanX, y, height);
    const distance = colorDistance(edge, clean);
    if (distance > 8) throw new Error(`${label}_header_internal_shadow_leak:${JSON.stringify({ categoryId: lane.categoryId, distance, edge, clean, sample: { y, height, edgeX, cleanX }, header })}`);
    return { categoryId: lane.categoryId, edgeDistance: distance };
};

export const analyzeDashboardVisual = (screenshotPath, snapshot, expectedHex, label) => {
    const png = PNG.sync.read(fs.readFileSync(screenshotPath));
    const lane = snapshot.layout?.lanes?.find((entry) => entry.active) || snapshot.layout?.lanes?.[0];
    if (!lane) throw new Error(`${label}_visual_lane_missing`);
    const expectedLaneHex = shadeHex(expectedHex, -10);
    const laneFillX = Math.min(lane.lane_rect.x + lane.lane_rect.width - 12, lane.lane_rect.x + lane.lane_rect.height + 12);
    assertNearColor(pixelAt(png, lane.header_rect.x + 7, lane.header_rect.y + 7), expectedHex, `${label}_active_header`);
    assertNearColor(pixelAt(png, lane.plus_rect.x + lane.plus_rect.width / 2, lane.plus_rect.y + lane.plus_rect.height + 12), expectedHex, `${label}_plus_strip`);
    assertNearColor(pixelAt(png, laneFillX, lane.header_rect.y + 12), expectedLaneHex, `${label}_lane_fill`);
    assertBrightPixels(png, lane.header_rect, `${label}_header_text_or_icon`);
    const headerFlatness = assertHeaderInteriorIsFlat(png, lane, label);
    assertBrightPixels(png, lane.plus_rect, `${label}_plus_symbol`, 2);
    if (lane.visibleItemCount > 0) assertLaneHasCardContrast(png, lane, expectedLaneHex, `${label}_lane`);
    const reserved = snapshot.layout.toolbox_reserved_rect;
    const reservedPixel = pixelAt(png, reserved.x + reserved.width / 2, reserved.y + Math.min(12, reserved.height - 1));
    if (colorDistance(reservedPixel, hexToRgb(expectedHex)) < 18) throw new Error(`${label}_dashboard_leaks_into_toolbox_band:${JSON.stringify({ reservedPixel, expectedHex })}`);
    return { label, expectedHex, width: png.width, height: png.height, headerFlatness };
};

export const analyzeDashboardOverviewVisual = (screenshotPath, snapshot) => {
    const png = PNG.sync.read(fs.readFileSync(screenshotPath));
    const headerFlatness = [];
    for (const lane of snapshot.layout?.lanes || []) {
        const expectedHex = CATEGORY_COLORS[lane.categoryId];
        if (!expectedHex) continue;
        const expectedLaneHex = shadeHex(expectedHex, -10);
        assertNearColor(pixelAt(png, laneFillSampleX(lane), lane.header_rect.y + 12), expectedLaneHex, `dashboard_open_lane_${lane.categoryId}`, 18);
        assertNearColor(pixelAt(png, lane.header_rect.x + 7, lane.header_rect.y + 7), expectedHex, `dashboard_open_header_${lane.categoryId}`);
        assertBrightPixels(png, lane.header_rect, `dashboard_open_header_text_or_icon_${lane.categoryId}`);
        if (lane.visibleItemCount > 0) assertLaneHasCardContrast(png, lane, expectedLaneHex, `dashboard_open_lane_${lane.categoryId}`);
        headerFlatness.push(assertHeaderInteriorIsFlat(png, lane, `dashboard_open_${lane.categoryId}`));
    }
    const reserved = snapshot.layout.toolbox_reserved_rect;
    const reservedPixel = pixelAt(png, reserved.x + reserved.width / 2, reserved.y + Math.min(12, reserved.height - 1));
    for (const expectedHex of Object.values(CATEGORY_COLORS)) {
        if (colorDistance(reservedPixel, hexToRgb(expectedHex)) < 18) throw new Error(`dashboard_open_dashboard_leaks_into_toolbox_band:${JSON.stringify({ reservedPixel, expectedHex })}`);
    }
    return { label: 'dashboard_open_overview', width: png.width, height: png.height, headerFlatness };
};
