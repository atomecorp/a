// The voice of one speaker cut into pieces a provider can transcribe (lot TR, temp/cb_sociale_2026-11-15/
// CONCEPT_TRADUCTION_TEMPS_REEL.md §4). Mono 16-bit PCM at 24 kHz, the assistant's own rate (providers/speech.rs).
//   - CB, by turns (one person holds the floor 45 s at most): the whole take, cut at the release only, or at 45 s.
//   - Appel, in duplex: short pieces cut at the silence, so a piece is translated while its speaker goes on talking:
//     at least 1 s of voice followed by 0.6 s of silence, or 8 s at most.
// A piece of silence alone is never sent anywhere.
//
// An Appel's voice reaches the server as Opus, never decoded (decision Q4): its takes are cut at the silence on the packets
// themselves (`PacketCut`, recordings/tap.rs), each piece an Ogg take handed whole to the translation. A packet is voice
// when its level (the RTP header extension `ssrc-audio-level`, RFC 6464, in -dBov) is at most `cb.call_silence_dbov`
// (40 by default, as `SILENCE_RMS`), and a piece ends after `cb.call_silence_ms` of silence (600 by default).
use super::RoomKind;
use std::sync::RwLock;

/// The rate every piece of PCM is read at.
pub const SAMPLE_RATE: usize = 24_000;
/// A CB take: the floor's own bound (cahier §9).
pub const TAKE_MAX_MS: usize = 45_000;
/// An Appel piece: 8 s at most, 1 s of voice at least, cut after 0.6 s of silence (rule 19).
pub const PIECE_MAX_MS: usize = 8_000;
pub const PIECE_MIN_VOICE_MS: usize = 1_000;
pub const SILENCE_MS: usize = 600;
// The analysis step and the level under which a step is silence (about -40 dBFS).
const STEP_MS: usize = 20;
const SILENCE_RMS: f64 = 330.0;
// The voice a last piece needs to be worth a transcription.
const FLUSH_MIN_VOICE_MS: usize = 300;

const fn samples(ms: usize) -> usize {
    ms * SAMPLE_RATE / 1000
}

/// The duration of `pcm` in milliseconds.
pub fn duration_ms(pcm: &[i16]) -> u64 {
    (pcm.len() * 1000 / SAMPLE_RATE) as u64
}

fn voiced(step: &[i16]) -> bool {
    if step.is_empty() {
        return false;
    }
    let energy: f64 = step.iter().map(|s| f64::from(*s) * f64::from(*s)).sum();
    (energy / step.len() as f64).sqrt() >= SILENCE_RMS
}

/// One speaker's voice as it arrives, until it becomes pieces.
pub struct Segmenter {
    kind: RoomKind,
    // The piece being gathered, and the end of a step not yet whole.
    piece: Vec<i16>,
    rest: Vec<i16>,
    voice: usize,
    silence: usize,
}

impl Segmenter {
    pub fn new(kind: RoomKind) -> Self {
        Self {
            kind,
            piece: Vec::new(),
            rest: Vec::new(),
            voice: 0,
            silence: 0,
        }
    }

    fn take(&mut self) -> Vec<i16> {
        self.voice = 0;
        self.silence = 0;
        std::mem::take(&mut self.piece)
    }

    /// More voice: the pieces it completes, in order.
    pub fn push(&mut self, chunk: &[i16]) -> Vec<Vec<i16>> {
        let step = samples(STEP_MS);
        self.rest.extend_from_slice(chunk);
        let whole = self.rest.len() / step * step;
        let ready: Vec<i16> = self.rest.drain(..whole).collect();
        let mut out = Vec::new();
        for frame in ready.chunks(step) {
            if voiced(frame) {
                self.voice += frame.len();
                self.silence = 0;
            } else {
                self.silence += frame.len();
            }
            self.piece.extend_from_slice(frame);
            match self.kind {
                RoomKind::Cb => {
                    if self.piece.len() >= samples(TAKE_MAX_MS) {
                        let piece = self.take();
                        out.push(piece);
                    }
                }
                RoomKind::Call => {
                    if self.voice == 0 && self.silence >= samples(SILENCE_MS) {
                        // Silence before any voice: nothing to keep.
                        self.take();
                    } else if self.piece.len() >= samples(PIECE_MAX_MS)
                        || (self.voice >= samples(PIECE_MIN_VOICE_MS)
                            && self.silence >= samples(SILENCE_MS))
                    {
                        let piece = self.take();
                        out.push(piece);
                    }
                }
            }
        }
        out
    }

