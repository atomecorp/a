//! The real Lottie files of tests/fixtures/lottie (licenses in its LICENSES.md), read as the renderer reads
//! them. Expected counts were taken independently from the JSON (temp/converters_audit_2026-11-16/lottie/
//! count_fixtures.mjs), never from this crate.
use atome_lottie::{LottieClock, load};
use velato::vello::{Scene, kurbo::Affine};

fn fixture(name: &str) -> Vec<u8> {
    let path = format!(
        "{}/../../../tests/fixtures/lottie/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read(&path).unwrap_or_else(|error| panic!("{path}: {error}"))
}

/// Every frame encodes into a vello scene without stopping the program, and draws something.
fn assert_every_frame_encodes(name: &str) {
    let loaded = load(&fixture(name)).unwrap_or_else(|error| panic!("{name}: {error}"));
    let mut renderer = velato::Renderer::new();
    let count = loaded.clock.frame_count();
    for index in (0..count).step_by(7) {
        let mut scene = Scene::new();
        renderer.append(
            &loaded.composition,
            loaded.clock.in_point + index as f64,
            Affine::IDENTITY,
            1.0,
            &mut scene,
        );
        assert!(
            scene.encoding().n_paths > 0,
            "{name}: frame {index} drew no path"
        );
    }
}

#[test]
fn tiger_counts_timing_and_keyframes() {
    let report = load(&fixture("noto_tiger.json")).unwrap().report;
    assert_eq!(
        (report.frame_rate, report.in_point, report.out_point),
        (60.0, 0.0, 306.0)
    );
    assert!((report.duration_seconds - 5.1).abs() < 1e-9);
    assert_eq!((report.width, report.height), (1024, 1024));
    assert_eq!(report.layer_count, 14);
    assert_eq!(report.layer_types.get("shape"), Some(&14));
    assert_eq!(report.shape_count, 404);
    assert_eq!(report.keyframe_count, 926);
    assert_eq!(report.eased_keyframe_count, 805);
    assert_eq!(report.hold_keyframe_count, 6);
    assert_eq!(report.matte_count, 4);
    assert_every_frame_encodes("noto_tiger.json");
}

#[test]
fn polystar_counts() {
    let report = load(&fixture("velato_polystar_test.json")).unwrap().report;
    assert_eq!((report.frame_rate, report.duration_seconds), (60.0, 2.0));
    assert_eq!(
        (
            report.layer_count,
            report.shape_count,
            report.keyframe_count
        ),
        (2, 8, 19)
    );
    assert_eq!(report.shape_types.get("sr"), Some(&2));
    assert!(report.unsupported.is_empty(), "{:?}", report.unsupported);
    assert_every_frame_encodes("velato_polystar_test.json");
}

#[test]
fn dotlottie_v1_reports_rounded_corners_as_unsupported() {
    let report = load(&fixture("dotlottie_v1_star_rating.lottie"))
        .unwrap()
        .report;
    assert_eq!(serde_json::to_value(report.container).unwrap(), "dotlottie");
    assert_eq!((report.frame_rate, report.duration_seconds), (30.0, 3.0));
    assert_eq!((report.width, report.height), (1080, 1080));
    assert_eq!((report.layer_count, report.precomposition_count), (26, 2));
    assert_eq!(
        (
            report.shape_count,
            report.keyframe_count,
            report.eased_keyframe_count
        ),
        (62, 38, 24)
    );
    assert_eq!(report.unsupported.get("shape_rounded_corners"), Some(&10));
    assert_every_frame_encodes("dotlottie_v1_star_rating.lottie");
}

#[test]
fn dotlottie_v2_reads_its_animation_folder() {
    let report = load(&fixture("dotlottie_v2_pigeon.lottie")).unwrap().report;
    assert_eq!((report.frame_rate, report.out_point), (25.0, 111.0));
    assert!((report.duration_seconds - 4.44).abs() < 1e-9);
    assert_eq!(
        (
            report.layer_count,
            report.shape_count,
            report.keyframe_count
        ),
        (50, 951, 280)
    );
    assert_eq!((report.matte_count, report.precomposition_count), (2, 5));
    assert_eq!(report.layer_types.get("null"), Some(&8));
    assert_every_frame_encodes("dotlottie_v2_pigeon.lottie");
}

#[test]
fn traffic_lights_gradients() {
    let report = load(&fixture("dotlottie_v1_traffic_lights.lottie"))
        .unwrap()
        .report;
    assert_eq!((report.layer_count, report.shape_count), (231, 902));
    assert_eq!(
        (report.shape_types.get("gf"), report.shape_types.get("gs")),
        (Some(&41), Some(&3))
    );
    assert_every_frame_encodes("dotlottie_v1_traffic_lights.lottie");
}

#[test]
fn bodymovin_4_files_report_their_masks_and_merges() {
    let adrock = load(&fixture("lottie_web_adrock.json")).unwrap().report;
    assert!((adrock.duration_seconds - 392.0 / 30.0).abs() < 1e-9);
    assert_eq!(
        (adrock.layer_count, adrock.shape_count, adrock.mask_count),
        (59, 384, 1)
    );
    assert_eq!(adrock.unsupported.get("shape_merge_paths"), Some(&38));
    assert_eq!(adrock.unsupported.get("layer_mask"), Some(&1));
    assert_eq!(
        (adrock.keyframe_count, adrock.eased_keyframe_count),
        (492, 362)
    );
    let happy = load(&fixture("lottie_web_happy2016.json")).unwrap().report;
    assert_eq!(
        (happy.width, happy.height, happy.mask_count),
        (1920, 1080, 3)
    );
    assert_eq!(
        (happy.keyframe_count, happy.eased_keyframe_count),
        (517, 387)
    );
    let gatin = load(&fixture("lottie_web_gatin.json")).unwrap().report;
    assert_eq!((gatin.frame_rate, gatin.duration_seconds), (25.0, 3.2));
    assert_eq!((gatin.layer_count, gatin.shape_count), (15, 141));
    assert_eq!(
        (gatin.keyframe_count, gatin.eased_keyframe_count),
        (119, 104)
    );
    for name in [
        "lottie_web_adrock.json",
        "lottie_web_happy2016.json",
        "lottie_web_gatin.json",
    ] {
        assert_every_frame_encodes(name);
    }
}

#[test]
fn clock_frames_follow_the_frame_rate() {
    let clock = LottieClock {
        frame_rate: 25.0,
        in_point: 10.0,
        out_point: 90.0,
    };
    assert_eq!(clock.frame_count(), 80);
    assert_eq!(clock.duration_seconds(), 3.2);
    assert_eq!(clock.frame_at(0.0, true), 10.0);
    assert_eq!(clock.frame_index(0.04, true), 1);
    assert_eq!(clock.frame_index(0.039, true), 0);
    assert_eq!(clock.frame_index(3.2, true), 0, "a loop starts again");
    assert_eq!(clock.frame_index(3.2, false), 79, "the last frame stays");
    assert_eq!(clock.next_frame_seconds(0.05, true), Some(0.08));
    assert_eq!(clock.next_frame_seconds(3.17, false), None);
}

#[test]
fn unreadable_constructs_are_reported_never_fatal() {
    let file = serde_json::json!({
        "v": "5.7.0", "fr": 30, "ip": 0, "op": 30, "w": 100, "h": 100,
        "layers": [
            { "ty": 5, "nm": "a text", "ks": {}, "ip": 0, "op": 30, "st": 0 },
            { "ty": 4, "ip": 0, "op": 30, "st": 0, "bm": 16, "ddd": 1,
              "ks": { "o": { "a": 0, "k": 100 }, "rz": { "a": 0, "k": 45 }, "rx": { "a": 0, "k": 0 },
                      "p": { "a": 0, "k": [50, 50] }, "a": { "a": 0, "k": [0, 0] }, "s": { "a": 0, "k": [100, 100] } },
              "shapes": [{ "ty": "gr", "it": [
                { "ty": "rc", "p": { "a": 0, "k": [0, 0] }, "s": { "a": 0, "k": [20, 20] }, "r": { "a": 0, "k": 0 } },
                { "ty": "zz", "s": { "a": 0, "k": 3 } },
                { "ty": "fl", "c": { "a": 0, "k": [1, 0, 0, 1] }, "o": { "a": 0, "k": 100 } },
                { "ty": "tr", "p": { "s": true, "x": { "a": 0, "k": 5 }, "y": { "a": 0, "k": 6 } },
                  "a": { "a": 0, "k": [0, 0] }, "s": { "a": 0, "k": [100, 100] }, "r": { "a": 0, "k": 0 }, "o": { "a": 0, "k": 100 } }
              ] }] }
        ]
    });
    let loaded = load(file.to_string().as_bytes()).unwrap();
    let unsupported = &loaded.report.unsupported;
    for feature in [
        "text_layer",
        "blend_mode_add",
        "3d_layer",
        "3d_rotation",
        "shape_zig_zag",
    ] {
        assert_eq!(
            unsupported.get(feature),
            Some(&1),
            "{feature}: {unsupported:?}"
        );
    }
    assert_eq!(loaded.composition.layers.len(), 1);
}

#[test]
fn refusals_are_explicit() {
    assert_eq!(load(b"").err().as_deref(), Some("lottie_file_empty"));
    assert!(load(b"{").unwrap_err().starts_with("lottie_json_invalid"));
    let no_rate = br#"{"ip":0,"op":10,"w":10,"h":10,"layers":[]}"#;
    assert_eq!(
        load(no_rate).err().as_deref(),
        Some("lottie_field_missing:fr")
    );
    assert!(
        load(b"PK\x03\x04broken")
            .unwrap_err()
            .starts_with("lottie_dotlottie_invalid")
    );
}
