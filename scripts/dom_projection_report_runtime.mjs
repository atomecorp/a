const sumMetric = (metrics, key) => metrics.reduce((total, item) => total + (Number(item[key]) || 0), 0);

const mergeCountEntries = (target, entries = [], keyName = 'attribute') => {
    entries.forEach((entry) => {
        const key = String(entry?.[keyName] || entry?.name || '').trim();
        if (!key) return;
        target.set(key, (target.get(key) || 0) + (Number(entry.count) || 0));
    });
};

const sortedCountEntries = (items, keyName = 'attribute') => (
    Array.from(items.entries())
        .map(([key, count]) => ({ [keyName]: key, count }))
        .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])))
);

export const summarizeMetrics = (metrics = []) => {
    const atomeIds = new Map();
    const atomeReferences = [];
    const canvasRoles = new Map();
    const duplicateIds = [];
    const heavyBusinessAttributes = new Map();
    const forbiddenAttributes = new Map();
    const inlineStyleProperties = new Map();
    for (const item of metrics) {
        item.data_atome_ids.forEach((id) => {
            atomeIds.set(id, (atomeIds.get(id) || 0) + 1);
        });
        item.data_atome_id_references.forEach((reference) => atomeReferences.push(reference));
        item.canvas_roles.forEach(({ role, count }) => {
            canvasRoles.set(role, (canvasRoles.get(role) || 0) + count);
        });
        item.duplicate_ids.forEach(({ id, count }) => duplicateIds.push({ file: item.file, id, count }));
        mergeCountEntries(heavyBusinessAttributes, item.heavy_business_data_attributes);
        mergeCountEntries(forbiddenAttributes, item.forbidden_data_attributes);
        mergeCountEntries(inlineStyleProperties, item.inline_style_properties, 'property');
    }
    const nodeCount = sumMetric(metrics, 'node_count');
    const inlineStyleCount = sumMetric(metrics, 'inline_style_count');
    return {
        file_count: metrics.length,
        dom_size_bytes: sumMetric(metrics, 'dom_size_bytes'),
        node_count: nodeCount,
        div_count: sumMetric(metrics, 'div_count'),
        span_count: sumMetric(metrics, 'span_count'),
        button_count: sumMetric(metrics, 'button_count'),
        canvas_count: sumMetric(metrics, 'canvas_count'),
        canvas_without_role_count: sumMetric(metrics, 'canvas_without_role_count'),
        canvas_roles: sortedCountEntries(canvasRoles, 'role'),
        video_count: sumMetric(metrics, 'video_count'),
        data_attribute_count: sumMetric(metrics, 'data_attribute_count'),
        json_like_data_count: sumMetric(metrics, 'json_like_data_count'),
        large_data_count: sumMetric(metrics, 'large_data_count'),
        inline_style_count: inlineStyleCount,
        inline_style_ratio: nodeCount ? Number((inlineStyleCount / nodeCount).toFixed(4)) : 0,
        inline_handler_count: sumMetric(metrics, 'inline_handler_count'),
        base64_in_dom_count: sumMetric(metrics, 'base64_in_dom_count'),
        data_uri_in_dom_count: sumMetric(metrics, 'data_uri_in_dom_count'),
        data_preview_signature_count: sumMetric(metrics, 'data_preview_signature_count'),
        duplicate_id_count: duplicateIds.length,
        duplicate_ids: duplicateIds,
        html_count: sumMetric(metrics, 'html_count'),
        head_count: sumMetric(metrics, 'head_count'),
        body_count: sumMetric(metrics, 'body_count'),
        localhost_occurrence_count: sumMetric(metrics, 'localhost_occurrence_count'),
        localhost_or_127_count_in_persisted_attrs: sumMetric(metrics, 'localhost_or_127_count_in_persisted_attrs'),
        media_error_count: sumMetric(metrics, 'media_error_count'),
        data_atome_id_count: sumMetric(metrics, 'data_atome_id_count'),
        data_atome_id_unique_count: atomeIds.size,
        repeated_data_atome_ids: Array.from(atomeIds.entries())
            .filter(([, count]) => count > 1)
            .map(([id, count]) => ({ id, count })),
        repeated_data_atome_id_references: atomeReferences.filter((reference) => {
            const count = atomeIds.get(reference.id) || 0;
            return count > 1;
        }),
        has_data_group_timeline: metrics.some((item) => item.has_data_group_timeline),
        heavy_business_data_count: sumMetric(metrics, 'heavy_business_data_count'),
        heavy_business_data_attributes: sortedCountEntries(heavyBusinessAttributes),
        forbidden_data_attributes: sortedCountEntries(forbiddenAttributes),
        inline_style_properties: sortedCountEntries(inlineStyleProperties, 'property').slice(0, 16)
    };
};

