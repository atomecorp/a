use super::*;
use crate::types::AtomeTexture;
use bevy::input::touch::TouchPhase;
use bevy::prelude::*;
use bevy::text::FontSource;
use bevy::ui::widget::ImageNode;

fn sample_tree() -> AtomeUiTree {
    AtomeUiTree {
        id: "ui_tree".to_string(),
        root: AtomeUiNode {
            id: "ui_root".to_string(),
            kind: "root".to_string(),
            text: None,
            image: None,
            style: AtomeUiStyle::default(),
            children: vec![AtomeUiNode {
                id: "ui_button".to_string(),
                kind: "button".to_string(),
                text: Some("Open".to_string()),
                image: None,
                style: AtomeUiStyle {
                    size: Some([120.0, 32.0]),
                    background: Some([0.2, 0.3, 0.4, 1.0]),
                    ..default()
                },
                children: Vec::new(),
            }],
        },
    }
}

fn image_tree() -> AtomeUiTree {
    AtomeUiTree {
        id: "ui_image_tree".to_string(),
        root: AtomeUiNode {
            id: "ui_image_root".to_string(),
            kind: "root".to_string(),
            text: None,
            image: None,
            style: AtomeUiStyle::default(),
            children: vec![AtomeUiNode {
                id: "ui_home_icon".to_string(),
                kind: "image".to_string(),
                text: None,
                image: Some(AtomeUiImage {
                    source: Some("./assets/images/icons/home.svg".to_string()),
                    fit: Some("contain".to_string()),
                    opacity: Some(1.0),
                    tint: Some([1.0, 1.0, 1.0, 1.0]),
                    texture: Some(AtomeTexture {
                        width: 2,
                        height: 2,
                        rgba: vec![
                            255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0,
                        ],
                    }),
                }),
                style: AtomeUiStyle {
                    size: Some([24.0, 24.0]),
                    ..default()
                },
                children: Vec::new(),
            }],
        },
    }
}

#[test]
fn ui_ops_mount_update_and_unmount_tree() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyUiPlugin);
    apply_ui_ops(
        app.world_mut(),
        vec![AtomeUiOp::MountTree {
            tree: sample_tree(),
        }],
    );
    let diagnostics = read_ui_diagnostics(app.world());
    assert_eq!(diagnostics.mounted_trees, 1);
    assert_eq!(diagnostics.mounted_nodes, 2);
    assert_eq!(diagnostics.last_error, None);
    let button = app
        .world()
        .resource::<AtomeUiEntityTable>()
        .by_id
        .get("ui_button")
        .copied()
        .expect("button entity");
    assert!(app.world().get::<Button>(button).is_some());

    apply_ui_ops(
        app.world_mut(),
        vec![AtomeUiOp::UpdateTree {
            tree: sample_tree(),
        }],
    );
    assert_eq!(read_ui_diagnostics(app.world()).mounted_trees, 1);

    apply_ui_ops(
        app.world_mut(),
        vec![AtomeUiOp::UnmountTree {
            id: "ui_tree".to_string(),
        }],
    );
    assert_eq!(read_ui_diagnostics(app.world()).mounted_trees, 0);
}

#[test]
fn ui_image_nodes_spawn_bevy_image_node_from_texture() {
    let mut app = App::new();
    app.add_plugins(AtomeBevyUiPlugin);
    apply_ui_ops(
        app.world_mut(),
        vec![AtomeUiOp::MountTree { tree: image_tree() }],
    );
    let diagnostics = read_ui_diagnostics(app.world());
    assert_eq!(diagnostics.last_error, None);
    let icon = app
        .world()
        .resource::<AtomeUiEntityTable>()
        .by_id
        .get("ui_home_icon")
        .copied()
        .expect("image entity");
    assert!(app.world().get::<ImageNode>(icon).is_some());
}

fn styled_node(id: &str, kind: &str, style: AtomeUiStyle) -> AtomeUiNode {
    AtomeUiNode {
        id: id.to_string(),
        kind: kind.to_string(),
        text: (kind == "label").then(|| "Texte".to_string()),
        image: None,
        style,
        children: Vec::new(),
    }
}

