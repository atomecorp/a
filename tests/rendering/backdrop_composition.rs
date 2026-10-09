use crate::{
    video_external_texture::video_quad_mesh_from_size,
    workspace_backdrop::AtomePresentationCamera,
    workspace_blur::composition::{composition_ranges, mesh_region, SampleRegion},
    AtomeBevyRendererConfig, AtomeBevyRendererPlugin, AtomeEntityTable, AtomeRenderNode,
    AtomeRenderScene,
};
use bevy::{
    camera::RenderTarget,
    image::Image,
    prelude::*,
    render::{
        batching::NoAutomaticBatching,
        render_resource::{PollType, TextureFormat},
        renderer::RenderDevice,
        view::screenshot::{Screenshot, ScreenshotCaptured},
    },
    window::WindowPlugin,
    winit::WinitPlugin,
};

fn region(x: f32, y: f32, width: f32, height: f32, halo: f32) -> SampleRegion {
    let paint = Rect::from_corners(Vec2::new(x, y), Vec2::new(x + width, y + height));
    SampleRegion {
        paint,
        sample: Rect::from_corners(paint.min - Vec2::splat(halo), paint.max + Vec2::splat(halo)),
    }
}

#[test]
fn overlapping_glass_and_intervening_content_require_fresh_snapshots() {
    let panel = region(0.0, 0.0, 300.0, 200.0, 32.0);
    let button = region(20.0, 20.0, 60.0, 30.0, 32.0);
    let third = region(30.0, 24.0, 20.0, 20.0, 32.0);
    assert_eq!(
        composition_ranges(
            [
                (0, None),
                (1, Some(panel)),
                (2, Some(button)),
                (3, Some(third)),
                (4, None)
            ],
            5
        ),
        vec![
            (0..1, false),
            (1..2, true),
            (2..3, true),
            (3..4, true),
            (4..5, false)
        ]
    );
    assert_eq!(
        composition_ranges([(0, Some(button)), (1, None), (2, Some(button))], 3),
        vec![(0..1, true), (1..2, false), (2..3, true)]
    );
}

#[test]
fn grouping_checks_sampling_halo_and_every_previous_surface() {
    let first = region(0.0, 0.0, 20.0, 20.0, 2.0);
    let distant = region(200.0, 0.0, 20.0, 20.0, 2.0);
    let near_first = region(30.0, 0.0, 20.0, 20.0, 16.0);
    assert_eq!(
        composition_ranges(
            [(0, Some(first)), (1, Some(distant)), (2, Some(near_first))],
            3
        ),
        vec![(0..2, true), (2..3, true)]
    );
    assert_eq!(
        composition_ranges([(0, Some(first)), (1, Some(distant))], 2),
        vec![(0..2, true)]
    );
    assert!(composition_ranges([], 0).is_empty());
}

#[test]
fn transformed_mesh_regions_follow_clipping_rotation_and_dpr() {
    let mesh = video_quad_mesh_from_size([40.0, 20.0], [0.0, 0.0, 1.0, 1.0]);
    let transform = GlobalTransform::from(
        Transform::from_xyz(100.0, 80.0, 0.0)
            .with_rotation(Quat::from_rotation_z(std::f32::consts::FRAC_PI_2))
            .with_scale(Vec3::new(2.0, 1.0, 1.0)),
    );
    let result = mesh_region(&mesh, &transform, 16.0, 2.0, 0.0).unwrap();
    assert!((result.paint.width() - 20.0).abs() < 0.01);
    assert!((result.paint.height() - 80.0).abs() < 0.01);
    assert_eq!(result.paint.center(), Vec2::new(100.0, 80.0));
    assert!(result.sample.min.x < result.paint.min.x - 16.0);
    let refracted = mesh_region(&mesh, &transform, 16.0, 2.0, 12.0).unwrap();
    assert!((result.sample.min.x - refracted.sample.min.x - 6.0).abs() < 0.01);
}

