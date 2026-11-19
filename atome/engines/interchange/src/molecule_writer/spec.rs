//! What an importer hands the Molecule writer: tracks, clips, notes and mix
//! settings in seconds, before any frame rounding.

use serde::Serialize;

/// One tempo-map change, as the Molecule `timebase.tempo_map` holds it.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct TempoEvent {
    /// Where it starts (the first one at 0).
    pub start_seconds: f64,
    /// Beats per minute.
    pub bpm: f64,
    /// Beats per bar.
    pub beats_per_bar: u32,
    /// The beat's note value.
    pub beat_unit: u32,
    /// True when the tempo glides evenly in time to the next change's.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub ramp: bool,
}

/// A Molecule track kind (`track_types/index.js`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrackKind {
    /// Audio clips.
    Audio,
    /// Video and image clips (a video lane and an audio lane).
    Video,
    /// Image clips.
    Image,
    /// Text clips.
    Text,
    /// MIDI clips.
    Midi,
    /// Every clip kind.
    Mixed,
}

impl TrackKind {
    /// Its key in the document.
    pub const fn key(self) -> &'static str {
        match self {
            TrackKind::Audio => "audio",
            TrackKind::Video => "video",
            TrackKind::Image => "image",
            TrackKind::Text => "text",
            TrackKind::Midi => "midi",
            TrackKind::Mixed => "mixed",
        }
    }

    /// True when the track has an audio strip (volume, pan, effects).
    pub const fn has_audio_strip(self) -> bool {
        matches!(self, TrackKind::Audio | TrackKind::Video | TrackKind::Mixed)
    }

    /// True when a clip of `kind` may lie on it.
    pub const fn accepts(self, kind: ClipKind) -> bool {
        match self {
            TrackKind::Audio => matches!(kind, ClipKind::Audio),
            TrackKind::Video => matches!(kind, ClipKind::Video | ClipKind::Image),
            TrackKind::Image => matches!(kind, ClipKind::Image),
            TrackKind::Text => matches!(kind, ClipKind::Text),
            TrackKind::Midi => matches!(kind, ClipKind::Midi),
            TrackKind::Mixed => true,
        }
    }
}

/// A track's role: it holds content, or it is a group (a bus) other tracks feed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrackRole {
    /// Holds clips.
    Content,
    /// A bus: its members' audio goes through its strip.
    Group,
}

/// A track to lay.
#[derive(Clone, Debug, PartialEq)]
pub struct TrackSpec {
    /// Its name.
    pub name: String,
    /// Its kind.
    pub kind: TrackKind,
    /// Content or group.
    pub role: TrackRole,
    /// Muted.
    pub mute: bool,
    /// Soloed.
    pub solo: bool,
}

impl TrackSpec {
    /// A content track of `kind`, neither muted nor soloed.
    pub fn content(name: &str, kind: TrackKind) -> TrackSpec {
        TrackSpec {
            name: name.into(),
            kind,
            role: TrackRole::Content,
            mute: false,
            solo: false,
        }
    }

    /// A group track (a bus).
    pub fn group(name: &str) -> TrackSpec {
        TrackSpec {
            name: name.into(),
            kind: TrackKind::Audio,
            role: TrackRole::Group,
            mute: false,
            solo: false,
        }
    }
}

/// A Molecule clip kind.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipKind {
    /// A sound.
    Audio,
    /// A video.
    Video,
    /// A still image.
    Image,
    /// A text.
    Text,
    /// MIDI notes.
    Midi,
}

impl ClipKind {
    /// Its key in the document.
    pub const fn key(self) -> &'static str {
        match self {
            ClipKind::Audio => "audio",
            ClipKind::Video => "video",
            ClipKind::Image => "image",
            ClipKind::Text => "text",
            ClipKind::Midi => "midi",
        }
    }
}

/// What a clip plays.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClipSource {
    /// A media of the source (a path in its archive, a URL…), written as
    /// `{ type: 'media_ref', media_ref: key }`: the JS importer replaces it by
    /// the stored media Atome, or keeps it and reports the clip offline.
    Media(String),
    /// The notes registered under this key ([`super::TimelineBuilder::add_midi_media`]),
    /// written as a `media_ref` the importer replaces by the encoded SMF media.
    Midi(String),
    /// An Atome that already exists.
    Atome(String),
}

/// How a clip joins the next clip it touches on its track (`clip_tone.js`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransitionKind {
    /// Both heard and seen at once, centred on the joint.
    Fade,
    /// Through silence and black.
    Black,
    /// The right picture pushes over the left one.
    Slide,
}

impl TransitionKind {
    /// Its key in the document.
    pub const fn key(self) -> &'static str {
        match self {
            TransitionKind::Fade => "fade",
            TransitionKind::Black => "black",
            TransitionKind::Slide => "slide",
        }
    }
}

/// A clip's transition to the next touching clip.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TransitionSpec {
    /// Its kind.
    pub kind: TransitionKind,
    /// Its whole length, centred on the joint.
    pub seconds: f64,
}

