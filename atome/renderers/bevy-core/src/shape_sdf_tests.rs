//! Les verifications de l'outil Shape : ce que chaque variante peint, ce que
//! l'arrondi de sommets lui fait, et ce que le masque en decoupe.

use bevy::prelude::*;

use crate::shape_sdf::{
    apply_mask_to_texture, cached_image_handle_from_shape_mask, image_handle_from_shape_mask,
    mask_texture_for_target, shape_mask_texture, AtomeShapeGeometry, AtomeShapeSilhouette, AtomeShapeVariant,
    POLYGON_SIDES_MAX, POLYGON_SIDES_MIN, STAR_BRANCHES_MAX, STAR_BRANCHES_MIN,
    STAR_INNER_RADIUS_MAX, STAR_INNER_RADIUS_MIN, STAR_INNER_RADIUS_FALLBACK,
};
use crate::texture::{image_handle_from_rounded_rect_mask, AtomeCornerRadii};
use crate::*;

fn alpha_at(texture: &AtomeTexture, x: u32, y: u32) -> u8 {
    let index = ((y as usize * texture.width as usize) + x as usize) * 4 + 3;
    texture.rgba[index]
}

fn star_silhouette(branches: u32, inner_radius: f32, size: f32) -> AtomeShapeSilhouette {
    AtomeShapeSilhouette {
        geometry: AtomeShapeGeometry {
            variant: AtomeShapeVariant::Star,
            star_branches: branches,
            star_inner_radius: inner_radius,
            polygon_sides: 6,
        },
        width: size,
        height: size,
        corner_radii: [0.0; 4],
    }
}

fn polygon_silhouette(sides: u32, size: f32) -> AtomeShapeSilhouette {
    AtomeShapeSilhouette {
        geometry: AtomeShapeGeometry {
            variant: AtomeShapeVariant::Polygon,
            star_branches: 5,
            star_inner_radius: 0.5,
            polygon_sides: sides,
        },
        width: size,
        height: size,
        corner_radii: [0.0; 4],
    }
}

#[test]
fn shape_variant_names_round_trip_and_unknown_names_are_squares() {
    assert_eq!(AtomeShapeVariant::from_name("circle"), AtomeShapeVariant::Circle);
    assert_eq!(AtomeShapeVariant::from_name(" STAR "), AtomeShapeVariant::Star);
    assert_eq!(AtomeShapeVariant::from_name("polygon"), AtomeShapeVariant::Polygon);
    assert_eq!(AtomeShapeVariant::from_name(""), AtomeShapeVariant::Square);
    // Une variante inventee ne doit jamais faire tomber la scene : elle est le
    // carre, exactement comme un document ecrit avant l'outil.
    assert_eq!(AtomeShapeVariant::from_name("hexagon"), AtomeShapeVariant::Square);
    assert_eq!(AtomeShapeVariant::Circle.as_str(), "circle");
}

#[test]
fn shape_geometry_bounds_match_the_rail() {
    let loose = AtomeShapeGeometry {
        variant: AtomeShapeVariant::Star,
        star_branches: 0,
        star_inner_radius: 4.0,
        polygon_sides: 99,
    }
    .normalized();
    assert_eq!(loose.star_branches, STAR_BRANCHES_MIN);
    assert_eq!(loose.star_inner_radius, STAR_INNER_RADIUS_MAX);
    assert_eq!(loose.polygon_sides, POLYGON_SIDES_MAX);

    let tight = AtomeShapeGeometry {
        variant: AtomeShapeVariant::Polygon,
        star_branches: 999,
        star_inner_radius: -1.0,
        polygon_sides: 1,
    }
    .normalized();
    assert_eq!(tight.star_branches, STAR_BRANCHES_MAX);
    assert_eq!(tight.star_inner_radius, STAR_INNER_RADIUS_MIN);
    assert_eq!(tight.polygon_sides, POLYGON_SIDES_MIN);

    let unreadable = AtomeShapeGeometry {
        variant: AtomeShapeVariant::Star,
        star_branches: 5,
        star_inner_radius: f32::NAN,
        polygon_sides: 6,
    }
    .normalized();
    assert_eq!(unreadable.star_inner_radius, STAR_INNER_RADIUS_FALLBACK);
}

