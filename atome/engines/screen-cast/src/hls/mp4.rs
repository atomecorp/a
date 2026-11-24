//! The fragmented MP4 (ISO BMFF) boxes of a live H.264 stream, written by hand: the init segment (`ftyp` + `moov`)
//! and one fragment per segment (`moof` + `mdat`). One video track, id 1.

use super::StreamConfig;

const TRACK_ID: u32 = 1;
/// `trun` flags: data offset, then per sample its duration, its size and its flags.
const TRUN_FLAGS: u32 = 0x00_0001 | 0x00_0100 | 0x00_0200 | 0x00_0400;
/// `tfhd` flag: offsets count from the start of the `moof`.
const TFHD_DEFAULT_BASE_IS_MOOF: u32 = 0x02_0000;
/// A sync sample: `sample_depends_on` = 2 (depends on no other).
pub(super) const KEY_SAMPLE_FLAGS: u32 = 0x0200_0000;
/// A non-sync sample: `sample_depends_on` = 1, `sample_is_non_sync_sample` = 1.
pub(super) const DELTA_SAMPLE_FLAGS: u32 = 0x0101_0000;
const UNITY_MATRIX: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];

/// One sample of a fragment, in the track's timescale.
pub(super) struct FragmentSample<'a> {
    pub data: &'a [u8],
    pub duration: u32,
    pub key: bool,
}

/// A box under construction: its header is patched with the size once its body is written.
struct BoxWriter {
    bytes: Vec<u8>,
}

impl BoxWriter {
    fn new(kind: &[u8; 4]) -> Self {
        let mut bytes = Vec::with_capacity(64);
        bytes.extend_from_slice(&[0, 0, 0, 0]);
        bytes.extend_from_slice(kind);
        Self { bytes }
    }

    fn full(kind: &[u8; 4], version: u8, flags: u32) -> Self {
        let mut writer = Self::new(kind);
        writer.u32(((version as u32) << 24) | (flags & 0x00ff_ffff));
        writer
    }

    fn u16(&mut self, value: u16) -> &mut Self {
        self.bytes.extend_from_slice(&value.to_be_bytes());
        self
    }

    fn u32(&mut self, value: u32) -> &mut Self {
        self.bytes.extend_from_slice(&value.to_be_bytes());
        self
    }

    fn u64(&mut self, value: u64) -> &mut Self {
        self.bytes.extend_from_slice(&value.to_be_bytes());
        self
    }

    fn zeros(&mut self, count: usize) -> &mut Self {
        self.bytes.resize(self.bytes.len() + count, 0);
        self
    }

    fn raw(&mut self, bytes: &[u8]) -> &mut Self {
        self.bytes.extend_from_slice(bytes);
        self
    }

    fn matrix(&mut self) -> &mut Self {
        for value in UNITY_MATRIX {
            self.u32(value);
        }
        self
    }

    fn child(&mut self, child: Vec<u8>) -> &mut Self {
        self.raw(&child)
    }

    fn finish(mut self) -> Vec<u8> {
        let size = self.bytes.len() as u32;
        self.bytes[0..4].copy_from_slice(&size.to_be_bytes());
        self.bytes
    }
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
    moov.child(mvhd(config.timescale))
        .child(trak(config))
        .child(mvex());
    let mut bytes = ftyp.finish();
    bytes.extend_from_slice(&moov.finish());
    bytes
}

fn mvhd(timescale: u32) -> Vec<u8> {
    let mut mvhd = BoxWriter::full(b"mvhd", 0, 0);
    mvhd.u32(0).u32(0).u32(timescale).u32(0);
    mvhd.u32(0x0001_0000)
        .u16(0x0100)
        .zeros(10)
        .matrix()
        .zeros(24);
    mvhd.u32(TRACK_ID + 1);
    mvhd.finish()
}

fn trak(config: &StreamConfig) -> Vec<u8> {
    let mut tkhd = BoxWriter::full(b"tkhd", 0, 0x00_0003);
    tkhd.u32(0).u32(0).u32(TRACK_ID).u32(0).u32(0).zeros(8);
    tkhd.u16(0).u16(0).u16(0).u16(0).matrix();
    tkhd.u32(config.width << 16).u32(config.height << 16);
    let mut trak = BoxWriter::new(b"trak");
    trak.child(tkhd.finish()).child(mdia(config));
    trak.finish()
}

fn mdia(config: &StreamConfig) -> Vec<u8> {
    let mut mdhd = BoxWriter::full(b"mdhd", 0, 0);
    // Language « und », packed as three 5-bit letters.
    mdhd.u32(0)
        .u32(0)
        .u32(config.timescale)
        .u32(0)
        .u16(0x55c4)
        .u16(0);
    let mut hdlr = BoxWriter::full(b"hdlr", 0, 0);
    hdlr.u32(0).raw(b"vide").zeros(12).raw(b"VideoHandler\0");
    let mut mdia = BoxWriter::new(b"mdia");
    mdia.child(mdhd.finish())
        .child(hdlr.finish())
        .child(minf(config));
    mdia.finish()
}

fn minf(config: &StreamConfig) -> Vec<u8> {
    let mut vmhd = BoxWriter::full(b"vmhd", 0, 1);
    vmhd.u16(0).zeros(6);
    // The data lies in this same file: one `url ` entry flagged self-contained.
    let mut dref = BoxWriter::full(b"dref", 0, 0);
    dref.u32(1).child(BoxWriter::full(b"url ", 0, 1).finish());
    let mut dinf = BoxWriter::new(b"dinf");
    dinf.child(dref.finish());
    let mut minf = BoxWriter::new(b"minf");
    minf.child(vmhd.finish())
        .child(dinf.finish())
        .child(stbl(config));
    minf.finish()
}

fn stbl(config: &StreamConfig) -> Vec<u8> {
    let mut avcc = BoxWriter::new(b"avcC");
    avcc.raw(&config.avcc);
    let mut avc1 = BoxWriter::new(b"avc1");
    avc1.zeros(6).u16(1).u16(0).u16(0).zeros(12);
    avc1.u16(config.width as u16).u16(config.height as u16);
    avc1.u32(0x0048_0000).u32(0x0048_0000).u32(0).u16(1);
    avc1.zeros(32).u16(0x0018).u16(0xffff);
    avc1.child(avcc.finish());
    let mut stsd = BoxWriter::full(b"stsd", 0, 0);
    stsd.u32(1).child(avc1.finish());
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
    let trun_at = traf.bytes.len();
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
