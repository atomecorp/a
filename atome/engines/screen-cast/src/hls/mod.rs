//! A view streamed live as HLS (R-248): the page encodes the view in H.264 (WebCodecs, format `avc`), hands each
//! encoded frame here, and a television (an Apple TV by AirPlay, a Chromecast) plays the stream as an ordinary video
//! URL fetched from the local server.
//!
//! The frames gather in the open segment; a new segment starts at a key frame once the open one lasts the target
//! (one second). Each finished segment is one fragmented MP4 fragment (`moof` + `mdat`), the init segment (`ftyp` +
//! `moov`) holding the decoder configuration once. The media playlist keeps the latest segments only, like any live
//! stream, until `finish` closes it.
//!
//! Its sound, when asked (`sound_rate`), is the engine's output in AAC (`aac`), on the video's own clock: the frames
//! handed by `push_sound` fill the sound track up to the latest picture's time, silence filling what the engine did not
//! give (an engine at rest) and what it gave too far ahead being dropped, so the two tracks never drift apart.

pub mod aac;
mod mp4;
#[cfg(test)]
mod tests;
#[cfg(all(test, target_vendor = "apple"))]
mod tests_sound;

use std::collections::VecDeque;

/// How long a segment lasts at least before a key frame starts the next.
pub const TARGET_SEGMENT_US: i64 = 1_000_000;
/// How many finished segments the playlist and the server keep.
pub const KEPT_SEGMENTS: usize = 6;
/// Where a television starts the live stream, in seconds before its end: one segment.
const START_OFFSET_S: f64 = TARGET_SEGMENT_US as f64 / 1_000_000.0;

/// What the stream's init segment declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamConfig {
    pub width: u32,
    pub height: u32,
    /// Ticks per second of the track (90 000 for video).
    pub timescale: u32,
    /// The AVCDecoderConfigurationRecord, as WebCodecs gives it in `decoderConfig.description`.
    pub avcc: Vec<u8>,
    /// The rate of the stereo sound handed by `push_sound`; None for a stream without sound.
    pub sound_rate: Option<u32>,
}

/// What the init segment declares of the sound track.
pub(crate) struct SoundConfig {
    pub rate: u32,
    pub audio_specific_config: Vec<u8>,
    pub bitrate: u32,
}

/// How far the sound may lag the picture before silence fills it (a tenth of a second), and lead it before it is
/// dropped (a fifth), as fractions of a second.
const SOUND_LAG_FRACTION: u64 = 10;
const SOUND_LEAD_FRACTION: u64 = 5;

/// The sound track: its encoder, the frames it was given since the stream's first picture, and its packets waiting
/// for the open segment.
struct Sound {
    encoder: aac::AacEncoder,
    rate: u32,
    frames_fed: u64,
    packets: Vec<Vec<u8>>,
    /// Decode time of the first waiting packet, on the sound's clock (its rate).
    next_tick: u64,
}

/// One encoded frame, as WebCodecs gives it with the format `avc`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sample {
    /// Its NAL units, each prefixed by its length on four bytes.
    pub data: Vec<u8>,
    pub key: bool,
    pub pts_us: i64,
    pub duration_us: i64,
}

/// Why the stream refused a configuration or a frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HlsError {
    InvalidConfig(&'static str),
    /// A stream starts on a key frame.
    FirstSampleNotKey,
    EmptySample,
    NonPositiveDuration,
    /// A frame's time is not after the previous frame's.
    NonIncreasingTime,
    /// The stream was finished.
    Ended,
    /// The sound's encoder refused (its code).
    Sound(String),
}

impl HlsError {
    /// The error's stable code, for the page.
    pub fn code(&self) -> String {
        match self {
            HlsError::InvalidConfig(reason) => format!("stream_config_invalid:{reason}"),
            HlsError::FirstSampleNotKey => "stream_first_sample_not_key".into(),
            HlsError::EmptySample => "stream_sample_empty".into(),
            HlsError::NonPositiveDuration => "stream_sample_duration_invalid".into(),
            HlsError::NonIncreasingTime => "stream_sample_time_not_increasing".into(),
            HlsError::Ended => "stream_ended".into(),
            HlsError::Sound(code) => format!("stream_sound:{code}"),
        }
    }
}

impl std::fmt::Display for HlsError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.code())
    }
}

impl std::error::Error for HlsError {}

struct PendingSample {
    data: Vec<u8>,
    key: bool,
    /// Decode time from the stream's first frame, in the track's timescale.
    tick: u64,
    /// Its own announced duration, used only for the very last frame of the stream.
    duration_ticks: u64,
}

struct Segment {
    sequence: u32,
    duration_ticks: u64,
    bytes: Vec<u8>,
}

