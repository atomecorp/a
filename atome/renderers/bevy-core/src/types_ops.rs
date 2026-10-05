use serde::Deserialize;

use crate::types::{
    default_transform_origin, default_transform_scale, AtomeBackdropStyle, AtomeColorFilters,
    AtomeMaskStyle, AtomeProceduralSdf, AtomeRenderNode, AtomeSceneEffectsPatch, AtomeShadowStyle,
    AtomeTexture, AtomeTransition,
};

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTransformPatch {
    pub id: String,
    pub logical_position: [f32; 2],
    pub logical_size: [f32; 2],
    #[serde(default = "default_transform_scale")]
    pub scale: [f32; 2],
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_transform_origin")]
    pub origin: [f32; 2],
    #[serde(default)]
    pub clip_rect: Option<[f32; 4]>,
    #[serde(default)]
    pub clip_rotation: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeSurfacePatch {
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub pixel_width: Option<f32>,
    #[serde(default)]
    pub pixel_height: Option<f32>,
    #[serde(default)]
    pub device_pixel_ratio: Option<f32>,
}

impl AtomeSurfacePatch {
    pub fn logical(width: f32, height: f32) -> Self {
        Self {
            width,
            height,
            pixel_width: None,
            pixel_height: None,
            device_pixel_ratio: None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AtomeSurfaceBackgroundPatch {
    pub signature: String,
    pub color: [f32; 4],
    pub texture: Option<AtomeTexture>,
    /// An animated wallpaper: one hidden `<video>` the page registers under
    /// `id` in the video source lookup. One quad covers the surface with a centred crop.
    #[serde(default)]
    pub video: Option<AtomeSurfaceBackgroundVideoSource>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AtomeSurfaceBackgroundVideoSource {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

impl AtomeSurfaceBackgroundPatch {
    /// The animated wallpaper, when one with a usable size is carried.
    pub fn video_source(&self) -> Option<&AtomeSurfaceBackgroundVideoSource> {
        self.video
            .as_ref()
            .filter(|video| !video.id.trim().is_empty() && video.width > 0 && video.height > 0)
    }


}


/// Un double Option doit distinguer trois etats : la cle absente du patch
/// (`None`), la cle presente a `null` (`Some(None)`, le document retire la
/// retouche) et la cle presente avec une valeur (`Some(Some(v))`). La
/// derivation serde, elle, ecrase `null` en `None` et confond donc le retrait
/// avec l'absence : c'est ce qui faisait qu'une ombre ou un arrondi supprime
/// dans l'app ne disparaissait jamais a l'ecran. Ce deserialiseur force la
/// couche exterieure a `Some` des que la cle est presente.
fn deserialize_clearing<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeStylePatch {
    pub id: String,
    pub color: Option<[f32; 4]>,
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub shadow: Option<Option<AtomeShadowStyle>>,
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub backdrop: Option<Option<AtomeBackdropStyle>>,
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub surface_paint: Option<Option<crate::surface_paint::SurfacePaint>>,
    pub selected: Option<bool>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub playback_progress: Option<Option<f32>>,
    #[serde(default)]
    pub filters: Option<AtomeColorFilters>,
    #[serde(default)]
    pub transition: Option<AtomeTransition>,
    #[serde(default)]
    pub procedural: Option<AtomeProceduralSdf>,
    // Les retouches NON destructives d'un objet deja pose : l'arrondi, la
    // variante de forme et le masque. Elles arrivent par le style parce que
    // l'objet garde son entite, sa pose et son calque ; sans ces champs le
    // renderer ignorait le patch et l'ecran gardait la valeur de la creation.
    #[serde(default)]
    pub corner_radius: Option<f32>,
    /// Un double Option : Some(None) veut dire que le document a RETIRE
    /// l'arrondi par coins (le rayon scalaire reprend alors la main), et None
    /// que le patch n'en parle pas du tout.
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub corner_radii: Option<Option<[f32; 4]>>,
    #[serde(default)]
    pub shape_variant: Option<String>,
    #[serde(default)]
    pub star_branches: Option<u32>,
    #[serde(default)]
    pub star_inner_radius: Option<f32>,
    #[serde(default)]
    pub polygon_sides: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub mask: Option<Option<AtomeMaskStyle>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeParentPatch {
    pub id: String,
    pub parent_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeLayerPatch {
    pub id: String,
    pub layer: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeVisibilityPatch {
    pub id: String,
    pub visible: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeTextPatch {
    pub id: String,
    pub text: Option<String>,
    pub texture: Option<AtomeTexture>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeResourcePatch {
    pub id: String,
    pub source: Option<String>,
    pub texture_size: Option<[u32; 2]>,
    #[serde(default, deserialize_with = "deserialize_clearing")]
    pub uv_rect: Option<Option<[f32; 4]>>,
    pub texture: Option<AtomeTexture>,
    pub peaks: Option<Vec<f32>>,
}

#[derive(Clone, Debug)]
pub enum AtomeRenderOp {
    Spawn(AtomeRenderNode),
    Despawn(String),
    Transform(AtomeTransformPatch),
    Style(AtomeStylePatch),
    Reparent(AtomeParentPatch),
    Layer(AtomeLayerPatch),
    Visibility(AtomeVisibilityPatch),
    Text(AtomeTextPatch),
    Resource(AtomeResourcePatch),
    Surface(AtomeSurfacePatch),
    SurfaceBackground(AtomeSurfaceBackgroundPatch),
    SceneEffects(AtomeSceneEffectsPatch),
    ProjectView(crate::project_view::AtomeProjectViewPatch),
    ProjectSpace(crate::project_view::AtomeProjectSpacePatch),
}
