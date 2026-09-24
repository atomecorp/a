use bevy::{image::Image, mesh::Mesh, prelude::*, sprite_render::MeshMaterial2d};

use crate::{
    apply_despawn, apply_spawn, apply_style,
    procedural_sdf::ProceduralSdfMaterial,
    types::{
        AtomeBevyRendererConfig, AtomeEntityTable, AtomeProceduralSdf, AtomeRenderNode, AtomeRenderScene,
        AtomeStylePatch,
    },
    workspace_backdrop::{AtomePresentationCamera, AtomeWorkspaceBackdrop},
    workspace_blur::{backdrop_blur_lod, AssistantOpticsSettings},
};

fn contract() -> AtomeProceduralSdf {
    AtomeProceduralSdf {
        morph: [1.12, 0.9, 0.16, 0.02],
        phase: 4.0,
        pulse: 0.03,
        time: 1.25,
        intensity: 0.6,
        glow_reveal: 1.0,
        core_reveal: 1.0,
        shell_reveal: 1.0,
        disappearing: 0.0,
        contact: [0.25, -0.1],
        attraction: 0.4,
        stretch: 0.5,
        gesture_velocity: 0.6,
        destructive_direction: [1.0, 0.0],
        destructive_mode: 0.0,
        destructive_progress: 0.0,
        surface_size: [1280.0, 720.0],
        assistant_center: [640.0, 360.0],
        assistant_size: 420.0,
        ..Default::default()
    }
}

fn world() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::new(1280.0, 720.0, AtomeRenderScene::default()));
    world.insert_resource(Assets::<Image>::default());
    world.insert_resource(Assets::<Mesh>::default());
    world.insert_resource(Assets::<ProceduralSdfMaterial>::default());
    world.insert_resource(AssistantOpticsSettings::default());
    let image = world.resource_mut::<Assets<Image>>().add(Image::default());
    let capture_image = image.clone();
    let camera = world.spawn(Camera::default()).id();
    world.spawn((Camera::default(), AtomePresentationCamera));
    world.insert_resource(AtomeWorkspaceBackdrop {
        capture_image,
        image,
        camera,
        enabled: false,
        pixel_size: UVec2::new(1280, 720),
    });
    world
}

#[test]
fn procedural_sdf_spawns_and_patches_one_full_surface_material_quad() {
    let mut world = world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            id: "assistant_sdf".to_string(),
            kind: "procedural_sdf".to_string(),
            parent_id: None,
            logical_position: [430.0, 150.0],
            logical_size: [420.0, 420.0],
            clip_rect: None,
            clip_rotation: 0.0,
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 1180,
            opacity: 1.0,
            corner_radius: 0.0,
            corner_radii: None,
            shadow: None,
            backdrop: None,
            presentation: false,
            menu_plane: 0,
            color: None,
            text: None,
            source: None,
            texture_size: None,
            uv_rect: None,
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
            filters: None,
            transition: None,
            procedural: Some(contract()),
        },
    )
    .unwrap();
    let handle = world.get::<MeshMaterial2d<ProceduralSdfMaterial>>(entity).unwrap().0.clone();
    assert!(world.get::<Mesh2d>(entity).is_some());
    let backdrop_state = world.resource::<AtomeWorkspaceBackdrop>().clone();
    assert!(backdrop_state.enabled);
    assert!(world.get::<Camera>(backdrop_state.camera).unwrap().is_active);
    assert_eq!(world.resource::<Assets<ProceduralSdfMaterial>>().get(&handle).unwrap().backdrop, backdrop_state.image);
    assert_eq!(
        world.resource::<Assets<ProceduralSdfMaterial>>().get(&handle).unwrap().uniform.morph.to_array(),
        contract().morph
    );

    let patched = AtomeProceduralSdf { phase: 2.0, intensity: 0.25, ..contract() };
    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "assistant_sdf".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: Some(patched),
        },
    )
    .unwrap();
    let uniform = world.resource::<Assets<ProceduralSdfMaterial>>().get(&handle).unwrap().uniform;
    assert_eq!(uniform.dynamics.x, 2.0);
    assert_eq!(uniform.dynamics.w, 0.25);
    assert_eq!(uniform.geometry.to_array(), [1280.0, 720.0, 640.0, 360.0]);
    assert_eq!(uniform.shape.x, 420.0);
    assert_eq!(uniform.shape.w, backdrop_blur_lod(contract().background_blur_px, 1.0));
    apply_despawn(&mut world, "assistant_sdf").unwrap();
    assert!(!world.resource::<AtomeWorkspaceBackdrop>().enabled);
    assert!(!world.get::<Camera>(backdrop_state.camera).unwrap().is_active);
}

#[test]
fn procedural_sdf_has_one_directional_ejection_mode() {
    let shader = include_str!("assets/shaders/procedural_sdf.wgsl");
    assert!(shader.contains("let inertial_progress = 1.0 - pow("));
    assert!(shader.contains("length(surface_size) / assistant_size + 1.10"));
    assert!(shader.contains("let axial_scale = 1.0 + destructive_pull"));
    assert!(shader.contains("let transverse_scale = 1.0 - destructive_pull * 0.12"));
    assert!(shader.contains("let core_inertia = select"));
    assert!(shader.contains("smoothstep(0.85, 1.0, destructive_progress)"));
    assert!(!shader.contains("cut_path"));
    assert!(!shader.contains("burst"));
    assert!(!shader.contains("membrane"));
}

