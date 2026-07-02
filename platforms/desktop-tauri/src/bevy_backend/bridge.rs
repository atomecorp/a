use serde_json::Value;

#[cfg(feature = "bevy_backend")]
mod native {
    use atome_bevy_renderer_core::{
        apply_render_ops, AtomeEntityTable, AtomeLayerPatch, AtomeParentPatch, AtomeRenderNode,
        AtomeRenderOp, AtomeRenderScene, AtomeRendererDiagnostics, AtomeResourcePatch,
        AtomeSceneEffectsPatch, AtomeStylePatch, AtomeSurfacePatch, AtomeTextPatch, AtomeTransformPatch,
        AtomeVisibilityPatch,
    };
    use bevy::prelude::*;
    use serde::Deserialize;
    use serde_json::{json, Value};
    use std::cell::RefCell;

    #[cfg(feature = "bevy_renderer_core")]
    use crate::bevy_backend::{build_atome_bevy_embedded_app, AtomeNativeBevyRendererConfig};
    #[cfg(feature = "bevy_renderer_core")]
    use bevy::app::Startup;

    struct NativeBevyRendererState {
        app: App,
        surface_id: String,
    }

    thread_local! {
        static NATIVE_RENDERER: RefCell<Option<NativeBevyRendererState>> = const { RefCell::new(None) };
    }

    fn parse_scene(scene: Value) -> Result<AtomeRenderScene, String> {
        serde_json::from_value(scene)
            .map_err(|error| format!("bevy_native_scene_decode_failed:{error}"))
    }

    fn renderer_summary(state: &NativeBevyRendererState) -> Value {
        let world = state.app.world();
        let diagnostics = world.resource::<AtomeRendererDiagnostics>();
        let node_count = world.resource::<AtomeEntityTable>().by_id.len();
        json!({
            "success": diagnostics.last_error.is_none(),
            "native": true,
            "presentable": false,
            "renderer_mode": "embedded_scene",
            "surface_id": state.surface_id,
            "node_count": node_count,
            "applied_ops": diagnostics.applied_ops,
            "last_error": diagnostics.last_error
        })
    }

    #[derive(Deserialize)]
    struct NativeRenderOpInput {
        #[serde(rename = "type")]
        op_type: String,
        #[serde(default)]
        id: Option<String>,
        #[serde(default)]
        node: Option<AtomeRenderNode>,
        #[serde(default)]
        patch: Option<Value>,
    }

    fn parse_patch<T>(value: Option<Value>, error_code: &str) -> Result<T, String>
    where
        T: for<'de> Deserialize<'de>,
    {
        let patch = value.ok_or_else(|| error_code.to_string())?;
        serde_json::from_value(patch).map_err(|error| format!("{error_code}:{error}"))
    }

    pub(super) fn parse_native_op(value: Value) -> Result<AtomeRenderOp, String> {
        let input: NativeRenderOpInput = serde_json::from_value(value)
            .map_err(|error| format!("bevy_native_op_decode_failed:{error}"))?;
        match input.op_type.trim() {
            "spawn" => input
                .node
                .map(AtomeRenderOp::Spawn)
                .ok_or_else(|| "bevy_native_spawn_node_required".to_string()),
            "despawn" => input
                .id
                .filter(|id| !id.trim().is_empty())
                .map(AtomeRenderOp::Despawn)
                .ok_or_else(|| "bevy_native_despawn_id_required".to_string()),
            "transform" => parse_patch::<AtomeTransformPatch>(
                input.patch,
                "bevy_native_transform_patch_required",
            )
            .map(AtomeRenderOp::Transform),
            "style" => {
                parse_patch::<AtomeStylePatch>(input.patch, "bevy_native_style_patch_required")
                    .map(AtomeRenderOp::Style)
            }
            "reparent" => {
                parse_patch::<AtomeParentPatch>(input.patch, "bevy_native_reparent_patch_required")
                    .map(AtomeRenderOp::Reparent)
            }
            "layer" => {
                parse_patch::<AtomeLayerPatch>(input.patch, "bevy_native_layer_patch_required")
                    .map(AtomeRenderOp::Layer)
            }
            "visibility" => parse_patch::<AtomeVisibilityPatch>(
                input.patch,
                "bevy_native_visibility_patch_required",
            )
            .map(AtomeRenderOp::Visibility),
            "text" => parse_patch::<AtomeTextPatch>(input.patch, "bevy_native_text_patch_required")
                .map(AtomeRenderOp::Text),
            "resource" => parse_patch::<AtomeResourcePatch>(
                input.patch,
                "bevy_native_resource_patch_required",
            )
            .map(AtomeRenderOp::Resource),
            "surface" => {
                parse_patch::<AtomeSurfacePatch>(input.patch, "bevy_native_surface_patch_required")
                    .map(AtomeRenderOp::Surface)
            }
            "scene_effects" => parse_patch::<AtomeSceneEffectsPatch>(
                input.patch,
                "bevy_native_scene_effects_patch_required",
            )
            .map(AtomeRenderOp::SceneEffects),
            other => Err(format!("bevy_native_op_unsupported:{other}")),
        }
    }