#[test]
fn a_square_variant_reuses_the_rounded_rect_field_exactly() {
    let silhouette = AtomeShapeSilhouette {
        geometry: AtomeShapeGeometry::default(),
        width: 80.0,
        height: 40.0,
        corner_radii: [6.0, 0.0, 12.0, 4.0],
    };
    for y in 0..40 {
        for x in 0..80 {
            let expected = crate::texture::rounded_rect_signed_distance(
                x as f32 + 0.5,
                y as f32 + 0.5,
                80.0,
                40.0,
                [6.0, 0.0, 12.0, 4.0],
            );
            assert!((silhouette.signed_distance(x as f32 + 0.5, y as f32 + 0.5) - expected).abs() < 1e-6);
        }
    }
    assert!(silhouette.requires_mask());
    assert!(!AtomeShapeSilhouette::rect(10.0, 10.0, [0.0; 4]).requires_mask());
}

#[test]
fn a_circle_paints_an_ellipse_in_its_box() {
    let circle = AtomeShapeSilhouette {
        geometry: AtomeShapeGeometry {
            variant: AtomeShapeVariant::Circle,
            ..AtomeShapeGeometry::default()
        },
        width: 100.0,
        height: 100.0,
        corner_radii: [0.0; 4],
    };
    assert!((circle.signed_distance(50.0, 50.0) + 50.0).abs() < 0.01);
    // Le centre du premier pixel vaut un demi-pixel DANS le cercle : le contour
    // passe exactement sur le bord de la boite.
    assert!((circle.signed_distance(50.0, 0.5) + 0.5).abs() < 0.02);
    // Le coin de la boite est hors du cercle : c'est tout ce qui distingue la
    // variante du carre qu'elle remplace.
    assert!(circle.signed_distance(0.5, 0.5) > 0.0);

    // `50%` du CSS : un ovale inscrit des que la boite n'est pas carree, et
    // aucun demi-axe ne prend la place de l'autre.
    let oval = AtomeShapeSilhouette {
        width: 200.0,
        height: 100.0,
        ..circle
    };
    assert!(oval.signed_distance(100.0, 50.0) < 0.0);
    assert!((oval.signed_distance(100.0, 0.5) + 0.5).abs() < 0.02);
    // L'ovale touche ses bords horizontaux : le milieu du bord gauche est
    // dedans, pas dehors comme celui d'un cercle de rayon min(w, h) / 2.
    assert!(oval.signed_distance(0.5, 50.0) < 0.0);
    // Le coin gauche haut, lui, reste vide : la boite n'est pas remplie.
    assert!(oval.signed_distance(0.5, 2.0) > 0.0);
}

#[test]
fn a_star_points_up_and_keeps_its_notches() {
    let star = star_silhouette(5, 0.5, 100.0);
    let radius = 50.0;
    // La pointe du haut : le pixel juste sous le bord est dans l'etoile.
    assert!(star.signed_distance(50.0, 50.0 - radius + 1.0) < 0.0);
    // Le creux, a mi-chemin entre deux pointes, est hors de l'etoile des que le
    // rayon interieur est plus court que le rayon exterieur.
    let notch_angle = std::f32::consts::PI / 5.0;
    let notch = (
        50.0 + 0.9 * radius * notch_angle.sin(),
        50.0 - 0.9 * radius * notch_angle.cos(),
    );
    assert!(star.signed_distance(notch.0, notch.1) > 0.0);
    // Le coin de la boite, lui, est toujours vide.
    assert!(star.signed_distance(0.5, 0.5) > 0.0);

    let texture = shape_mask_texture(&star);
    assert_eq!(alpha_at(&texture, 50, 2), 255);
    assert_eq!(alpha_at(&texture, 1, 1), 0);
}

#[test]
fn a_star_with_more_branches_takes_more_of_its_box() {
    let five = shape_mask_texture(&star_silhouette(5, 0.5, 64.0));
    let twelve = shape_mask_texture(&star_silhouette(12, 0.5, 64.0));
    let painted = |texture: &AtomeTexture| {
        texture.rgba.chunks(4).filter(|pixel| pixel[3] > 0).count()
    };
    assert!(painted(&twelve) > painted(&five));
}

