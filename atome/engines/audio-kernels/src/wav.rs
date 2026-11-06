// WAV in and out, the one codec of every page (cahier sampler §8.4 « Figer », §9
// formats): a file's shape and the sampler metadata it carries — `smpl` (root
// note, fine tune, loops) and `acid` (root, tempo, beats) — its PCM read from
// 8/16/24/32-bit PCM or 32/64-bit float (WAVE_FORMAT_EXTENSIBLE included), and
// files written as 16/24-bit PCM or 32-bit float from samples, or as 8/16/24-bit
// PCM from integers with a `smpl` chunk. A loop end is inclusive in a WAV and
// exclusive in eVe (instrument_schema.js): it is converted here, once.
use crate::{KernelError, Result, UNREADABLE, UNSUPPORTED, js_round, require_channels};
use serde::Serialize;

pub const FORMAT_PCM: u16 = 1;
pub const FORMAT_FLOAT: u16 = 3;
const FORMAT_EXTENSIBLE: u16 = 0xfffe;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SmplLoop {
    pub start: u32,
    pub end: u64,
    pub ping_pong: bool,
    pub reverse: bool,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Smpl {
    pub root: Option<u32>,
    pub tune_cents: f64,
    pub loops: Vec<SmplLoop>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Acid {
    pub one_shot: bool,
    pub root: Option<u16>,
    pub beats: u32,
    pub tempo: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WavInfo {
    pub format: u16,
    pub channels: u16,
    pub sample_rate: u32,
    pub bits: u16,
    pub frames: usize,
    /// The data chunk's body: its offset and its size, cut to the bytes there are.
    pub data: (usize, usize),
    pub smpl: Option<Smpl>,
    pub acid: Option<Acid>,
}

fn u16_at(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}
fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

fn read_smpl(body: &[u8]) -> Option<Smpl> {
    if body.len() < 36 {
        return None;
    }
    let unity = u32_at(body, 12);
    let fraction = u32_at(body, 16);
    let count = u32_at(body, 28) as usize;
    let loops = (0..count)
        .take_while(|index| 36 + (index + 1) * 24 <= body.len())
        .map(|index| {
            let base = 36 + index * 24;
            let kind = u32_at(body, base + 4);
            SmplLoop {
                start: u32_at(body, base + 8),
                end: u64::from(u32_at(body, base + 12)) + 1,
                ping_pong: kind == 1,
                reverse: kind == 2,
                count: u32_at(body, base + 20),
            }
        })
        .collect();
    Some(Smpl {
        root: (unity <= 127).then_some(unity),
        tune_cents: f64::from(fraction) / 4_294_967_296.0 * 100.0,
        loops,
    })
}

fn read_acid(body: &[u8]) -> Option<Acid> {
    if body.len() < 24 {
        return None;
    }
    let flags = u32_at(body, 0);
    let tempo = f32::from_le_bytes([body[20], body[21], body[22], body[23]]);
    Some(Acid {
        one_shot: flags & 0x01 != 0,
        root: (flags & 0x02 != 0).then(|| u16_at(body, 4)),
        beats: u32_at(body, 12),
        tempo: (tempo.is_finite() && tempo > 0.0).then_some(tempo),
    })
}

/// Whether `bytes` are a RIFF WAVE file.
pub fn is_wav(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE"
}

/// The shape of a WAV file and its sampler metadata.
pub fn read_info(bytes: &[u8]) -> Result<WavInfo> {
    read_info_from(bytes.len(), &|at, count| {
        bytes[at.min(bytes.len())..(at + count).min(bytes.len())].to_vec()
    })
}

/// `read_info` over a file of `total` bytes read in parts (`read(at, count)`, cut at the end):
/// only the chunk headers and the metadata chunks are read, never the sound itself.
pub fn read_info_from(total: usize, read: &dyn Fn(usize, usize) -> Vec<u8>) -> Result<WavInfo> {
    if total < 12 || !is_wav(&read(0, 12)) {
        return Err(KernelError::new(UNREADABLE, "not a RIFF WAVE file"));
    }
    let mut info = WavInfo {
        format: 0,
        channels: 0,
        sample_rate: 0,
        bits: 0,
        frames: 0,
        data: (0, 0),
        smpl: None,
        acid: None,
    };
    let mut has_data = false;
    let mut at = 12;
    while at + 8 <= total {
        let head = read(at, 8);
        let size = u32_at(&head, 4) as usize;
        let body = at + 8;
        let available = size.min(total.saturating_sub(body));
        match &head[0..4] {
            b"fmt " if available >= 16 => {
                let chunk = read(body, available.min(40));
                let tag = u16_at(&chunk, 0);
                info.format = if tag == FORMAT_EXTENSIBLE && chunk.len() >= 26 {
                    u16_at(&chunk, 24)
                } else {
                    tag
                };
                info.channels = u16_at(&chunk, 2);
                info.sample_rate = u32_at(&chunk, 4);
                info.bits = u16_at(&chunk, 14);
            }
            b"data" => {
                info.data = (body, available);
                has_data = true;
            }
            b"smpl" => info.smpl = read_smpl(&read(body, available)),
            b"acid" => info.acid = read_acid(&read(body, available)),
            _ => {}
        }
        at = body + size + (size % 2);
    }
    if !has_data || info.channels == 0 || info.bits == 0 {
        return Err(KernelError::new(
            UNREADABLE,
            "a WAVE file needs its fmt and data chunks",
        ));
    }
    if info.format != FORMAT_PCM && info.format != FORMAT_FLOAT {
        return Err(KernelError::new(
            UNSUPPORTED,
            format!("WAVE format {} is not PCM", info.format),
        ));
    }
    info.frames = info.data.1 / (usize::from(info.channels) * usize::from(info.bits / 8).max(1));
    Ok(info)
}

/// The PCM of a WAV file, one channel after another.
pub fn decode(bytes: &[u8], info: &WavInfo) -> Result<Vec<Vec<f32>>> {
    let width = usize::from(info.bits / 8);
    let read: fn(&[u8]) -> f32 = match (info.format, info.bits) {
        (FORMAT_FLOAT, 32) => |b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]),
        (FORMAT_FLOAT, 64) => {
            |b| f64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]) as f32
        }
        (FORMAT_PCM, 8) => |b| (f64::from(b[0]) - 128.0) as f32 / 128.0,
        (FORMAT_PCM, 16) => |b| f32::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0,
        (FORMAT_PCM, 24) => {
            |b| (f64::from(i32::from_le_bytes([0, b[0], b[1], b[2]]) >> 8) / 8_388_608.0) as f32
        }
        (FORMAT_PCM, 32) => {
            |b| (f64::from(i32::from_le_bytes([b[0], b[1], b[2], b[3]])) / 2_147_483_648.0) as f32
        }
        _ => {
            return Err(KernelError::new(
                UNSUPPORTED,
                format!("WAVE {}-bit format {} is not read", info.bits, info.format),
            ));
        }
    };
    let channels = usize::from(info.channels);
    let data = &bytes[info.data.0..info.data.0 + info.frames * channels * width];
    let mut out = vec![Vec::with_capacity(info.frames); channels];
    for frame in data.chunks_exact(channels * width) {
        for (channel, sample) in out.iter_mut().zip(frame.chunks_exact(width)) {
            channel.push(read(sample));
        }
    }
    Ok(out)
}

