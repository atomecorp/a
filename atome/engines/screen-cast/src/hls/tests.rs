use super::mp4::{DELTA_SAMPLE_FLAGS, KEY_SAMPLE_FLAGS};
use super::*;

/// A minimal AVCDecoderConfigurationRecord: version 1, High profile, level 3.1, 4-byte lengths, one SPS, one PPS.
pub(super) fn avcc() -> Vec<u8> {
    vec![
        1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x1f, 0x01, 0x00, 0x02,
        0x68, 0xee,
    ]
}

fn stream() -> LiveStream {
    LiveStream::new(StreamConfig {
        width: 640,
        height: 360,
        timescale: 90_000,
        avcc: avcc(),
        sound_rate: None,
    })
    .expect("valid config")
}

/// A frame at `index` of a 30 fps stream (its time rounded down to the microsecond), a key frame every `gop` frames.
pub(super) fn frame(index: i64, gop: i64) -> Sample {
    let byte = (index % 251) as u8;
    Sample {
        data: vec![0, 0, 0, 3, 0x65, byte, byte],
        key: index % gop == 0,
        pts_us: 5_000_000 + index * 1_000_000 / 30,
        duration_us: 33_333,
    }
}

pub(super) struct Mp4Box<'a> {
    pub kind: [u8; 4],
    pub body: &'a [u8],
    pub start: usize,
}

/// The boxes laid one after another in `bytes`, each size checked against what remains.
pub(super) fn walk(bytes: &[u8], base: usize) -> Vec<Mp4Box<'_>> {
    let mut boxes = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        assert!(at + 8 <= bytes.len(), "truncated box header at {at}");
        let size = u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        assert!(
            size >= 8 && at + size <= bytes.len(),
            "box size {size} at {at} overflows"
        );
        boxes.push(Mp4Box {
            kind: bytes[at + 4..at + 8].try_into().unwrap(),
            body: &bytes[at + 8..at + size],
            start: base + at,
        });
        at += size;
    }
    boxes
}

pub(super) fn find<'a>(boxes: &'a [Mp4Box<'a>], kind: &[u8; 4]) -> &'a Mp4Box<'a> {
    boxes
        .iter()
        .find(|found| &found.kind == kind)
        .unwrap_or_else(|| panic!("no {}", String::from_utf8_lossy(kind)))
}

pub(super) fn kinds(boxes: &[Mp4Box]) -> Vec<String> {
    boxes
        .iter()
        .map(|found| String::from_utf8_lossy(&found.kind).into_owned())
        .collect()
}

pub(super) fn be32(bytes: &[u8], at: usize) -> u32 {
    u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap())
}

#[test]
fn init_segment_boxes_nest_consistently() {
    let live = stream();
    let top = walk(live.init_segment(), 0);
    assert_eq!(kinds(&top), ["ftyp", "moov"]);
    assert_eq!(&find(&top, b"ftyp").body[..4], b"iso5");
    let moov = walk(find(&top, b"moov").body, 0);
    assert_eq!(kinds(&moov), ["mvhd", "trak", "mvex"]);
    let trak = walk(find(&moov, b"trak").body, 0);
    assert_eq!(kinds(&trak), ["tkhd", "mdia"]);
    let tkhd = find(&trak, b"tkhd").body;
    assert_eq!(be32(tkhd, tkhd.len() - 8), 640 << 16);
    assert_eq!(be32(tkhd, tkhd.len() - 4), 360 << 16);
    let mdia = walk(find(&trak, b"mdia").body, 0);
    assert_eq!(kinds(&mdia), ["mdhd", "hdlr", "minf"]);
    assert_eq!(be32(find(&mdia, b"mdhd").body, 12), 90_000);
    assert_eq!(&find(&mdia, b"hdlr").body[8..12], b"vide");
    let minf = walk(find(&mdia, b"minf").body, 0);
    assert_eq!(kinds(&minf), ["vmhd", "dinf", "stbl"]);
    let stbl = walk(find(&minf, b"stbl").body, 0);
    assert_eq!(kinds(&stbl), ["stsd", "stts", "stsc", "stsz", "stco"]);
    let stsd = find(&stbl, b"stsd").body;
    let entries = walk(&stsd[8..], 0);
    assert_eq!(kinds(&entries), ["avc1"]);
    let avc1 = entries[0].body;
    assert_eq!(u16::from_be_bytes([avc1[24], avc1[25]]), 640);
    assert_eq!(u16::from_be_bytes([avc1[26], avc1[27]]), 360);
    let inner = walk(&avc1[78..], 0);
    assert_eq!(kinds(&inner), ["avcC"]);
    assert_eq!(inner[0].body, avcc().as_slice());
    let mvex = walk(find(&moov, b"mvex").body, 0);
    assert_eq!(kinds(&mvex), ["trex"]);
}

#[test]
fn a_segment_starts_at_a_key_frame_once_the_open_one_lasts_a_second() {
    let mut live = stream();
    let mut finished = Vec::new();
    // Key frames every 15 frames (0.5 s): segments of 30 frames, cut every other key frame.
    for index in 0..91 {
        if let Some(sequence) = live.push(frame(index, 15)).unwrap() {
            finished.push((index, sequence));
        }
    }
    assert_eq!(finished, [(30, 1), (60, 2), (90, 3)]);
    // A key frame before the second has gone by does not cut.
    let mut short = stream();
    for index in 0..30 {
        assert_eq!(short.push(frame(index, 10)).unwrap(), None);
    }
}