/// A live HLS stream of fragmented MP4 segments.
pub struct LiveStream {
    config: StreamConfig,
    init: Vec<u8>,
    origin_us: Option<i64>,
    last_tick: Option<u64>,
    open: Vec<PendingSample>,
    segments: VecDeque<Segment>,
    next_sequence: u32,
    longest_ticks: u64,
    ended: bool,
    sound: Option<Sound>,
}

impl LiveStream {
    pub fn new(config: StreamConfig) -> Result<Self, HlsError> {
        if config.width == 0 || config.height == 0 {
            return Err(HlsError::InvalidConfig("size"));
        }
        if config.width > u16::MAX as u32 || config.height > u16::MAX as u32 {
            return Err(HlsError::InvalidConfig("size_too_large"));
        }
        if config.timescale == 0 {
            return Err(HlsError::InvalidConfig("timescale"));
        }
        // configurationVersion 1, profile, compatibility, level, length size, SPS count, at least.
        if config.avcc.len() < 7 || config.avcc[0] != 1 {
            return Err(HlsError::InvalidConfig("avcc"));
        }
        // The samples carry 4-byte NAL lengths: lengthSizeMinusOne must be 3.
        if config.avcc[4] & 0x03 != 3 {
            return Err(HlsError::InvalidConfig("avcc_length_size"));
        }
        let sound = config
            .sound_rate
            .map(|rate| {
                let audio_specific_config =
                    aac::audio_specific_config(rate).map_err(HlsError::Sound)?;
                let encoder = aac::AacEncoder::new(rate).map_err(HlsError::Sound)?;
                Ok::<_, HlsError>((
                    SoundConfig {
                        rate,
                        audio_specific_config: audio_specific_config.to_vec(),
                        bitrate: aac::AAC_BITRATE,
                    },
                    Sound {
                        encoder,
                        rate,
                        frames_fed: 0,
                        packets: Vec::new(),
                        next_tick: 0,
                    },
                ))
            })
            .transpose()?;
        let init = mp4::init_segment(&config, sound.as_ref().map(|(declared, _)| declared));
        Ok(Self {
            config,
            init,
            origin_us: None,
            last_tick: None,
            open: Vec::new(),
            segments: VecDeque::new(),
            next_sequence: 1,
            longest_ticks: 0,
            ended: false,
            sound: sound.map(|(_, sound)| sound),
        })
    }

    /// Adds the engine's stereo output (interleaved), heard since the previous call. Before the first picture it is
    /// dropped: the sound starts with the picture. It fills the sound track up to the latest picture's time.
    pub fn push_sound(&mut self, interleaved: &[f32]) -> Result<(), HlsError> {
        let Some(last_tick) = self.last_tick.filter(|_| !self.ended) else {
            return Ok(());
        };
        let timescale = u64::from(self.config.timescale);
        let Some(sound) = self.sound.as_mut() else {
            return Ok(());
        };
        let rate = u64::from(sound.rate);
        let due = last_tick * rate / timescale;
        let given = (interleaved.len() / 2) as u64;
        // Too far ahead of the picture (the two clocks drifting): only what fits the lead is kept.
        let room = (due + rate / SOUND_LEAD_FRACTION).saturating_sub(sound.frames_fed);
        let kept = given.min(room) as usize;
        let mut frames = interleaved[..kept * 2].to_vec();
        // Too far behind (an engine at rest gives nothing): silence up to the lag.
        let reached = sound.frames_fed + kept as u64;
        let floor = due.saturating_sub(rate / SOUND_LAG_FRACTION);
        if reached < floor {
            frames.resize(frames.len() + ((floor - reached) * 2) as usize, 0.0);
        }
        sound.frames_fed += (frames.len() / 2) as u64;
        let packets = sound.encoder.encode(&frames).map_err(HlsError::Sound)?;
        sound.packets.extend(packets);
        Ok(())
    }

    fn ticks(&self, microseconds: i64) -> u64 {
        (microseconds as i128 * self.config.timescale as i128 / 1_000_000) as u64
    }

    /// Adds one frame. Returns the sequence number of the segment it finished, if a segment was finished.
    pub fn push(&mut self, sample: Sample) -> Result<Option<u32>, HlsError> {
        if self.ended {
            return Err(HlsError::Ended);
        }
        if sample.data.is_empty() {
            return Err(HlsError::EmptySample);
        }
        if sample.duration_us <= 0 {
            return Err(HlsError::NonPositiveDuration);
        }
        let origin = match self.origin_us {
            Some(origin) => origin,
            None if sample.key => *self.origin_us.insert(sample.pts_us),
            None => return Err(HlsError::FirstSampleNotKey),
        };
        if sample.pts_us < origin {
            return Err(HlsError::NonIncreasingTime);
        }
        let tick = self.ticks(sample.pts_us - origin);
        if self.last_tick.is_some_and(|last| tick <= last) {
            return Err(HlsError::NonIncreasingTime);
        }
        let mut finished = None;
        if sample.key
            && let Some(first) = self.open.first()
            && tick - first.tick >= self.ticks(TARGET_SEGMENT_US)
        {
            finished = Some(self.close_segment(tick));
        }
        self.last_tick = Some(tick);
        let duration_ticks = self.ticks(sample.duration_us).max(1);
        self.open.push(PendingSample {
            data: sample.data,
            key: sample.key,
            tick,
            duration_ticks,
        });
        Ok(finished)
    }

