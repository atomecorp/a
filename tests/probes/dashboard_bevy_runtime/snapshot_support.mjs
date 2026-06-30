export const dashboardSnapshot = async (page) => page.evaluate(async () => {
    const runtime = window.eveDashboardRuntime || null;
    const state = runtime?.state || null;
    const projectId = window.__currentProject?.id || null;
    const scene = projectId ? window.eveToolBase?.getProjectSceneState?.(projectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const dashboardRecords = records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'));
    const visibleDashboardRecords = dashboardRecords.filter((record) => record?.properties?.visible !== false);
    const editorRecord = dashboardRecords.find((record) => record.id === '__eve_dashboard_editor') || null;
    const layout = state?.layout || null;
    const flower = document.getElementById('eve_intuitionx_flower');
    const flowerStyle = flower ? getComputedStyle(flower) : null;
    const flowerRect = flower?.getBoundingClientRect?.() || null;
    const flowerOpen = !!flower
        && flowerStyle?.display !== 'none'
        && flowerStyle?.visibility !== 'hidden'
        && Number(flowerRect?.width || 0) > 0
        && Number(flowerRect?.height || 0) > 0;
    const toolboxCandidates = [
        document.querySelector('#eve_intuitionx_main_ribbon'),
        document.querySelector('#eve_intuitionx_menu_layer #eve_intuitionx_main_ribbon'),
        document.querySelector('#menu_container_v2 > .eve-toolbox-v2-row'),
        document.querySelector('#menu_container_v2'),
        document.querySelector('#toolbox'),
        document.querySelector('#toolbox_support')
    ].filter(Boolean);
    const toolboxHeight = toolboxCandidates.reduce((height, element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(height, Number(rect.height || 0));
    }, 0);
    const dashboardDomCount = document.querySelectorAll('[id^="__eve_dashboard_"], [data-dashboard]').length;
    const canvas = document.getElementById('eve_surface_project');
    const recordOverReservedBand = dashboardRecords.filter((record) => {
        if (record.id === '__eve_dashboard_bottom_shadow') return false;
        if (record.id === '__eve_dashboard_project_veil') return false;
        if (record.id === '__eve_dashboard_reserved_band_fill') return false;
        const props = record.properties || {};
        const top = Number(props.top ?? props.y ?? 0);
        const height = Number(props.height ?? 0);
        return layout?.toolbox_reserved_rect && top + height > layout.toolbox_reserved_rect.y + 0.5;
    }).map((record) => record.id);
    return {
        ok: !!runtime && !!state,
        active: state?.active === true,
        activeCategoryId: state?.activeCategoryId || null,
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
                plus_rect: lane.plus_rect,
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
        dashboardRecordIds: dashboardRecords.map((record) => record.id),
        dashboardVisibleRecordIds: visibleDashboardRecords.map((record) => record.id),
        dashboardTitleTexts: dashboardRecords
            .filter((record) => String(record?.id || '').includes('card_title_'))
            .map((record) => String(record?.properties?.text || '')),
        dashboardMediaRecords: dashboardRecords
            .filter((record) => String(record?.id || '').includes('card_media_'))
            .map((record) => ({
                id: String(record.id || ''),
                source: String(record.properties?.source || ''),
                media_fit: String(record.properties?.media_fit || record.properties?.object_fit || ''),
                corner_radius: Number(record.properties?.corner_radius || record.properties?.cornerRadius || 0),
                rect: {
                    x: Number(record.properties?.left ?? record.properties?.x ?? 0),
                    y: Number(record.properties?.top ?? record.properties?.y ?? 0),
                    width: Number(record.properties?.width ?? 0),
                    height: Number(record.properties?.height ?? 0)
                },
                visible: record.properties?.visible !== false && Number(record.properties?.opacity ?? 1) > 0
            })),
        dashboardCardRecords: dashboardRecords
            .filter((record) => /^__eve_dashboard_card_(?!media_|title_|date_)/.test(String(record?.id || '')))
            .map((record) => ({
                id: String(record.id || ''),
                color: String(record.properties?.color || ''),
                corner_radius: Number(record.properties?.corner_radius || record.properties?.cornerRadius || 0),
                rect: {
                    x: Number(record.properties?.left ?? record.properties?.x ?? 0),
                    y: Number(record.properties?.top ?? record.properties?.y ?? 0),
                    width: Number(record.properties?.width ?? 0),
                    height: Number(record.properties?.height ?? 0)
                }
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
