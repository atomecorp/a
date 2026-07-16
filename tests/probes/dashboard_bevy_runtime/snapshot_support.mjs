export const dashboardSnapshot = async (page) => page.evaluate(async () => {
    const dashboardRecordId = (record = {}) => String(record?.id || '');
    const normalizeDashboardRecordId = (id = '') => {
        const value = String(id || '');
        if (value.startsWith('__eve_dashboard_')) return value;
        const index = value.indexOf('___eve_dashboard_');
        return index >= 0 ? value.slice(index + 1) : value;
    };
    const isDashboardRecord = (record = {}) => {
        const id = dashboardRecordId(record);
        return id.startsWith('__eve_dashboard_') || id.includes('___eve_dashboard_');
    };
    const runtime = window.eveDashboardBevyUiRuntime || null;
    const state = runtime?.state || null;
    const projectId = window.__currentProject?.id || state?.projectId || null;
    const scene = projectId ? window.eveToolBase?.getProjectSceneState?.(projectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const dashboardRecords = records.filter(isDashboardRecord);
    const visibleDashboardRecords = dashboardRecords.filter((record) => record?.properties?.visible !== false);
    const editorRecord = dashboardRecords.find((record) => normalizeDashboardRecordId(record.id) === '__eve_dashboard_editor') || null;
    const layout = state?.layout || null;
    const canvas = document.getElementById('eve_surface_project');
    const { getFlowerRuntime, getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
    const flowerOpen = getFlowerRuntime()?.isOpen?.() === true;
    const menu = getMainMenuRuntime();
    const menuMeasure = typeof menu?.measure === 'function' ? menu.measure() : null;
    const menuReservedHeight = typeof menu?.getReservedHeight === 'function'
        ? Number(menu.getReservedHeight(canvas) || 0)
        : 0;
    const menuOverlay = window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees
        ?.find?.((entry) => entry?.id === 'eve_bevy_ui_main_menu') || null;
    const toolboxHeight = menuReservedHeight;
    const dashboardDomCount = document.querySelectorAll('[id^="__eve_dashboard_"], [data-dashboard]').length;
    const recordOverReservedBand = dashboardRecords.filter((record) => {
        const id = normalizeDashboardRecordId(record.id);
        if (id === '__eve_dashboard_bottom_shadow') return false;
        if (id === '__eve_dashboard_project_veil') return false;
        const props = record.properties || {};
        const top = Number(props.top ?? props.y ?? 0);
        const height = Number(props.height ?? 0);
        return layout?.toolbox_reserved_rect && top + height > layout.toolbox_reserved_rect.y + 0.5;
    }).map((record) => normalizeDashboardRecordId(record.id));
    return {
        ok: !!runtime && !!state,
        active: state?.active === true,
        activeCategoryId: state?.activeCategoryId || null,
        focusTransitionActive: !!state?.focusTransition,
        focusTransitionProgress: Number(state?.focusTransition?.progress ?? 1),
        editorOpen: !!state?.editor,
        editorItemId: state?.editor?.item?.id || null,
        labelEditorOpen: !!state?.labelEditor,
        labelEditorItemId: state?.labelEditor?.item_id || null,
        labelEditorSelection: state?.labelEditor?.selection || null,
        flowerOpen,
        projectId,
        canvas: canvas ? {
            width: canvas.getBoundingClientRect().width,
            height: canvas.getBoundingClientRect().height,
            role: canvas.dataset?.role || null
        } : null,
        toolboxHeight,
        menu: {
            active: menuMeasure?.active === true,
            treeMounted: menuMeasure?.treeMounted === true,
            reservedHeight: menuReservedHeight,
            overlayRecordCount: Number(menuOverlay?.overlayRecordCount || 0),
            interactiveNodeCount: Number(menuOverlay?.interactiveNodeCount || 0)
        },
        layout: layout ? {
            handedness: layout.handedness,
            dashboard_rect: layout.dashboard_rect,
            table_rect: layout.table_rect,
            toolbox_reserved_rect: layout.toolbox_reserved_rect,
            creation_fullscreen_rect: layout.creation_fullscreen_rect,
            lanes: layout.lanes.map((lane) => ({
                categoryId: lane.category.id,
                lane_rect: lane.lane_rect,
                header_rect: lane.header_rect,
                active: lane.active,
                visibleItemCount: lane.visible_item_rects.length,
                items: lane.visible_item_rects.map((entry) => ({
                    id: entry.item?.id || null,
                    title: entry.item?.title || '',
                    metadata: entry.item?.metadata || {},
                    rect: entry.rect
                }))
            }))
        } : null,
        dashboardRecordIds: dashboardRecords.map((record) => normalizeDashboardRecordId(record.id)),
        dashboardVisibleRecordIds: visibleDashboardRecords.map((record) => normalizeDashboardRecordId(record.id)),
        dashboardFillRecords: dashboardRecords
            .filter((record) => /^__eve_dashboard_(background|table|lane_|header_bg_|focus_spread_)/.test(normalizeDashboardRecordId(record?.id)))
            .map((record) => ({
                id: normalizeDashboardRecordId(record.id),
                color: String(record.properties?.color || record.properties?.background || record.properties?.backgroundColor || ''),
                rect: {
                    x: Number(record.properties?.left ?? record.properties?.x ?? 0),
                    y: Number(record.properties?.top ?? record.properties?.y ?? 0),
                    width: Number(record.properties?.width ?? 0),
                    height: Number(record.properties?.height ?? 0)
                },
                visible: record.properties?.visible !== false && Number(record.properties?.opacity ?? 1) > 0
            })),
        dashboardTitleTexts: dashboardRecords
            .filter((record) => normalizeDashboardRecordId(record?.id).includes('card_title_'))
            .map((record) => String(record?.properties?.text || '')),
        dashboardMediaRecords: dashboardRecords
            .filter((record) => normalizeDashboardRecordId(record?.id).includes('card_media_'))
            .map((record) => ({
                id: normalizeDashboardRecordId(record.id),
                source: String(record.properties?.source || ''),
                media_fit: String(record.properties?.media_fit || record.properties?.object_fit || ''),
                corner_radius: Number(record.properties?.corner_radius || record.properties?.cornerRadius || 0),
                z_index: Number(record.properties?.z_index ?? record.properties?.zIndex ?? 0),
                rect: {
                    x: Number(record.properties?.left ?? record.properties?.x ?? 0),
                    y: Number(record.properties?.top ?? record.properties?.y ?? 0),
                    width: Number(record.properties?.width ?? 0),
                    height: Number(record.properties?.height ?? 0)
                },
                visible: record.properties?.visible !== false && Number(record.properties?.opacity ?? 1) > 0
            })),
        dashboardCardRecords: dashboardRecords
            .filter((record) => /^__eve_dashboard_card_(?!media_|title_|date_)/.test(normalizeDashboardRecordId(record?.id)))
            .map((record) => ({
                id: normalizeDashboardRecordId(record.id),
                color: String(record.properties?.color || ''),
                corner_radius: Number(record.properties?.corner_radius || record.properties?.cornerRadius || 0),
                rect: {
                    x: Number(record.properties?.left ?? record.properties?.x ?? 0),
                    y: Number(record.properties?.top ?? record.properties?.y ?? 0),
                    width: Number(record.properties?.width ?? 0),
                    height: Number(record.properties?.height ?? 0)
                }
            })),
        dashboardLabelBackdropRecords: dashboardRecords
            .filter((record) => normalizeDashboardRecordId(record?.id).includes('card_label_backdrop_'))
            .map((record) => ({
                id: normalizeDashboardRecordId(record.id),
                source: String(record.properties?.source || ''),
                opacity: Number(record.properties?.opacity ?? 1),
                z_index: Number(record.properties?.z_index ?? record.properties?.zIndex ?? 0),
                rect: {
                    x: Number(record.properties?.left ?? record.properties?.x ?? 0),
                    y: Number(record.properties?.top ?? record.properties?.y ?? 0),
                    width: Number(record.properties?.width ?? 0),
                    height: Number(record.properties?.height ?? 0)
                },
                visible: record.properties?.visible !== false && Number(record.properties?.opacity ?? 1) > 0
            })),
        editorRect: editorRecord ? {
            x: Number(editorRecord.properties?.left ?? editorRecord.properties?.x ?? 0),
            y: Number(editorRecord.properties?.top ?? editorRecord.properties?.y ?? 0),
            width: Number(editorRecord.properties?.width ?? 0),
            height: Number(editorRecord.properties?.height ?? 0)
        } : null,
        dashboardDomCount,
        recordOverReservedBand
    };
});
