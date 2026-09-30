//! Les SILHOUETTES de l'outil Shape : carre, cercle, etoile et polygone.
//!
//! Une forme reste l'atome `shape` que le reste du moteur connait : aucune
//! primitive nouvelle, seulement une silhhouette de plus a decouper. Le carre
//! et le cercle sont les deux variantes du cadre (le carre reutilise
//! exactement le champ de distance du rectangle arrondi) ; l'etoile et le
//! polygone sont evalues ici par un SDF, ce qui donne du meme geste :
//!   - le masque alpha qui peint la forme (`image_handle_from_shape_mask`) ;
//!   - la silhouette dont l'ombre se deduit (bloc comme portee) ;
//!   - l'ARRONDI DES SOMMETS demandee par le panneau Arrondi, qui porte sur les
//!     pointes et les creux — pas sur le cadre, qui n'existe plus.
//!
//! Tout est calcule dans le repere de la forme : X vers le premier pic, Y vers
//! la droite, origine au centre. La rotation entre ce repere et l'image (dont
//! l'axe Y descend) est faite une seule fois, dans `resolve`.

use std::f32::consts::TAU;

use serde::Deserialize;

use bevy::{
    asset::RenderAssetUsages,
    image::{Image, ImageSampler},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::components::{AtomeRoundedRectMaskCache, AtomeRoundedRectMaskCacheKey};
use crate::types::{AtomeMaskPlacement, AtomeMaskStyle, AtomeRenderNode, AtomeTexture};
use crate::texture::{corner_radii_are_zero, rounded_rect_signed_distance, AtomeCornerRadii};

pub const STAR_BRANCHES_MIN: u32 = 3;
pub const STAR_BRANCHES_MAX: u32 = 20;
pub const POLYGON_SIDES_MIN: u32 = 3;
pub const POLYGON_SIDES_MAX: u32 = 12;
pub const STAR_BRANCHES_FALLBACK: u32 = 5;
pub const POLYGON_SIDES_FALLBACK: u32 = 6;
pub const STAR_INNER_RADIUS_FALLBACK: f32 = 0.5;
pub const STAR_INNER_RADIUS_MIN: f32 = 0.15;
pub const STAR_INNER_RADIUS_MAX: f32 = 0.95;

/// Les quatre variantes de l'outil. `Square` est le defaut : un document ecrit
/// avant l'outil ne porte aucune variante et doit continuer a peindre le
/// rectangle arrondi qu'il peignait.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
// Une variante INCONNUE ne doit jamais faire tomber la scene entiere : elle est
// lue comme une chaine et ramenee au carre, exactement comme le rail le fait.
#[serde(from = "String")]
pub enum AtomeShapeVariant {
    #[default]
    Square,
    Circle,
    Star,
    Polygon,
}

impl AtomeShapeVariant {
    pub fn from_name(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "circle" => Self::Circle,
            "star" => Self::Star,
            "polygon" => Self::Polygon,
            _ => Self::Square,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Square => "square",
            Self::Circle => "circle",
            Self::Star => "star",
            Self::Polygon => "polygon",
        }
    }

    /// La variante entre dans la cle du cache de masques : deux variantes ne
    /// doivent jamais partager une texture.
    pub(crate) fn cache_code(self) -> u32 {
        match self {
            Self::Square => 0,
            Self::Circle => 1,
            Self::Star => 2,
            Self::Polygon => 3,
        }
    }
}

impl From<String> for AtomeShapeVariant {
    fn from(value: String) -> Self {
        Self::from_name(&value)
    }
}

/// Les reglages d'une variante, bornes comme le rail les borne.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(from = "AtomeShapeGeometryWire")]
pub struct AtomeShapeGeometry {
    pub variant: AtomeShapeVariant,
    pub star_branches: u32,
    pub star_inner_radius: f32,
    pub polygon_sides: u32,
}

impl Default for AtomeShapeGeometry {
    fn default() -> Self {
        Self {
            variant: AtomeShapeVariant::Square,
            star_branches: STAR_BRANCHES_FALLBACK,
            star_inner_radius: STAR_INNER_RADIUS_FALLBACK,
            polygon_sides: POLYGON_SIDES_FALLBACK,
        }
    }
}

