use std::collections::BTreeMap;

use super::grade::*;
use super::lut::*;
use super::*;

fn effect(name: &str, params: &[(&str, f32)]) -> AtomeMediaEffect {
    AtomeMediaEffect {
        effect: name.to_string(),
        params: params
            .iter()
            .map(|(key, value)| (key.to_string(), *value))
            .collect::<BTreeMap<_, _>>(),
        asset: None,
    }
}

const COLOR_DEFAULTS: [(&str, f32); 14] = [
    ("exposure", 0.0),
    ("pivot", 0.5),
    ("contrast", 1.0),
    ("brightness", 1.0),
    ("saturate", 1.0),
    ("vibrance", 0.0),
    ("temperature", 0.0),
    ("tint", 0.0),
    ("highlights", 0.0),
    ("shadows", 0.0),
    ("hue", 0.0),
    ("grayscale", 0.0),
    ("sepia", 0.0),
    ("invert", 0.0),
];

fn color_with(changes: &[(&str, f32)]) -> AtomeMediaEffect {
    let mut params: Vec<(&str, f32)> = COLOR_DEFAULTS.to_vec();
    for (key, value) in changes {
        params.iter_mut().find(|(name, _)| name == key).unwrap().1 = *value;
    }
    effect("color", &params)
}

fn primary(changes: &[(&str, f32)]) -> ColorPrimary {
    let p = |key: &str| {
        changes
            .iter()
            .chain(COLOR_DEFAULTS.iter())
            .find(|(name, _)| *name == key)
            .unwrap()
            .1
    };
    ColorPrimary {
        exposure: p("exposure"),
        pivot: p("pivot"),
        contrast: p("contrast"),
        brightness: p("brightness"),
        saturate: p("saturate"),
        vibrance: p("vibrance"),
        temperature: p("temperature"),
        tint: p("tint"),
        highlights: p("highlights"),
        shadows: p("shadows"),
        hue: p("hue"),
        grayscale: p("grayscale"),
        sepia: p("sepia"),
        invert: p("invert"),
    }
}

fn near(a: [f32; 3], b: [f32; 3], tolerance: f32) {
    for axis in 0..3 {
        assert!((a[axis] - b[axis]).abs() <= tolerance, "{a:?} != {b:?}");
    }
}

#[test]
fn effects_at_their_identity_never_reach_a_slot() {
    let stack = MediaFxStack::compile(&[
        color_with(&[]),
        effect(
            "vignette",
            &[
                ("amount", 0.0),
                ("size", 0.55),
                ("softness", 0.34),
                ("roundness", 1.0),
            ],
        ),
        effect(
            "blur",
            &[
                ("mode", 0.0),
                ("radius", 0.0),
                ("angle", 0.0),
                ("mix", 1.0),
                ("center_x", 0.5),
                ("center_y", 0.5),
                ("zone", 0.0),
                ("zone_size", 0.34),
            ],
        ),
    ])
    .unwrap();
    assert!(stack.is_empty());
    assert_eq!(media_fx_for_effects(&[color_with(&[])]).unwrap(), None);
}

#[test]
fn a_chain_keeps_its_order_and_its_neighbourhood_flags() {
    let stack = MediaFxStack::compile(&[
        color_with(&[("contrast", 1.3)]),
        effect(
            "blur",
            &[
                ("mode", 1.0),
                ("radius", 13.0),
                ("angle", 90.0),
                ("mix", 1.0),
                ("center_x", 0.5),
                ("center_y", 0.5),
                ("zone", 0.0),
                ("zone_size", 0.34),
            ],
        ),
    ])
    .unwrap();
    assert_eq!(stack.slots.len(), 2);
    assert_eq!(stack.slots[0].kind, MediaFxKind::Color);
    assert!(!stack.slots[0].spatial);
    assert_eq!(stack.slots[1].kind, MediaFxKind::Blur);
    assert!(stack.slots[1].spatial);
    assert!((stack.slots[1].params[2] - std::f32::consts::FRAC_PI_2).abs() < 1e-6);
    let bytes = media_fx_uniform_bytes(
        Some(&stack),
        [320.0, 180.0],
        [0.0, 0.0, 1.0, 1.0],
        2.0,
        None,
    );
    let floats: Vec<f32> = bytes
        .chunks(4)
        .map(|chunk| f32::from_ne_bytes(chunk.try_into().unwrap()))
        .collect();
    assert_eq!(bytes.len(), (5 + 12 * 12) * 16);
    assert_eq!(&floats[0..6], &[2.0, 2.0, 0.0, 0.0, 320.0, 180.0]);
    assert_eq!(floats[20], MediaFxKind::Color as u32 as f32);
    assert_eq!(floats[20 + 48], MediaFxKind::Blur as u32 as f32);
    assert_eq!(floats[20 + 48 + 1], 1.0);
}

