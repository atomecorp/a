use super::{composition_ranges, frame, region, rgb, shape, Captured};
use crate::{
    workspace_backdrop::AtomePresentationCamera, AtomeBevyRendererConfig, AtomeBevyRendererPlugin,
    AtomeEntityTable, AtomeRenderNode, AtomeRenderScene,
};
use bevy::{
    camera::RenderTarget,
    core_pipeline::core_2d::Transparent2d,
    prelude::*,
    render::{
        render_phase::{PhaseItem, ViewSortedRenderPhases},
        render_resource::TextureFormat,
        view::screenshot::{Screenshot, ScreenshotCaptured},
        RenderApp,
    },
    window::WindowPlugin,
    winit::WinitPlugin,
};

#[test]
fn disjoint_coplanar_glass_shares_one_capture_without_changing_nested_composition() {
    let top = region(8.0, 8.0, 240.0, 48.0, 18.0);
    let middle = region(8.0, 64.0, 240.0, 48.0, 18.0);
    let bottom = region(8.0, 120.0, 240.0, 48.0, 18.0);
    for order in [
        [top, middle, bottom],
        [bottom, top, middle],
        [middle, bottom, top],
    ] {
        assert_eq!(
            composition_ranges(order.into_iter().enumerate().map(|(i, r)| (i, 10.0, Some(r))), 3),
            vec![(0..3, true)]
        );
    }
    let overlapping = region(8.0, 40.0, 240.0, 48.0, 18.0);
    let raised = region(8.0, 64.0, 240.0, 48.0, 18.0);
    for (second, depth) in [(overlapping, 10.0), (raised, 20.0)] {
        assert_eq!(
            composition_ranges([(0, 10.0, Some(top)), (1, depth, Some(second))], 2),
            vec![(0..1, true), (1..2, true)]
        );
    }
}

#[test]
fn coplanar_glass_shares_one_capture_whatever_other_items_of_its_plane_come_between() {
    // A panel list: glass rows and, on the same plane, the transparent carriers
    // of their drop shadows. Bevy hands the plane over in any order; a row must
    // never capture a neighbour row (a selected one bled into the row above).
    let rows = [
        region(8.0, 8.0, 240.0, 48.0, 18.0),
        region(8.0, 64.0, 240.0, 48.0, 18.0),
        region(8.0, 120.0, 240.0, 48.0, 18.0),
    ];
    let plane = [Some(rows[0]), None, Some(rows[1]), None, Some(rows[2]), None];
    for rotation in 0..plane.len() {
        let mut order = plane;
        order.rotate_left(rotation);
        let items = std::iter::once((0, 0.0, None))
            .chain(order.into_iter().enumerate().map(|(i, r)| (i + 1, 10.0, r)))
            .chain(std::iter::once((7, 12.0, None)));
        assert_eq!(composition_ranges(items, 8), vec![(0..1, false), (1..8, true)]);
    }
}

