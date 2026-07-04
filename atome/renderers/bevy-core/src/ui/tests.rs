use super::*;
use crate::types::AtomeTexture;
use bevy::prelude::*;
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
                            255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0,
                            0,
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
