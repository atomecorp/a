//! The sound track of a live stream (R-248): declared in the init segment, carried in each fragment after the
//! pictures, on the pictures' clock, silence filling an engine at rest.

use super::tests::{avcc, be32, find, frame, kinds, walk};
use super::*;

const RATE: u32 = 48_000;

fn sounding_stream() -> LiveStream {
    LiveStream::new(StreamConfig {
        width: 640,
        height: 360,
        timescale: 90_000,
        avcc: avcc(),
        sound_rate: Some(RATE),
    })
    .expect("valid config with sound")
}

/// `frames` stereo frames of a 440 Hz tone from frame `from`.
fn tone(from: usize, frames: usize) -> Vec<f32> {
    (from..from + frames)
        .flat_map(|index| {
            let value = (index as f32 * 440.0 * std::f32::consts::TAU / RATE as f32).sin() * 0.5;
            [value, value]
        })
        .collect()
}

#[test]
fn the_init_segment_declares_an_aac_track_beside_the_picture() {
    let live = sounding_stream();
    let top = walk(live.init_segment(), 0);
    let moov = walk(find(&top, b"moov").body, 0);
    assert_eq!(kinds(&moov), ["mvhd", "trak", "trak", "mvex"]);
    let sound = walk(moov[2].body, 0);
    let mdia = walk(find(&sound, b"mdia").body, 0);
    assert_eq!(be32(find(&mdia, b"mdhd").body, 12), RATE);
    assert_eq!(&find(&mdia, b"hdlr").body[8..12], b"soun");
    let minf = walk(find(&mdia, b"minf").body, 0);
    assert_eq!(kinds(&minf), ["smhd", "dinf", "stbl"]);
    let stbl = walk(find(&minf, b"stbl").body, 0);
    let entries = walk(&find(&stbl, b"stsd").body[8..], 0);
    assert_eq!(kinds(&entries), ["mp4a"]);
    let mp4a = entries[0].body;
    assert_eq!(u16::from_be_bytes([mp4a[16], mp4a[17]]), 2);
    assert_eq!(be32(mp4a, 24) >> 16, RATE);
    let esds = walk(&mp4a[28..], 0);
    assert_eq!(kinds(&esds), ["esds"]);
    // The AudioSpecificConfig ends the decoder's descriptors: AAC-LC, 48 kHz (index 3), stereo.
    let config = audio_specific_config_of(esds[0].body);
    assert_eq!(config, [0x11, 0x90]);
    let mvex = walk(find(&moov, b"mvex").body, 0);
    assert_eq!(kinds(&mvex), ["trex", "trex"]);
}

fn audio_specific_config_of(esds: &[u8]) -> [u8; 2] {
    let at = esds
        .windows(2)
        .position(|pair| pair == [0x05, 0x02])
        .expect("DecoderSpecificInfo");
    [esds[at + 2], esds[at + 3]]
}

/// Two seconds of pictures, the engine's sound handed after each picture as a device hands it.
fn two_seconds(live: &mut LiveStream, sounding: bool) {
    let mut fed = 0;
    for index in 0..61 {
        live.push(frame(index, 30)).unwrap();
        let due = ((index as usize) * RATE as usize) / 30;
        let chunk = due.saturating_sub(fed);
        if sounding {
            live.push_sound(&tone(fed, chunk)).unwrap();
        } else {
            live.push_sound(&[]).unwrap();
        }
        fed += chunk;
    }
}

/// The sound track's samples of a segment: (their count, the bytes of the mdat they point at).
fn sound_run(bytes: &[u8]) -> (usize, u64, usize) {
    let top = walk(bytes, 0);
    assert_eq!(kinds(&top), ["moof", "mdat"]);
    let moof = walk(top[0].body, 8);
    assert_eq!(kinds(&moof), ["mfhd", "traf", "traf"]);
    let traf = walk(moof[2].body, 0);
    assert_eq!(be32(find(&traf, b"tfhd").body, 4), 2);
    let tfdt = find(&traf, b"tfdt").body;
    let base = u64::from_be_bytes(tfdt[4..12].try_into().unwrap());
    let trun = find(&traf, b"trun").body;
    let count = be32(trun, 4) as usize;
    let offset = be32(trun, 8) as usize;
    let sizes: usize = (0..count)
        .map(|index| be32(trun, 12 + index * 12 + 4) as usize)
        .sum();
    // The sound's bytes close the mdat, after the pictures'.
    assert_eq!(offset + sizes, bytes.len());
    for index in 0..count {
        assert_eq!(be32(trun, 12 + index * 12), aac::AAC_FRAMES as u32);
    }
    (count, base, sizes)
}

#[test]
fn each_segment_carries_the_sound_heard_with_its_pictures() {
    let mut live = sounding_stream();
    two_seconds(&mut live, true);
    let (first, base, bytes) = sound_run(&live.segment(1).unwrap());
    assert_eq!(base, 0);
    // One second of sound, less what the encoder holds while it primes.
    assert!(
        (44..=47).contains(&first),
        "{first} packets in the first second"
    );
    assert!(
        bytes > first * 100,
        "a tone encodes to real packets ({bytes} bytes)"
    );
    let (_, second_base, _) = sound_run(&live.segment(2).unwrap());
    assert_eq!(second_base, (first * aac::AAC_FRAMES) as u64);
}

#[test]
fn silence_fills_an_engine_at_rest() {
    let mut live = sounding_stream();
    two_seconds(&mut live, false);
    let (count, _, _) = sound_run(&live.segment(1).unwrap());
    // The track keeps the pictures' pace, a tenth of a second behind at most.
    assert!((40..=47).contains(&count), "{count} packets of silence");
}