#[test]
#[ignore = "requires a real GPU adapter"]
fn equal_depth_glass_remains_pixel_stable_when_transient_content_is_requeued() {
    let tint = [0.0, 0.0, 0.0, 0.5];
    // A panel list: resting rows carry their drop shadow on a transparent shape
    // of their own plane; the selected middle row is pressed in and lighter.
    let carrier = |id: &str, y: f32| -> AtomeRenderNode {
        serde_json::from_value(serde_json::json!({"id":id,"kind":"shape","parent_id":null,
            "logical_position":[8.0, y],"logical_size":[240.0, 48.0],"layer":10,"color":[0,0,0,0],
            "corner_radius":8,"shadow":{"color":[0.0,0.0,0.0,0.35],"blur":6.0,"offset_y":2.0}}))
        .unwrap()
    };
    // Panel glass blurs wide enough to reach a neighbour row across the gap.
    let row = |id: &str, y: f32, tint: [f32; 4]| -> AtomeRenderNode {
        serde_json::from_value(serde_json::json!({"id":id,"kind":"shape","parent_id":null,
            "logical_position":[8.0, y],"logical_size":[240.0, 48.0],"layer":10,"color":[1,1,1,1],
            "backdrop":{"blur_px":40,"tint":tint},"corner_radius":8}))
        .unwrap()
    };
    let scene = AtomeRenderScene {
        nodes: vec![
            shape("background", [0.0, 0.0], [256.0, 192.0], 0, None),
            carrier("top_shadow", 8.0),
            row("top", 8.0, tint),
            row("middle", 60.0, [0.3, 0.4, 0.7, 0.9]),
            carrier("bottom_shadow", 112.0),
            row("bottom", 112.0, tint),
            shape("foreground", [220.0, 170.0], [16.0, 16.0], 20, None),
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
    let initial = frame(&mut app, &target);
    if let Ok(directory) = std::env::var("ATOME_COMPOSITION_CAPTURE_DIR") {
        std::fs::create_dir_all(&directory).unwrap();
        initial
            .clone()
            .try_into_dynamic()
            .unwrap()
            .save(std::path::Path::new(&directory).join("coplanar.png"))
            .unwrap();
    }
    let plane: Vec<_> = ["top_shadow", "top", "middle", "bottom_shadow", "bottom"]
        .into_iter()
        .map(|id| app.world().resource::<AtomeEntityTable>().by_id[id])
        .collect();
    let read_order = |app: &App| {
        let phases = app
            .sub_app(RenderApp)
            .world()
            .resource::<ViewSortedRenderPhases<Transparent2d>>();
        phases
            .values()
            .filter_map(|phase| {
                let order: Vec<_> = phase
                    .items
                    .values()
                    .map(|item| item.main_entity().id())
                    .filter(|entity| plane.contains(entity))
                    .collect();
                (order.len() == plane.len()).then_some(order)
            })
            .collect::<Vec<_>>()
    };
    let first_order = read_order(&app);
    assert!(
        !first_order.is_empty(),
        "the actual presentation phase must contain the whole plane"
    );
    let mut changed_order = false;
    let points = [(128, 53), (128, 66), (128, 109), (128, 122)];
    for index in 0..6 {
        let current = requeued_frame(&mut app, &target, index);
        changed_order |= read_order(&app) != first_order;
        for (x, y) in points {
            assert_eq!(
                rgb(&current, x, y),
                rgb(&initial, x, y),
                "static glass pixels changed at ({x},{y}) on capture {index}"
            );
        }
        assert!(
            current.data == initial.data,
            "static presentation changed on capture {index}"
        );
    }
    assert!(
        changed_order,
        "the fixture must exercise transient-driven phase reordering"
    );
}

/// A frame captured while rows are requeued on every update, as an animated
/// item keeps doing on a device: a patch makes Bevy swap-remove the row from
/// the phase and append it, which moves the plane's other items between rows.
fn requeued_frame(app: &mut App, target: &Handle<Image>, seed: usize) -> Image {
    let mut step = seed;
    let mut update = |app: &mut App| {
        let id = if step % 2 == 0 { "top" } else { "middle" };
        step += 1;
        crate::apply_layer(app.world_mut(), crate::AtomeLayerPatch { id: id.into(), layer: 10 })
            .unwrap();
        app.update();
    };
    for _ in 0..12 {
        update(app);
    }
    app.world_mut().resource_mut::<Captured>().0 = None;
    app.world_mut().spawn(Screenshot::image(target.clone())).observe(
        |captured: On<ScreenshotCaptured>, mut pixels: ResMut<Captured>| {
            pixels.0 = Some(captured.image.clone());
        },
    );
    for _ in 0..120 {
        update(app);
        if let Some(image) = app.world_mut().resource_mut::<Captured>().0.take() {
            return image;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    panic!("GPU screenshot was not delivered");
}
