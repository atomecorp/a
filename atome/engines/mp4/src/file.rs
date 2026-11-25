//! A progressive MP4 file: `ftyp`, then the whole `moov` (every sample's size, time and place, so a player knows
//! the length and can seek before reading any picture), then one `mdat` where the tracks' samples lie interleaved
//! by about a second each, so a player reading it in order finds the sound beside the picture it goes with.

use crate::boxes::{BoxWriter, avc1, dinf, hdlr, mdhd, mvhd, opus, smhd, tkhd, vmhd};

/// The movie's clock: milliseconds.
const MOVIE_TIMESCALE: u32 = 1_000;

/// What a track codes.
#[derive(Clone, Debug)]
pub enum Codec {
    /// H.264, its AVCDecoderConfigurationRecord, the picture's size.
    Avc {
        avcc: Vec<u8>,
        width: u16,
        height: u16,
    },
    /// Opus on its 48 kHz clock: its channels, the samples its decoder drops first, the source's rate.
    Opus {
        channels: u8,
        pre_skip: u16,
        input_rate: u32,
    },
}

/// One sample of a track, on the track's clock.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SampleInfo {
    pub size: u32,
    pub duration: u32,
    /// A sync sample (a key image; every Opus packet is one).
    pub key: bool,
}

/// What is shown of a track (`edts`/`elst`): from `media_time` (on its clock) for `duration` (on its clock).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Edit {
    pub media_time: u32,
    pub duration: u64,
}

/// One track: its codec, its clock, its samples in decode order and their bytes one after another in `data`.
#[derive(Clone, Debug)]
pub struct Track<'a> {
    pub codec: Codec,
    pub timescale: u32,
    pub samples: Vec<SampleInfo>,
    pub data: &'a [u8],
    pub edit: Option<Edit>,
}

pub const MP4_TRACKS_MISSING: &str = "mp4_tracks_missing";
pub const MP4_TRACK_INVALID: &str = "mp4_track_invalid";
pub const MP4_TOO_LARGE: &str = "mp4_too_large";

/// One chunk: a run of a track's samples lying together in the `mdat`.
struct Chunk {
    track: usize,
    count: usize,
    start_seconds: f64,
    bytes: std::ops::Range<usize>,
}

fn check(track: &Track) -> Result<(), String> {
    let total: u64 = track
        .samples
        .iter()
        .map(|sample| u64::from(sample.size))
        .sum();
    if track.timescale == 0 || track.samples.is_empty() {
        return Err(format!("{MP4_TRACK_INVALID}:empty"));
    }
    if total != track.data.len() as u64 {
        return Err(format!(
            "{MP4_TRACK_INVALID}:sizes {total} for {} bytes",
            track.data.len()
        ));
    }
    if let Codec::Avc { .. } = track.codec
        && !track.samples[0].key
    {
        return Err(format!("{MP4_TRACK_INVALID}:first_image_not_key"));
    }
    Ok(())
}

/// The track's samples cut into chunks of about a second.
fn chunks_of(index: usize, track: &Track, chunks: &mut Vec<Chunk>) {
    let (mut first, mut time, mut offset, mut chunk_time) = (0, 0u64, 0usize, 0u64);
    let mut bytes_start = 0usize;
    for (at, sample) in track.samples.iter().enumerate() {
        if at > first && time - chunk_time >= u64::from(track.timescale) {
            chunks.push(Chunk {
                track: index,
                count: at - first,
                start_seconds: chunk_time as f64 / f64::from(track.timescale),
                bytes: bytes_start..offset,
            });
            first = at;
            chunk_time = time;
            bytes_start = offset;
        }
        time += u64::from(sample.duration);
        offset += sample.size as usize;
    }
    chunks.push(Chunk {
        track: index,
        count: track.samples.len() - first,
        start_seconds: chunk_time as f64 / f64::from(track.timescale),
        bytes: bytes_start..offset,
    });
}