#[test]
fn the_first_frame_must_be_a_key_frame_and_times_must_increase() {
    let mut live = stream();
    assert_eq!(live.push(frame(1, 15)), Err(HlsError::FirstSampleNotKey));
    live.push(frame(0, 15)).unwrap();
    assert_eq!(live.push(frame(0, 15)), Err(HlsError::NonIncreasingTime));
    live.finish();
    assert_eq!(live.push(frame(1, 15)), Err(HlsError::Ended));
}

#[test]
fn fragment_trun_points_at_the_mdat_payload() {
    let mut live = stream();
    let frames: Vec<Sample> = (0..31).map(|index| frame(index, 15)).collect();
    for sample in frames.iter().cloned() {
        live.push(sample).unwrap();
    }
    let bytes = live.segment(1).expect("first segment kept");
    let top = walk(&bytes, 0);
    assert_eq!(kinds(&top), ["moof", "mdat"]);
    let moof = walk(top[0].body, 8);
    assert_eq!(kinds(&moof), ["mfhd", "traf"]);
    assert_eq!(be32(find(&moof, b"mfhd").body, 4), 1);
    let traf = walk(find(&moof, b"traf").body, 0);
    assert_eq!(kinds(&traf), ["tfhd", "tfdt", "trun"]);
    assert_eq!(be32(find(&traf, b"tfhd").body, 0) & 0x02_0000, 0x02_0000);
    let tfdt = find(&traf, b"tfdt").body;
    assert_eq!(tfdt[0], 1);
    assert_eq!(u64::from_be_bytes(tfdt[4..12].try_into().unwrap()), 0);
    let trun = find(&traf, b"trun").body;
    let count = be32(trun, 4) as usize;
    assert_eq!(count, 30);
    let data_offset = be32(trun, 8) as usize;
    let mdat = &top[1];
    assert_eq!(data_offset, mdat.start + 8);
    let mut at = data_offset;
    let mut total = 0u64;
    for (index, sample) in frames.iter().take(count).enumerate() {
        let entry = 12 + index * 12;
        let size = be32(trun, entry + 4) as usize;
        assert_eq!(&bytes[at..at + size], sample.data.as_slice());
        let flags = be32(trun, entry + 8);
        assert_eq!(
            flags,
            if sample.key {
                KEY_SAMPLE_FLAGS
            } else {
                DELTA_SAMPLE_FLAGS
            }
        );
        total += be32(trun, entry) as u64;
        at += size;
    }
    assert_eq!(at, bytes.len());
    // The durations follow the frames' times: the segment ends where frame 30 starts.
    assert_eq!(total, 90_000);
    let second = live.finish().expect("open segment finished");
    let tail = live.segment(second).unwrap();
    let traf = walk(walk(walk(&tail, 0)[0].body, 8)[1].body, 0);
    let tfdt = find(&traf, b"tfdt").body;
    assert_eq!(u64::from_be_bytes(tfdt[4..12].try_into().unwrap()), total);
}

#[test]
fn the_playlist_keeps_the_six_latest_segments_then_ends() {
    let mut live = stream();
    assert!(live.playlist().contains("#EXT-X-MEDIA-SEQUENCE:1\n"));
    // Ten seconds, a key frame every second: nine finished segments, one open.
    for index in 0..300 {
        live.push(frame(index, 30)).unwrap();
    }
    let playlist = live.playlist();
    assert!(playlist.starts_with("#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n"));
    assert!(playlist.contains("#EXT-X-MEDIA-SEQUENCE:4\n"));
    assert!(playlist.contains(
        "#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-START:TIME-OFFSET=-1.0,PRECISE=YES\n#EXT-X-MAP:URI=\"init.mp4\"\n"
    ));
    let uris: Vec<&str> = playlist
        .lines()
        .filter(|line| line.ends_with(".m4s"))
        .collect();
    assert_eq!(uris, ["4.m4s", "5.m4s", "6.m4s", "7.m4s", "8.m4s", "9.m4s"]);
    assert!(playlist.contains("#EXTINF:1.000,\n"));
    assert!(!playlist.contains("ENDLIST"));
    assert_eq!(live.segment(3), None);
    assert!(live.segment(4).is_some());
    assert_eq!(live.finish(), Some(10));
    let ended = live.playlist();
    assert!(ended.ends_with("10.m4s\n#EXT-X-ENDLIST\n"));
    assert!(ended.contains("#EXT-X-MEDIA-SEQUENCE:5\n"));
}

#[test]
fn three_seconds_of_frames_make_a_whole_playable_window() {
    let mut live = stream();
    let mut finished = 0;
    for index in 0..90 {
        finished += live.push(frame(index, 30)).unwrap().is_some() as u32;
    }
    finished += live.finish().is_some() as u32;
    assert_eq!(finished, 3);
    let playlist = live.playlist();
    let durations: Vec<f64> = playlist
        .lines()
        .filter_map(|line| line.strip_prefix("#EXTINF:"))
        .map(|value| value.trim_end_matches(',').parse().unwrap())
        .collect();
    assert_eq!(durations.len(), 3);
    assert!((durations.iter().sum::<f64>() - 3.0).abs() < 0.01);
    for sequence in 1..=3 {
        let bytes = live.segment(sequence).unwrap();
        assert_eq!(kinds(&walk(&bytes, 0)), ["moof", "mdat"]);
    }
}

#[test]
fn a_configuration_without_an_avc_record_is_refused() {
    let refused = LiveStream::new(StreamConfig {
        width: 640,
        height: 360,
        timescale: 90_000,
        avcc: vec![0, 1, 2],
        sound_rate: None,
    });
    assert_eq!(refused.err(), Some(HlsError::InvalidConfig("avcc")));
}