    pub fn start(
        surface_id: String,
        width: f32,
        height: f32,
        scene: Value,
    ) -> Result<Value, String> {
        #[cfg(not(feature = "bevy_renderer_core"))]
        {
            let _ = (surface_id, width, height, scene);
            return Err("bevy_native_renderer_core_feature_required".to_string());
        }
        #[cfg(feature = "bevy_renderer_core")]
        {
            let initial_scene = parse_scene(scene)?;
            let config = AtomeNativeBevyRendererConfig {
                width,
                height,
                initial_scene,
                ..AtomeNativeBevyRendererConfig::default()
            };
            let mut app = build_atome_bevy_embedded_app(config);
            app.world_mut().run_schedule(Startup);
            let state = NativeBevyRendererState { app, surface_id };
            let summary = renderer_summary(&state);
            NATIVE_RENDERER.with(|slot| {
                *slot.borrow_mut() = Some(state);
            });
            Ok(summary)
        }
    }

    pub fn apply_ops(surface_id: String, ops: Vec<Value>) -> Result<Value, String> {
        let render_ops = ops
            .into_iter()
            .map(parse_native_op)
            .collect::<Result<Vec<_>, _>>()?;
        NATIVE_RENDERER.with(|slot| {
            let mut guard = slot.borrow_mut();
            let state = guard
                .as_mut()
                .ok_or_else(|| "bevy_native_renderer_not_started".to_string())?;
            if state.surface_id != surface_id {
                return Err("bevy_native_surface_id_mismatch".to_string());
            }
            apply_render_ops(state.app.world_mut(), render_ops);
            Ok(renderer_summary(state))
        })
    }

    pub fn resize(surface_id: String, width: f32, height: f32) -> Result<Value, String> {
        NATIVE_RENDERER.with(|slot| {
            let mut guard = slot.borrow_mut();
            let state = guard
                .as_mut()
                .ok_or_else(|| "bevy_native_renderer_not_started".to_string())?;
            if state.surface_id != surface_id {
                return Err("bevy_native_surface_id_mismatch".to_string());
            }
            apply_render_ops(
                state.app.world_mut(),
                vec![AtomeRenderOp::Surface(AtomeSurfacePatch::logical(width, height))],
            );
            Ok(renderer_summary(state))
        })
    }
}

#[tauri::command]
pub fn bevy_native_start(
    surface_id: String,
    width: f32,
    height: f32,
    scene: Value,
) -> Result<Value, String> {
    #[cfg(feature = "bevy_backend")]
    {
        return native::start(surface_id, width, height, scene);
    }
    #[cfg(not(feature = "bevy_backend"))]
    {
        let _ = (surface_id, width, height, scene);
        Err("bevy_native_renderer_feature_required".to_string())
    }
}

#[tauri::command]
pub fn bevy_native_apply_ops(surface_id: String, ops: Vec<Value>) -> Result<Value, String> {
    #[cfg(feature = "bevy_backend")]
    {
        return native::apply_ops(surface_id, ops);
    }
    #[cfg(not(feature = "bevy_backend"))]
    {
        let _ = (surface_id, ops);
        Err("bevy_native_renderer_feature_required".to_string())
    }
}

#[tauri::command]
pub fn bevy_native_resize(surface_id: String, width: f32, height: f32) -> Result<Value, String> {
    #[cfg(feature = "bevy_backend")]
    {
        return native::resize(surface_id, width, height);
    }
    #[cfg(not(feature = "bevy_backend"))]
    {
        let _ = (surface_id, width, height);
        Err("bevy_native_renderer_feature_required".to_string())
    }
}

#[cfg(all(test, feature = "bevy_renderer_core"))]
mod tests {
    use super::*;
    use atome_bevy_renderer_core::AtomeRenderOp;
    use serde_json::json;

    #[test]
    fn native_bridge_decodes_spawn_and_transform_ops() {
        let spawn = native::parse_native_op(json!({
            "type": "spawn",
            "node": {
                "id": "image_native",
                "kind": "image",
                "parent_id": null,
                "logical_position": [4.0, 8.0],
                "logical_size": [40.0, 30.0],
                "layer": 2,
                "color": [1.0, 1.0, 1.0, 1.0],
                "text": null,
                "source": "/api/uploads/image.png",
                "texture": {
                    "width": 1,
                    "height": 1,
                    "rgba": [255, 0, 0, 255]
                },
                "peaks": null,
                "selected": false
            }
        }))
        .expect("native Bevy spawn op should decode");
        assert!(matches!(spawn, AtomeRenderOp::Spawn(_)));

        let transform = native::parse_native_op(json!({
            "type": "transform",
            "patch": {
                "id": "image_native",
                "logical_position": [10.0, 12.0],
                "logical_size": [44.0, 32.0]
            }
        }))
        .expect("native Bevy transform op should decode");
        assert!(matches!(transform, AtomeRenderOp::Transform(_)));
    }

    #[test]
    fn native_bridge_start_runs_embedded_scene_without_window_panic() {
        let result = native::start(
            "eve_surface_project".to_string(),
            800.0,
            600.0,
            json!({
                "nodes": [{
                    "id": "image_native_start",
                    "kind": "image",
                    "parent_id": null,
                    "logical_position": [12.0, 16.0],
                    "logical_size": [64.0, 48.0],
                    "layer": 3,
                    "color": [1.0, 1.0, 1.0, 1.0],
                    "text": null,
                    "source": "/api/uploads/image.png",
                    "texture": {
                        "width": 1,
                        "height": 1,
                        "rgba": [255, 0, 0, 255]
                    },
                    "peaks": null,
                    "selected": false
                }],
                "selection_style": null
            }),
        )
        .expect("native Bevy start should run the embedded scene");

        assert_eq!(result["success"], true);
        assert_eq!(result["native"], true);
        assert_eq!(result["presentable"], false);
        assert_eq!(result["renderer_mode"], "embedded_scene");
        assert_eq!(result["surface_id"], "eve_surface_project");
        assert_eq!(result["node_count"], 1);
    }
}