fn media_duration(track: &Track) -> u64 {
    track
        .samples
        .iter()
        .map(|sample| u64::from(sample.duration))
        .sum()
}

/// The track's shown length on the movie's clock.
fn movie_duration(track: &Track) -> u64 {
    let shown = track
        .edit
        .map_or(media_duration(track), |edit| edit.duration);
    shown * u64::from(MOVIE_TIMESCALE) / u64::from(track.timescale)
}

fn narrow(value: u64) -> Result<u32, String> {
    u32::try_from(value).map_err(|_| MP4_TOO_LARGE.to_string())
}

fn stbl(track: &Track, chunks: &[(&Chunk, u32)]) -> Result<Vec<u8>, String> {
    let entry = match &track.codec {
        Codec::Avc {
            avcc,
            width,
            height,
        } => avc1(avcc, *width, *height),
        Codec::Opus {
            channels,
            pre_skip,
            input_rate,
        } => opus(*channels, *pre_skip, *input_rate),
    };
    let mut stsd = BoxWriter::full(b"stsd", 0, 0);
    stsd.u32(1).child(entry);
    // Times, run-length coded: equal durations one after another are one entry.
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for sample in &track.samples {
        match runs.last_mut() {
            Some((count, duration)) if *duration == sample.duration => *count += 1,
            _ => runs.push((1, sample.duration)),
        }
    }
    let mut stts = BoxWriter::full(b"stts", 0, 0);
    stts.u32(runs.len() as u32);
    for (count, duration) in runs {
        stts.u32(count).u32(duration);
    }
    // Samples per chunk, run-length coded too: a chunk of the same count as the one before adds no entry.
    let mut stsc = BoxWriter::full(b"stsc", 0, 0);
    let mut entries: Vec<(u32, u32)> = Vec::new();
    for (position, (chunk, _)) in chunks.iter().enumerate() {
        if entries.last().map(|(_, count)| *count) != Some(chunk.count as u32) {
            entries.push((position as u32 + 1, chunk.count as u32));
        }
    }
    stsc.u32(entries.len() as u32);
    for (first, count) in entries {
        stsc.u32(first).u32(count).u32(1);
    }
    let mut stsz = BoxWriter::full(b"stsz", 0, 0);
    stsz.u32(0).u32(track.samples.len() as u32);
    for sample in &track.samples {
        stsz.u32(sample.size);
    }
    let mut stco = BoxWriter::full(b"stco", 0, 0);
    stco.u32(chunks.len() as u32);
    for (_, offset) in chunks {
        stco.u32(*offset);
    }
    let mut stbl = BoxWriter::new(b"stbl");
    stbl.child(stsd.finish()).child(stts.finish());
    // A picture names its key images; a sound, all of whose samples are sync, needs no `stss`.
    if matches!(track.codec, Codec::Avc { .. }) {
        let keys: Vec<u32> = (1..=track.samples.len() as u32)
            .filter(|number| track.samples[*number as usize - 1].key)
            .collect();
        let mut stss = BoxWriter::full(b"stss", 0, 0);
        stss.u32(keys.len() as u32);
        for number in keys {
            stss.u32(number);
        }
        stbl.child(stss.finish());
    }
    stbl.child(stsc.finish())
        .child(stsz.finish())
        .child(stco.finish());
    Ok(stbl.finish())
}

