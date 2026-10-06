use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    mesh::{Indices, Mesh, Mesh2d},
    prelude::*,
    render::{
        extract_component::{ExtractComponent, ExtractComponentPlugin},
        render_resource::PrimitiveTopology,
    },
};

use crate::types::{
    normalize_opacity, normalize_uv_rect, AtomeColorFilters, AtomeMaskStyle, AtomeRenderNode,
    AtomeTransition,
};

#[derive(Clone, Debug, Component, ExtractComponent)]
pub struct AtomeVideoExternalTexture {
    pub id: String,
    pub layer: i32,
    pub opacity: f32,
    pub uv_rect: [f32; 4],
    pub filters: AtomeColorFilters,
    pub transition: AtomeTransition,
    /// La texture d'alpha du masque, cuite sur le CPU comme celle d'un sprite.
    /// Une texture EXTERNE (le flux de la balise `<video>`) ne peut pas etre
    /// recopiee : c'est donc le fragment shader qui echantillonne cette
    /// texture-la et compose l'alpha sur le GPU. `None` = pas de masque.
    pub mask_texture: Option<Handle<Image>>,
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
        mask_texture: None,
    })
}

/// La silhouette resolue d'un noeud video, cuite en texture d'alpha. Le masque
/// vient de la projection (elle seule connait l'atome source) : sans silhouette
/// utilisable, aucune texture n'est creee et la video reste entiere.
fn video_mask_texture_handle(world: &mut World, node: &AtomeRenderNode) -> Option<Handle<Image>> {
    let mask = node.mask.clone().and_then(AtomeMaskStyle::normalized)?;
    video_mask_handle_for_style(world, &mask, node.logical_size, &node.id)
}

fn video_mask_handle_for_style(
    world: &mut World,
    mask: &AtomeMaskStyle,
    logical_size: [f32; 2],
    id: &str,
) -> Option<Handle<Image>> {
    let texture = crate::shape_sdf::mask_texture_for_target(mask, logical_size);
    let mut images = world.get_resource_mut::<Assets<Image>>()?;
    crate::texture::image_handle_from_texture(&mut images, &Some(texture), &format!("{id}:mask")).ok()
}

/// Replaces only the alpha resource of a live external video. The entity, mesh,
/// HTMLVideoElement association and playback cursor remain untouched.
pub fn apply_video_mask_style(
    world: &mut World,
    entity: Entity,
    mask: Option<AtomeMaskStyle>,
) -> Result<(), String> {
    let size = world
        .get::<crate::types::AtomeLogicalSize>(entity)
        .copied()
        .ok_or_else(|| "bevy_video_mask_size_missing".to_string())?;
    let id = world
        .get::<crate::types::AtomeEntityId>(entity)
        .map(|value| value.0.clone())
        .ok_or_else(|| "bevy_video_mask_id_missing".to_string())?;
    let handle = mask
        .as_ref()
        .and_then(|value| video_mask_handle_for_style(world, value, [size.width, size.height], &id));
    let mut video = world
        .get_mut::<AtomeVideoExternalTexture>(entity)
        .ok_or_else(|| format!("bevy_video_external_texture_missing:{id}"))?;
    video.mask_texture = handle;
    Ok(())
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
    let Some(mut component) = video_external_texture_component_from_node(node) else {
        return;
    };
    // Une mise a jour de RESSOURCE (la source qui arrive, un uv_rect qui bouge)
    // reconstruit ce composant sans rejouer la projection : la silhouette deja
    // posee est conservee, sinon le masque disparaissait a la premiere mise a
    // jour de la video. Un masque retire, lui, passe par un respawn complet.
    component.mask_texture = video_mask_texture_handle(world, node).or_else(|| {
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .and_then(|video| video.mask_texture.clone())
    });
    world.entity_mut(entity).insert(component);
}

pub(crate) fn video_quad_mesh_from_size(logical_size: [f32; 2], uv_rect: [f32; 4]) -> Mesh {
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
    mesh
}

pub fn video_quad_mesh_handle_from_size(
    meshes: &mut Assets<Mesh>,
    logical_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Handle<Mesh> {
    meshes.add(video_quad_mesh_from_size(logical_size, uv_rect))
}

/// Le rectangle d'UV D'ORIGINE du quad video, porte par le quad lui-meme.
/// La decoupe par une page en a besoin pour calculer un sous-rectangle ; le lire
/// sur `AtomeVideoExternalTexture` ne suffit pas : ce composant peut manquer
/// (source pas encore resolue), et la video restait alors non decoupee.
#[derive(Component, Clone, Copy, PartialEq, Debug)]
pub struct AtomeVideoQuad(pub [f32; 4]);

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
    // Le quad repart de sa taille PLEINE : toute decoupe posee auparavant est
    // caduque. Sans cet oubli, la garde de decoupe croyait le travail deja fait
    // et la video ressortait de sa page des qu'une ressource changeait.
    world
        .entity_mut(entity)
        .insert((Mesh2d(handle), AtomeVideoQuad(uv_rect)))
        .remove::<crate::clip::AtomeVideoClipMesh>();
    Ok(())
}

/// Le meme quad, redimensionne et recoupe pour une decoupe : il ne touche PAS au
/// rectangle d'origine, sinon chaque decoupe se recouperait elle-meme.
pub fn insert_clipped_video_quad_mesh(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Result<(), String> {
    let current = world.get::<Mesh2d>(entity).map(|mesh| mesh.0.clone());
    let handle = {
        let mut meshes = world.get_resource_mut::<Assets<Mesh>>()
            .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        match current {
            Some(handle) => {
                // Update the resident quad instead of retaining a new asset per crop.
                *meshes.get_mut(&handle)
                    .ok_or_else(|| "bevy_video_quad_asset_required".to_string())?
                    = video_quad_mesh_from_size(logical_size, uv_rect);
                handle
            }
            None => video_quad_mesh_handle_from_size(&mut meshes, logical_size, uv_rect),
        }
    };
    world.entity_mut(entity).insert(Mesh2d(handle));
    Ok(())
}