impl AtomeShapeGeometry {
    pub fn new(variant: AtomeShapeVariant) -> Self {
        Self {
            variant,
            ..Self::default()
        }
    }

    pub fn normalized(self) -> Self {
        Self {
            variant: self.variant,
            star_branches: self.star_branches.clamp(STAR_BRANCHES_MIN, STAR_BRANCHES_MAX),
            // Un rayon interne hors bornes donnerait soit une etoile
            // confondue avec son polygone, soit une etoile repliee sur
            // elle-meme : les deux sont ramenes dans les bornes du rail.
            star_inner_radius: if self.star_inner_radius.is_finite() {
                self.star_inner_radius.clamp(STAR_INNER_RADIUS_MIN, STAR_INNER_RADIUS_MAX)
            } else {
                STAR_INNER_RADIUS_FALLBACK
            },
            polygon_sides: self.polygon_sides.clamp(POLYGON_SIDES_MIN, POLYGON_SIDES_MAX),
        }
    }
}

/// La geometrie que le noeud demande. Une propriete absente laisse la valeur
/// par defaut de sa variante : c'est le rail qui borne, et cette lecture ne fait
/// que reappliquer les memes bornes a un document edite a la main.
impl AtomeRenderNode {
    pub fn shape_geometry(&self) -> AtomeShapeGeometry {
        let variant = self
            .shape_variant
            .as_deref()
            .map(AtomeShapeVariant::from_name)
            .unwrap_or_default();
        let number = |value: Option<f32>, fallback: f32| -> f32 {
            match value {
                Some(parsed) if parsed.is_finite() => parsed,
                _ => fallback,
            }
        };
        AtomeShapeGeometry {
            variant,
            star_branches: number(self.star_branches, STAR_BRANCHES_FALLBACK as f32) as u32,
            star_inner_radius: number(self.star_inner_radius, STAR_INNER_RADIUS_FALLBACK),
            polygon_sides: number(self.polygon_sides, POLYGON_SIDES_FALLBACK as f32) as u32,
        }
        .normalized()
    }
}

// Le contrat de lecture : chaque champ absent retombe sur le defaut de SA
// variante — un document ecrit avant l'outil Shape ne porte aucun de ces
// nombres, et un `star_branches` manquant ne doit pas valoir zero.
#[derive(Clone, Copy, Debug, Deserialize)]
struct AtomeShapeGeometryWire {
    #[serde(default)]
    variant: AtomeShapeVariant,
    #[serde(default = "default_star_branches")]
    star_branches: u32,
    #[serde(default = "default_star_inner_radius")]
    star_inner_radius: f32,
    #[serde(default = "default_polygon_sides")]
    polygon_sides: u32,
}

fn default_star_branches() -> u32 {
    STAR_BRANCHES_FALLBACK
}

fn default_star_inner_radius() -> f32 {
    STAR_INNER_RADIUS_FALLBACK
}

fn default_polygon_sides() -> u32 {
    POLYGON_SIDES_FALLBACK
}

