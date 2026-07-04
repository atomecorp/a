export const assertDashboardFocusedColors = async (page, categoryId) => page.evaluate(async (id) => {
    const { DASHBOARD_VISUAL_TOKENS } = await import('/eVe/domains/dashboard/dashboard_tokens.js');
    const state = window.eveDashboardRuntime?.state || {};
    const projectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
    const sceneProjectId = state.active === true ? (state.projectId || '__eve_dashboard_workspace__') : projectId;
    const scene = sceneProjectId ? window.eveToolBase?.getProjectSceneState?.(sceneProjectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const category = (state.categories || []).find((entry) => String(entry.id) === String(id));
    const activeColor = category?.color || '';
    const byId = new Map(records.map((record) => [String(record.id || ''), record]));
    const readColor = (suffix) => byId.get(`__eve_dashboard_${suffix}`)?.properties?.color || '';
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const shadeHex = (hex, percent) => {
        const value = String(hex || '#000000').replace('#', '');
        const amount = Math.round(2.55 * percent);
        const red = clamp(Number.parseInt(value.slice(0, 2), 16) + amount, 0, 255);
        const green = clamp(Number.parseInt(value.slice(2, 4), 16) + amount, 0, 255);
        const blue = clamp(Number.parseInt(value.slice(4, 6), 16) + amount, 0, 255);
        return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
    };
    const failures = [];
    const expect = (name, actual, expected) => {
        if (String(actual).toLowerCase() !== String(expected).toLowerCase()) failures.push({ name, actual, expected });
    };
    expect('background', readColor('background'), activeColor);
    expect('table', readColor('table'), activeColor);
    expect('plus_strip_active', readColor('plus_strip_active'), activeColor);
    for (const lane of state.layout?.lanes || []) {
        const laneId = String(lane.category?.id || '');
        const headerColor = laneId === id ? activeColor : shadeHex(activeColor, -18);
        expect(`lane_${laneId}`, readColor(`lane_${laneId}`), shadeHex(headerColor, DASHBOARD_VISUAL_TOKENS.laneShadePercent));
        expect(`header_bg_${laneId}`, readColor(`header_bg_${laneId}`), headerColor);
    }
    const cards = records.filter((record) => (
        record.type === 'shape'
        && String(record.id || '').startsWith('__eve_dashboard_card_')
        && record?.properties?.visible !== false
        && Number(record?.properties?.opacity ?? 1) > 0
    ));
    for (const card of cards) {
        if (!card.properties?.material?.shadow) failures.push({ name: `${card.id}:shadow`, actual: card.properties?.material?.shadow, expected: 'material.shadow' });
    }
    return {
        ok: !!activeColor && failures.length === 0,
        activeColor,
        cardColors: cards.map((card) => card.properties?.color),
        cardCount: cards.length,
        failures,
        tokenBackground: DASHBOARD_VISUAL_TOKENS.background
    };
}, categoryId);

export const assertDashboardOverviewColors = async (page) => page.evaluate(async () => {
    const { DASHBOARD_VISUAL_TOKENS } = await import('/eVe/domains/dashboard/dashboard_tokens.js');
    const state = window.eveDashboardRuntime?.state || {};
    const projectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
    const sceneProjectId = state.active === true ? (state.projectId || '__eve_dashboard_workspace__') : projectId;
    const scene = sceneProjectId ? window.eveToolBase?.getProjectSceneState?.(sceneProjectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const byId = new Map(records.map((record) => [String(record.id || ''), record]));
    const readColor = (suffix) => byId.get(`__eve_dashboard_${suffix}`)?.properties?.color || '';
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const shadeHex = (hex, percent) => {
        const value = String(hex || '#000000').replace('#', '');
        const amount = Math.round(2.55 * percent);
        const red = clamp(Number.parseInt(value.slice(0, 2), 16) + amount, 0, 255);
        const green = clamp(Number.parseInt(value.slice(2, 4), 16) + amount, 0, 255);
        const blue = clamp(Number.parseInt(value.slice(4, 6), 16) + amount, 0, 255);
        return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
    };
    const failures = [];
    const expect = (name, actual, expected) => {
        if (String(actual).toLowerCase() !== String(expected).toLowerCase()) failures.push({ name, actual, expected });
    };
    expect('background', readColor('background'), DASHBOARD_VISUAL_TOKENS.background);
    expect('table', readColor('table'), DASHBOARD_VISUAL_TOKENS.table);
    for (const lane of state.layout?.lanes || []) {
        const laneId = String(lane.category?.id || '');
        const laneColor = lane.category?.color || '';
        expect(`lane_${laneId}`, readColor(`lane_${laneId}`), shadeHex(laneColor, DASHBOARD_VISUAL_TOKENS.laneShadePercent));
        expect(`header_bg_${laneId}`, readColor(`header_bg_${laneId}`), laneColor);
    }
    return { ok: failures.length === 0 && !state.activeCategoryId, failures };
});