fn mount_styled_tree(world: &mut World, children: Vec<AtomeUiNode>) {
    apply_ui_ops(
        world,
        vec![AtomeUiOp::MountTree {
            tree: AtomeUiTree {
                id: "ui_style_tree".to_string(),
                root: AtomeUiNode {
                    id: "ui_style_root".to_string(),
                    kind: "root".to_string(),
                    text: None,
                    image: None,
                    style: AtomeUiStyle {
                        background: Some([0.1, 0.1, 0.1, 0.8]),
                        ..default()
                    },
                    children,
                },
            },
        }],
    );
    assert!(read_ui_diagnostics(world).last_error.is_none());
}

fn entity_for(world: &World, id: &str) -> Entity {
    world.resource::<AtomeUiEntityTable>().by_id[id]
}

#[test]
fn update_node_style_patches_position_size_background_z_in_place() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_card",
            "panel",
            AtomeUiStyle {
                position: Some([10.0, 20.0]),
                size: Some([100.0, 50.0]),
                background: Some([0.2, 0.3, 0.4, 1.0]),
                z_index: Some(3),
                ..default()
            },
        )],
    );
    apply_ui_ops(
        &mut world,
        vec![AtomeUiOp::UpdateNodeStyle {
            id: "ui_card".to_string(),
            style: AtomeUiStyle {
                position: Some([40.0, 60.0]),
                size: Some([200.0, 80.0]),
                background: Some([0.5, 0.1, 0.1, 1.0]),
                z_index: Some(9),
                ..default()
            },
        }],
    );
    assert!(read_ui_diagnostics(&world).last_error.is_none());
    let entity = entity_for(&world, "ui_card");
    let node = world.get::<Node>(entity).unwrap();
    assert_eq!(node.left, px(40.0));
    assert_eq!(node.top, px(60.0));
    assert_eq!(node.width, px(200.0));
    assert_eq!(node.height, px(80.0));
    assert_eq!(
        world.get::<BackgroundColor>(entity).unwrap().0,
        Color::srgba(0.5, 0.1, 0.1, 1.0)
    );
    assert_eq!(world.get::<ZIndex>(entity).unwrap().0, 9);
    assert_eq!(world.get::<GlobalZIndex>(entity).unwrap().0, 9);
}

#[test]
fn set_subtree_opacity_scales_and_restores_all_color_alphas() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![
            styled_node(
                "ui_fade_label",
                "label",
                AtomeUiStyle {
                    color: Some([1.0, 1.0, 1.0, 0.8]),
                    ..default()
                },
            ),
            styled_node(
                "ui_fade_shadowed",
                "panel",
                AtomeUiStyle {
                    shadow: Some(AtomeUiShadow {
                        color: [0.0, 0.0, 1.0, 0.8],
                        blur: 8.0,
                        spread: 0.0,
                        offset: [0.0, 4.0],
                    }),
                    ..default()
                },
            ),
        ],
    );
    apply_ui_ops(
        &mut world,
        vec![AtomeUiOp::SetSubtreeOpacity {
            id: "ui_style_root".to_string(),
            opacity: 0.5,
        }],
    );
    assert!(read_ui_diagnostics(&world).last_error.is_none());
    let root = entity_for(&world, "ui_style_root");
    let label = entity_for(&world, "ui_fade_label");
    assert!((world.get::<BackgroundColor>(root).unwrap().0.alpha() - 0.4).abs() < 1e-5);
    assert!((world.get::<TextColor>(label).unwrap().0.alpha() - 0.4).abs() < 1e-5);
    let shadowed = entity_for(&world, "ui_fade_shadowed");
    assert!((world.get::<BoxShadow>(shadowed).unwrap().0[0].color.alpha() - 0.4).abs() < 1e-5);
    apply_ui_ops(
        &mut world,
        vec![AtomeUiOp::SetSubtreeOpacity {
            id: "ui_style_root".to_string(),
            opacity: 1.0,
        }],
    );
    assert!((world.get::<BackgroundColor>(root).unwrap().0.alpha() - 0.8).abs() < 1e-5);
    assert!((world.get::<TextColor>(label).unwrap().0.alpha() - 0.8).abs() < 1e-5);
    assert!((world.get::<BoxShadow>(shadowed).unwrap().0[0].color.alpha() - 0.8).abs() < 1e-5);
}

