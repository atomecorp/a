use super::file::{MP4_TOO_LARGE, MP4_TRACK_INVALID, MP4_TRACKS_MISSING};
use super::*;

fn avcc() -> Vec<u8> {
    vec![
        1, 0x4d, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x4d, 0x00, 0x28, 0x01, 0x00, 0x02,
        0x68, 0xee,
    ]
}

/// The boxes laid one after another in `bytes`: (kind, body start, body end), sizes checked.
fn walk(bytes: &[u8]) -> Vec<([u8; 4], usize, usize)> {
    let mut boxes = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        let size = u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        assert!(
            size >= 8 && at + size <= bytes.len(),
            "box at {at} overflows"
        );
        boxes.push((bytes[at + 4..at + 8].try_into().unwrap(), at + 8, at + size));
        at += size;
    }
    boxes
}

/// The body of the box at `path` (each step a child kind), past a sample table's or a sample entry's own fields.
fn dig<'a>(bytes: &'a [u8], path: &[&[u8; 4]]) -> &'a [u8] {
    let mut body = bytes;
    for kind in path {
        let skip = if *kind == b"stsd" { 8 } else { 0 };
        let found = walk(body)
            .into_iter()
            .find(|(found, ..)| found == *kind)
            .unwrap_or_else(|| panic!("{} missing", String::from_utf8_lossy(*kind)));
        body = &body[found.1 + skip..found.2];
        if *kind == b"avc1" {
            body = &body[78..];
        } else if *kind == b"Opus" {
            body = &body[28..];
        }
    }
    body
}

fn word(bytes: &[u8], at: usize) -> u32 {
    u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap())
}

/// The `trak` bodies of a file, in order.
fn traks(file: &[u8]) -> Vec<&[u8]> {
    let moov = dig(file, &[b"moov"]);
    walk(moov)
        .into_iter()
        .filter(|(kind, ..)| kind == b"trak")
        .map(|(_, start, end)| &moov[start..end])
        .collect()
}

/// Three seconds at 24 images a second, a key image every 48, each image's bytes its own index.
fn picture() -> (Vec<SampleInfo>, Vec<u8>) {
    let samples: Vec<SampleInfo> = (0..72)
        .map(|index| SampleInfo {
            size: 5,
            duration: 1_000,
            key: index % 48 == 0,
        })
        .collect();
    let data = (0..72u8).flat_map(|index| [0, 0, 0, 1, index]).collect();
    (samples, data)
}

/// Three seconds of 20 ms Opus packets (150), each 3 bytes, 0xA0 + its index.
fn sound() -> (Vec<SampleInfo>, Vec<u8>) {
    let samples = vec![
        SampleInfo {
            size: 3,
            duration: 960,
            key: true,
        };
        150
    ];
    let data = (0..150u32)
        .flat_map(|index| [0xa0, (index >> 8) as u8, index as u8])
        .collect();
    (samples, data)
}

fn file() -> Vec<u8> {
    let (video, video_data) = picture();
    let (audio, audio_data) = sound();
    write_mp4(&[
        Track {
            codec: Codec::Avc {
                avcc: avcc(),
                width: 640,
                height: 360,
            },
            timescale: 24_000,
            samples: video,
            data: &video_data,
            edit: None,
        },
        Track {
            codec: Codec::Opus {
                channels: 2,
                pre_skip: 312,
                input_rate: 48_000,
            },
            timescale: 48_000,
            samples: audio,
            data: &audio_data,
            edit: Some(Edit {
                media_time: 312,
                duration: 144_000,
            }),
        },
    ])
    .expect("a file")
}

#[test]
fn a_progressive_file_lays_ftyp_moov_then_mdat() {
    let file = file();
    let kinds: Vec<[u8; 4]> = walk(&file).into_iter().map(|(kind, ..)| kind).collect();
    assert_eq!(kinds, vec![*b"ftyp", *b"moov", *b"mdat"]);
    let mvhd = dig(&file, &[b"moov", b"mvhd"]);
    assert_eq!(word(mvhd, 12), 1_000, "the movie's clock");
    assert_eq!(word(mvhd, 16), 3_000, "three seconds");
    assert_eq!(word(mvhd, 96), 3, "next track id");
}

