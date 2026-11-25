//! The fragmented MP4 (ISO BMFF) boxes of a live H.264 stream: the init segment (`ftyp` + `moov`) and one fragment
//! per segment (`moof` + `mdat`). The video track, id 1, and its sound, if any, in AAC, id 2. The boxes are the one
//! writer's (`atome-mp4`), which also lays a shared project's progressive MP4 proxy.

use super::{SoundConfig, StreamConfig};
use atome_mp4::boxes::{BoxWriter, avc1, dinf, hdlr, mdhd, mp4a, mvhd, smhd, tkhd, vmhd};

pub(super) const TRACK_ID: u32 = 1;
pub(super) const SOUND_TRACK_ID: u32 = 2;
/// `trun` flags: data offset, then per sample its duration, its size and its flags.
const TRUN_FLAGS: u32 = 0x00_0001 | 0x00_0100 | 0x00_0200 | 0x00_0400;
/// `tfhd` flag: offsets count from the start of the `moof`.
const TFHD_DEFAULT_BASE_IS_MOOF: u32 = 0x02_0000;
/// A sync sample: `sample_depends_on` = 2 (depends on no other).
pub(super) const KEY_SAMPLE_FLAGS: u32 = 0x0200_0000;
/// A non-sync sample: `sample_depends_on` = 1, `sample_is_non_sync_sample` = 1.
pub(super) const DELTA_SAMPLE_FLAGS: u32 = 0x0101_0000;

/// One sample of a fragment, in the track's timescale.
pub(super) struct FragmentSample<'a> {
    pub data: &'a [u8],
    pub duration: u32,
    pub key: bool,
}

/// `ftyp` + `moov`: what a player reads once before any fragment (`#EXT-X-MAP`).
pub(super) fn init_segment(config: &StreamConfig, sound: Option<&SoundConfig>) -> Vec<u8> {
    let mut ftyp = BoxWriter::new(b"ftyp");
    ftyp.raw(b"iso5")
        .u32(512)
        .raw(b"iso5")
        .raw(b"iso6")
        .raw(b"mp41");
    let mut moov = BoxWriter::new(b"moov");
    moov.child(mvhd(config.timescale, 0, SOUND_TRACK_ID + 1))
        .child(trak(config));
    if let Some(sound) = sound {
        moov.child(sound_trak(sound));
    }
    moov.child(mvex(sound.is_some()));
    let mut bytes = ftyp.finish();
    bytes.extend_from_slice(&moov.finish());
    bytes
}

fn trak(config: &StreamConfig) -> Vec<u8> {
    let mut trak = BoxWriter::new(b"trak");
    trak.child(tkhd(TRACK_ID, 0, 0, config.width, config.height))
        .child(mdia(config));
    trak.finish()
}

fn mdia(config: &StreamConfig) -> Vec<u8> {
    let mut mdia = BoxWriter::new(b"mdia");
    mdia.child(mdhd(config.timescale, 0))
        .child(hdlr(b"vide", b"VideoHandler"))
        .child(minf(config));
    mdia.finish()
}

fn sound_trak(sound: &SoundConfig) -> Vec<u8> {
    let entry = mp4a(&sound.audio_specific_config, 2, sound.rate, sound.bitrate);
    let mut minf = BoxWriter::new(b"minf");
    minf.child(smhd()).child(dinf()).child(stbl(entry));
    let mut mdia = BoxWriter::new(b"mdia");
    mdia.child(mdhd(sound.rate, 0))
        .child(hdlr(b"soun", b"SoundHandler"))
        .child(minf.finish());
    let mut trak = BoxWriter::new(b"trak");
    trak.child(tkhd(SOUND_TRACK_ID, 0, 0x0100, 0, 0))
        .child(mdia.finish());
    trak.finish()
}

fn minf(config: &StreamConfig) -> Vec<u8> {
    let entry = avc1(&config.avcc, config.width as u16, config.height as u16);
    let mut minf = BoxWriter::new(b"minf");
    minf.child(vmhd()).child(dinf()).child(stbl(entry));
    minf.finish()
}

