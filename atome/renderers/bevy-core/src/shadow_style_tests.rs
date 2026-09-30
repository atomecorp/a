use crate::shadow_texture::{build_block_shadow_texture_rgba, build_gaussian_outer_shadow_texture_rgba};
use crate::types::{AtomeShadowKind, AtomeShadowStyle};

fn shadow(kind: AtomeShadowKind, blur: f32, spread: f32, invert: bool) -> AtomeShadowStyle {
    AtomeShadowStyle {
        kind,
        color: [0.0, 0.0, 0.0, 0.5],
        blur,
        offset_x: 4.0,
        offset_y: 6.0,
        spread,
        invert,
    }
}

#[test]
fn a_drop_shadow_survives_blur_zero_because_its_silhouette_is_already_filled() {
    // Le curseur de flou descend jusqu'a zero. A zero l'ombre portee reste un
    // aplat dur, au lieu de disparaitre sans que rien ne l'ait demande.
    let flat = shadow(AtomeShadowKind::Drop, 0.0, 0.0, false)
        .normalized()
        .expect("une ombre portee sans flou reste une ombre");
    assert_eq!(flat.kind, AtomeShadowKind::Drop);
    assert_eq!(flat.blur, 0.0);
    assert!(shadow(AtomeShadowKind::Drop, 8.0, 0.0, false).normalized().is_some());
}

#[test]
fn a_block_shadow_is_the_hard_silhouette_and_survives_blur_zero() {
    let normalized = shadow(AtomeShadowKind::Block, 0.0, 3.0, false).normalized().expect("block shadow");
    assert_eq!(normalized.kind, AtomeShadowKind::Block);
    assert_eq!(normalized.blur, 0.0);
    assert_eq!(normalized.spread, 3.0);
    assert!(!normalized.invert);
}

#[test]
fn the_inner_cutout_belongs_to_the_block_silhouette_only() {
    // `invert` on a blurred drop shadow has no meaning: it is never carried.
    let drop = shadow(AtomeShadowKind::Drop, 8.0, 0.0, true).normalized().expect("drop shadow");
    assert!(!drop.invert);
    let block = shadow(AtomeShadowKind::Block, 0.0, 2.0, true).normalized().expect("block shadow");
    assert!(block.invert);
}

#[test]
fn a_transparent_shadow_never_reaches_the_renderer() {
    let mut style = shadow(AtomeShadowKind::Block, 0.0, 2.0, false);
    style.color[3] = 0.0;
    assert!(style.normalized().is_none());
}

#[test]
fn the_block_texture_paints_the_whole_silhouette_and_nothing_outside_it() {
    let (width, height, rgba) = build_block_shadow_texture_rgba(
        [0.0, 0.0, 0.0, 0.6],
        20.0,
        10.0,
        [0.0; 4],
        0.0,
        false,
    )
    .expect("hard silhouette");
    assert_eq!((width, height), (20, 10));
    let alpha_at = |x: usize, y: usize| rgba[(y * width as usize + x) * 4 + 3];
    assert_eq!(alpha_at(10, 5), 153, "the centre of the silhouette is painted");
    assert_eq!(alpha_at(0, 0), 153, "a square corner is painted too");
    assert_eq!(alpha_at(19, 9), 153);
}

#[test]
fn an_inner_block_shadow_without_spread_has_no_band_to_paint() {
    assert!(build_block_shadow_texture_rgba([0.0, 0.0, 0.0, 0.6], 20.0, 10.0, [0.0; 4], 0.0, true).is_none());
}

#[test]
fn an_inner_block_shadow_paints_the_band_the_spread_grows_around_the_silhouette() {
    let (width, height, rgba) = build_block_shadow_texture_rgba(
        [0.0, 0.0, 0.0, 0.6],
        20.0,
        10.0,
        [0.0; 4],
        3.0,
        true,
    )
    .expect("inner band");
    assert_eq!((width, height), (26, 16), "le bande grandit la silhouette de deux fois 3 px");
    let alpha_at = |x: usize, y: usize| rgba[(y * width as usize + x) * 4 + 3];
    // Le centre de l'objet est son propre trou : l'ombre interne ne le repeint pas.
    assert_eq!(alpha_at(13, 8), 0, "the object interior stays a hole");
    // Le bord, lui, porte la bande.
    assert_eq!(alpha_at(0, 8), 153, "the grown band is painted");
    assert_eq!(alpha_at(25, 8), 153);
}

#[test]
fn a_block_shadow_is_not_the_gaussian_halo() {
    let block = build_block_shadow_texture_rgba([0.0, 0.0, 0.0, 1.0], 20.0, 20.0, [0.0; 4], 0.0, false)
        .expect("block texture");
    let drop = build_gaussian_outer_shadow_texture_rgba([0.0, 0.0, 0.0, 1.0], 20.0, 20.0, [0.0; 4], 8.0)
        .expect("drop texture");
    assert_eq!(block.0, 20, "the hard silhouette is the shape, padded by nothing");
    assert!(drop.0 > 20, "the gaussian halo is padded by its blur");
    // Le coin de la silhouette dure est plein ; celui du halo exterieur est vide.
    assert_eq!(block.2[3], 255);
    assert_eq!(drop.2[3], 0);
}