#[test]
fn shadow_style_inserts_box_shadow() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_shadowed",
            "panel",
            AtomeUiStyle {
                shadow: Some(AtomeUiShadow {
                    color: [0.0, 0.0, 0.0, 0.4],
                    blur: 14.0,
                    spread: 2.0,
                    offset: [0.0, 6.0],
                }),
                ..default()
            },
        )],
    );
    let shadow = world
        .get::<BoxShadow>(entity_for(&world, "ui_shadowed"))
        .unwrap();
    assert_eq!(shadow.0.len(), 1);
    assert_eq!(shadow.0[0].blur_radius, px(14.0));
    assert_eq!(shadow.0[0].y_offset, px(6.0));
}

#[test]
fn scroll_style_sets_and_patches_scroll_position() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_lane",
            "panel",
            AtomeUiStyle {
                overflow: Some("scroll_x".to_string()),
                scroll: Some([24.0, 0.0]),
                ..default()
            },
        )],
    );
    let entity = entity_for(&world, "ui_lane");
    assert_eq!(world.get::<ScrollPosition>(entity).unwrap().0.x, 24.0);
    apply_ui_ops(
        &mut world,
        vec![AtomeUiOp::UpdateNodeStyle {
            id: "ui_lane".to_string(),
            style: AtomeUiStyle {
                scroll: Some([120.0, 0.0]),
                ..default()
            },
        }],
    );
    assert_eq!(world.get::<ScrollPosition>(entity).unwrap().0.x, 120.0);
}

#[test]
fn per_corner_radius_overrides_uniform_radius() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_band",
            "panel",
            AtomeUiStyle {
                radius: Some(4.0),
                radius_corners: Some([0.0, 0.0, 12.0, 12.0]),
                ..default()
            },
        )],
    );
    let node = world.get::<Node>(entity_for(&world, "ui_band")).unwrap();
    assert_eq!(node.border_radius.top_left, px(0.0));
    assert_eq!(node.border_radius.bottom_right, px(12.0));
    assert_eq!(node.border_radius.bottom_left, px(12.0));
}

#[test]
fn text_align_and_line_height_apply_to_text_nodes() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_centered",
            "label",
            AtomeUiStyle {
                text_align: Some("center".to_string()),
                line_height: Some(22.0),
                ..default()
            },
        )],
    );
    let entity = entity_for(&world, "ui_centered");
    assert_eq!(
        world.get::<TextLayout>(entity).unwrap().justify,
        Justify::Center
    );
    assert_eq!(
        *world.get::<bevy::text::LineHeight>(entity).unwrap(),
        bevy::text::LineHeight::Px(22.0)
    );
}

#[test]
fn mount_time_style_opacity_applies_to_subtree() {
    let mut world = World::new();
    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_ghost",
            "panel",
            AtomeUiStyle {
                background: Some([1.0, 0.0, 0.0, 1.0]),
                opacity: Some(0.5),
                ..default()
            },
        )],
    );
    let entity = entity_for(&world, "ui_ghost");
    assert!((world.get::<BackgroundColor>(entity).unwrap().0.alpha() - 0.5).abs() < 1e-5);
}

#[test]
fn registered_roboto_weights_map_to_nearest_font_handle() {
    let mut world = World::new();
    world.init_resource::<Assets<Font>>();
    let base =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/assets/fonts/Roboto");
    let regular = std::fs::read(base.join("Roboto-Regular.ttf")).unwrap();
    let bold = std::fs::read(base.join("Roboto-Bold.ttf")).unwrap();
    register_ui_font(&mut world, 400, regular).unwrap();
    register_ui_font(&mut world, 700, bold).unwrap();

    let table = world.resource::<AtomeUiFontTable>().clone();
    let regular_handle = table.handle_for_weight(400).unwrap();
    let bold_handle = table.handle_for_weight(700).unwrap();
    assert_ne!(regular_handle, bold_handle);
    assert_eq!(table.handle_for_weight(450).unwrap(), regular_handle);
    assert_eq!(table.handle_for_weight(800).unwrap(), bold_handle);

    mount_styled_tree(
        &mut world,
        vec![styled_node(
            "ui_bold_label",
            "label",
            AtomeUiStyle {
                font_weight: Some(700.0),
                ..default()
            },
        )],
    );
    let entity = entity_for(&world, "ui_bold_label");
    assert_eq!(
        world.get::<TextFont>(entity).unwrap().font,
        FontSource::Handle(bold_handle)
    );
}