#[test]
fn a_polygon_is_bounded_by_its_apothem() {
    let hexagon = polygon_silhouette(6, 100.0);
    let radius = 50.0;
    // Un sommet est en haut : le pixel sous le bord est dans le polygone.
    assert!(hexagon.signed_distance(50.0, 50.0 - radius + 1.0) < 0.0);
    assert!(hexagon.signed_distance(0.5, 0.5) > 0.0);
    // Le milieu d'un cote est a l'apothem, a un demi-secteur du sommet : au
    // dela de cette distance, c'est dehors.
    let half = std::f32::consts::PI / 6.0;
    let apothem = radius * half.cos();
    let beyond = apothem + 4.0;
    let outside_edge = (
        50.0 + beyond * half.sin(),
        50.0 - beyond * half.cos(),
    );
    assert!(hexagon.signed_distance(outside_edge.0, outside_edge.1) > 0.0);
    let inside_edge = (
        50.0 + (apothem - 4.0) * half.sin(),
        50.0 - (apothem - 4.0) * half.cos(),
    );
    assert!(hexagon.signed_distance(inside_edge.0, inside_edge.1) < 0.0);
    assert_eq!(alpha_at(&shape_mask_texture(&hexagon), 50, 1), 255);
}

#[test]
fn vertex_rounding_cuts_the_tips_and_the_notches() {
    let sharp = polygon_silhouette(4, 100.0);
    let rounded = AtomeShapeSilhouette {
        corner_radii: [10.0; 4],
        ..sharp
    };
    let tip = (50.0, 50.0 - 50.0 + 0.5);
    // Le sommet arrondi recule de tout le rayon demande : la distance signee au
    // sommet vaut alors -rayon, la ou le sommet vif valait zero.
    assert!(sharp.signed_distance(tip.0, tip.1).abs() < 1.0);
    assert!((rounded.signed_distance(tip.0, tip.1) + 10.0).abs() < 1.0);
    // L'arrondi est borne par la demi-boite : un rayon absurde ne replie jamais
    // la forme sur elle-meme.
    let absurd = AtomeShapeSilhouette {
        corner_radii: [400.0; 4],
        ..sharp
    };
    assert_eq!(absurd.vertex_rounding(), 50.0);
    // Un seul coin demande suffit : c'est le plus grand qui arrondit les sommets.
    let one_corner = AtomeShapeSilhouette {
        corner_radii: [0.0, 6.0, 0.0, 0.0],
        ..sharp
    };
    assert_eq!(one_corner.vertex_rounding(), 6.0);
}

#[test]
fn a_node_reads_its_variant_and_its_defaults() {
    let mut node = AtomeRenderNode {
        shape_variant: Some("Star".to_string()),
        star_branches: Some(7.0),
        star_inner_radius: None,
        polygon_sides: None,
        ..AtomeRenderNode {
            project_space: false,
            id: "star_1".to_string(),
            kind: "shape".to_string(),
            parent_id: None,
            logical_position: [0.0, 0.0],
            logical_size: [120.0, 120.0],
            clip_rect: None,
            clip_rotation: 0.0,
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 0,
            opacity: 1.0,
            corner_radius: 0.0,
            corner_radii: None,
            shape_variant: None,
            star_branches: None,
            star_inner_radius: None,
            polygon_sides: None,
            shadow: None,
            surface_paint: None,
            backdrop: None,
            mask: None,
            mask_source: false,
            presentation: false,
            menu_plane: 0,
            color: None,
            text: None,
            source: None,
            texture_size: None,
            uv_rect: None,
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
            filters: None,
            transition: None,
            procedural: None,
        }
    };
    let geometry = node.shape_geometry();
    assert_eq!(geometry.variant, AtomeShapeVariant::Star);
    assert_eq!(geometry.star_branches, 7);
    assert_eq!(geometry.star_inner_radius, STAR_INNER_RADIUS_FALLBACK);
    assert_eq!(geometry.polygon_sides, 6);

    node.shape_variant = None;
    assert_eq!(node.shape_geometry().variant, AtomeShapeVariant::Square);
}

#[test]
fn a_generated_mask_carries_the_shape_and_is_cached() {
    let mut app = App::new();
    app.init_resource::<Assets<Image>>();
    let world = app.world_mut();
    let star = star_silhouette(5, 0.5, 48.0);
    let first = cached_image_handle_from_shape_mask(world, &star, "shape_1").unwrap();
    let second = cached_image_handle_from_shape_mask(world, &star, "shape_2").unwrap();
    assert_eq!(first, second);
    let other = cached_image_handle_from_shape_mask(
        world,
        &polygon_silhouette(6, 48.0),
        "shape_3",
    )
    .unwrap();
    assert_ne!(first, other);
}