#[test]
fn a_wrong_chain_is_refused_explicitly() {
    assert_eq!(
        MediaFxStack::compile(&[effect("sparkle", &[])]).unwrap_err(),
        "media_fx_effect_unknown:sparkle"
    );
    assert_eq!(
        MediaFxStack::compile(&[effect("pixelate", &[])]).unwrap_err(),
        "media_fx_param_missing:pixelate.size"
    );
    let long: Vec<_> = (0..13)
        .map(|_| effect("pixelate", &[("size", 13.0)]))
        .collect();
    assert!(
        MediaFxStack::compile(&long)
            .unwrap_err()
            .starts_with("media_fx_chain_too_long")
    );
    let lut = |asset: &str| AtomeMediaEffect {
        asset: Some(asset.to_string()),
        ..effect("lut", &[("intensity", 1.0)])
    };
    assert_eq!(
        MediaFxStack::compile(&[lut("a"), lut("b")]).unwrap_err(),
        "media_fx_one_lut_per_chain"
    );
    let stack = MediaFxStack::compile(&[lut("a"), lut("a")]).unwrap();
    assert_eq!(stack.lut_asset.as_deref(), Some("a"));
    // A LUT not chosen yet changes nothing.
    assert!(
        MediaFxStack::compile(&[effect("lut", &[("intensity", 1.0)])])
            .unwrap()
            .is_empty()
    );
}

#[test]
fn the_primary_correction_matches_its_reference_values() {
    let grey = [0.5, 0.5, 0.5];
    near(primary(&[]).apply(grey), grey, 1e-6);
    // One stop up doubles the linear light.
    let up = primary(&[("exposure", 1.0)]).apply([0.3, 0.3, 0.3])[0];
    assert!((srgb_to_linear(up) - 2.0 * srgb_to_linear(0.3)).abs() < 1e-4);
    // Contrast turns around its pivot.
    let pivot = primary(&[("contrast", 2.0), ("pivot", 0.25)]);
    near(pivot.apply([0.25; 3]), [0.25; 3], 1e-6);
    near(pivot.apply([0.5; 3]), [0.75; 3], 1e-6);
    // Warm: red up, blue down.
    let warm = primary(&[("temperature", 100.0)]).apply(grey);
    assert!(warm[0] > 0.55 && warm[2] < 0.45);
    // Vibrance lifts a dull colour more than a vivid one.
    let vibrance = primary(&[("vibrance", 1.0)]);
    let dull = vibrance.apply([0.5, 0.45, 0.4]);
    assert!(dull[0] - dull[2] > 0.1 * 1.5);
    // Grayscale and invert keep the CSS meaning.
    let mono = primary(&[("grayscale", 1.0)]).apply([1.0, 0.0, 0.0]);
    near(mono, [0.2126; 3], 1e-4);
    near(
        primary(&[("invert", 1.0)]).apply([0.2, 0.4, 0.6]),
        [0.8, 0.6, 0.4],
        1e-6,
    );
}

fn no_wheels() -> Wheels {
    Wheels {
        lift: Wheel::default(),
        gamma: Wheel::default(),
        gain: Wheel::default(),
        offset: Wheel::default(),
        lift_sat: 1.0,
        gamma_sat: 1.0,
        gain_sat: 1.0,
        offset_temperature: 0.0,
    }
}

