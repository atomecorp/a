// R-349: the proxy of a project decodes back with the engines' own Opus decoder
// at the render's length and level, from a 48 kHz render and a 44.1 kHz one.

use crate::clip_decode::decode_clip;
use crate::offline_proxy::{PROXY_BITRATE, render_proxy};
use crate::offline_render::render_offline;
use crate::offline_render_tests::{plan, store};

fn rms(samples: impl Iterator<Item = f32>) -> f32 {
    let (sum, count) = samples.fold((0.0f64, 0usize), |(sum, count), value| {
        (sum + f64::from(value) * f64::from(value), count + 1)
    });
    (sum / count.max(1) as f64).sqrt() as f32
}

#[test]
fn a_proxy_decodes_at_the_render_length_and_level() {
    let plan = plan(true, true);
    let rendered = render_offline(&plan, &store()).expect("render").frames;
    let proxy = render_proxy(&plan, &store(), PROXY_BITRATE).expect("proxy");
    assert_eq!((proxy.rate, proxy.frames), (48_000, plan.duration_frames));
    let decoded = decode_clip(proxy.bytes, Some("opus")).expect("decoded");
    assert_eq!(decoded.sample_rate, 48_000);
    assert_eq!(decoded.frames.len() as u64, plan.duration_frames);
    let original = rms(rendered.iter().map(|frame| frame[1]));
    let read = rms(decoded.frames.iter().map(|frame| frame.right));
    let db = 20.0 * (read / original).log10();
    assert!(db.abs() < 0.5, "proxy level off by {db} dB");
}

#[test]
fn a_render_opus_does_not_code_is_brought_to_48_khz() {
    let mut plan = plan(true, false);
    plan.rate = 44_100;
    plan.duration_frames = 26_460;
    let proxy = render_proxy(&plan, &store(), PROXY_BITRATE).expect("proxy");
    let decoded = decode_clip(proxy.bytes, Some("opus")).expect("decoded");
    let expected = 26_460.0 * 48_000.0 / 44_100.0;
    let length = decoded.frames.len() as f64;
    assert!(
        (length - expected).abs() <= 2.0,
        "{length} frames, {expected} expected"
    );
    let level = rms(decoded.frames.iter().map(|frame| frame.right));
    assert!(level > 0.1, "the clips sound: {level}");
}

// The MP4 proxy (a project with a picture): the picture as given, the sound as an Opus track whose edit shows
// exactly the render's length (48 kHz) past the encoder's lookahead.
#[test]
fn an_mp4_proxy_carries_the_picture_and_the_sound_at_its_length() {
    use crate::offline_proxy::{ProxyVideo, SampleInfo, render_proxy_mp4};
    let plan = plan(true, true);
    let images = 24 * plan.duration_frames.div_ceil(48_000) as usize;
    let video = ProxyVideo {
        width: 640,
        height: 360,
        timescale: 24_000,
        avcc: vec![1, 0x4d, 0, 0x28, 0xff, 0xe1, 0, 2, 0x67, 0x4d, 0xe1, 0, 0],
        data: [0, 0, 0, 1, 0x65].repeat(images),
        samples: (0..images)
            .map(|index| SampleInfo {
                size: 5,
                duration: 1_000,
                key: index == 0,
            })
            .collect(),
    };
    let proxy = render_proxy_mp4(&plan, &store(), PROXY_BITRATE, &video).expect("mp4");
    let bytes = &proxy.bytes;
    assert_eq!(&bytes[4..8], b"ftyp");
    let at = |kind: &[u8; 4]| bytes.windows(4).position(|window| window == kind);
    assert_eq!(
        bytes.windows(4).filter(|window| window == b"trak").count(),
        2
    );
    assert!(at(b"avcC").is_some() && at(b"dOps").is_some());
    let elst = at(b"elst").expect("the sound's edit") + 4;
    let word = |offset: usize| u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap());
    // version/flags, count, then the shown length in milliseconds and the media time (the pre-skip).
    let shown_ms = u64::from(word(elst + 8));
    assert_eq!(shown_ms, plan.duration_frames * 1_000 / 48_000);
    assert!(word(elst + 12) > 0, "the lookahead is skipped");
}