#[test]
fn a_mask_multiplies_the_alpha_and_never_the_colors() {
    let mut rgba = Vec::new();
    for _ in 0..(8 * 4) {
        rgba.extend_from_slice(&[10, 20, 30, 255]);
    }
    let source = AtomeTexture {
        animation: None,
        width: 8,
        height: 4,
        rgba,
    };
    // Le masque est etire sur la BOITE de la source : une silhouette en etoile
    // laisse son centre opaque et vide les coins, la ou un rectangle plein ne
    // retirerait rien.
    let star = star_silhouette(5, 0.5, 4.0);
    let masked = apply_mask_to_texture(&source, &star);
    let alpha = |x: usize, y: usize| masked.rgba[(y * 8 + x) * 4 + 3];
    assert!(alpha(4, 2) > 200, "le centre de l'etoile reste peint");
    assert_eq!(alpha(0, 0), 0);
    assert_eq!(alpha(7, 0), 0);
    assert_eq!(alpha(0, 3), 0);
    assert_eq!(alpha(7, 3), 0);
    // Les couleurs des pixels effaces sont intactes : seul l'alpha a bouge.
    assert_eq!(masked.rgba[0..3], [10, 20, 30]);
    assert_eq!(masked.rgba[(4 * 4)..(4 * 4 + 3)], [10, 20, 30]);
    assert_eq!(masked.width, 8);
    assert_eq!(masked.height, 4);
    // Le masque MULTIPLIE l'alpha deja pose, il ne le remplace pas : un pixel a
    // demi transparent le reste, et un pixel efface reste efface.
    let mut faded = source.clone();
    faded.rgba[(2 * 8 + 4) * 4 + 3] = 128;
    let faded_masked = apply_mask_to_texture(&faded, &star);
    assert_eq!(faded_masked.rgba[(2 * 8 + 4) * 4 + 3], 128);
    assert_eq!(faded_masked.rgba[3], 0);
    // Un masque de la taille de la source ne retire rien.
    let identity = apply_mask_to_texture(&source, &AtomeShapeSilhouette::rect(8.0, 4.0, [0.0; 4]));
    assert!(identity.rgba.chunks(4).all(|pixel| pixel[3] == 255));
}

#[test]
fn an_unusable_mask_is_refused_and_never_erases_an_object() {
    let empty = AtomeMaskStyle {
        source_id: "shape_1".to_string(),
        mode: "alpha".to_string(),
        alpha: vec![],
        placement: None,
        layers: vec![],
        silhouette: AtomeShapeSilhouette::default(),
    };
    assert!(empty.normalized().is_none());

    let resolvable = AtomeMaskStyle {
        source_id: " shape_1 ".to_string(),
        mode: "alpha".to_string(),
        alpha: vec![],
        placement: None,
        layers: vec![],
        silhouette: AtomeShapeSilhouette::rect(20.0, 20.0, [0.0; 4]),
    };
    let mask = resolvable.normalized().expect("un masque resolu");
    assert_eq!(mask.source_id, " shape_1 ");

    let unsupported = AtomeMaskStyle {
        source_id: "shape_1".to_string(),
        mode: "luminance".to_string(),
        alpha: vec![],
        placement: None,
        layers: vec![],
        silhouette: AtomeShapeSilhouette::rect(20.0, 20.0, [0.0; 4]),
    };
    assert!(unsupported.normalized().is_none());

    let sourceless = AtomeMaskStyle {
        source_id: "   ".to_string(),
        mode: "alpha".to_string(),
        alpha: vec![],
        placement: None,
        layers: vec![],
        silhouette: AtomeShapeSilhouette::rect(20.0, 20.0, [0.0; 4]),
    };
    assert!(sourceless.normalized().is_none());
}

#[test]
fn a_spatial_mask_keeps_its_world_position_and_rotation_inside_the_target() {
    let mask = AtomeMaskStyle {
        source_id: "rotated_source".to_string(),
        mode: "alpha".to_string(),
        alpha: vec![],
        silhouette: AtomeShapeSilhouette::rect(20.0, 40.0, [0.0; 4]),
        layers: vec![],
        placement: Some(AtomeMaskPlacement {
            source_position: [40.0, 30.0],
            target_position: [0.0, 0.0],
            source_scale: [1.0, 1.0],
            target_scale: [1.0, 1.0],
            source_rotation: 90.0,
            target_rotation: 0.0,
            source_origin: [0.5, 0.5],
            target_origin: [0.0, 0.0],
            target_size: [100.0, 100.0],
        }),
    };
    let texture = mask_texture_for_target(&mask, [100.0, 100.0]);
    assert_eq!(alpha_at(&texture, 50, 50), 255, "the rotated source centre remains visible");
    assert_eq!(alpha_at(&texture, 10, 10), 0, "the source is not stretched over the target");
    assert_eq!(alpha_at(&texture, 50, 30), 0, "rotation moves the narrow edge in world space");
    assert_eq!(alpha_at(&texture, 31, 50), 255, "the rotated long edge reaches its expected position");
}

