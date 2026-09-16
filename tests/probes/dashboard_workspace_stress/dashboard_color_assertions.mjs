const inspectDashboardGlass = async (page, categoryId = '') => page.evaluate((activeId) => {
    const state = window.eveDashboardBevyUiRuntime?.state || {};
    const sceneProjectId = state.sceneProjectId || window.__currentProject?.id || null;
    const records = window.eveToolBase?.getProjectSceneState?.(sceneProjectId)?.records || [];
    const dashboard = records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'));
    const headers = dashboard.filter((record) => String(record.id).startsWith('__eve_dashboard_header_bg_'));
    const failures = [];
    for (const record of headers) {
        if (!(Number(record.properties?.material?.backdrop?.blurPx) > 0)) {
            failures.push({ id: record.id, error: 'backdrop_blur_missing' });
        }
    }
    if (activeId) {
        const active = headers.find((record) => record.id === `__eve_dashboard_header_bg_${activeId}`);
        const inactive = headers.find((record) => record !== active);
        const activeAlpha = Number(active?.properties?.material?.backdrop?.tint?.[3] || 0);
        const inactiveAlpha = Number(inactive?.properties?.material?.backdrop?.tint?.[3] || 0);
        if (!(activeAlpha > inactiveAlpha)) failures.push({ error: 'active_header_emphasis_missing', activeAlpha, inactiveAlpha });
    }
    const obsolete = dashboard.map((record) => record.id)
        .filter((id) => /project_veil|bottom_shadow|header_side_shadow|focus_spread|create_bg|_lane_|_table$/.test(id));
    if (obsolete.length) failures.push({ error: 'obsolete_dashboard_records', obsolete });
    return {
        ok: headers.length === (state.categories || []).length && failures.length === 0,
        activeId,
        headerCount: headers.length,
        failures
    };
}, categoryId);

export const assertDashboardFocusedColors = (page, categoryId) => inspectDashboardGlass(page, categoryId);
export const assertDashboardOverviewColors = (page) => inspectDashboardGlass(page, '');