fn button_node(id: &str) -> AtomeUiNode {
    AtomeUiNode {
        id: id.to_string(),
        kind: "button".to_string(),
        text: Some("Go".to_string()),
        image: None,
        style: AtomeUiStyle {
            size: Some([120.0, 40.0]),
            background: Some([0.2, 0.3, 0.4, 1.0]),
            ..default()
        },
        children: Vec::new(),
    }
}

fn set_interaction_and_cursor(
    world: &mut World,
    id: &str,
    interaction: Interaction,
    normalized: Option<Vec2>,
) {
    let entity = entity_for(world, id);
    // Unit tests spawn entities directly (no `App`/UI layout schedule), so
    // `ComputedNode` never gets its real size from `ui_layout_system`; pin it
    // to the node's declared style size so node-local position math is
    // meaningful.
    world.get_mut::<ComputedNode>(entity).unwrap().size = Vec2::new(120.0, 40.0);
    *world.get_mut::<Interaction>(entity).unwrap() = interaction;
    world
        .get_mut::<RelativeCursorPosition>(entity)
        .unwrap()
        .normalized = normalized;
}

fn run_interaction_collection(world: &mut World) {
    let mut schedule = Schedule::default();
    schedule.add_systems(collect_ui_interactions);
    schedule.run(world);
}

fn drained_kinds(world: &mut World) -> Vec<(String, f32, f32, f32, f32)> {
    drain_ui_events(world)
        .into_iter()
        .map(|event| (event.event, event.x, event.y, event.delta_x, event.delta_y))
        .collect()
}

#[test]
fn hover_press_release_activate_sequence_carries_node_local_position() {
    let mut world = World::new();
    mount_styled_tree(&mut world, vec![button_node("ui_btn")]);
    world.insert_resource(Messages::<MouseWheel>::default());

    set_interaction_and_cursor(
        &mut world,
        "ui_btn",
        Interaction::Hovered,
        Some(Vec2::new(0.25, 0.5)),
    );
    run_interaction_collection(&mut world);
    let hover = drained_kinds(&mut world);
    assert_eq!(hover, vec![("hover".to_string(), 30.0, 20.0, 0.0, 0.0)]);

    set_interaction_and_cursor(
        &mut world,
        "ui_btn",
        Interaction::Pressed,
        Some(Vec2::new(0.25, 0.5)),
    );
    run_interaction_collection(&mut world);
    assert_eq!(
        drained_kinds(&mut world),
        vec![("press".to_string(), 30.0, 20.0, 0.0, 0.0)]
    );

    set_interaction_and_cursor(
        &mut world,
        "ui_btn",
        Interaction::Hovered,
        Some(Vec2::new(0.25, 0.5)),
    );
    run_interaction_collection(&mut world);
    assert_eq!(
        drained_kinds(&mut world),
        vec![
            ("release".to_string(), 30.0, 20.0, 0.0, 0.0),
            ("activate".to_string(), 30.0, 20.0, 0.0, 0.0),
        ]
    );

    set_interaction_and_cursor(
        &mut world,
        "ui_btn",
        Interaction::None,
        Some(Vec2::new(0.25, 0.5)),
    );
    run_interaction_collection(&mut world);
    assert_eq!(
        drained_kinds(&mut world),
        vec![("blur".to_string(), 30.0, 20.0, 0.0, 0.0)]
    );
}

