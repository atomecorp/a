use super::*;

fn setting(value: JsonValue) -> Setting {
    Setting::from_json(&value).unwrap()
}

#[test]
fn a_packet_carries_its_header_its_command_and_its_padding() {
    // ISO 800 on camera 1: int32, 4 bytes of data, 12 bytes in all.
    let packet = ccp_packet(1, &setting(json!({ "name": "iso", "iso": 800 })));
    assert_eq!(packet, vec![1, 8, 0, 0, 1, 14, INT32, 0, 0x20, 0x03, 0, 0]);
    // Focus: one fixed16, padded from 10 to 12 bytes.
    let focus = ccp_packet(
        BROADCAST,
        &setting(json!({ "name": "focus", "normalised": 0.5 })),
    );
    assert_eq!(
        focus,
        vec![255, 6, 0, 0, 0, 0, FIXED16, 0, 0x00, 0x04, 0, 0]
    );
    assert!(
        [focus.len(), packet.len()]
            .iter()
            .all(|length| length % 4 == 0)
    );
}

#[test]
fn values_are_written_in_the_protocols_units() {
    // f/4 is the aperture value 4 (√(2⁴) = 4): 4 × 2048 in fixed16.
    let iris = ccp_packet(1, &setting(json!({ "name": "iris", "f_number": 4.0 })));
    assert_eq!(&iris[4..10], &[0, 2, FIXED16, 0, 0x00, 0x20]);
    // 180° is 18000 hundredths.
    let shutter = ccp_packet(1, &setting(json!({ "name": "shutter", "degrees": 180 })));
    assert_eq!(
        i32::from_le_bytes(shutter[8..12].try_into().unwrap()),
        18_000
    );
    // Balance and Teinte in one int16 pair.
    let balance = ccp_packet(
        1,
        &setting(json!({ "name": "white_balance", "kelvin": 5600, "tint": 3 })),
    );
    assert_eq!(&balance[4..12], &[1, 2, INT16, 0, 0xE0, 0x15, 3, 0]);
    // Gain: red, green, blue neutral at 1, luma 1.08; a negative value in two's complement.
    let gain = ccp_packet(1, &setting(json!({ "name": "gain", "luma": 1.08 })));
    assert_eq!(gain[1], 12);
    assert_eq!(
        i16::from_le_bytes([gain[14], gain[15]]),
        (1.08f32 * 2048.0).round() as i16
    );
    let gamma = ccp_packet(1, &setting(json!({ "name": "gamma", "luma": -0.5 })));
    assert_eq!(i16::from_le_bytes([gamma[14], gamma[15]]), -1024);
}

#[test]
fn rest_requests_name_the_cameras_api() {
    let (path, body) = &rest_requests(&setting(json!({ "name": "iris", "f_number": 2.8 })))[0];
    assert_eq!(path, "/control/api/v1/lens/iris");
    assert!((body["apertureStop"].as_f64().unwrap() - 2.8).abs() < 1e-6);
    let balance = rest_requests(&setting(
        json!({ "name": "white_balance", "kelvin": 5600, "tint": -3 }),
    ));
    assert_eq!(balance.len(), 2);
    assert_eq!(balance[1].1, json!({ "whiteBalanceTint": -3 }));
    let contrast = rest_requests(&setting(
        json!({ "name": "contrast", "pivot": 0.5, "adjust": 1.0 }),
    ));
    assert_eq!(contrast[0].0, "/control/api/v1/colorCorrection/contrast");
}

#[test]
fn a_wrong_setting_is_refused_never_clamped() {
    let refused = |value: JsonValue| Setting::from_json(&value).unwrap_err();
    assert_eq!(
        refused(json!({ "name": "zoom", "value": 1 })),
        "blackmagic_setting_unknown:zoom"
    );
    assert_eq!(
        refused(json!({ "name": "iso", "iso": 9 })),
        "blackmagic_setting_value_out_of_range:iso"
    );
    assert_eq!(
        refused(json!({ "name": "contrast", "pivot": 0.5 })),
        "blackmagic_setting_value_missing:adjust"
    );
}
