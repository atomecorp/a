//! The fragmented MP4 (ISO BMFF) boxes of a live H.264 stream: the init segment (`ftyp` + `moov`) and one fragment
//! per segment (`moof` + `mdat`). One video track, id 1. The boxes are the one writer's (`atome-mp4`), which also
//! lays a shared project's progressive MP4 proxy.

use super::StreamConfig;
use atome_mp4::boxes::{BoxWriter, avc1, dinf, hdlr, mdhd, mvhd, tkhd, vmhd};

const TRACK_ID: u32 = 1;
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
pub(super) fn init_segment(config: &StreamConfig) -> Vec<u8> {
    let mut ftyp = BoxWriter::new(b"ftyp");
    ftyp.raw(b"iso5")
        .u32(512)
        .raw(b"iso5")
        .raw(b"iso6")
        .raw(b"mp41");
    let mut moov = BoxWriter::new(b"moov");
    moov.child(mvhd(config.timescale, 0, TRACK_ID + 1))
        .child(trak(config))
        .child(mvex());
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

fn minf(config: &StreamConfig) -> Vec<u8> {
    let mut minf = BoxWriter::new(b"minf");
    minf.child(vmhd()).child(dinf()).child(stbl(config));
    minf.finish()
}

// A fragmented stream's sample tables are empty: its samples come in the fragments.
fn stbl(config: &StreamConfig) -> Vec<u8> {
    let mut stsd = BoxWriter::full(b"stsd", 0, 0);
    stsd.u32(1).child(avc1(
        &config.avcc,
        config.width as u16,
        config.height as u16,
    ));
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

fn mvex() -> Vec<u8> {
    let mut trex = BoxWriter::full(b"trex", 0, 0);
    trex.u32(TRACK_ID).u32(1).u32(0).u32(0).u32(0);
    let mut mvex = BoxWriter::new(b"mvex");
    mvex.child(trex.finish());
    mvex.finish()
}

/// One media segment: `moof` (its sequence number, its base decode time, its samples) then `mdat` (their bytes).
pub(super) fn fragment(
    sequence: u32,
    base_decode_time: u64,
    samples: &[FragmentSample],
) -> Vec<u8> {
    let payload: usize = samples.iter().map(|sample| sample.data.len()).sum();
    let mut mfhd = BoxWriter::full(b"mfhd", 0, 0);
    mfhd.u32(sequence);
    let mut tfhd = BoxWriter::full(b"tfhd", 0, TFHD_DEFAULT_BASE_IS_MOOF);
    tfhd.u32(TRACK_ID);
    let mut tfdt = BoxWriter::full(b"tfdt", 1, 0);
    tfdt.u64(base_decode_time);
    let mut trun = BoxWriter::full(b"trun", 0, TRUN_FLAGS);
    // The data offset (0 here) is patched once the moof's size is known.
    trun.u32(samples.len() as u32).u32(0);
    for sample in samples {
        let flags = if sample.key {
            KEY_SAMPLE_FLAGS
        } else {
            DELTA_SAMPLE_FLAGS
        };
        trun.u32(sample.duration)
            .u32(sample.data.len() as u32)
            .u32(flags);
    }
    let trun = trun.finish();
    let mut traf = BoxWriter::new(b"traf");
    traf.child(tfhd.finish()).child(tfdt.finish());
    let trun_at = traf.len();
    traf.child(trun);
    let traf = traf.finish();
    let mut moof = BoxWriter::new(b"moof");
    let mfhd = mfhd.finish();
    let traf_at = 8 + mfhd.len();
    moof.child(mfhd).child(traf);
    let mut moof = moof.finish();
    // The first sample's byte, counted from the moof's start: past the moof and the mdat's header.
    let data_offset = (moof.len() + 8) as u32;
    let offset_at = traf_at + trun_at + 16;
    moof[offset_at..offset_at + 4].copy_from_slice(&data_offset.to_be_bytes());
    let mut bytes = moof;
    bytes.reserve(8 + payload);
    bytes.extend_from_slice(&((8 + payload) as u32).to_be_bytes());
    bytes.extend_from_slice(b"mdat");
    for sample in samples {
        bytes.extend_from_slice(sample.data);
    }
    bytes
}
