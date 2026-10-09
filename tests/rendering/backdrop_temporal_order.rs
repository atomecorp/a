use super::{composition_ranges, frame, region, rgb, shape, Captured};
use crate::{
    workspace_backdrop::AtomePresentationCamera, AtomeBevyRendererConfig, AtomeBevyRendererPlugin,
    AtomeEntityTable, AtomeRenderScene,
};
use bevy::{
    camera::RenderTarget,
    core_pipeline::core_2d::Transparent2d,
    prelude::*,
    render::{
        render_phase::{PhaseItem, ViewSortedRenderPhases},
        render_resource::TextureFormat,
        RenderApp,
    },
    window::WindowPlugin,
    winit::WinitPlugin,
};

#[test]
fn disjoint_coplanar_glass_shares_one_capture_without_changing_nested_composition() {
    let top = region(8.0, 8.0, 240.0, 48.0, 18.0, 10.0);
    let middle = region(8.0, 64.0, 240.0, 48.0, 18.0, 10.0);
    let bottom = region(8.0, 120.0, 240.0, 48.0, 18.0, 10.0);
    for order in [
        [top, middle, bottom],
        [bottom, top, middle],
        [middle, bottom, top],
    ] {
        assert_eq!(
            composition_ranges(order.into_iter().enumerate().map(|(i, r)| (i, Some(r))), 3),
            vec![(0..3, true)]
        );
    }
    let overlapping = region(8.0, 40.0, 240.0, 48.0, 18.0, 10.0);
    let raised = region(8.0, 64.0, 240.0, 48.0, 18.0, 20.0);
    for second in [overlapping, raised] {
        assert_eq!(
            composition_ranges([(0, Some(top)), (1, Some(second))], 2),
            vec![(0..1, true), (1..2, true)]
        );
    }
}

#[test]
#[ignore = "requires a real GPU adapter"]
fn equal_depth_glass_remains_pixel_stable_when_transient_content_is_requeued() {
    let tint = Some([0.0, 0.0, 0.0, 0.5]);
    let scene = AtomeRenderScene {
        nodes: vec![
            shape("background", [0.0, 0.0], [256.0, 192.0], 0, None),
            shape("top", [8.0, 8.0], [240.0, 48.0], 10, tint),
            shape("middle", [8.0, 64.0], [240.0, 48.0], 10, tint),
            shape("bottom", [8.0, 120.0], [240.0, 48.0], 10, tint),
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
    let glasses: Vec<_> = ["top", "middle", "bottom"]
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
                    .filter(|entity| glasses.contains(entity))
                    .collect();
                (order.len() == glasses.len()).then_some(order)
            })
            .collect::<Vec<_>>()
    };
    let first_order = read_order(&app);
    assert!(
        !first_order.is_empty(),
        "the actual presentation phase must contain all glasses"
    );
    let mut changed_order = false;
    let points = [(128, 53), (128, 66), (128, 109), (128, 122)];
    for index in 0..6 {
        for _ in 0..=index {
            app.update();
        }
        changed_order |= read_order(&app) != first_order;
        let current = frame(&mut app, &target);
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
