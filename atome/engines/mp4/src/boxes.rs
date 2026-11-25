//! The ISO BMFF boxes, written by hand: a box under construction, and the boxes a live fragmented stream
//! (screen-cast `hls/mp4.rs`) and a progressive file (`file.rs`) both lay — the movie and track headers, the
//! handler, the data reference and the sample entries of H.264 (`avc1` + `avcC`) and Opus (`Opus` + `dOps`).

const UNITY_MATRIX: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];
/// Language « und », packed as three 5-bit letters.
const UNDETERMINED_LANGUAGE: u16 = 0x55c4;

/// A box under construction: its header is patched with the size once its body is written.
pub struct BoxWriter {
    bytes: Vec<u8>,
}

impl BoxWriter {
    pub fn new(kind: &[u8; 4]) -> Self {
        let mut bytes = Vec::with_capacity(64);
        bytes.extend_from_slice(&[0, 0, 0, 0]);
        bytes.extend_from_slice(kind);
        Self { bytes }
    }

    /// A full box: its version and its 24-bit flags first.
    pub fn full(kind: &[u8; 4], version: u8, flags: u32) -> Self {
        let mut writer = Self::new(kind);
        writer.u32((u32::from(version) << 24) | (flags & 0x00ff_ffff));
        writer
    }

    pub fn u8(&mut self, value: u8) -> &mut Self {
        self.bytes.push(value);
        self
    }

    pub fn u16(&mut self, value: u16) -> &mut Self {
        self.bytes.extend_from_slice(&value.to_be_bytes());
        self
    }

    pub fn u32(&mut self, value: u32) -> &mut Self {
        self.bytes.extend_from_slice(&value.to_be_bytes());
        self
    }

    pub fn u64(&mut self, value: u64) -> &mut Self {
        self.bytes.extend_from_slice(&value.to_be_bytes());
        self
    }

    pub fn zeros(&mut self, count: usize) -> &mut Self {
        self.bytes.resize(self.bytes.len() + count, 0);
        self
    }

    pub fn raw(&mut self, bytes: &[u8]) -> &mut Self {
        self.bytes.extend_from_slice(bytes);
        self
    }

    pub fn matrix(&mut self) -> &mut Self {
        for value in UNITY_MATRIX {
            self.u32(value);
        }
        self
    }

    pub fn child(&mut self, child: Vec<u8>) -> &mut Self {
        self.raw(&child)
    }

    /// The bytes written so far, the header included.
    pub fn len(&self) -> usize {
        self.bytes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }

    pub fn finish(mut self) -> Vec<u8> {
        let size = self.bytes.len() as u32;
        self.bytes[0..4].copy_from_slice(&size.to_be_bytes());
        self.bytes
    }
}

/// `mvhd`: the movie's clock, its length on that clock (0 for a live stream) and the next free track id.
pub fn mvhd(timescale: u32, duration: u32, next_track_id: u32) -> Vec<u8> {
    let mut mvhd = BoxWriter::full(b"mvhd", 0, 0);
    mvhd.u32(0).u32(0).u32(timescale).u32(duration);
    mvhd.u32(0x0001_0000)
        .u16(0x0100)
        .zeros(10)
        .matrix()
        .zeros(24);
    mvhd.u32(next_track_id);
    mvhd.finish()
}

/// `tkhd`, enabled and in the movie: its id, its length on the movie's clock, its volume (0x0100 for a sound,
/// 0 for a picture) and its picture's size (0 × 0 for a sound).
pub fn tkhd(track_id: u32, duration: u32, volume: u16, width: u32, height: u32) -> Vec<u8> {
    let mut tkhd = BoxWriter::full(b"tkhd", 0, 0x00_0003);
    tkhd.u32(0)
        .u32(0)
        .u32(track_id)
        .u32(0)
        .u32(duration)
        .zeros(8);
    tkhd.u16(0).u16(0).u16(volume).u16(0).matrix();
    tkhd.u32(width << 16).u32(height << 16);
    tkhd.finish()
}

/// `mdhd`: the track's own clock and its length on it.
pub fn mdhd(timescale: u32, duration: u32) -> Vec<u8> {
    let mut mdhd = BoxWriter::full(b"mdhd", 0, 0);
    mdhd.u32(0)
        .u32(0)
        .u32(timescale)
        .u32(duration)
        .u16(UNDETERMINED_LANGUAGE)
        .u16(0);
    mdhd.finish()
}

/// `hdlr`: `vide` or `soun`, and its name (NUL-terminated).
pub fn hdlr(handler: &[u8; 4], name: &[u8]) -> Vec<u8> {
    let mut hdlr = BoxWriter::full(b"hdlr", 0, 0);
    hdlr.u32(0).raw(handler).zeros(12).raw(name).u8(0);
    hdlr.finish()
}

/// `vmhd`, a picture's media header.
pub fn vmhd() -> Vec<u8> {
    let mut vmhd = BoxWriter::full(b"vmhd", 0, 1);
    vmhd.u16(0).zeros(6);
    vmhd.finish()
}

/// `smhd`, a sound's media header (centred balance).
pub fn smhd() -> Vec<u8> {
    let mut smhd = BoxWriter::full(b"smhd", 0, 0);
    smhd.u16(0).u16(0);
    smhd.finish()
}

/// `dinf`: the data lies in this same file, one `url ` entry flagged self-contained.
pub fn dinf() -> Vec<u8> {
    let mut dref = BoxWriter::full(b"dref", 0, 0);
    dref.u32(1).child(BoxWriter::full(b"url ", 0, 1).finish());
    let mut dinf = BoxWriter::new(b"dinf");
    dinf.child(dref.finish());
    dinf.finish()
}

/// `avc1`: an H.264 sample entry, its `avcC` (the AVCDecoderConfigurationRecord: SPS, PPS) as the encoder gave it.
pub fn avc1(avcc: &[u8], width: u16, height: u16) -> Vec<u8> {
    let mut record = BoxWriter::new(b"avcC");
    record.raw(avcc);
    let mut avc1 = BoxWriter::new(b"avc1");
    avc1.zeros(6).u16(1).u16(0).u16(0).zeros(12);
    avc1.u16(width).u16(height);
    avc1.u32(0x0048_0000).u32(0x0048_0000).u32(0).u16(1);
    avc1.zeros(32).u16(0x0018).u16(0xffff);
    avc1.child(record.finish());
    avc1.finish()
}

/// `Opus`: an Opus sample entry (« Encapsulation of Opus in ISO Base Media File Format » §4.3), its `dOps`
/// carrying what an `OpusHead` carries: the channels, the pre-skip (48 kHz samples) and the source's rate.
pub fn opus(channels: u8, pre_skip: u16, input_rate: u32) -> Vec<u8> {
    let mut dops = BoxWriter::new(b"dOps");
    dops.u8(0)
        .u8(channels)
        .u16(pre_skip)
        .u32(input_rate)
        .u16(0)
        .u8(0);
    let mut entry = BoxWriter::new(b"Opus");
    entry.zeros(6).u16(1).zeros(8);
    entry.u16(u16::from(channels)).u16(16).u16(0).u16(0);
    entry.u32(48_000 << 16);
    entry.child(dops.finish());
    entry.finish()
}