export const formatDomProjectionReport = (result) => {
    const summary = result.summary || summarizeMetrics(result.metrics || []);
    const lines = [
        'DOM projection audit report',
        `status: ${result.ok ? 'PASS' : 'FAIL'}`,
        `files: ${summary.file_count}`,
        `dom_size_bytes: ${summary.dom_size_bytes}`,
        `node_count: ${summary.node_count}`,
        `div_count: ${summary.div_count}`,
        `span_count: ${summary.span_count}`,
        `button_count: ${summary.button_count}`,
        `canvas_count: ${summary.canvas_count}`,
        `canvas_without_role_count: ${summary.canvas_without_role_count}`,
        `video_count: ${summary.video_count}`,
        `data_attribute_count: ${summary.data_attribute_count}`,
        `json_like_data_count: ${summary.json_like_data_count}`,
        `large_data_count: ${summary.large_data_count}`,
        `inline_style_count: ${summary.inline_style_count}`,
        `inline_style_ratio: ${summary.inline_style_ratio}`,
        `inline_handler_count: ${summary.inline_handler_count}`,
        `base64_in_dom_count: ${summary.base64_in_dom_count}`,
        `data_uri_in_dom_count: ${summary.data_uri_in_dom_count}`,
        `data_preview_signature_count: ${summary.data_preview_signature_count}`,
        `duplicate_id_count: ${summary.duplicate_id_count}`,
        `html_count: ${summary.html_count}`,
        `head_count: ${summary.head_count}`,
        `body_count: ${summary.body_count}`,
        `localhost_occurrence_count: ${summary.localhost_occurrence_count}`,
        `localhost_or_127_count_in_persisted_attrs: ${summary.localhost_or_127_count_in_persisted_attrs}`,
        `media_error_count: ${summary.media_error_count}`,
        `data_atome_id_count: ${summary.data_atome_id_count}`,
        `data_atome_id_unique_count: ${summary.data_atome_id_unique_count}`,
        `data_group_timeline: ${summary.has_data_group_timeline ? 'present' : 'absent'}`,
        `heavy_business_data_count: ${summary.heavy_business_data_count}`,
        `violations: ${result.violations.length}`
    ];
    if (summary.duplicate_ids.length) {
        lines.push(`duplicate_ids: ${summary.duplicate_ids.map((item) => `${item.file}:${item.id}(${item.count})`).join(', ')}`);
    }
    if (summary.forbidden_data_attributes.length) {
        lines.push(`forbidden_data_attributes: ${summary.forbidden_data_attributes.map((item) => `${item.attribute}(${item.count})`).join(', ')}`);
    }
    if (summary.repeated_data_atome_ids.length) {
        lines.push(`repeated_data_atome_ids: ${summary.repeated_data_atome_ids.map((item) => `${item.id}(${item.count})`).join(', ')}`);
        lines.push(`repeated_data_atome_projection_refs: ${summary.repeated_data_atome_id_references.map((item) => {
            const role = item.role || 'no-role';
            const renderer = item.renderer || 'no-renderer';
            const viewId = item.view_id || 'no-view';
            return `${item.id}:${item.tag}/${role}/${renderer}/${viewId}`;
        }).join(', ')}`);
    }
    if (summary.heavy_business_data_attributes.length) {
        lines.push(`heavy_business_data_attributes: ${summary.heavy_business_data_attributes.map((item) => `${item.attribute}(${item.count})`).join(', ')}`);
    }
    if (summary.inline_style_properties.length) {
        lines.push(`inline_style_properties: ${summary.inline_style_properties.map((item) => `${item.property}(${item.count})`).join(', ')}`);
    }
    if (summary.canvas_roles.length) {
        lines.push(`canvas_roles: ${summary.canvas_roles.map((item) => `${item.role}(${item.count})`).join(', ')}`);
    }
    return lines.join('\n');
};