/// The integer PCM of an 8/16/24-bit PCM WAV, for a lossless FLAC.
pub fn decode_integers(bytes: &[u8], info: &WavInfo) -> Result<Vec<Vec<i32>>> {
    if info.format != FORMAT_PCM || ![8, 16, 24].contains(&info.bits) {
        return Err(KernelError::new(
            UNSUPPORTED,
            format!(
                "a {}-bit format {} WAVE has no lossless FLAC here",
                info.bits, info.format
            ),
        ));
    }
    let width = usize::from(info.bits / 8);
    let channels = usize::from(info.channels);
    let read = |b: &[u8]| match width {
        1 => i32::from(b[0]) - 128,
        2 => i32::from(i16::from_le_bytes([b[0], b[1]])),
        _ => i32::from_le_bytes([0, b[0], b[1], b[2]]) >> 8,
    };
    let data = &bytes[info.data.0..info.data.0 + info.frames * channels * width];
    let mut out = vec![Vec::with_capacity(info.frames); channels];
    for frame in data.chunks_exact(channels * width) {
        for (channel, sample) in out.iter_mut().zip(frame.chunks_exact(width)) {
            channel.push(read(sample));
        }
    }
    Ok(out)
}

fn header(
    out: &mut Vec<u8>,
    total: usize,
    format: u16,
    channels: usize,
    rate: u32,
    bits: u16,
    data: usize,
) {
    let block = channels * usize::from(bits / 8);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((total - 8) as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&format.to_le_bytes());
    out.extend_from_slice(&(channels as u16).to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate.wrapping_mul(block as u32)).to_le_bytes());
    out.extend_from_slice(&(block as u16).to_le_bytes());
    out.extend_from_slice(&bits.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data as u32).to_le_bytes());
}