fn trak(id: u32, track: &Track, chunks: &[(&Chunk, u32)]) -> Result<Vec<u8>, String> {
    let (handler, name, media_header, volume, size) = match &track.codec {
        Codec::Avc { width, height, .. } => (
            b"vide",
            b"VideoHandler".as_slice(),
            vmhd(),
            0,
            (u32::from(*width), u32::from(*height)),
        ),
        Codec::Opus { .. } => (b"soun", b"SoundHandler".as_slice(), smhd(), 0x0100, (0, 0)),
    };
    let shown = narrow(movie_duration(track))?;
    let mut minf = BoxWriter::new(b"minf");
    minf.child(media_header)
        .child(dinf())
        .child(stbl(track, chunks)?);
    let mut mdia = BoxWriter::new(b"mdia");
    mdia.child(mdhd(track.timescale, narrow(media_duration(track))?))
        .child(hdlr(handler, name))
        .child(minf.finish());
    let mut trak = BoxWriter::new(b"trak");
    trak.child(tkhd(id, shown, volume, size.0, size.1));
    if let Some(edit) = track.edit {
        let mut elst = BoxWriter::full(b"elst", 0, 0);
        elst.u32(1).u32(shown).u32(edit.media_time).u16(1).u16(0);
        let mut edts = BoxWriter::new(b"edts");
        edts.child(elst.finish());
        trak.child(edts.finish());
    }
    trak.child(mdia.finish());
    Ok(trak.finish())
}

fn moov(tracks: &[Track], laid: &[Chunk], mdat_data_start: u64) -> Result<Vec<u8>, String> {
    let mut offsets = Vec::with_capacity(laid.len());
    let mut at = mdat_data_start;
    for chunk in laid {
        offsets.push(narrow(at)?);
        at += chunk.bytes.len() as u64;
    }
    let duration = tracks.iter().map(movie_duration).max().unwrap_or(0);
    let mut moov = BoxWriter::new(b"moov");
    moov.child(mvhd(
        MOVIE_TIMESCALE,
        narrow(duration)?,
        tracks.len() as u32 + 1,
    ));
    for (index, track) in tracks.iter().enumerate() {
        let own: Vec<(&Chunk, u32)> = laid
            .iter()
            .zip(&offsets)
            .filter(|(chunk, _)| chunk.track == index)
            .map(|(chunk, offset)| (chunk, *offset))
            .collect();
        moov.child(trak(index as u32 + 1, track, &own)?);
    }
    Ok(moov.finish())
}

/// The file of `tracks` (ids 1, 2… in this order).
pub fn write_mp4(tracks: &[Track]) -> Result<Vec<u8>, String> {
    if tracks.is_empty() {
        return Err(MP4_TRACKS_MISSING.to_string());
    }
    for track in tracks {
        check(track)?;
    }
    let mut laid = Vec::new();
    for (index, track) in tracks.iter().enumerate() {
        chunks_of(index, track, &mut laid);
    }
    // Interleaved by time; at the same instant, the tracks' order.
    laid.sort_by(|left, right| {
        left.start_seconds
            .total_cmp(&right.start_seconds)
            .then(left.track.cmp(&right.track))
    });
    let mut ftyp = BoxWriter::new(b"ftyp");
    ftyp.raw(b"isom")
        .u32(512)
        .raw(b"isom")
        .raw(b"iso2")
        .raw(b"avc1")
        .raw(b"mp41");
    let ftyp = ftyp.finish();
    // The chunks' offsets do not change the `moov`'s size (32 bits each): it is laid once to be measured.
    let measured = moov(tracks, &laid, 0)?.len();
    let payload: u64 = laid.iter().map(|chunk| chunk.bytes.len() as u64).sum();
    let data_start = (ftyp.len() + measured + 8) as u64;
    let moov = moov(tracks, &laid, data_start)?;
    let mdat_size = narrow(8 + payload)?;
    narrow(data_start + payload)?;
    let mut bytes = Vec::with_capacity(data_start as usize + payload as usize);
    bytes.extend_from_slice(&ftyp);
    bytes.extend_from_slice(&moov);
    bytes.extend_from_slice(&mdat_size.to_be_bytes());
    bytes.extend_from_slice(b"mdat");
    for chunk in &laid {
        bytes.extend_from_slice(&tracks[chunk.track].data[chunk.bytes.clone()]);
    }
    Ok(bytes)
}
