use bevy::{image::Image, mesh::Mesh, prelude::*, sprite_render::MeshMaterial2d};

use crate::{
    apply_despawn, apply_spawn, apply_style,
    procedural_sdf::ProceduralSdfMaterial,
    types::{
        AtomeBevyRendererConfig, AtomeEntityTable, AtomeProceduralSdf, AtomeRenderNode,
        AtomeRenderScene, AtomeStylePatch,
    },
    workspace_backdrop::{AtomePresentationCamera, AtomeWorkspaceBackdrop},
    workspace_blur::{AssistantOpticsSettings, WorkspaceBlurPipeline},
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
    world.insert_resource(AtomeBevyRendererConfig::new(
        1280.0,
        720.0,
        AtomeRenderScene::default(),
    ));
    world.insert_resource(Assets::<Image>::default());
    world.insert_resource(Assets::<Mesh>::default());
    world.insert_resource(Assets::<ProceduralSdfMaterial>::default());
    world.insert_resource(AssistantOpticsSettings::default());
    let image = world.resource_mut::<Assets<Image>>().add(Image::default());
    let horizontal_image = world.resource_mut::<Assets<Image>>().add(Image::default());
    let vertical_image = world.resource_mut::<Assets<Image>>().add(Image::default());
    let camera = world.spawn(Camera::default()).id();
    let horizontal_camera = world.spawn(Camera::default()).id();
    let vertical_camera = world.spawn(Camera::default()).id();
    let horizontal_quad = world.spawn(Visibility::Hidden).id();
    let vertical_quad = world.spawn(Visibility::Hidden).id();
    let visual = world.spawn((Sprite::default(), Visibility::Hidden)).id();
    world.spawn((Camera::default(), AtomePresentationCamera));
    world.insert_resource(AtomeWorkspaceBackdrop {
        image,
        camera,
        visual,
        enabled: false,
        pixel_size: UVec2::new(1280, 720),
        blur: WorkspaceBlurPipeline {
            horizontal_image,
            vertical_image,
            horizontal_camera,
            vertical_camera,
            horizontal_quad,
            vertical_quad,
            horizontal_material: Handle::default(),
            vertical_material: Handle::default(),
        },
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
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 1180,
            opacity: 1.0,
            corner_radius: 0.0,
            shadow: None,
            backdrop: None,
            presentation: false,
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
    let handle = world
        .get::<MeshMaterial2d<ProceduralSdfMaterial>>(entity)
        .unwrap()
        .0
        .clone();
    assert!(world.get::<Mesh2d>(entity).is_some());
    let backdrop_state = world.resource::<AtomeWorkspaceBackdrop>().clone();
    assert!(backdrop_state.enabled);
    assert!(
        world
            .get::<Camera>(backdrop_state.camera)
            .unwrap()
            .is_active
    );
    assert_eq!(
        world.get::<Visibility>(backdrop_state.visual),
        Some(&Visibility::Hidden),
        "the legacy backdrop sprite must stay hidden; only the isolated material samples the capture"
    );
    assert_eq!(
        world
            .resource::<Assets<ProceduralSdfMaterial>>()
            .get(&handle)
            .unwrap()
            .original_backdrop,
        backdrop_state.image
    );
    assert_eq!(
        world
            .resource::<Assets<ProceduralSdfMaterial>>()
            .get(&handle)
            .unwrap()
            .blurred_backdrop,
        backdrop_state.blur.vertical_image
    );
    for camera in [
        backdrop_state.blur.horizontal_camera,
        backdrop_state.blur.vertical_camera,
    ] {
        assert!(world.get::<Camera>(camera).unwrap().is_active);
    }
    for quad in [
        backdrop_state.blur.horizontal_quad,
        backdrop_state.blur.vertical_quad,
    ] {
        assert_eq!(world.get::<Visibility>(quad), Some(&Visibility::Visible));
    }
    assert_eq!(
        world
            .resource::<Assets<ProceduralSdfMaterial>>()
            .get(&handle)
            .unwrap()
            .uniform
            .morph
            .to_array(),
        contract().morph
    );

    let patched = AtomeProceduralSdf {
        phase: 2.0,
        intensity: 0.25,
        ..contract()
    };
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
    let uniform = world
        .resource::<Assets<ProceduralSdfMaterial>>()
        .get(&handle)
        .unwrap()
        .uniform;
    assert_eq!(uniform.dynamics.x, 2.0);
    assert_eq!(uniform.dynamics.w, 0.25);
    assert_eq!(uniform.geometry.to_array(), [1280.0, 720.0, 640.0, 360.0]);
    assert_eq!(uniform.shape.x, 420.0);
    apply_despawn(&mut world, "assistant_sdf").unwrap();
    assert!(!world.resource::<AtomeWorkspaceBackdrop>().enabled);
    assert!(
        !world
            .get::<Camera>(backdrop_state.camera)
            .unwrap()
            .is_active
    );
    assert_eq!(
        world.get::<Visibility>(backdrop_state.visual),
        Some(&Visibility::Hidden)
    );
    for camera in [
        backdrop_state.blur.horizontal_camera,
        backdrop_state.blur.vertical_camera,
    ] {
        assert!(!world.get::<Camera>(camera).unwrap().is_active);
    }
    for quad in [
        backdrop_state.blur.horizontal_quad,
        backdrop_state.blur.vertical_quad,
    ] {
        assert_eq!(world.get::<Visibility>(quad), Some(&Visibility::Hidden));
    }
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
    assert!(shader.contains("let glass_color = mix(original_color, blurred_color, material.optics.y)"));
    assert!(shader.contains("fn gaussian_tail"));
    assert!(shader.contains("let halo_near = gaussian_tail"));
    assert!(shader.contains("let halo_diffuse = gaussian_tail"));
    assert!(shader.contains("0.05 + rim * 0.46 + shell_edge * 0.18"));
    assert!(!shader.contains("contact_shadow"));
    assert!(!shader.contains("let halo_distance = abs(shell_distance)"));
}

#[test]
fn procedural_sdf_flower_mode_uses_one_antialiased_smooth_union_mask() {
    let shader = include_str!("assets/shaders/procedural_sdf.wgsl");
    assert!(shader.contains("fn sd_capsule"));
    assert!(shader.contains("fn smooth_union"));
    assert!(shader.contains("fn flower_liquid"));
    assert!(shader.contains("material.flower_petals[index]"));
    assert!(shader.contains("textureSample(blurred_texture, blurred_sampler, screen_uv)"));
    assert!(shader.contains("smoothstep(-edge_softness, edge_softness, distance)"));
    assert!(!shader.contains("flower_copy"));
}