fn shape(
    id: &str,
    position: [f32; 2],
    size: [f32; 2],
    layer: i32,
    tint: Option<[f32; 4]>,
) -> AtomeRenderNode {
    serde_json::from_value(serde_json::json!({"id":id,"kind":"shape","parent_id":null,
        "logical_position":position,"logical_size":size,"layer":layer,"color":[1,1,1,1],
        "backdrop":tint.map(|t|serde_json::json!({"blur_px":4,"tint":t})),"corner_radius":8}))
    .unwrap()
}

#[test]
fn sampling_materials_cannot_batch_across_capture_boundaries() {
    let scene = AtomeRenderScene {
        nodes: vec![
            shape(
                "a",
                [10.0, 10.0],
                [80.0, 60.0],
                1,
                Some([0.0, 0.0, 0.0, 0.5]),
            ),
            shape(
                "b",
                [20.0, 20.0],
                [40.0, 20.0],
                2,
                Some([0.0, 0.0, 0.0, 0.5]),
            ),
        ],
        ..default()
    };
    let mut app = App::new();
    app.add_plugins(AtomeBevyRendererPlugin::new(AtomeBevyRendererConfig::new(
        256.0, 192.0, scene,
    )));
    app.update();
    for id in ["a", "b"] {
        let entity = app.world().resource::<AtomeEntityTable>().by_id[id];
        assert!(app.world().get::<NoAutomaticBatching>(entity).is_some());
    }
}

#[derive(Resource, Default)]
struct Captured(Option<Image>);

