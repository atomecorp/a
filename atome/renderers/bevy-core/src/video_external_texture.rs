use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, Mesh, Mesh2d},
    prelude::*,
    render::{
        extract_component::{ExtractComponent, ExtractComponentPlugin},
        render_resource::PrimitiveTopology,
    },
};

use crate::types::{
    normalize_opacity, normalize_uv_rect, AtomeColorFilters, AtomeRenderNode, AtomeTransition,
};

#[derive(Clone, Debug, Component, ExtractComponent)]
pub struct AtomeVideoExternalTexture {
    pub id: String,
    pub layer: i32,
    pub opacity: f32,
    pub uv_rect: [f32; 4],
    pub filters: AtomeColorFilters,
    pub transition: AtomeTransition,
}

pub struct AtomeVideoExternalTexturePlugin;

impl Plugin for AtomeVideoExternalTexturePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(ExtractComponentPlugin::<AtomeVideoExternalTexture>::default());

        #[cfg(target_arch = "wasm32")]
        crate::video_external_web::build_web_external_texture_renderer(app);
    }
}

pub fn video_external_texture_component_from_node(
    node: &AtomeRenderNode,
) -> Option<AtomeVideoExternalTexture> {
    if node.kind != "video"
        || node
            .source
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
    {
        return None;
    }
    Some(AtomeVideoExternalTexture {
        id: node.id.clone(),
        layer: node.layer,
        opacity: normalize_opacity(node.opacity),
        uv_rect: normalize_uv_rect(node.uv_rect),
        filters: node
            .filters
            .unwrap_or_else(AtomeColorFilters::identity)
            .normalized(),
        transition: node
            .transition
            .unwrap_or_else(AtomeTransition::none)
            .normalized(),
    })
}

fn video_quad_uvs(uv_rect: [f32; 4]) -> Vec<[f32; 2]> {
    let [x, y, width, height] = normalize_uv_rect(Some(uv_rect));
    let left = x;
    let right = x + width;
    let top = y;
    let bottom = y + height;
    vec![[left, bottom], [right, bottom], [left, top], [right, top]]
}

pub fn insert_video_external_texture_component_for_node(
    world: &mut World,
    entity: Entity,
    node: &AtomeRenderNode,
) {
    if let Some(component) = video_external_texture_component_from_node(node) {
        world.entity_mut(entity).insert(component);
    }
}

pub fn video_quad_mesh_handle_from_size(
    meshes: &mut Assets<Mesh>,
    logical_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Handle<Mesh> {
    let width = logical_size[0].max(1.0);
    let height = logical_size[1].max(1.0);
    let half_width = width / 2.0;
    let half_height = height / 2.0;
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-half_width, -half_height, 0.0],
            [half_width, -half_height, 0.0],
            [-half_width, half_height, 0.0],
            [half_width, half_height, 0.0],
        ],
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, video_quad_uvs(uv_rect));
    mesh.insert_indices(Indices::U32(vec![0, 1, 2, 2, 1, 3]));
    meshes.add(mesh)
}

pub fn insert_video_quad_mesh(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Result<(), String> {
    let handle = {
        let mut meshes = world
            .get_resource_mut::<Assets<Mesh>>()
            .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        video_quad_mesh_handle_from_size(&mut meshes, logical_size, uv_rect)
    };
    world.entity_mut(entity).insert(Mesh2d(handle));
    Ok(())
}