impl From<AtomeShapeGeometryWire> for AtomeShapeGeometry {
    fn from(wire: AtomeShapeGeometryWire) -> Self {
        Self {
            variant: wire.variant,
            star_branches: wire.star_branches,
            star_inner_radius: wire.star_inner_radius,
            polygon_sides: wire.polygon_sides,
        }
        .normalized()
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
struct AtomeShapeSilhouetteWire {
    #[serde(default)]
    geometry: AtomeShapeGeometry,
    #[serde(default)]
    width: f32,
    #[serde(default)]
    height: f32,
    #[serde(default)]
    corner_radii: AtomeCornerRadii,
}

impl From<AtomeShapeSilhouetteWire> for AtomeShapeSilhouette {
    fn from(wire: AtomeShapeSilhouetteWire) -> Self {
        Self {
            geometry: wire.geometry.normalized(),
            width: wire.width,
            height: wire.height,
            corner_radii: wire.corner_radii.map(|radius| if radius.is_finite() { radius.max(0.0) } else { 0.0 }),
        }
    }
}

/// Une silhouette placee dans sa boite : la geometrie de la variante, les
/// dimensions du noeud et l'arrondi demande.
// `Default` est la silhouette INUTILISABLE (taille nulle) : un masque qui
// n'aurait pas ete resolu est ignore, il n'efface jamais l'objet qu'il devait
// decouper.
#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize)]
#[serde(from = "AtomeShapeSilhouetteWire")]
pub struct AtomeShapeSilhouette {
    pub geometry: AtomeShapeGeometry,
    pub width: f32,
    pub height: f32,
    pub corner_radii: AtomeCornerRadii,
}

impl AtomeShapeSilhouette {
    /// Le rectangle arrondi historique : c'est la silhouette de tout ce qui
    /// n'est pas une forme a pointes, et celle de l'ombre des medias.
    pub fn rect(width: f32, height: f32, corner_radii: AtomeCornerRadii) -> Self {
        Self {
            geometry: AtomeShapeGeometry::default(),
            width,
            height,
            corner_radii,
        }
    }

    /// L'arrondi des SOMMETS, en px. Sur une etoile ou un polygone les quatre
    /// coins du cadre n'existent plus : le rayon qui arrondit est donc le plus
    /// grand demande, pour qu'un seul curseur de coin deplace se voie.
    pub(crate) fn vertex_rounding(&self) -> f32 {
        let scalar = self
            .corner_radii
            .iter()
            .fold(0.0_f32, |accumulator, value| accumulator.max(*value));
        let limit = self.width.min(self.height) / 2.0;
        scalar.max(0.0).min(limit.max(0.0))
    }

    /// Un masque de taille nulle ou negative ne decoupe rien : mieux vaut
    /// l'ignorer que peindre un objet entierement efface.
    pub fn is_usable(self) -> bool {
        self.width > 0.0 && self.height > 0.0
    }

    /// Vrai quand la silhouette n'est pas le simple rectangle plein : c'est ce
    /// qui decide si un masque doit etre genere.
    pub fn requires_mask(&self) -> bool {
        self.geometry.variant != AtomeShapeVariant::Square
            || !corner_radii_are_zero(self.corner_radii)
    }

    /// Le champ de distance signe, en px, de la forme placee dans sa boite.
    pub fn signed_distance(&self, x: f32, y: f32) -> f32 {
        let width = self.width.max(1.0);
        let height = self.height.max(1.0);
        if self.geometry.variant == AtomeShapeVariant::Square {
            return rounded_rect_signed_distance(x, y, width, height, self.corner_radii);
        }
        // Repere de la forme : l'image descend, le repere monte, et le premier
        // pic pointe vers le haut de l'ecran.
        let local = Vec2::new(-(y - height / 2.0), x - width / 2.0);
        let radius = width.min(height) / 2.0;
        match self.geometry.variant {
            AtomeShapeVariant::Circle => {
                // `50%` du CSS : un ovale inscrit des que la boite n'est pas
                // carree. `local.x` monte vers le haut de l'ecran et `local.y`
                // va vers la droite : chaque demi-axe divise SA dimension,
                // sinon un ovale large deborderait en hauteur sans jamais
                // atteindre ses bords gauche et droit.
                let vertical = height / 2.0;
                let horizontal = width / 2.0;
                let scaled =
                    Vec2::new(local.x / vertical, local.y / horizontal).length() - 1.0;
                scaled * vertical.min(horizontal)
            }
            AtomeShapeVariant::Star => star_signed_distance(
                local,
                radius,
                radius * self.geometry.star_inner_radius,
                self.geometry.star_branches,
                self.vertex_rounding(),
            ),
            AtomeShapeVariant::Polygon => polygon_signed_distance(
                local,
                radius,
                self.geometry.polygon_sides,
                self.vertex_rounding(),
            ),
            AtomeShapeVariant::Square => unreachable!("le rectangle est traite plus haut"),
        }
    }

    /// Force l'alpha d'un pixel de la boite, avec un bord d'un demi-pixel :
    /// c'est exactement la formule du masque rectangulaire arrondi, pour que
    /// changer de variante ne change jamais la douceur du contour.
    fn coverage(&self, x: f32, y: f32) -> f32 {
        let edge = -self.signed_distance(x, y);
        if edge >= 0.5 {
            1.0
        } else if edge <= -0.5 {
            0.0
        } else {
            edge + 0.5
        }
    }
}

fn segment_distance(p: Vec2, a: Vec2, b: Vec2) -> f32 {
    let ab = b - a;
    let length_squared = ab.length_squared();
    let t = if length_squared <= f32::EPSILON {
        0.0
    } else {
        ((p - a).dot(ab) / length_squared).clamp(0.0, 1.0)
    };
    (p - (a + ab * t)).length()
}

/// Le cote du segment ou tombe le point : positif a l'interieur de la forme.
fn segment_side(p: Vec2, a: Vec2, b: Vec2) -> f32 {
    let ab = b - a;
    ab.x * (p - a).y - ab.y * (p - a).x
}

/// Distance signee a un contour ferme donne par ses aretes, avec l'ARRONDI DES
/// SOMMETS : chaque arete est raccourcie de `rounding` a ses deux bouts et
/// chaque sommet recoit un disque du meme rayon. Le zero reste exactement sur le
/// contour arrondi, ce qui est tout ce qui compte pour un masque alpha.
fn rounded_contour_signed_distance(p: Vec2, edges: &[(Vec2, Vec2)], rounding: f32) -> f32 {
    let rounding = rounding.max(0.0);
    let mut best = f32::INFINITY;
    for (a, b) in edges.iter().copied() {
        let ab = b - a;
        let length = ab.length();
        if length <= f32::EPSILON {
            continue;
        }
        let direction = ab / length;
        let trim = rounding.min(length / 2.0);
        let start = a + direction * trim;
        let end = b - direction * trim;
        let side = segment_side(p, start, end);
        let distance = segment_distance(p, start, end);
        best = best.min(if side > 0.0 { -distance } else { distance });
        if rounding > 0.0 {
            best = best.min((p - a).length() - rounding);
            best = best.min((p - b).length() - rounding);
        }
    }
    best
}

/// Le point replie dans UN secteur de la symetrie d'ordre `branches`, ramene du
/// bon cote du premier pic.
fn folded_sector_point(p: Vec2, branches: u32) -> (Vec2, f32) {
    let n = branches.max(POLYGON_SIDES_MIN) as f32;
    let sector = TAU / n;
    let half = sector / 2.0;
    let angle = p.y.atan2(p.x);
    let folded = (angle + half).rem_euclid(sector) - half;
    let length = p.length();
    (
        Vec2::new(length * folded.cos(), (length * folded.sin()).abs()),
        half,
    )
}

/// L'etoile a `branches` pointes : un rayon exterieur pour les pics, un rayon
/// interieur pour les creux, et l'arrondi des deux familles de sommets.
fn star_signed_distance(
    p: Vec2,
    outer_radius: f32,
    inner_radius: f32,
    branches: u32,
    rounding: f32,
) -> f32 {
    let (local, half) = folded_sector_point(p, branches);
    let tip = Vec2::new(outer_radius, 0.0);
    let notch = Vec2::new(
        inner_radius * half.cos(),
        inner_radius * half.sin().abs(),
    );
    rounded_contour_signed_distance(local, &[(tip, notch)], rounding)
}

/// Le polygone REGULIER a `sides` sommets, pose sommet en haut comme l'etoile a
/// sa pointe : un rayon interieur egal au rayon exterieur est exactement ce
/// polygone, donc la meme arete sert aux deux variantes.
fn polygon_signed_distance(p: Vec2, radius: f32, sides: u32, rounding: f32) -> f32 {
    let (local, half) = folded_sector_point(p, sides);
    let vertex = Vec2::new(radius, 0.0);
    // Le sommet suivant est a `radius`, mais la moitie d'arete qui reste dans
    // le secteur s'arrete au MILIEU du cote : a l'apothem, `radius * cos(half)`.
    // Prendre le rayon gonfle le polygone d'un cote et le rogne de l'autre — et
    // emporte l'arrondi des sommets avec lui.
    let apothem = radius * half.cos();
    let neighbour = Vec2::new(apothem * half.cos(), (apothem * half.sin()).abs());
    rounded_contour_signed_distance(local, &[(vertex, neighbour)], rounding)
}

fn image_from_mask(width: u32, height: u32, rgba: Vec<u8>) -> Image {
    let mut image = Image::new(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        rgba,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    image.sampler = ImageSampler::linear();
    image
}

/// Le masque alpha d'une silhouette, au format d'une texture de sprite : les
/// trois canaux de couleur sont blancs et seul l'alpha porte la forme, comme le
/// masque rectangulaire arrondi qu'il remplace.
pub fn shape_mask_texture(silhouette: &AtomeShapeSilhouette) -> AtomeTexture {
    let width = silhouette.width.ceil().max(1.0) as u32;
    let height = silhouette.height.ceil().max(1.0) as u32;
    let mut rgba = vec![255; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let coverage = silhouette.coverage(x as f32 + 0.5, y as f32 + 0.5);
            rgba[(y as usize * width as usize + x as usize) * 4 + 3] =
                (coverage * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    AtomeTexture {
        animation: None,
        width,
        height,
        rgba,
    }
}

pub fn image_handle_from_shape_mask(
    images: &mut Assets<Image>,
    silhouette: &AtomeShapeSilhouette,
    id: &str,
) -> Result<Handle<Image>, String> {
    let texture = shape_mask_texture(silhouette);
    if texture.width == 0 || texture.height == 0 {
        return Err(format!("bevy_shape_mask_dimension_required:{id}"));
    }
    Ok(images.add(image_from_mask(texture.width, texture.height, texture.rgba)))
}

fn mask_cache_key(silhouette: &AtomeShapeSilhouette) -> AtomeRoundedRectMaskCacheKey {
    AtomeRoundedRectMaskCacheKey {
        width: silhouette.width.ceil().max(1.0) as u32,
        height: silhouette.height.ceil().max(1.0) as u32,
        radii: [
            (silhouette.corner_radii[0].max(0.0) * 100.0).round() as u32,
            (silhouette.corner_radii[1].max(0.0) * 100.0).round() as u32,
            (silhouette.corner_radii[2].max(0.0) * 100.0).round() as u32,
            (silhouette.corner_radii[3].max(0.0) * 100.0).round() as u32,
        ],
        variant: silhouette.geometry.variant.cache_code(),
        star_branches: silhouette.geometry.star_branches,
        star_inner_radius: (silhouette.geometry.star_inner_radius * 100.0).round() as u32,
        polygon_sides: silhouette.geometry.polygon_sides,
    }
}

/// Le masque d'une silhouette, memoise : le balayage est en O(largeur x hauteur)
/// sur le CPU et une forme pleine surface coute plusieurs millisecondes a
/// chaque apparition.
pub fn cached_image_handle_from_shape_mask(
    world: &mut World,
    silhouette: &AtomeShapeSilhouette,
    id: &str,
) -> Result<Handle<Image>, String> {
    if world.get_resource::<AtomeRoundedRectMaskCache>().is_none() {
        world.insert_resource(AtomeRoundedRectMaskCache::default());
    }
    let key = mask_cache_key(silhouette);
    let cached = world
        .resource::<AtomeRoundedRectMaskCache>()
        .handles
        .get(&key)
        .cloned();
    if let Some(handle) = cached {
        let exists = world
            .get_resource::<Assets<Image>>()
            .map(|images| images.contains(&handle))
            .unwrap_or(false);
        if exists {
            return Ok(handle);
        }
        let mut cache = world.resource_mut::<AtomeRoundedRectMaskCache>();
        cache.handles.remove(&key);
        cache.order.retain(|existing| existing != &key);
        cache.total_bytes = cache
            .total_bytes
            .saturating_sub(cache.byte_sizes.remove(&key).unwrap_or(0));
    }
    let handle = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_image_assets_required".to_string())?;
        image_handle_from_shape_mask(&mut images, silhouette, id)?
    };
    let mut cache = world.resource_mut::<AtomeRoundedRectMaskCache>();
    let byte_size = key.width as usize * key.height as usize * 4;
    if byte_size > cache.max_bytes {
        return Ok(handle);
    }
    if !cache.handles.contains_key(&key) {
        cache.order.push_back(key.clone());
    }
    cache.handles.insert(key.clone(), handle.clone());
    cache.byte_sizes.insert(key.clone(), byte_size);
    cache.total_bytes += byte_size;
    while cache.order.len() > cache.max_entries || cache.total_bytes > cache.max_bytes {
        if let Some(evicted) = cache.order.pop_front() {
            cache.handles.remove(&evicted);
            cache.total_bytes = cache
                .total_bytes
                .saturating_sub(cache.byte_sizes.remove(&evicted).unwrap_or(0));
        }
    }
    Ok(handle)
}

/// Applique une silhouette de masque a une texture deja rasterisee : l'alpha du
/// masque MULTIPLIE celui de la source, sans jamais toucher a ses couleurs. Une
/// taille de masque differente de celle de la source etire la silhouette, ce qui
/// est le comportement attendu quand le masque a ete redimensionne a la main.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn apply_mask_to_texture(
    texture: &AtomeTexture,
    silhouette: &AtomeShapeSilhouette,
) -> AtomeTexture {
    let width = texture.width.max(1);
    let height = texture.height.max(1);
    let mut rgba = texture.rgba.clone();
    let mask_width = silhouette.width.max(1.0);
    let mask_height = silhouette.height.max(1.0);
    for y in 0..height {
        let mask_y = (y as f32 + 0.5) * mask_height / height as f32;
        for x in 0..width {
            let mask_x = (x as f32 + 0.5) * mask_width / width as f32;
            let coverage = silhouette.coverage(mask_x, mask_y).clamp(0.0, 1.0);
            let offset = (y as usize * width as usize + x as usize) * 4 + 3;
            if offset >= rgba.len() {
                break;
            }
            let alpha = (rgba[offset] as f32 * coverage).round();
            rgba[offset] = alpha.clamp(0.0, 255.0) as u8;
        }
    }
    AtomeTexture {
        animation: texture.animation.clone(),
        width: texture.width,
        height: texture.height,
        rgba,
    }
}

fn local_to_world(
    point: Vec2,
    size: Vec2,
    position: Vec2,
    scale: Vec2,
    rotation_degrees: f32,
    origin: Vec2,
) -> Vec2 {
    let pivot = size * origin;
    let local = (point - pivot) * scale;
    let angle = rotation_degrees.to_radians();
    let rotated = Vec2::new(
        local.x * angle.cos() - local.y * angle.sin(),
        local.x * angle.sin() + local.y * angle.cos(),
    );
    position + pivot + rotated
}

fn world_to_local(
    point: Vec2,
    size: Vec2,
    position: Vec2,
    scale: Vec2,
    rotation_degrees: f32,
    origin: Vec2,
) -> Vec2 {
    let pivot = size * origin;
    let relative = point - position - pivot;
    let angle = -rotation_degrees.to_radians();
    let rotated = Vec2::new(
        relative.x * angle.cos() - relative.y * angle.sin(),
        relative.x * angle.sin() + relative.y * angle.cos(),
    );
    Vec2::new(
        if scale.x.abs() > f32::EPSILON { rotated.x / scale.x } else { f32::MAX },
        if scale.y.abs() > f32::EPSILON { rotated.y / scale.y } else { f32::MAX },
    ) + pivot
}

fn spatial_mask_coverage(
    mask: &AtomeMaskStyle,
    placement: AtomeMaskPlacement,
    target_point: Vec2,
) -> f32 {
    let target_size = Vec2::new(
        placement.target_size[0].max(1.0),
        placement.target_size[1].max(1.0),
    );
    let world = local_to_world(
        target_point,
        target_size,
        Vec2::from_array(placement.target_position),
        Vec2::from_array(placement.target_scale),
        placement.target_rotation,
        Vec2::from_array(placement.target_origin),
    );
    let source_size = Vec2::new(mask.silhouette.width.max(1.0), mask.silhouette.height.max(1.0));
    let source_point = world_to_local(
        world,
        source_size,
        Vec2::from_array(placement.source_position),
        Vec2::from_array(placement.source_scale),
        placement.source_rotation,
        Vec2::from_array(placement.source_origin),
    );
    if !mask.alpha.is_empty() {
        let width = mask.silhouette.width.ceil().max(1.0) as usize;
        let height = mask.silhouette.height.ceil().max(1.0) as usize;
        let x = source_point.x.floor() as isize;
        let y = source_point.y.floor() as isize;
        if x < 0 || y < 0 || x as usize >= width || y as usize >= height {
            return 0.0;
        }
        return mask.alpha[y as usize * width + x as usize] as f32 / 255.0;
    }
    mask.silhouette.coverage(source_point.x, source_point.y).clamp(0.0, 1.0)
}

fn resolved_mask_coverage(
    mask: &AtomeMaskStyle,
    target_point: Vec2,
    target_width: u32,
    target_height: u32,
) -> f32 {
    let own = match mask.placement {
        Some(placement) => spatial_mask_coverage(mask, placement, target_point),
        None => {
            let source_x = target_point.x * mask.silhouette.width.max(1.0) / target_width.max(1) as f32;
            let source_y = target_point.y * mask.silhouette.height.max(1.0) / target_height.max(1) as f32;
            if !mask.alpha.is_empty() {
                let width = mask.silhouette.width.ceil().max(1.0) as usize;
                let height = mask.silhouette.height.ceil().max(1.0) as usize;
                let x = source_x.floor().clamp(0.0, width.saturating_sub(1) as f32) as usize;
                let y = source_y.floor().clamp(0.0, height.saturating_sub(1) as f32) as usize;
                mask.alpha[y * width + x] as f32 / 255.0
            } else {
                mask.silhouette.coverage(source_x, source_y)
            }
        },
    };
    mask.layers.iter().fold(own, |coverage, layer| {
        coverage * resolved_mask_coverage(layer, target_point, target_width, target_height)
    }).clamp(0.0, 1.0)
}

/// Rasterise the source in this target's coordinate system. Unlike the legacy
/// helper above, this never stretches a mask independently over each group
/// child: non-overlapping pixels are transparent and rotations remain spatial.
pub(crate) fn mask_texture_for_target(mask: &AtomeMaskStyle, target_size: [f32; 2]) -> AtomeTexture {
    let width = target_size[0].ceil().max(1.0) as u32;
    let height = target_size[1].ceil().max(1.0) as u32;
    let mut rgba = vec![255; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let target_point = Vec2::new(x as f32 + 0.5, y as f32 + 0.5);
            let coverage = resolved_mask_coverage(mask, target_point, width, height);
            rgba[(y as usize * width as usize + x as usize) * 4 + 3] =
                (coverage * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    AtomeTexture { animation: None, width, height, rgba }
}

pub(crate) fn apply_spatial_mask_to_texture(
    texture: &AtomeTexture,
    mask: &AtomeMaskStyle,
) -> AtomeTexture {
    let width = texture.width.max(1);
    let height = texture.height.max(1);
    let target_size = mask.placement
        .map(|placement| placement.target_size)
        .unwrap_or([width as f32, height as f32]);
    let mask_texture = mask_texture_for_target(mask, target_size);
    let mut rgba = texture.rgba.clone();
    for y in 0..height {
        let mask_y = ((y as f32 + 0.5) * mask_texture.height as f32 / height as f32)
            .floor().clamp(0.0, mask_texture.height.saturating_sub(1) as f32) as usize;
        for x in 0..width {
            let mask_x = ((x as f32 + 0.5) * mask_texture.width as f32 / width as f32)
                .floor().clamp(0.0, mask_texture.width.saturating_sub(1) as f32) as usize;
            let alpha_offset = (y as usize * width as usize + x as usize) * 4 + 3;
            let mask_offset = (mask_y * mask_texture.width as usize + mask_x) * 4 + 3;
            if alpha_offset >= rgba.len() || mask_offset >= mask_texture.rgba.len() { continue; }
            rgba[alpha_offset] = ((rgba[alpha_offset] as u16 * mask_texture.rgba[mask_offset] as u16) / 255) as u8;
        }
    }
    AtomeTexture { animation: texture.animation.clone(), width: texture.width, height: texture.height, rgba }
}
