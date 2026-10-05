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

use bevy::prelude::*;

use crate::types::AtomeRenderNode;
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
    pub(crate) fn coverage(&self, x: f32, y: f32) -> f32 {
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

pub use crate::shape_texture::{shape_mask_texture, image_handle_from_shape_mask, cached_image_handle_from_shape_mask};
pub(crate) use crate::shape_texture::{apply_spatial_mask_to_texture, mask_texture_for_target};
#[cfg(test)]
pub(crate) use crate::shape_texture::apply_mask_to_texture;