#[test]
fn a_raster_alpha_mask_uses_glyph_pixels_instead_of_its_bounding_box() {
    let mask = AtomeMaskStyle {
        source_id: "text_source".to_string(),
        mode: "alpha".to_string(),
        silhouette: AtomeShapeSilhouette::rect(4.0, 2.0, [0.0; 4]),
        alpha: vec![0, 255, 0, 0, 0, 255, 255, 0],
        layers: vec![],
        placement: None,
    };
    let texture = mask_texture_for_target(&mask, [4.0, 2.0]);
    assert_eq!(alpha_at(&texture, 0, 0), 0, "the text box background stays transparent");
    assert_eq!(alpha_at(&texture, 1, 0), 255, "a glyph pixel reveals the target");
    assert_eq!(alpha_at(&texture, 2, 1), 255, "each raster alpha pixel is sampled");
    assert_eq!(alpha_at(&texture, 3, 1), 0, "the rest of the text box never becomes a rectangle");
}

#[test]
fn a_masked_image_goes_through_the_documented_handle_path() {
    let mut images = Assets::<Image>::default();
    let rounded = image_handle_from_rounded_rect_mask(&mut images, 20.0, 20.0, [4.0; 4], "rect")
        .expect("le masque arrondi historique reste le meme");
    assert!(images.contains(&rounded));
    let star = image_handle_from_shape_mask(&mut images, &star_silhouette(5, 0.5, 20.0), "star")
        .expect("une etoile se masque");
    assert!(images.contains(&star));
    assert_ne!(rounded, star);
}

#[test]
fn the_block_shadow_of_a_star_has_its_points() {
    let star = star_silhouette(5, 0.5, 64.0);
    let (width, height, rgba) = crate::shadow_texture::build_block_shadow_texture_rgba_for_silhouette(
        &star,
        [0.0, 0.0, 0.0, 1.0],
        0.0,
        false,
    )
    .expect("une ombre dure");
    assert_eq!((width, height), (64, 64));
    let alpha_at = |x: u32, y: u32| rgba[((y as usize * width as usize) + x as usize) * 4 + 3];
    // La pointe est peinte, le coin de la boite ne l'est pas : l'ombre d'une
    // etoile n'est plus celle d'un carre.
    assert_eq!(alpha_at(32, 1), 255);
    assert_eq!(alpha_at(1, 1), 0);
    let rect = AtomeShapeSilhouette::rect(64.0, 64.0, [0.0; 4]);
    let (_, _, rect_rgba) = crate::shadow_texture::build_block_shadow_texture_rgba_for_silhouette(
        &rect,
        [0.0, 0.0, 0.0, 1.0],
        0.0,
        false,
    )
    .expect("une ombre de carre");
    assert_eq!(rect_rgba[3], 255);
}

#[test]
fn the_dropshadow_of_a_star_is_also_a_star() {
    let star = star_silhouette(5, 0.5, 40.0);
    let (width, height, _) =
        crate::shadow_texture::build_gaussian_outer_shadow_texture_rgba_for_silhouette(
            &star,
            [0.0, 0.0, 0.0, 1.0],
            6.0,
        )
        .expect("un halo");
    assert!(width > 40 && height > 40);
    let corner = AtomeShapeSilhouette {
        corner_radii: [8.0; 4],
        ..star
    };
    let (_, _, corner_rgba) =
        crate::shadow_texture::build_gaussian_outer_shadow_texture_rgba_for_silhouette(
            &corner,
            [0.0, 0.0, 0.0, 1.0],
            6.0,
        )
        .expect("un halo arrondi");
    assert_eq!(corner_rgba.len(), width as usize * height as usize * 4);
}

#[test]
fn corner_radii_still_round_the_rect_shadow() {
    let radii: AtomeCornerRadii = [6.0; 4];
    let rounded = crate::shadow_texture::build_block_shadow_texture_rgba(
        [0.0, 0.0, 0.0, 1.0],
        32.0,
        32.0,
        radii,
        0.0,
        false,
    )
    .expect("une ombre dure");
    let straight = crate::shadow_texture::build_block_shadow_texture_rgba(
        [0.0, 0.0, 0.0, 1.0],
        32.0,
        32.0,
        [0.0; 4],
        0.0,
        false,
    )
    .expect("une ombre droite");
    assert_eq!(rounded.2[3], 0, "le coin arrondi reste vide");
    assert_eq!(straight.2[3], 255);
}