#[test]
fn press_then_release_outside_emits_release_without_activate() {
    let mut world = World::new();
    mount_styled_tree(&mut world, vec![button_node("ui_btn_cancel")]);
    world.insert_resource(Messages::<MouseWheel>::default());

    set_interaction_and_cursor(
        &mut world,
        "ui_btn_cancel",
        Interaction::Pressed,
        Some(Vec2::new(0.5, 0.5)),
    );
    run_interaction_collection(&mut world);
    drain_ui_events(&mut world);

    set_interaction_and_cursor(
        &mut world,
        "ui_btn_cancel",
        Interaction::None,
        Some(Vec2::new(0.5, 0.5)),
    );
    run_interaction_collection(&mut world);
    assert_eq!(
        drained_kinds(&mut world),
        vec![("release".to_string(), 60.0, 20.0, 0.0, 0.0)]
    );
}

#[test]
fn drag_emits_delta_every_frame_while_pressed_even_without_interaction_change() {
    let mut world = World::new();
    mount_styled_tree(&mut world, vec![button_node("ui_btn_drag")]);
    world.insert_resource(Messages::<MouseWheel>::default());

    set_interaction_and_cursor(
        &mut world,
        "ui_btn_drag",
        Interaction::Pressed,
        Some(Vec2::new(0.0, 0.5)),
    );
    run_interaction_collection(&mut world);
    drain_ui_events(&mut world); // consume the initial "press"

    // Interaction component itself is untouched (stays Pressed) — only the
    // cursor position moves, exactly like a real multi-frame drag gesture.
    world
        .get_mut::<RelativeCursorPosition>(entity_for(&world, "ui_btn_drag"))
        .unwrap()
        .normalized = Some(Vec2::new(0.5, 0.5));
    run_interaction_collection(&mut world);
    let dragged = drained_kinds(&mut world);
    assert_eq!(dragged.len(), 1);
    assert_eq!(dragged[0].0, "drag");
    assert!(
        (dragged[0].3 - 60.0).abs() < 1e-4,
        "delta_x should be 60px: {:?}",
        dragged[0]
    );
    assert_eq!(dragged[0].4, 0.0);

    // No further cursor movement → no spurious drag event.
    run_interaction_collection(&mut world);
    assert!(drained_kinds(&mut world).is_empty());
}

#[test]
fn wheel_event_reaches_hovered_node_with_summed_delta() {
    let mut world = World::new();
    mount_styled_tree(&mut world, vec![button_node("ui_btn_wheel")]);
    world.insert_resource(Messages::<MouseWheel>::default());
    set_interaction_and_cursor(
        &mut world,
        "ui_btn_wheel",
        Interaction::Hovered,
        Some(Vec2::new(0.5, 0.5)),
    );
    run_interaction_collection(&mut world);
    drain_ui_events(&mut world); // consume "hover"

    let window = world.spawn_empty().id();
    world
        .resource_mut::<Messages<MouseWheel>>()
        .write(MouseWheel {
            unit: bevy::input::mouse::MouseScrollUnit::Pixel,
            x: 0.0,
            y: -12.0,
            window,
            phase: TouchPhase::Moved,
        });
    world
        .resource_mut::<Messages<MouseWheel>>()
        .write(MouseWheel {
            unit: bevy::input::mouse::MouseScrollUnit::Pixel,
            x: 0.0,
            y: -8.0,
            window,
            phase: TouchPhase::Moved,
        });
    run_interaction_collection(&mut world);
    let events = drained_kinds(&mut world);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].0, "wheel");
    assert_eq!(events[0].4, -20.0);
}

#[test]
fn wheel_event_ignored_when_node_not_hovered_or_pressed() {
    let mut world = World::new();
    mount_styled_tree(&mut world, vec![button_node("ui_btn_idle")]);
    world.insert_resource(Messages::<MouseWheel>::default());
    let window = world.spawn_empty().id();
    world
        .resource_mut::<Messages<MouseWheel>>()
        .write(MouseWheel {
            unit: bevy::input::mouse::MouseScrollUnit::Pixel,
            x: 0.0,
            y: -12.0,
            window,
            phase: TouchPhase::Moved,
        });
    run_interaction_collection(&mut world);
    assert!(drained_kinds(&mut world).is_empty());
}