#[test]
fn wheels_follow_the_lift_gamma_gain_model() {
    let identity = no_wheels();
    assert!(identity.is_identity());
    let compiled = identity.compile();
    assert_eq!(compiled.gain, [1.0; 3]);
    assert_eq!(compiled.exponent, [1.0; 3]);
    near(compiled.apply([0.2, 0.5, 0.8]), [0.2, 0.5, 0.8], 1e-6);
    // The puck's hue: 0° is red, its tint has no luminance of its own.
    let red = Wheel {
        x: 1.0,
        y: 0.0,
        level: 0.0,
    }
    .tint();
    assert!(red[0] > 0.0 && red[1] < 0.0 && red[2] < 0.0);
    assert!(luma(red).abs() < 1e-6);
    let green = Wheel {
        x: -0.5,
        y: 0.866,
        level: 0.0,
    }
    .tint();
    assert!(green[1] > 0.0 && green[1] > green[0]);
    // A red gain warms the highlights more than the shadows.
    let warm_gain = Wheels {
        gain: Wheel {
            x: 0.5,
            y: 0.0,
            level: 0.0,
        },
        ..no_wheels()
    }
    .compile();
    let bright = warm_gain.apply([0.8; 3]);
    let dark = warm_gain.apply([0.1; 3]);
    assert!(bright[0] - bright[2] > dark[0] - dark[2]);
    // Lift raises the blacks and leaves the whites; gamma bends the middle.
    let lift = Wheels {
        lift: Wheel {
            x: 0.0,
            y: 0.0,
            level: 0.5,
        },
        ..no_wheels()
    }
    .compile();
    near(lift.apply([0.0; 3]), [0.25; 3], 1e-6);
    near(lift.apply([1.0; 3]), [1.0; 3], 1e-6);
    let gamma = Wheels {
        gamma: Wheel {
            x: 0.0,
            y: 0.0,
            level: 1.0,
        },
        ..no_wheels()
    }
    .compile();
    near(gamma.apply([0.25; 3]), [0.5; 3], 1e-6);
}

#[test]
fn curves_are_smooth_monotone_and_pass_through_their_points() {
    let identity = [0.0, 0.25, 0.5, 0.75, 1.0];
    let tangents = monotone_tangents(&identity);
    for step in 0..=20 {
        let x = step as f32 / 20.0;
        assert!((curve_eval(&identity, &tangents, x) - x).abs() < 1e-5);
    }
    let lifted = [0.0, 0.4, 0.6, 0.8, 1.0];
    let tangents = monotone_tangents(&lifted);
    let mut previous = -1.0;
    for step in 0..=200 {
        let x = step as f32 / 200.0;
        let y = curve_eval(&lifted, &tangents, x);
        assert!(y >= previous - 1e-6, "not monotone at {x}");
        previous = y;
    }
    for (index, point) in lifted.iter().enumerate() {
        assert!((curve_eval(&lifted, &tangents, index as f32 * 0.25) - point).abs() < 1e-5);
    }
    // A flat stretch stays flat: no overshoot between equal points.
    let plateau = [0.0, 0.5, 0.5, 0.5, 1.0];
    let tangents = monotone_tangents(&plateau);
    assert!((curve_eval(&plateau, &tangents, 0.6) - 0.5).abs() < 1e-6);
}

#[test]
fn the_chroma_key_takes_out_its_colour_and_its_spill() {
    let green = [0.0, 0.69, 0.24];
    let key = chroma_of(green);
    assert!(chroma_key_alpha(green, key, 0.34, 0.13) < 1e-6);
    let skin = [0.85, 0.62, 0.5];
    assert!((chroma_key_alpha(skin, key, 0.34, 0.13) - 1.0).abs() < 1e-6);
    let greenish_grey = [0.45, 0.6, 0.45];
    let cleaned = chroma_key_spill(greenish_grey, key, 1.0);
    assert!(cleaned[1] < greenish_grey[1]);
    assert!((luma(cleaned) - luma(greenish_grey)).abs() < 1e-4);
    // A colour carrying none of the key's chroma is left as it is.
    let magenta = [0.7, 0.3, 0.7];
    near(chroma_key_spill(magenta, key, 1.0), magenta, 1e-5);
}

const IDENTITY_CUBE: &str = "# identity\nTITLE \"id\"\nLUT_3D_SIZE 2\n\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";

#[test]
fn a_cube_file_parses_and_samples_trilinearly() {
    let lut = parse_cube(IDENTITY_CUBE).unwrap();
    assert_eq!(lut.size, 2);
    near(lut.sample([0.2, 0.5, 0.9]), [0.2, 0.5, 0.9], 1e-6);
    // An inverting cube on a [0, 2] domain.
    let mut text = String::from("LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n");
    for b in 0..2 {
        for g in 0..2 {
            for r in 0..2 {
                text.push_str(&format!("{} {} {}\n", 1 - r, 1 - g, 1 - b));
            }
        }
    }
    let invert = parse_cube(&text).unwrap();
    near(invert.sample([1.0, 0.5, 2.0]), [0.5, 0.75, 0.0], 1e-6);
    let image = invert.image();
    assert_eq!(image.texture_descriptor.size.depth_or_array_layers, 2);
    assert_eq!(image.data.as_ref().unwrap().len(), 8 * 8);
}

