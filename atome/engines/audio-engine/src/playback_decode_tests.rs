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

#[test]
fn routes_caf_to_symphonia_whatever_its_extension() {
    let mut bytes = b"caff\x00\x01\x00\x00desc".to_vec();
    bytes.resize(64, 0);
    for extension in [Some("caf"), Some("wav"), None] {
        assert_eq!(
            resolve_native_decode_route(extension, &bytes, "clip").unwrap(),
            NativeDecodeRoute::Symphonia
        );
    }
}

#[test]
fn routes_opus_to_symphonia_and_leaves_vorbis_to_kira() {
    let mut ogg_opus = b"OggS\x00\x02".to_vec();
    ogg_opus.resize(28, 0);
    ogg_opus.extend_from_slice(b"OpusHead");
    let mut webm = vec![0x1a, 0x45, 0xdf, 0xa3];
    webm.resize(64, 0);
    for bytes in [&ogg_opus, &webm] {
        for extension in [Some("opus"), Some("weba"), Some("ogg"), None] {
            assert_eq!(
                resolve_native_decode_route(extension, bytes, "clip").unwrap(),
                NativeDecodeRoute::Symphonia
            );
        }
    }
    let mut ogg_vorbis = b"OggS\x00\x02".to_vec();
    ogg_vorbis.resize(28, 0);
    ogg_vorbis.extend_from_slice(b"\x01vorbis");
    assert_ne!(
        resolve_native_decode_route(Some("ogg"), &ogg_vorbis, "clip").unwrap(),
        NativeDecodeRoute::Symphonia
    );
}
