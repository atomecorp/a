// Properties real code writes on each atome type beyond the schema its owner declares (R-104 D9). The server
// refuses any property a type does not declare (#shared/atome_type_gate.js#assertKnownAtomeProperties), so every key a
// real writer commits is declared here, never dropped. Seeded from the writers (temp/r104/scripts/d9_seed_written_properties.mjs:
// the keys stored by current code in the dev vaults, the keys of each type's commit literals, the writers read one by
// one); a new key gets its line here, or in its owner's schema when the owner is a domain contract.
// The rule only states the value's type when every stored value had one; ANY accepts every value.

const S = Object.freeze({ type: 'string' }), N = Object.freeze({ type: 'number' }), B = Object.freeze({ type: 'boolean' });
const O = Object.freeze({ type: 'object' }), A = Object.freeze({ type: 'array' }), ANY = Object.freeze({});

// Written on any atome: its name (rename) and the bin's trail (eVe/intuition/tools/delete/blackhole_runtime.js).
export const ATOME_COMMON_PROPERTY_SCHEMA = Object.freeze({
    name: S, deleted_from_project_id: S, deletedFromProjectId: S, deleted_iso: S, deletedIso: S
});

export const ATOME_WRITTEN_PROPERTIES = Object.freeze({
    calendar: {
        coaching: ANY
    },
    user: {
        access: S, current_activity_id: S, current_activity_name: S, current_project_id: S,
        current_project_name: S, currentActivityId: S, currentActivityName: S, currentProjectId: S,
        currentProjectName: S, email: S, eve_profile: O, first_launch_version: ANY, first_name: S, firstname: S,
        firstName: S, message_stack: A, nickname: S, notification_stack: A, user_face: S, username: S,
        visibility: S
    },
    guest_workspace: {
        access: ANY, email: ANY, eve_profile: ANY, first_launch_version: ANY, first_name: ANY, firstname: ANY,
        firstName: ANY, message_stack: ANY, nickname: ANY, notification_stack: ANY, user_face: ANY, username: ANY,
        visibility: ANY
    },
    activity: {
        activity_key: S, activity_name: S, enabled: B, icon: ANY, order: N
    },
    tool_layer: {
        activity_id: ANY, activityId: ANY, entries: ANY, removed_keys: ANY, scope: ANY
    },
    toolbox_scope_state: {
        activity_id: ANY, activityId: ANY, desktop_state: ANY, desktopState: ANY, scope: ANY
    },
    project_toolbox_state: {
        activity_id: ANY, activityId: ANY, desktop_state: ANY, desktopState: ANY, scope: ANY
    },
    tool: {
        action_mode: ANY, atome_tool: B, dom_id: ANY, drag_mode: ANY, drop_create_enabled: ANY, finder_visible: B,
        gateway_action: ANY, icon: S, icon_key: S, instance_atome_id: ANY, label_fallback: S, label_key: S,
        latch: ANY, long_press_action: ANY, long_press_delay_ms: ANY, move_enabled: ANY, name_key: ANY,
        palette_children: ANY, source_palette_atome_id: ANY, source_palette_child_key: ANY,
        source_palette_name_key: ANY, source_palette_tool_id: ANY, tool_definition: O, tool_id: S,
        tool_instance_id: ANY, tool_key: S, tool_name: S, tool_registry_version: N, tool_scope: S, tool_type: ANY
    },
    panel: {
        atome_tool: B, finder_visible: B, icon: S, icon_key: S, label_fallback: S, label_key: S,
        tool_definition: O, tool_id: S, tool_key: S, tool_name: S, tool_registry_version: N, tool_scope: S
    },
    code_file: {
        content: ANY, fileName: ANY, language: ANY, lastModified: ANY, size: ANY
    },
    tag: {
        background: ANY, backgroundColor: ANY, bg: ANY, color: ANY, created_iso: S, font_size: ANY,
        font_weight: ANY, fontSize: ANY, fontWeight: ANY, height: S, hierarchy_order: N, left: S, line_height: ANY, lineHeight: ANY,
        media_kind: S, media_url: ANY, news_line: S, order: N, overflow: ANY, render_order: N, renderOrder: N,
        tag_slug: S, text: S, top: S, width: S, z_index: N, zIndex: N
    },
    blackHole: {
        hidden: B, label: S
    },
    clipboard: {
        copies: A, left: ANY, order: N, render_order: N, top: ANY, z_index: N, zIndex: N
    },
    file: {
        file_name: ANY, file_path: ANY, is_public: ANY, mime_type: ANY, original_name: ANY, size: ANY
    },
    sound: {
        ai_generation: O, background: ANY, backgroundColor: S, bg: ANY, channels: N, color: S, container: S,
        created_iso: S, duration: N, duration_sec: N, duration_seconds: N, file_name: S, file_path: S, fileName: S,
        filePath: S, font_size: ANY, font_weight: ANY, fontSize: ANY, fontWeight: ANY, frame_count: N, height: ANY,
        hierarchy_order: N, is_public: ANY, label: S, left: ANY, line_height: ANY, lineHeight: ANY,
        local_recording_backend: S, local_recording_id: S, media_duration: N, media_kind: S, media_pending: B,
        media_source: S, media_updated_iso: S, media_url: S, media_user_id: S, mediaUserId: S, mime_type: S, mimeType: S,
        order: N, original_name: ANY, overflow: S, peaks: A, pending: B, placeholder_duration_seconds: N,
        placeholder_kind: S, properties: O, recording_id: S, render_order: N, renderOrder: N, sample_rate: N,
        size: ANY, size_bytes: N, src: S, storage_root: S, system_template_ref: S, template_instance_id: S,
        template_slot_id: S, text: ANY, top: ANY, visual_ref: S, visual_status: S, waveform_peaks: A,
        waveform_ref: S, width: ANY, z_index: N, zIndex: N
    },
    audio_recording: {
        accessibility: O, background: ANY, backgroundColor: S, bg: ANY, channels: N, color: ANY, container: S,
        created_iso: S, duration: N, duration_sec: N, duration_seconds: N, file_name: S, file_path: S, fileName: S,
        filePath: S, font_size: ANY, font_weight: ANY, fontSize: ANY, fontWeight: ANY, frame_count: N, height: ANY,
        hierarchy_order: N, is_public: ANY, left: ANY, line_height: ANY, lineHeight: ANY,
        local_recording_backend: S, local_recording_id: S, media_duration: N, media_duration_seconds: N,
        media_kind: S, media_pending: B, media_source: S, media_updated_iso: S, media_url: S, media_user_id: S, mediaUserId: S,
        mime_type: S, mimeType: S, mute: B, order: N, original_name: ANY, overflow: S, peaks: A, pending: B,
        recording_id: S, render_layer: N, render_order: N, renderLayer: N, renderOrder: N, sample_rate: N,
        size: ANY, size_bytes: N, source_in_seconds: N, source_out_seconds: N, storage_root: S, text: ANY,
        top: ANY, visual_ref: S, visual_status: S, waveform_peaks: A, waveform_ref: S, width: ANY, z_index: N, zIndex: N
    },
    video_recording: {
        accessibility: O, audio_codec: S, audio_track_count: N, background: ANY, backgroundColor: ANY, bg: ANY,
        codecs: A, color: ANY, container: S, corner_radii: ANY, corner_radius: N, created_iso: S, duration: N,
        duration_sec: N, duration_seconds: N, file_name: S, file_path: S, fileName: S, filePath: S, font_size: ANY,
        font_weight: ANY, fontSize: ANY, fontWeight: ANY, has_audio: B, height: ANY, hierarchy_order: N,
        is_public: ANY, left: ANY, line_height: ANY, lineHeight: ANY, material: O, media_duration: N,
        media_height: N, media_kind: S, media_pending: B, media_source: S, media_updated_iso: S, media_url: S,
        media_user_id: S, media_width: N, mediaHeight: N, mediaUserId: S, mediaWidth: N, mime_type: S, mimeType: S,
        mute: B, mute_strength: N, natural_height: N, natural_width: N, naturalHeight: N, naturalWidth: N,
        nominal_fps: N, order: N, orientation: S, original_name: ANY, overflow: S, pending: B, recording_id: S,
        render_layer: N, render_order: N, renderLayer: N, renderOrder: N, rotate: N, rounding_enabled: B,
        size: ANY, size_bytes: N, solo: B, source_height: N, source_rect: O, source_width: N, sourceHeight: N,
        sourceWidth: N, storage_root: S, text: ANY, thumbnail_ref: S, top: ANY, video_codec: S,
        video_track_count: N, visual_ref: S, visual_status: S, width: ANY, z_index: N, zIndex: N
    },
    raw: {
        file_name: ANY, file_path: ANY, is_public: ANY, mime_type: ANY, original_name: ANY, size: ANY
    },
    site: {
        credit: ANY, description: ANY, page_ids: ANY, site_menu: ANY, site_status: ANY, slug: ANY, title: ANY
    },
    shop_listing: {
        listing: ANY, listing_status: ANY
    },
    share_request: {
        acceptedAt: ANY, atome_ids: ANY, box: ANY, importedAtomeIds: ANY, importedAtomesCount: ANY, inbox_id: ANY,
        linkMappings: ANY, mode: ANY, outbox_id: ANY, permissions: ANY, property_overrides: ANY, published_at: ANY,
        receiver_project_id: ANY, rejectedAt: ANY, request_id: ANY, share_type: ANY, sharer_id: ANY,
        source_project_id: ANY, status: ANY, statusUpdatedAt: ANY, target_phone: ANY, target_user_id: ANY,
        timestamp: ANY
    },
    share_policy: {
        peerUserId: ANY, permissions: ANY
    },
    generic: {
        background: S, backgroundColor: S, bg: S, current_activity_id: S, current_activity_name: S,
        current_project_id: S, currentActivityId: S, currentActivityName: S, currentProjectId: S, left: N,
        message_stack: A, notification_stack: A, top: N
    },
    project: {
        action_recording: O, action_templates: A, active: B, background: S, backgroundColor: S, bg: S, color: S,
        forced_activity: S, left: S, loop: B, material: O, matrix_slot: N, matrixSlot: N, molecule_timeline: O,
        news_audience: S, news_id: S, news_origin_author_id: S, news_participants: A, news_share_mode: S,
        news_template: ANY, news_writable: B, playback_loop: B, playback_mode: S, preview_height: N,
        preview_region_height: N, preview_region_width: N, preview_region_x: N, preview_region_y: N,
        preview_updated_at: S, preview_url: S, preview_width: N, project_number: N, project_tags: A,
        project_template: O, projectNumber: N, render_order: N, system_template_key: S, system_template_version: N,
        top: S, view_mode: S, work_mode: S, zIndex: N
    },
    group: {
        action_recording: O, author_id: S, author_name: S, background: S, backgroundColor: S, bg: S, color: S,
        container_kind: S, created_iso: S, duration_seconds: N, fill: S, font_size: ANY, font_weight: ANY,
        fontSize: ANY, fontWeight: ANY, group_type: S, groupType: S, hierarchy_order: N, line_height: ANY, lineHeight: ANY,
        list_transport_model_version: ANY, locked: B, media_kind: S, media_url: ANY, molecule_entity: S,
        molecule_timeline: O, news_contribution: B, news_id: S, news_line: S, news_post_id: S, overflow: S,
        page_cover: B, page_format: S, page_orientation: S, playback_loop: B, playback_mode: S,
        playback_offset_seconds: N, render_layer: N, render_order: N, renderLayer: N, renderOrder: N, rotate: N,
        source_in_seconds: N, source_out_seconds: N, stroke: S, system_template_ref: S, template_instance_id: S,
        template_link: O, template_slot_id: S, text: ANY, x: N, y: N, zIndex: N
    },
    text: {
        action_recording: O, background: S, backgroundColor: S, bg: ANY, borderRadius: S, color: S, content: S,
        corner_radii: ANY, corner_radius: ANY, cornerRadii: ANY, created_iso: S, duration: N, duration_sec: N,
        duration_seconds: N, ephemeral: ANY, file_name: S, file_path: S, fill: ANY, font_family: ANY,
        font_size: ANY, font_weight: S, fontSize: ANY, fontWeight: S, hierarchy_order: N, icon: ANY,
        is_public: ANY, line_height: S, lineHeight: S, material: ANY, media_duration: N, media_kind: S,
        media_url: S, media_user_id: S, mediaUserId: S, mime_type: S, news_line: S, opacity: N, original_name: S,
        overflow: S, padding: S, paddingHorizontal: ANY, placeholder_hint: S, placeholder_kind: S,
        placeholder_max_chars: N, playback_offset_seconds: N, render_layer: N, render_order: N, renderLayer: N,
        renderOrder: N, richText: ANY, rotate: N, rounding_enabled: ANY, selectable: B, size: ANY, size_bytes: N,
        source: ANY, source_in_seconds: N, source_out_seconds: N, src: ANY, system_template_ref: S,
        teleport_proxy_destination: ANY, teleport_proxy_destination_label: ANY, teleport_proxy_name: ANY,
        teleport_proxy_unreachable: ANY, template_instance_id: S, template_slot_id: S, text_align: S,
        text_tool_keep_empty: B, zIndex: N
    },
    shape: {
        action_recording: O, ai_generation: O, background: S, backgroundColor: S, bg: S, color: S,
        corner_radius: N, created_iso: S, draw_items: ANY, ephemeral: ANY, exportable: ANY, file_name: S,
        file_path: S, fileName: S, filePath: S, font_size: ANY, font_weight: ANY, fontSize: ANY, fontWeight: ANY,
        hierarchy_order: N, is_public: ANY, lasso_selectable: ANY, layer: ANY, layout_fill: S, line_height: ANY, lineHeight: ANY,
        matrix_categories: A, matrix_headers: B, media_kind: S, media_url: S, media_user_id: S, mime_type: S, mimeType: S,
        module: S, opacity: ANY, original_name: ANY, overflow: S, placeholder_kind: S, polygon_sides: N,
        presentation: ANY, render_layer: N, render_order: N, renderLayer: N, renderOrder: N, rotate: N,
        rounding_enabled: B, selectable: B, shadow: O, shape_variant: S, size: ANY, star_branches: N,
        star_inner_radius: N, svg_markup: S, svgMarkup: S, system_template_ref: S, template_instance_id: S,
        template_slot_id: S, text: ANY, x: N, y: N, zIndex: N
    },
    image: {
        access: S, ai_generation: O, background: S, backgroundColor: S, bg: S, borderRadius: ANY, color: S,
        container: S, corner_radii: ANY, corner_radius: N, created_iso: S, ephemeral: ANY, file_name: S,
        file_path: S, fileName: S, filePath: S, font_size: ANY, font_weight: ANY, fontSize: ANY, fontWeight: ANY,
        hierarchy_order: N, is_public: ANY, line_height: ANY, lineHeight: ANY, media_duration: ANY, media_fit: ANY,
        media_kind: S, media_pending: B, media_src: ANY, media_updated_iso: S, media_user_id: S, mediaHeight: N,
        mediaUserId: S, mediaWidth: N, mime_type: S, mimeType: S, natural_height: N, natural_width: N,
        naturalHeight: N, naturalWidth: N, object_fit: ANY, opacity: N, origin_x: N, origin_y: N, original_name: S,
        overflow: S, pending: B, placeholder_kind: S, playback_offset_seconds: N, recording_id: S, render_layer: N,
        render_order: N, renderLayer: N, renderOrder: N, rotate: N, rounding_enabled: B, selectable: B, size: ANY,
        size_bytes: N, source: S, source_height: N, source_width: N, sourceHeight: N, sourceWidth: N, src: ANY,
        storage_root: S, system_template_ref: S, template_instance_id: S, template_slot_id: S, text: ANY,
        texture_scale: N, visibility: S, visual_ref: S, visual_status: S, zIndex: N
    },
    video: {
        ai_generation: O, audio_codec: S, audio_track_count: N, background: ANY, backgroundColor: ANY, bg: ANY,
        codecs: A, color: S, container: S, created_iso: S, ephemeral: ANY, exportable: ANY, file_name: S,
        file_path: S, fileName: S, filePath: S, font_size: ANY, font_weight: ANY, fontSize: ANY, fontWeight: ANY,
        has_audio: B, hierarchy_order: N, is_public: ANY, line_height: ANY, lineHeight: ANY, loop: B,
        media_duration: N, media_kind: S, media_pending: B, media_updated_iso: S, media_user_id: S, mediaHeight: N,
        mediaUserId: S, mediaWidth: N, mime_type: S, mimeType: S, muted: ANY, natural_height: N, natural_width: N,
        naturalHeight: N, naturalWidth: N, nominal_fps: N, orientation: S, original_name: ANY, overflow: S,
        pending: B, placeholder_kind: S, properties: O, recording_id: S, render_layer: N, render_order: N,
        renderLayer: N, renderOrder: N, rotate: N, selectable: ANY, size: ANY, size_bytes: N, source: ANY,
        source_height: N, source_width: N, sourceHeight: N, sourceWidth: N, src: S, storage_root: S,
        system_template_ref: S, template_instance_id: S, template_slot_id: S, text: S, thumbnail_ref: S,
        tv_channel_id: S, tv_channel_name: S, tv_country: S, video_codec: S, video_track_count: N, visual_ref: S,
        visual_status: S, zIndex: N
    },
    audio: {
        background: ANY, backgroundColor: ANY, bg: ANY, color: S, created_iso: S, font_size: ANY, font_weight: ANY,
        fontSize: ANY, fontWeight: ANY, gain: N, has_audio: B, height: ANY, hierarchy_order: N, left: ANY,
        line_height: ANY, lineHeight: ANY, loop: B, media_duration: N, media_kind: S, mediaKind: ANY, mime_type: S, mimeType: S,
        opacity: N, overflow: ANY, peaks: ANY, playback_offset_seconds: N, playback_rate: N,
        preview_media_kind: ANY, render_layer: N, render_order: N, renderLayer: N, renderOrder: N, text: S,
        top: ANY, width: ANY, zIndex: N
    },
    midi: {
        file_path: ANY, is_public: ANY, original_name: ANY, size: ANY
    },
    audio_waveform: {
        media_id: ANY
    },
    record: {
        author: ANY, author_id: S, author_name: S, background: ANY, backgroundColor: ANY, bg: ANY, color: ANY,
        community: ANY, font_size: ANY, font_weight: ANY, fontSize: ANY, fontWeight: ANY, height: S, image: ANY,
        left: ANY, line_height: ANY, lineHeight: ANY, matrix_cell: ANY, media_kind: S, media_url: ANY, mute: B,
        news_id: S, news_presentation: O, overflow: ANY, post_key: ANY, publication_id: S, render_layer: N,
        render_order: N, renderLayer: N, renderOrder: N, role: ANY, sensor_recording_consent: ANY, sent_at: ANY,
        server_id: ANY, template_control: ANY, text: S, thalasso_stay: ANY, top: ANY, width: S, zIndex: N
    },
    interaction: {
        system_template_ref: S, template_instance_id: S, template_slot_id: S
    }
});