    /// Closes the open segment, its last frame lasting until `end_tick`.
    fn close_segment(&mut self, end_tick: u64) -> u32 {
        let pending = std::mem::take(&mut self.open);
        let base = pending[0].tick;
        let samples: Vec<mp4::FragmentSample> = pending
            .iter()
            .enumerate()
            .map(|(index, sample)| {
                let next = pending.get(index + 1).map_or(end_tick, |next| next.tick);
                mp4::FragmentSample {
                    data: &sample.data,
                    duration: (next - sample.tick) as u32,
                    key: sample.key,
                }
            })
            .collect();
        let sequence = self.next_sequence;
        self.next_sequence += 1;
        let duration_ticks = end_tick - base;
        self.longest_ticks = self.longest_ticks.max(duration_ticks);
        let mut runs = vec![mp4::TrackRun {
            track_id: mp4::TRACK_ID,
            base_decode_time: base,
            samples,
        }];
        let sound_packets = self
            .sound
            .as_mut()
            .map(|sound| (sound.next_tick, std::mem::take(&mut sound.packets)));
        if let Some((next_tick, packets)) = &sound_packets
            && !packets.is_empty()
        {
            runs.push(mp4::TrackRun {
                track_id: mp4::SOUND_TRACK_ID,
                base_decode_time: *next_tick,
                samples: packets
                    .iter()
                    .map(|packet| mp4::FragmentSample {
                        data: packet,
                        duration: aac::AAC_FRAMES as u32,
                        key: true,
                    })
                    .collect(),
            });
        }
        let bytes = mp4::fragment(sequence, &runs);
        if let (Some(sound), Some((_, packets))) = (self.sound.as_mut(), &sound_packets) {
            sound.next_tick += (packets.len() * aac::AAC_FRAMES) as u64;
        }
        self.segments.push_back(Segment {
            sequence,
            duration_ticks,
            bytes,
        });
        while self.segments.len() > KEPT_SEGMENTS {
            self.segments.pop_front();
        }
        sequence
    }

    /// Ends the stream: the open segment is finished and the playlist closed. Returns the segment it finished.
    pub fn finish(&mut self) -> Option<u32> {
        if self.ended {
            return None;
        }
        self.ended = true;
        let last = self.open.last()?;
        let end = last.tick + last.duration_ticks;
        Some(self.close_segment(end))
    }

    pub fn is_ended(&self) -> bool {
        self.ended
    }

    /// `ftyp` + `moov`: the playlist's `#EXT-X-MAP`.
    pub fn init_segment(&self) -> &[u8] {
        &self.init
    }

    /// A kept segment's bytes.
    pub fn segment(&self, sequence: u32) -> Option<Vec<u8>> {
        self.segments
            .iter()
            .find(|segment| segment.sequence == sequence)
            .map(|segment| segment.bytes.clone())
    }

    /// The live media playlist of the kept segments (`<sequence>.m4s`, the init as `init.mp4`).
    pub fn playlist(&self) -> String {
        let timescale = self.config.timescale as u64;
        let target = self
            .longest_ticks
            .max(self.ticks(TARGET_SEGMENT_US))
            .div_ceil(timescale);
        let first = self
            .segments
            .front()
            .map_or(self.next_sequence, |segment| segment.sequence);
        // A television starts a live stream three segments behind its end unless told otherwise: told to start one
        // segment behind (`START_OFFSET_S`), it shows the view about two seconds sooner (user, 25 Nov. 2026: « une latence
        // incroyable »).
        let mut text = format!(
            "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:{target}\n#EXT-X-MEDIA-SEQUENCE:{first}\n\
             #EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-START:TIME-OFFSET=-{START_OFFSET_S:.1},PRECISE=YES\n\
             #EXT-X-MAP:URI=\"init.mp4\"\n"
        );
        for segment in &self.segments {
            let seconds = segment.duration_ticks as f64 / timescale as f64;
            text.push_str(&format!(
                "#EXTINF:{seconds:.3},\n{}.m4s\n",
                segment.sequence
            ));
        }
        if self.ended {
            text.push_str("#EXT-X-ENDLIST\n");
        }
        text
    }
}