    /// The speaker stopped (the floor released, the call ended): the last piece, when it holds some voice.
    pub fn flush(&mut self) -> Option<Vec<i16>> {
        let rest = std::mem::take(&mut self.rest);
        if voiced(&rest) {
            self.voice += rest.len();
        }
        self.piece.extend_from_slice(&rest);
        let enough = self.voice >= samples(FLUSH_MIN_VOICE_MS);
        let piece = self.take();
        enough.then_some(piece)
    }
}

pub const CALL_SILENCE_LEVEL_SETTING: &str = "cb.call_silence_dbov";
const CALL_SILENCE_LEVEL_ENV: &str = "CB_CALL_SILENCE_DBOV";
pub const CALL_SILENCE_MS_SETTING: &str = "cb.call_silence_ms";
const CALL_SILENCE_MS_ENV: &str = "CB_CALL_SILENCE_MS";
// The RFC 6464 level of a packet that is silence (the lowest level), and the size an Opus packet of DTX or of digital
// silence keeps (its TOC and a byte or two): what tells silence apart when a packet carries no level.
const LEVEL_SILENT: u8 = 127;
const QUIET_PACKET_BYTES: usize = 3;

/// Where an Appel's takes are cut (rule 19, both configurable): a packet at most `silence_level` -dBov is voice; a piece
/// ends after `silence_ms` of silence once it holds 1 s of voice, or at 8 s.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CallCut {
    pub silence_level: u8,
    pub silence_ms: u64,
}

impl CallCut {
    pub const DEFAULT: Self = Self {
        silence_level: 40,
        silence_ms: SILENCE_MS as u64,
    };

    /// Read as the other CB settings are: the setting, else its environment spelling, else the default.
    pub fn from_settings(settings: &crate::settings::Settings) -> Self {
        let read = |name: &str, env: &str| {
            settings
                .get(name)
                .or_else(|| settings.get(env))
                .and_then(|value| value.trim().parse::<u64>().ok())
                .filter(|value| *value > 0)
        };
        Self {
            silence_level: read(CALL_SILENCE_LEVEL_SETTING, CALL_SILENCE_LEVEL_ENV)
                .and_then(|level| u8::try_from(level).ok())
                .filter(|level| *level < LEVEL_SILENT)
                .unwrap_or(Self::DEFAULT.silence_level),
            silence_ms: read(CALL_SILENCE_MS_SETTING, CALL_SILENCE_MS_ENV)
                .map_or(Self::DEFAULT.silence_ms, |ms| ms.min(PIECE_MAX_MS as u64)),
        }
    }
}

impl Default for CallCut {
    fn default() -> Self {
        Self::DEFAULT
    }
}

// The server's cut, set once from its settings (main.rs) and read by each recording consumer of an Appel (tap.rs), which
// holds no other handle on the settings.
static CALL_CUT: RwLock<CallCut> = RwLock::new(CallCut::DEFAULT);

/// The cut the server's settings chose (main.rs).
pub fn set_call_cut(cut: CallCut) {
    *CALL_CUT.write().expect("cb call cut") = cut;
}

/// The cut each new recording consumer of an Appel uses.
pub fn call_cut() -> CallCut {
    *CALL_CUT.read().expect("cb call cut")
}

/// The RFC 6464 level (0 the loudest, 127 silence, in -dBov) an RTP packet carries in its header extension `id`, in the
/// one-byte (RFC 8285 §4.2) or two-byte (§4.3) form; none when it carries none or is malformed (never trusted).
pub fn rtp_audio_level(packet: &[u8], id: u8) -> Option<u8> {
    if id == 0 || packet.len() < 12 || packet[0] >> 6 != 2 || packet[0] & 0x10 == 0 {
        return None;
    }
    let start = 12 + usize::from(packet[0] & 0x0F) * 4;
    let profile = u16::from_be_bytes([*packet.get(start)?, *packet.get(start + 1)?]);
    let words = u16::from_be_bytes([*packet.get(start + 2)?, *packet.get(start + 3)?]);
    let data = packet.get(start + 4..start + 4 + usize::from(words) * 4)?;
    let one_byte = profile == 0xBEDE;
    if !one_byte && profile & 0xFFF0 != 0x1000 {
        return None;
    }
    let mut at = 0;
    while at < data.len() {
        let byte = data[at];
        // Padding between elements.
        if byte == 0 {
            at += 1;
            continue;
        }
        let (element, len, value) = if one_byte {
            if byte >> 4 == 15 {
                return None;
            }
            (byte >> 4, usize::from(byte & 0x0F) + 1, at + 1)
        } else {
            (byte, usize::from(*data.get(at + 1)?), at + 2)
        };
        if element == id {
            return data
                .get(value)
                .filter(|_| len >= 1)
                .map(|level| level & 0x7F);
        }
        at = value + len;
    }
    None
}