/// `bits` 32 (float) or 16 and 24 (PCM) at a whole `sample_rate`, else the refusal.
fn float_format(sample_rate: u32, bits: u16) -> Result<()> {
    if ![16, 24, 32].contains(&bits) {
        return Err(KernelError::new(
            crate::INVALID_ARGUMENT,
            "bits is 16, 24, 32",
        ));
    }
    if sample_rate == 0 {
        return Err(KernelError::new(
            crate::INVALID_ARGUMENT,
            "sampleRate must be a whole number",
        ));
    }
    Ok(())
}

/// The 44-byte header of the float-sample WAV `encode` writes: `frames` frames of `channels`.
/// A file written as it comes (the native recorder) writes it first with the frames unknown (0),
/// then again once they are counted.
pub fn float_header(
    channels: usize,
    sample_rate: u32,
    bits: u16,
    frames: usize,
) -> Result<Vec<u8>> {
    float_format(sample_rate, bits)?;
    let data = frames * channels * usize::from(bits / 8);
    let mut out = Vec::with_capacity(44);
    header(
        &mut out,
        44 + data,
        if bits == 32 { FORMAT_FLOAT } else { FORMAT_PCM },
        channels,
        sample_rate,
        bits,
        data,
    );
    Ok(out)
}

/// One float sample as `encode` writes it at `bits` (a header from `float_header`): 32 as it is,
/// 16 and 24 clamped to ±1 and rounded to their step.
pub fn push_float_sample(out: &mut Vec<u8>, value: f32, bits: u16) {
    let level = |scale: f64| js_round(f64::from(value.clamp(-1.0, 1.0)) * scale) as i32;
    match bits {
        32 => out.extend_from_slice(&value.to_le_bytes()),
        16 => out.extend_from_slice(&(level(32767.0) as i16).to_le_bytes()),
        _ => out.extend_from_slice(&level(8_388_607.0).to_le_bytes()[..3]),
    }
}

/// WAV bytes of float `channels`: `bits` 32 is float, 16 and 24 are PCM, each sample clamped to
/// ±1 and rounded to its step.
pub fn encode(channels: &[&[f32]], sample_rate: u32, bits: u16) -> Result<Vec<u8>> {
    let frames = require_channels(channels)?;
    let mut out = float_header(channels.len(), sample_rate, bits, frames)?;
    out.reserve(frames * channels.len() * usize::from(bits / 8));
    for frame in 0..frames {
        for channel in channels {
            push_float_sample(&mut out, channel[frame], bits);
        }
    }
    Ok(out)
}

/// A loop written into a `smpl` chunk (end exclusive, as eVe counts it).
pub struct LoopOut {
    pub start: u32,
    pub end: u32,
    pub ping_pong: bool,
}