fn frame(app: &mut App, target: &Handle<Image>) -> Image {
    for _ in 0..12 {
        app.update();
    }
    app.world_mut().resource_mut::<Captured>().0 = None;
    app.world_mut()
        .spawn(Screenshot::image(target.clone()))
        .observe(
            |captured: On<ScreenshotCaptured>, mut pixels: ResMut<Captured>| {
                pixels.0 = Some(captured.image.clone());
            },
        );
    for _ in 0..120 {
        app.update();
        if let Some(image) = app.world_mut().resource_mut::<Captured>().0.take() {
            return image;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    panic!("GPU screenshot was not delivered");
}

fn rgb(image: &Image, x: usize, y: usize) -> [u8; 3] {
    let bytes = image.data.as_ref().unwrap();
    let scale = image.width() as usize / 256;
    let (x, y) = (x * scale, y * scale);
    let offset = (y * image.width() as usize + x) * 4;
    [bytes[offset], bytes[offset + 1], bytes[offset + 2]]
}

#[test]
#[ignore = "requires a real WebGPU/Metal adapter; run explicitly for rendering acceptance"]
fn gpu_pixels_compose_depth_without_self_capture_or_foreground_leakage() {
    let tint = [0.0, 0.0, 0.0, 0.5];
    let scene = AtomeRenderScene {
        nodes: vec![
            shape("wallpaper", [0.0, 0.0], [256.0, 192.0], 0, None),
            shape("panel", [8.0, 8.0], [144.0, 176.0], 10, Some(tint)),
            shape("nested", [24.0, 24.0], [112.0, 144.0], 20, Some(tint)),
            shape("third", [40.0, 40.0], [80.0, 112.0], 30, Some(tint)),
            shape("standalone", [168.0, 24.0], [72.0, 144.0], 20, Some(tint)),
        ],
        ..default()
    };
    let mut app = App::new();
    app.add_plugins(
        DefaultPlugins
            .set(WindowPlugin {
                primary_window: None,
                ..default()
            })
            .disable::<WinitPlugin>(),
    )
    .add_plugins(AtomeBevyRendererPlugin::new(
        AtomeBevyRendererConfig::with_surface_metrics(256.0, 192.0, 1024.0, 768.0, 4.0, scene),
    ))
    .init_resource::<Captured>();
    app.finish();
    app.cleanup();
    app.update();
    let target = app
        .world_mut()
        .resource_mut::<Assets<Image>>()
        .add(Image::new_target_texture(
            1024,
            768,
            TextureFormat::Rgba8UnormSrgb,
            None,
        ));
    let camera = app
        .world_mut()
        .query_filtered::<Entity, With<AtomePresentationCamera>>()
        .single(app.world())
        .unwrap();
    app.world_mut()
        .entity_mut(camera)
        .insert(RenderTarget::Image(target.clone().into()));
    let image = frame(&mut app, &target);
    let one = rgb(&image, 16, 96)[0];
    let two = rgb(&image, 32, 96)[0];
    let three = rgb(&image, 80, 96)[0];
    let standalone = rgb(&image, 200, 96)[0];
    let mut durations = Vec::new();
    let meshes = app.world().resource::<Assets<Mesh>>().len();
    let images = app.world().resource::<Assets<Image>>().len();
    for i in 0..36 {
        let started = std::time::Instant::now();
        crate::apply_transform(
            app.world_mut(),
            serde_json::from_value(serde_json::json!({
                "id":"nested","logical_position":[24+(i%3)*2,24],"logical_size":[112,144]
            }))
            .unwrap(),
        )
        .unwrap();
        app.update();
        app.world()
            .resource::<RenderDevice>()
            .poll(PollType::wait_indefinitely())
            .unwrap();
        durations.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    assert_eq!(app.world().resource::<Assets<Mesh>>().len(), meshes);
    assert_eq!(app.world().resource::<Assets<Image>>().len(), images);
    crate::apply_transform(
        app.world_mut(),
        serde_json::from_value(serde_json::json!({
            "id":"nested","logical_position":[24,24],"logical_size":[112,144]
        }))
        .unwrap(),
    )
    .unwrap();
    durations.sort_by(f64::total_cmp);
    if let Ok(directory) = std::env::var("ATOME_COMPOSITION_CAPTURE_DIR") {
        let directory = std::path::PathBuf::from(directory);
        assert!(
            directory.is_absolute(),
            "captures require an absolute path under the root repository temp directory"
        );
        std::fs::create_dir_all(&directory).unwrap();
        image
            .clone()
            .try_into_dynamic()
            .unwrap()
            .save(directory.join("layers.png"))
            .unwrap();
        std::fs::write(directory.join("measurements.json"),serde_json::to_vec_pretty(&serde_json::json!({
            "pixels":{"one":one,"two":two,"three":three,"standalone":standalone},
            "physical_size":[1024,768],"frames":36,"update_and_gpu_wait_ms":{"p50":durations[18],"p95":durations[34]},
            "mesh_assets":meshes,"image_assets":images
        })).unwrap()).unwrap();
    }
    assert!((one as i16 - 188).abs() < 6, "one-layer sRGB pixel: {one}");
    assert!((two as i16 - 137).abs() < 8, "two-layer sRGB pixel: {two}");
    assert!(
        (three as i16 - 99).abs() < 8,
        "three-layer sRGB pixel: {three}"
    );
    assert!(
        (standalone as i16 - one as i16).abs() < 5,
        "standalone:{standalone}, panel:{one}"
    );
    // The same scene must not progressively darken by sampling last frame.
    let repeat = frame(&mut app, &target);
    assert_eq!(rgb(&repeat, 80, 96), rgb(&image, 80, 96));
    let front = crate::spawn::spawn_node_in_world(
        app.world_mut(),
        AtomeRenderNode {
            color: Some([1.0, 0.0, 0.0, 1.0]),
            ..shape("foreground", [60.0, 60.0], [40.0, 40.0], 40, None)
        },
    )
    .unwrap();
    let foreground = frame(&mut app, &target);
    assert_eq!(rgb(&foreground, 80, 80), [255, 0, 0]);
    assert_eq!(rgb(&foreground, 80, 120), rgb(&image, 80, 120));
    // A coloured visual on the presentation layer, BELOW the nested glasses,
    // must be included even though the old workspace-only capture excludes it.
    app.world_mut().despawn(front);
    let behind = crate::spawn::spawn_node_in_world(
        app.world_mut(),
        AtomeRenderNode {
            kind: "image".into(),
            source: Some("fixture://green-image".into()),
            presentation: true,
            texture: Some(crate::AtomeTexture {
                width: 8,
                height: 8,
                rgba: [0, 255, 0, 255].repeat(64),
                animation: None,
            }),
            ..shape("behind", [60.0, 60.0], [40.0, 40.0], 15, None)
        },
    )
    .unwrap();
    let green = frame(&mut app, &target);
    let center = rgb(&green, 80, 80);
    assert!(
        center[1] > 100 && center[0] < 8 && center[2] < 8,
        "behind glass: {center:?}"
    );
    assert!(app.world().get_entity(behind).is_ok());
    crate::apply_transform(
        app.world_mut(),
        serde_json::from_value(serde_json::json!({
            "id":"behind","logical_position":[160,60],"logical_size":[40,40]
        }))
        .unwrap(),
    )
    .unwrap();
    let moved = frame(&mut app, &target);
    assert_eq!(rgb(&moved, 80, 80), rgb(&image, 80, 80));
    crate::apply_layer(
        app.world_mut(),
        crate::AtomeLayerPatch {
            id: "behind".into(),
            layer: 40,
        },
    )
    .unwrap();
    crate::apply_transform(
        app.world_mut(),
        serde_json::from_value(serde_json::json!({
            "id":"behind","logical_position":[60,60],"logical_size":[40,40]
        }))
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rgb(&frame(&mut app, &target), 80, 80), [0, 255, 0]);
    for id in [
        "wallpaper",
        "panel",
        "nested",
        "third",
        "standalone",
        "behind",
    ] {
        crate::apply_render_op(app.world_mut(), crate::AtomeRenderOp::Despawn(id.into())).unwrap();
    }
    app.world_mut()
        .get_mut::<Camera>(camera)
        .unwrap()
        .clear_color = bevy::camera::ClearColorConfig::Custom(Color::WHITE);
    crate::spawn::spawn_node_in_world(
        app.world_mut(),
        shape(
            "clear_only_glass",
            [60.0, 60.0],
            [80.0, 80.0],
            10,
            Some(tint),
        ),
    )
    .unwrap();
    let clear = frame(&mut app, &target);
    assert!((rgb(&clear, 80, 80)[0] as i16 - 188).abs() < 6);
    assert_eq!(rgb(&clear, 20, 20), [255, 255, 255]);
    assert_eq!(rgb(&frame(&mut app, &target), 80, 80), rgb(&clear, 80, 80));
    // Partially overlapping glasses must obey depth, including after a live
    // inversion. Different tints make an incorrect order observable in pixels.
    crate::apply_render_op(
        app.world_mut(),
        crate::AtomeRenderOp::Despawn("clear_only_glass".into()),
    )
    .unwrap();
    for node in [
        shape("left_glass", [8.0, 20.0], [112.0, 144.0], 10, Some(tint)),
        shape(
            "right_glass",
            [80.0, 20.0],
            [112.0, 144.0],
            20,
            Some([1.0, 0.0, 0.0, 0.5]),
        ),
    ] {
        crate::spawn::spawn_node_in_world(app.world_mut(), node).unwrap();
    }
    let partial = frame(&mut app, &target);
    let overlap = rgb(&partial, 100, 96);
    assert!(
        (overlap[0] as i16 - 225).abs() < 8,
        "partial overlap: {overlap:?}"
    );
    assert!((overlap[1] as i16 - 137).abs() < 8);
    assert!((rgb(&partial, 40, 96)[0] as i16 - 188).abs() < 6);
    crate::apply_layer(
        app.world_mut(),
        crate::AtomeLayerPatch {
            id: "left_glass".into(),
            layer: 30,
        },
    )
    .unwrap();
    let inverted = frame(&mut app, &target);
    let overlap = rgb(&inverted, 100, 96);
    assert!(
        (overlap[0] as i16 - 188).abs() < 8,
        "inverted depth: {overlap:?}"
    );
    assert!((overlap[1] as i16 - 137).abs() < 8);
    for id in ["left_glass", "right_glass"] {
        crate::apply_render_op(app.world_mut(), crate::AtomeRenderOp::Despawn(id.into())).unwrap();
    }
    let empty = frame(&mut app, &target);
    assert_eq!(rgb(&empty, 100, 96), [255, 255, 255], "empty scenes must clear old pixels");
    assert_eq!(rgb(&empty, 40, 96), [255, 255, 255]);
    // The palette uses the same glass, clipped to its existing folded corner.
    let palette = shape("palette", [20.0, 20.0], [60.0, 60.0], 10, Some([0.0, 0.0, 0.0, 0.69]));
    crate::spawn::spawn_node_in_world(app.world_mut(), palette).unwrap();
    let ordinary = frame(&mut app, &target);
    crate::apply_style(app.world_mut(), serde_json::from_value(serde_json::json!({
        "id":"palette","backdrop":{"blur_px":16,"tint":[0,0,0,0.69],"corner_cut_px":11}
    })).unwrap()).unwrap();
    let cut = frame(&mut app, &target);
    assert_eq!(rgb(&cut, 50, 50), rgb(&ordinary, 50, 50), "cut must not alter glass opacity");
    assert_eq!(rgb(&cut, 76, 23), [255, 255, 255], "folded corner must show the backdrop");
    assert!(rgb(&ordinary, 76, 23)[0] < 180, "ordinary rounded corner must remain painted");
    assert_eq!(rgb(&cut, 23, 23), rgb(&ordinary, 23, 23), "other corners must stay unchanged");
    let family_tint = [0.08, 0.04, 0.1, 0.69];
    crate::apply_style(app.world_mut(), serde_json::from_value(serde_json::json!({
        "id":"palette","backdrop":{"blur_px":16,"tint":family_tint,"corner_cut_px":11}
    })).unwrap()).unwrap();
    let mut mystic: crate::AtomeProceduralSdf = serde_json::from_value(serde_json::json!({
        "mode":3,"morph":[1,1,0,0],"surface_size":[256,192],"background_blur_px":16,
        "assistant_background_tint":[0,0,0,0.69],"mystic_count":[1,0,8,0],"mystic_style":[2.5,0,0,0.6]
    })).unwrap();
    mystic.mystic_tiles[0] = [120.0, 142.0, 30.0, 8.0];
    mystic.mystic_tile_motion[0] = [1.0, 0.0, 1.0, 0.0];
    mystic.mystic_tile_colors[0] = [family_tint[0], family_tint[1], family_tint[2], 1.0];
    crate::spawn::spawn_node_in_world(app.world_mut(), AtomeRenderNode {
        kind: "procedural_sdf".into(), procedural: Some(mystic),
        ..shape("mystic", [0.0, 0.0], [256.0, 192.0], 10, None)
    }).unwrap();
    let unified = frame(&mut app, &target);
    for (palette, mystic) in rgb(&unified, 50, 50).into_iter().zip(rgb(&unified, 120, 50)) {
        assert!((palette as i16 - mystic as i16).abs() <= 2, "palette and Mystic must retain equal tint and transparency");
    }
    if let Ok(directory) = std::env::var("ATOME_COMPOSITION_CAPTURE_DIR") {
        std::fs::create_dir_all(&directory).unwrap();
        cut.clone().try_into_dynamic().unwrap().save(std::path::Path::new(&directory).join("palette-cut.png")).unwrap();
        for (name, pixels) in [
            ("layers", image),
            ("foreground", foreground),
            ("image-behind", green),
            ("image-moved", moved),
            ("partial-overlap", partial),
            ("inverted-depth", inverted),
        ] {
            pixels
                .try_into_dynamic()
                .unwrap()
                .save(std::path::Path::new(&directory).join(format!("{name}.png")))
                .unwrap();
        }
    }
}