/// Whether an RTP packet of an Appel is voice: by its level when it carries one (`level_id`, the consumer's id of
/// `ssrc-audio-level`), else by its size (a packet of DTX or of digital silence is a few bytes).
pub fn packet_voiced(packet: &[u8], level_id: Option<u8>, cut: CallCut) -> bool {
    if let Some(level) = level_id.and_then(|id| rtp_audio_level(packet, id)) {
        return level <= cut.silence_level;
    }
    crate::social::cb::recordings::ogg_opus::parse_rtp(packet)
        .is_some_and(|rtp| rtp.payload.len() > QUIET_PACKET_BYTES)
}

/// What becomes of the take being written after one more stretch of an Appel's voice.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cue {
    /// Going on.
    Go,
    /// Closed here: a piece, kept and translated.
    Cut,
    /// Silence alone: dropped, never kept nor sent anywhere.
    Drop,
}

/// The Appel's cut at the silence, read stretch by stretch (a packet, or the time no packet came), as `Segmenter` reads
/// PCM: at least 1 s of voice followed by the silence, or 8 s at most.
pub struct PacketCut {
    cut: CallCut,
    piece_ms: u64,
    voice_ms: u64,
    silence_ms: u64,
}

impl PacketCut {
    pub fn new(cut: CallCut) -> Self {
        Self {
            cut,
            piece_ms: 0,
            voice_ms: 0,
            silence_ms: 0,
        }
    }

    /// The silence that closes a piece.
    pub fn silence_ms(&self) -> u64 {
        self.cut.silence_ms
    }

    /// The take ends before its cut (the call ended, its producer paused or closed): the piece gathered so far follows the
    /// pieces' own rule, kept and translated only with 1 s of voice at least, else dropped. The next one starts afresh.
    pub fn ended(&mut self) -> Cue {
        let cue = if self.voice_ms >= PIECE_MIN_VOICE_MS as u64 {
            Cue::Cut
        } else {
            Cue::Drop
        };
        self.reset();
        cue
    }

    /// The take was closed elsewhere (its longest length): the next one starts afresh.
    pub fn reset(&mut self) {
        self.piece_ms = 0;
        self.voice_ms = 0;
        self.silence_ms = 0;
    }

    /// `ms` more of the take, voice or not.
    pub fn heard(&mut self, ms: u64, voiced: bool) -> Cue {
        self.piece_ms += ms;
        if voiced {
            self.voice_ms += ms;
            self.silence_ms = 0;
        } else {
            self.silence_ms += ms;
        }
        let cue = if self.voice_ms == 0 && self.silence_ms >= self.cut.silence_ms {
            Cue::Drop
        } else if self.piece_ms >= PIECE_MAX_MS as u64
            || (self.voice_ms >= PIECE_MIN_VOICE_MS as u64
                && self.silence_ms >= self.cut.silence_ms)
        {
            Cue::Cut
        } else {
            Cue::Go
        };
        if cue != Cue::Go {
            self.reset();
        }
        cue
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(ms: usize) -> Vec<i16> {
        (0..samples(ms))
            .map(|i| {
                ((i as f64 * 440.0 * std::f64::consts::TAU / SAMPLE_RATE as f64).sin() * 8000.0)
                    as i16
            })
            .collect()
    }

    #[test]
    fn a_call_is_cut_at_the_silence_and_a_cb_take_at_the_release() {
        let mut talk = tone(1500);
        talk.extend(vec![0; samples(700)]);
        talk.extend(tone(1200));
        let mut call = Segmenter::new(RoomKind::Call);
        let pieces = call.push(&talk);
        assert_eq!(pieces.len(), 1, "one piece cut at the silence");
        assert!(call.flush().is_some(), "the second piece at the end");
        let mut cb = Segmenter::new(RoomKind::Cb);
        assert!(cb.push(&talk).is_empty(), "a CB take waits for the release");
        let whole = cb.flush().expect("the take");
        assert_eq!(whole.len(), talk.len());
    }

    #[test]
    fn silence_alone_is_never_a_piece() {
        let mut call = Segmenter::new(RoomKind::Call);
        let silence: Vec<i16> = std::iter::repeat_n(0, samples(3000)).collect();
        assert!(call.push(&silence).is_empty());
        assert!(call.flush().is_none());
        let mut long = Segmenter::new(RoomKind::Call);
        assert_eq!(long.push(&tone(PIECE_MAX_MS + 100)).len(), 1, "8 s at most");
    }
}
