//! The native decode route of each container (playback.rs).

use super::{
    NativeContainer, NativeDecodeRoute, resolve_native_decode_route, sniff_native_container,
};

#[test]
fn routes_iso_bmff_by_signature_without_extension() {
    let bytes = [
        0x00, 0x00, 0x00, 0x18, b'f', b't', b'y', b'p', b'i', b's', b'o', b'm', 0x00, 0x00, 0x02,
        0x00,
    ];
    assert_eq!(sniff_native_container(&bytes), NativeContainer::IsoBmff);
    assert_eq!(
        resolve_native_decode_route(None, &bytes, "clip").unwrap(),
        NativeDecodeRoute::Symphonia
    );
}

#[test]
fn routes_iso_bmff_when_free_box_precedes_ftyp() {
    let bytes = [
        0x00, 0x00, 0x00, 0x08, b'f', b'r', b'e', b'e', 0x00, 0x00, 0x00, 0x18, b'f', b't', b'y',
        b'p', b'i', b's', b'o', b'm',
    ];
    assert_eq!(sniff_native_container(&bytes), NativeContainer::IsoBmff);
    assert_eq!(
        resolve_native_decode_route(Some("mp3"), &bytes, "clip").unwrap(),
        NativeDecodeRoute::Symphonia
    );
}

#[test]
fn rejects_mp3_extension_with_non_mp3_bytes() {
    let bytes = b"not an mp3 stream";
    let error = resolve_native_decode_route(Some("mp3"), bytes, "clip").unwrap_err();
    assert!(error.contains("Native audio container mismatch"));
    assert!(error.contains("extension=mp3"));
}

#[test]
fn routes_wav_bytes_to_kira() {
    let bytes = b"RIFF\x24\x00\x00\x00WAVEfmt ";
    assert_eq!(sniff_native_container(bytes), NativeContainer::Wav);
    assert_eq!(
        resolve_native_decode_route(None, bytes, "clip").unwrap(),
        NativeDecodeRoute::Kira
    );
}

#[test]
fn aiff_and_aiff_c_route_to_symphonia_whatever_the_extension() {
    for form in [b"AIFF", b"AIFC"] {
        let mut bytes = b"FORM\0\0\0\x20".to_vec();
        bytes.extend_from_slice(form);
        bytes.extend_from_slice(&[0; 20]);
        assert_eq!(sniff_native_container(&bytes), NativeContainer::Unknown);
        assert_eq!(
            resolve_native_decode_route(Some("aiff"), &bytes, "loop.aiff"),
            Ok(NativeDecodeRoute::Symphonia)
        );
        assert_eq!(
            resolve_native_decode_route(None, &bytes, "loop"),
            Ok(NativeDecodeRoute::Symphonia)
        );
    }
}