#[test]
fn a_wrong_cube_file_is_refused() {
    assert_eq!(parse_cube("0 0 0\n").unwrap_err(), "lut_cube_size_missing");
    assert_eq!(
        parse_cube("LUT_1D_SIZE 4\n").unwrap_err(),
        "lut_cube_1d_unsupported"
    );
    assert!(
        parse_cube("LUT_3D_SIZE 2\n0 0 0\n")
            .unwrap_err()
            .starts_with("lut_cube_table_length_invalid")
    );
    assert!(
        parse_cube("LUT_3D_SIZE 1\n")
            .unwrap_err()
            .starts_with("lut_cube_size_invalid")
    );
    assert!(
        parse_cube("LUT_3D_SIZE 2\nGAMMA 2\n")
            .unwrap_err()
            .starts_with("lut_cube_keyword_unknown")
    );
    assert!(
        parse_cube("LUT_3D_SIZE 2\n0 0\n")
            .unwrap_err()
            .starts_with("lut_cube_line_invalid")
    );
}

#[test]
fn lut_texels_are_half_floats() {
    assert_eq!(f32_to_f16_bits(0.0), 0x0000);
    assert_eq!(f32_to_f16_bits(1.0), 0x3c00);
    assert_eq!(f32_to_f16_bits(0.5), 0x3800);
    assert_eq!(f32_to_f16_bits(-2.0), 0xc000);
    assert_eq!(f32_to_f16_bits(65504.0), 0x7bff);
    assert_eq!(f32_to_f16_bits(1.0e6), 0x7c00);
    // 0.1 rounds to the nearest half (0x2e66).
    assert_eq!(f32_to_f16_bits(0.1), 0x2e66);
}

#[test]
fn an_image_shows_its_whole_texture_or_its_crop_from_the_top_left() {
    use bevy::math::{Rect, Vec2};
    assert_eq!(
        image_draw::image_quad_rect_for_tests(
            None,
            Some(Vec2::new(64.0, 32.0)),
            Vec2::new(8.0, 4.0)
        ),
        [0.0, 0.0, 1.0, 1.0]
    );
    let crop = Rect::new(2.0, 1.0, 6.0, 3.0);
    let shown = image_draw::image_quad_rect_for_tests(Some(crop), None, Vec2::new(8.0, 4.0));
    for (value, expected) in shown.iter().zip([0.25, 0.25, 0.5, 0.5]) {
        assert!((value - expected).abs() < 1e-6, "{shown:?}");
    }
}

#[test]
fn a_media_gains_and_loses_its_chain_on_its_entity() {
    use bevy::prelude::*;
    let mut world = World::new();
    let entity = world.spawn_empty().id();
    apply_media_effects(&mut world, entity, &[color_with(&[("saturate", 0.0)])]).unwrap();
    assert_eq!(world.get::<AtomeMediaFx>(entity).unwrap().0.slots.len(), 1);
    apply_media_effects(&mut world, entity, &[]).unwrap();
    assert!(world.get::<AtomeMediaFx>(entity).is_none());
    assert!(apply_media_effects(&mut world, entity, &[effect("nope", &[])]).is_err());
}

// R-349: an MP4 proxy's image draws its effects at its own instant, never the machine's clock.
#[test]
fn the_media_clock_follows_the_offline_instant_then_the_real_time_again() {
    use super::clock::{
        AtomeMediaClockPatch, MediaFxOfflineClock, apply_media_clock, media_fx_seconds,
    };
    let mut world = World::new();
    apply_media_clock(&mut world, AtomeMediaClockPatch { seconds: Some(2.5) }).expect("an instant");
    let offline = *world.resource::<MediaFxOfflineClock>();
    assert_eq!(media_fx_seconds(1_234.0, offline), 2.5);
    apply_media_clock(&mut world, AtomeMediaClockPatch { seconds: None }).expect("the real clock");
    let real = *world.resource::<MediaFxOfflineClock>();
    assert_eq!(media_fx_seconds(3_605.0, real), 5.0);
    let refused = apply_media_clock(
        &mut world,
        AtomeMediaClockPatch {
            seconds: Some(f64::NAN),
        },
    );
    assert!(refused.unwrap_err().starts_with("media_clock_invalid"));
}