/// A PCM WAV of integer `channels` (`bits` 8, 16 or 24 deep), with a `smpl` chunk when `smpl`
/// (root note, loops) is given.
pub fn encode_integers(
    channels: &[&[i32]],
    sample_rate: u32,
    bits: u16,
    smpl: Option<(u32, &[LoopOut])>,
) -> Result<Vec<u8>> {
    let frames = require_channels(channels)?;
    if ![8, 16, 24].contains(&bits) {
        return Err(KernelError::new(
            UNSUPPORTED,
            format!("a {bits}-bit PCM WAVE is not written"),
        ));
    }
    let data = frames * channels.len() * usize::from(bits / 8);
    let smpl_size = smpl.map_or(0, |(_, loops)| 36 + loops.len() * 24);
    let total = 44 + data + data % 2 + smpl.map_or(0, |_| 8 + smpl_size);
    let mut out = Vec::with_capacity(total);
    header(
        &mut out,
        total,
        FORMAT_PCM,
        channels.len(),
        sample_rate,
        bits,
        data,
    );
    for frame in 0..frames {
        for channel in channels {
            let value = channel[frame];
            match bits {
                16 => out.extend_from_slice(&(value as i16).to_le_bytes()),
                24 => out.extend_from_slice(&value.to_le_bytes()[..3]),
                _ => out.push((value + 128) as u8),
            }
        }
    }
    out.resize(out.len() + data % 2, 0);
    if let Some((root, loops)) = smpl {
        let base = out.len();
        out.resize(total, 0);
        out[base..base + 4].copy_from_slice(b"smpl");
        out[base + 4..base + 8].copy_from_slice(&(smpl_size as u32).to_le_bytes());
        out[base + 20..base + 24].copy_from_slice(&root.to_le_bytes());
        out[base + 36..base + 40].copy_from_slice(&(loops.len() as u32).to_le_bytes());
        for (index, lp) in loops.iter().enumerate() {
            let at = base + 8 + 36 + index * 24;
            out[at + 4..at + 8].copy_from_slice(&u32::from(lp.ping_pong).to_le_bytes());
            out[at + 8..at + 12].copy_from_slice(&lp.start.to_le_bytes());
            out[at + 12..at + 16].copy_from_slice(&lp.end.wrapping_sub(1).to_le_bytes());
        }
    }
    Ok(out)
}

/// The rate a sound file was written at (WAV, FLAC, Ogg Vorbis / Opus), None for another format.
pub fn source_rate(bytes: &[u8]) -> Result<Option<u32>> {
    source_rate_from(bytes.len(), &|at, count| {
        bytes[at.min(bytes.len())..(at + count).min(bytes.len())].to_vec()
    })
}

/// `source_rate` over a file of `total` bytes read in parts, its header alone.
pub fn source_rate_from(
    total: usize,
    read: &dyn Fn(usize, usize) -> Vec<u8>,
) -> Result<Option<u32>> {
    let head = read(0, 300);
    if is_wav(&head) {
        return read_info_from(total, read).map(|info| Some(info.sample_rate));
    }
    let bytes = head.as_slice();
    if bytes.len() >= 21 && &bytes[0..4] == b"fLaC" {
        return Ok(Some(
            (u32::from(bytes[18]) << 12)
                | (u32::from(bytes[19]) << 4)
                | (u32::from(bytes[20]) >> 4),
        ));
    }
    if bytes.len() >= 28 && &bytes[0..4] == b"OggS" {
        let packet = 27 + usize::from(bytes[26]);
        if bytes.len() >= packet + 16 && &bytes[packet..packet + 7] == b"\x01vorbis" {
            return Ok(Some(u32_at(bytes, packet + 12)));
        }
        if bytes.len() >= packet + 8 && &bytes[packet..packet + 8] == b"OpusHead" {
            return Ok(Some(48000));
        }
    }
    Ok(None)
}