/// A clip's time stretch (`stretch.js`): `ratio` = timeline length / source length.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StretchSpec {
    /// Timeline length over source length (0.25..4).
    pub ratio: f64,
    /// True when the pitch stays (a stretch), false when it follows the speed.
    pub pitch_lock: bool,
}

/// A clip to lay, in seconds.
#[derive(Clone, Debug, PartialEq)]
pub struct ClipSpec {
    /// Its kind.
    pub kind: ClipKind,
    /// What it plays.
    pub source: ClipSource,
    /// Where it starts on the timeline.
    pub start_seconds: f64,
    /// How long it lasts on the timeline (> 0).
    pub duration_seconds: f64,
    /// Where it starts in its source.
    pub source_in_seconds: f64,
    /// Where it ends in its source; `None`: `source_in + duration` (no stretch).
    pub source_out_seconds: Option<f64>,
    /// Its name, when the source gives one.
    pub name: Option<String>,
    /// Linear fade-in from its first frame.
    pub fade_in_seconds: f64,
    /// Linear fade-out to its last frame.
    pub fade_out_seconds: f64,
    /// The clip's own gain (-60..12 dB).
    pub gain_db: Option<f64>,
    /// Its transition to the next touching clip.
    pub transition: Option<TransitionSpec>,
    /// The whole span its source block repeats over (>= its duration).
    pub block_loop_seconds: Option<f64>,
    /// Its time stretch.
    pub stretch: Option<StretchSpec>,
    /// A video clip whose own sound stays silent (the source gives its sound
    /// separately, on an audio clip).
    pub sound_muted: bool,
}

impl ClipSpec {
    /// A clip of `kind` playing `source` from `source_in_seconds`, nothing else set.
    pub fn new(
        kind: ClipKind,
        source: ClipSource,
        start_seconds: f64,
        duration_seconds: f64,
        source_in_seconds: f64,
    ) -> ClipSpec {
        ClipSpec {
            kind,
            source,
            start_seconds,
            duration_seconds,
            source_in_seconds,
            source_out_seconds: None,
            name: None,
            fade_in_seconds: 0.0,
            fade_out_seconds: 0.0,
            gain_db: None,
            transition: None,
            block_loop_seconds: None,
            stretch: None,
            sound_muted: false,
        }
    }
}

/// One MIDI note, in seconds from its clip's source start (JS encodes them to SMF).
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct MidiNote {
    /// Its start.
    pub start_s: f64,
    /// Its length (> 0).
    pub duration_s: f64,
    /// 0..127.
    pub pitch: u8,
    /// 1..127.
    pub velocity: u8,
    /// 1..16.
    pub channel: u8,
}

/// The notes of one MIDI media, encoded by the JS importer into one SMF file.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MidiMedia {
    /// The key its clips name ([`ClipSource::Midi`]).
    pub media_key: String,
    /// Its name.
    pub name: String,
    /// Its length in seconds (the SMF ends there at least).
    pub duration_s: f64,
    /// Its notes, by start.
    pub notes: Vec<MidiNote>,
}

/// A media of the source that clips name.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MediaUse {
    /// The key its clips name ([`ClipSource::Media`]).
    pub media_key: String,
    /// `"audio"`, `"video"` or `"image"`.
    pub kind: String,
    /// How many clips play it.
    pub clips: u64,
}

/// An effect of the atome-dsp catalogue on an audio strip (`mix_modules.js` `dsp`).
#[derive(Clone, Debug, PartialEq)]
pub struct DspSpec {
    /// Its catalogue key (`"eq"`, `"compressor"`, `"gate"`, `"limiter"`, `"reverb"`…).
    pub effect: String,
    /// The parameters set (the others keep the catalogue's defaults); a value
    /// outside its range is brought to the nearest end.
    pub params: Vec<(String, f64)>,
    /// True when it is switched off.
    pub bypass: bool,
}

/// A Scene's cell settings (`scene_schema.js`), only those the source sets.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CellSpec {
    /// `"one_shot"` or `"loop"`.
    pub play_mode: Option<String>,
    /// Passes of a loop (`None` with `play_mode` loop: until stopped).
    pub passes: Option<u32>,
    /// `"latch"` or `"momentary"`.
    pub trigger: Option<String>,
}

/// An automation keyframe's curve.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Curve {
    /// Straight to the next keyframe.
    Linear,
    /// Holds until the next keyframe.
    Hold,
    /// Eased to the next keyframe.
    Smooth,
}

impl Curve {
    /// Its key in the document.
    pub const fn key(self) -> &'static str {
        match self {
            Curve::Linear => "linear",
            Curve::Hold => "hold",
            Curve::Smooth => "smooth",
        }
    }
}

/// One automation keyframe, in the parameter's own unit (dB, pan -1..1…).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Keyframe {
    /// Its time (>= 0).
    pub time_seconds: f64,
    /// Its value.
    pub value: f64,
    /// The curve to the next one.
    pub curve: Curve,
}