// A fragmented stream's sample tables are empty: its samples come in the fragments.
fn stbl(entry: Vec<u8>) -> Vec<u8> {
    let mut stsd = BoxWriter::full(b"stsd", 0, 0);
    stsd.u32(1).child(entry);
    let mut stts = BoxWriter::full(b"stts", 0, 0);
    stts.u32(0);
    let mut stsc = BoxWriter::full(b"stsc", 0, 0);
    stsc.u32(0);
    let mut stsz = BoxWriter::full(b"stsz", 0, 0);
    stsz.u32(0).u32(0);
    let mut stco = BoxWriter::full(b"stco", 0, 0);
    stco.u32(0);
    let mut stbl = BoxWriter::new(b"stbl");
    stbl.child(stsd.finish())
        .child(stts.finish())
        .child(stsc.finish())
        .child(stsz.finish())
        .child(stco.finish());
    stbl.finish()
}

fn mvex(sound: bool) -> Vec<u8> {
    let mut mvex = BoxWriter::new(b"mvex");
    for track in [TRACK_ID, SOUND_TRACK_ID]
        .into_iter()
        .take(1 + usize::from(sound))
    {
        let mut trex = BoxWriter::full(b"trex", 0, 0);
        trex.u32(track).u32(1).u32(0).u32(0).u32(0);
        mvex.child(trex.finish());
    }
    mvex.finish()
}

/// One track's part of a fragment: its id, the decode time of its first sample, its samples.
pub(super) struct TrackRun<'a> {
    pub track_id: u32,
    pub base_decode_time: u64,
    pub samples: Vec<FragmentSample<'a>>,
}

/// One media segment: `moof` (its sequence number, then per track its base decode time and its samples) then `mdat`
/// (every track's bytes, in the same order).
pub(super) fn fragment(sequence: u32, runs: &[TrackRun]) -> Vec<u8> {
    let mut mfhd = BoxWriter::full(b"mfhd", 0, 0);
    mfhd.u32(sequence);
    let mfhd = mfhd.finish();
    let mut moof = BoxWriter::new(b"moof");
    moof.child(mfhd);
    // Where each run's data offset lies in the moof, patched once the moof's size is known.
    let mut offsets_at = Vec::with_capacity(runs.len());
    for run in runs {
        let (traf, trun_offset_at) = traf(run);
        offsets_at.push(moof.len() + trun_offset_at);
        moof.child(traf);
    }
    let mut moof = moof.finish();
    let payload: usize = runs
        .iter()
        .flat_map(|run| run.samples.iter())
        .map(|sample| sample.data.len())
        .sum();
    // Each run's first byte, counted from the moof's start: past the moof, the mdat's header and the runs before it.
    let mut data_offset = moof.len() + 8;
    for (run, at) in runs.iter().zip(offsets_at) {
        moof[at..at + 4].copy_from_slice(&(data_offset as u32).to_be_bytes());
        data_offset += run
            .samples
            .iter()
            .map(|sample| sample.data.len())
            .sum::<usize>();
    }
    let mut bytes = moof;
    bytes.reserve(8 + payload);
    bytes.extend_from_slice(&((8 + payload) as u32).to_be_bytes());
    bytes.extend_from_slice(b"mdat");
    for sample in runs.iter().flat_map(|run| run.samples.iter()) {
        bytes.extend_from_slice(sample.data);
    }
    bytes
}

/// One track's `traf`, and where its `trun`'s data offset lies in it.
fn traf(run: &TrackRun) -> (Vec<u8>, usize) {
    let mut tfhd = BoxWriter::full(b"tfhd", 0, TFHD_DEFAULT_BASE_IS_MOOF);
    tfhd.u32(run.track_id);
    let mut tfdt = BoxWriter::full(b"tfdt", 1, 0);
    tfdt.u64(run.base_decode_time);
    let mut trun = BoxWriter::full(b"trun", 0, TRUN_FLAGS);
    // The data offset (0 here) is patched once the moof's size is known.
    trun.u32(run.samples.len() as u32).u32(0);
    for sample in &run.samples {
        let flags = if sample.key {
            KEY_SAMPLE_FLAGS
        } else {
            DELTA_SAMPLE_FLAGS
        };
        trun.u32(sample.duration)
            .u32(sample.data.len() as u32)
            .u32(flags);
    }
    let mut traf = BoxWriter::new(b"traf");
    traf.child(tfhd.finish()).child(tfdt.finish());
    // Past what the traf holds so far (its header included), the trun's header (12: size, type, version and flags)
    // and its sample count (4).
    let offset_at = traf.len() + 16;
    traf.child(trun.finish());
    (traf.finish(), offset_at)
}