#[test]
fn each_chunk_offset_points_at_its_first_sample() {
    let file = file();
    for (trak, first_byte) in traks(&file).into_iter().zip([0u8, 0xa0]) {
        let stbl = dig(trak, &[b"mdia", b"minf", b"stbl"]);
        let stco = dig(stbl, &[b"stco"]);
        let count = word(stco, 4) as usize;
        assert!(count >= 3, "a chunk a second at least");
        for chunk in 0..count {
            let offset = word(stco, 8 + chunk * 4) as usize;
            let expected = if first_byte == 0 { 0 } else { 0xa0 };
            assert_eq!(file[offset], expected, "chunk {chunk} lands on a sample");
        }
        // The samples of the first chunk follow its offset in order.
        let first = word(stco, 8) as usize;
        if first_byte == 0 {
            assert_eq!(&file[first..first + 10], &[0, 0, 0, 1, 0, 0, 0, 0, 1, 1]);
        } else {
            assert_eq!(&file[first..first + 6], &[0xa0, 0, 0, 0xa0, 0, 1]);
        }
    }
}

#[test]
fn the_picture_names_its_key_images_and_the_sound_its_edit() {
    let file = file();
    let traks = traks(&file);
    let video = dig(traks[0], &[b"mdia", b"minf", b"stbl"]);
    let stss = dig(video, &[b"stss"]);
    assert_eq!(word(stss, 4), 2);
    assert_eq!((word(stss, 8), word(stss, 12)), (1, 49));
    let stts = dig(video, &[b"stts"]);
    assert_eq!(
        (word(stts, 4), word(stts, 8), word(stts, 12)),
        (1, 72, 1_000)
    );
    assert_eq!(dig(video, &[b"stsd", b"avc1", b"avcC"]), avcc().as_slice());
    let audio = dig(traks[1], &[b"mdia", b"minf", b"stbl"]);
    assert!(walk(audio).iter().all(|(kind, ..)| kind != b"stss"));
    let dops = dig(audio, &[b"stsd", b"Opus", b"dOps"]);
    assert_eq!(dops, &[0, 2, 0x01, 0x38, 0, 0, 0xbb, 0x80, 0, 0, 0]);
    let elst = dig(traks[1], &[b"edts", b"elst"]);
    assert_eq!(
        (word(elst, 4), word(elst, 8), word(elst, 12)),
        (1, 3_000, 312)
    );
    let mdhd = dig(traks[1], &[b"mdia", b"mdhd"]);
    assert_eq!((word(mdhd, 12), word(mdhd, 16)), (48_000, 144_000));
}

#[test]
fn a_track_that_does_not_hold_together_is_refused() {
    assert_eq!(write_mp4(&[]).unwrap_err(), MP4_TRACKS_MISSING);
    let (mut samples, data) = picture();
    samples[0].key = false;
    let refused = write_mp4(&[Track {
        codec: Codec::Avc {
            avcc: avcc(),
            width: 2,
            height: 2,
        },
        timescale: 24_000,
        samples,
        data: &data,
        edit: None,
    }])
    .unwrap_err();
    assert!(refused.starts_with(MP4_TRACK_INVALID), "{refused}");
    let (samples, data) = sound();
    let refused = write_mp4(&[Track {
        codec: Codec::Opus {
            channels: 2,
            pre_skip: 0,
            input_rate: 48_000,
        },
        timescale: 48_000,
        samples,
        data: &data[1..],
        edit: None,
    }])
    .unwrap_err();
    assert!(refused.starts_with(MP4_TRACK_INVALID), "{refused}");
    assert_eq!(MP4_TOO_LARGE, "mp4_too_large");
}