#[test]
fn procedural_sdf_keeps_clear_glass_and_a_continuous_shadow_free_aura() {
    let shader = include_str!("assets/shaders/procedural_sdf.wgsl");
    assert!(shader.contains("frag_coord_to_uv(mesh.position.xy, view.viewport)"));
    assert!(!shader.contains("mesh.world_position.x / surface_size.x + 0.5"));
    assert!(!shader.contains("mesh.position.xy / max(screen_dimensions"));
    assert!(shader.contains("let glass_color = mix(original_color, blurred_color, material.optics.y)"));
    assert!(shader.contains("fn gaussian_tail"));
    assert!(shader.contains("let halo_near = gaussian_tail"));
    assert!(shader.contains("let halo_diffuse = gaussian_tail"));
    assert!(shader.contains("0.05 + rim * 0.46 + shell_edge * 0.18"));
    assert!(!shader.contains("contact_shadow"));
    assert!(!shader.contains("let halo_distance = abs(shell_distance)"));
}

#[test]
fn procedural_sdf_mystic_mode_is_one_isolated_turning_tile_branch() {
    let shader = include_str!("assets/shaders/procedural_sdf.wgsl");
    // The branch exists, and it is reachable: the dispatch walks from the most
    // specific mode to the most general one, so mode 3 can never fall through
    // into the liquid glass and mode 2 can never fall into the corolla.
    assert!(shader.contains("fn intuition_mystic(pixel_position: vec2<f32>, screen_uv: vec2<f32>)"));
    let mystic = shader.find("material.surface_style.x > 2.5").expect("mystic dispatch");
    let liquid = shader.find("material.surface_style.x > 1.5").expect("liquid dispatch");
    assert!(mystic < liquid);
    assert!(!shader.contains("fn flower_liquid("));
    // Both plates are rounded rectangles, so the SDF is shared instead of
    // copy-pasted into each design branch. Mystic calls it three times — the
    // turning plate, the flat hole it leaves in its cell, and the cell's own
    // footprint, which is the distance the contact shadow fades over when a pixel
    // never projects onto the plate plane — hence five call sites in all, the
    // definition included.
    assert!(shader.contains("fn sd_rounded_box"));
    assert!(!shader.contains("intuition_liquid_rounded_box"));
    assert_eq!(shader.matches("sd_rounded_box(").count(), 5);
    // The contact shadow fades over the distance to the PLATE, never over a
    // distance that reads as zero off the plate: that is what turned the whole
    // `reach` of a turning tile into one dark rectangle.
    assert!(shader.contains("let shadow_value = (1.0 - smoothstep(0.0, shadow_blur, max(contact_distance, 0.0)))"));
    assert!(!shader.contains("smoothstep(0.0, shadow_blur, max(box_distance, 0.0))"));
    // The tile turns around a real perspective divide, and its two faces are the
    // same rectangle: the workspace side reads the plate coordinate as its own
    // source offset, the menu side reads the shared system glass.
    assert!(shader.contains("let candidate_aside = along * eye / denominator"));
    assert!(shader.contains("let candidate_bside = across * depth / eye"));
    assert!(shader.contains("let source = select(tile.xy + vec2(aside, bside), tile.xy + vec2(bside, aside), turning_y)"));
    assert!(shader.contains("mix(plate, tint.rgb, tint.a)"));
    assert!(shader.contains("material.mystic_tile_colors[index]"));
    assert!(shader.contains("material.mystic_tile_motion[index]"));
    // The back face carries the workspace WHOLE — no fade gating its opacity — and
    // the cell it leaves behind is filled with the menu plate: the hole.
    assert!(shader.contains("plate_color = textureSampleLevel(menu_front, menu_front_sampler, source_uv, 0.0).rgb"));
    assert!(!shader.contains("back_alpha"));
    assert!(shader.contains("let hole_distance = sd_rounded_box(delta, vec2(half_side)"));
    assert!(shader.contains("* hole_dose"));
    // The contact shadow is occluded by the plate it belongs to, and only a plate
    // that is really turning carries one.
    assert!(shader.contains("* shadow_dose * (1.0 - plate_mask) * lifted"));
    assert!(shader.contains("let lifted = abs(sine)"));
    // A tile that has not started turning paints nothing at all.
    assert!(shader.contains("if progress <= 0.0 { continue; }"));
    // Every mystic uniform is declared, and in the bind group order.
    let mut order = vec![shader.find("liquid_drop_count: vec4<f32>").expect("liquid drop count")];
    for field in ["mystic_tiles", "mystic_tile_motion", "mystic_tile_colors", "mystic_count", "mystic_style"] {
        order.push(shader.find(&format!("{field}:")).expect("mystic uniform"));
    }
    assert!(order.windows(2).all(|pair| pair[0] < pair[1]), "mystic uniforms follow liquid_drop_count in order");
}
