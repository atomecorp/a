// What each network takes (R-190): its documented media limits (SOCIAL_MEDIA_CONSTRAINTS of
// atome/src/squirrel/social/contracts.js), its text limit, and whether it pulls the media from a
// public URL instead of taking its bytes. media.rs checks an asset and prepares its variant
// against them.

const MB: f64 = 1024.0 * 1024.0;

/// A network's limits for a kind of media, none where it has none.
pub struct Limits {
    pub formats: &'static [&'static str],
    pub containers: &'static [&'static str],
    pub codecs: &'static [&'static str],
    pub audio_codecs: Option<&'static [&'static str]>,
    pub max_audio_rate: Option<f64>,
    pub min_side: Option<f64>,
    pub max_side: Option<f64>,
    pub min_width: Option<f64>,
    pub max_width: Option<f64>,
    pub min_aspect: Option<f64>,
    pub max_aspect: f64,
    pub min_fps: f64,
    pub max_fps: f64,
    pub min_duration: Option<f64>,
    pub max_duration: Option<f64>,
    pub max_bytes: f64,
}

const NONE: Limits = Limits {
    formats: &[],
    containers: &[],
    codecs: &[],
    audio_codecs: None,
    max_audio_rate: None,
    min_side: None,
    max_side: None,
    min_width: None,
    max_width: None,
    min_aspect: None,
    max_aspect: 0.0,
    min_fps: 0.0,
    max_fps: 0.0,
    min_duration: None,
    max_duration: None,
    max_bytes: 0.0,
};

// TikTok's documented caption limits, in UTF-16 units.
pub const TIKTOK_VIDEO_CAPTION: usize = 2200;
pub const TIKTOK_PHOTO_DESCRIPTION: usize = 4000;

pub fn limits(network: &str, kind: &str) -> Option<Limits> {
    Some(match (network, kind) {
        ("tiktok", "video") => Limits {
            containers: &["mp4", "mov", "webm"],
            codecs: &["h264", "hevc", "vp8", "vp9"],
            min_side: Some(360.0),
            max_side: Some(4096.0),
            min_fps: 23.0,
            max_fps: 60.0,
            max_duration: Some(600.0),
            max_bytes: 4.0 * 1024.0 * MB,
            ..NONE
        },
        ("tiktok", "image") => Limits {
            formats: &["jpeg", "webp"],
            max_side: Some(1080.0),
            max_bytes: 20.0 * MB,
            ..NONE
        },
        ("instagram", "video") => Limits {
            containers: &["mp4", "mov"],
            codecs: &["h264", "hevc"],
            audio_codecs: Some(&["aac"]),
            max_audio_rate: Some(48_000.0),
            min_fps: 23.0,
            max_fps: 60.0,
            max_width: Some(1920.0),
            min_duration: Some(3.0),
            max_duration: Some(900.0),
            max_bytes: 300.0 * MB,
            ..NONE
        },
        ("instagram", "image") => Limits {
            formats: &["jpeg"],
            min_width: Some(320.0),
            max_width: Some(1440.0),
            min_aspect: Some(4.0 / 5.0),
            max_aspect: 1.91,
            max_bytes: 8.0 * MB,
            ..NONE
        },
        ("facebook", "image") => Limits {
            formats: &["jpeg", "png", "gif", "bmp", "tiff"],
            max_bytes: 4.0 * MB,
            ..NONE
        },
        ("threads", "image") => Limits {
            formats: &["jpeg", "png"],
            max_width: Some(1440.0),
            max_bytes: 8.0 * MB,
            ..NONE
        },
        ("threads", "video") => Limits {
            containers: &["mp4", "mov"],
            codecs: &["h264", "hevc"],
            max_duration: Some(300.0),
            max_bytes: 1024.0 * MB,
            ..NONE
        },
        // An atproto blob holds 1 MB for an image, 50 MB for a video.
        ("bluesky", "image") => Limits {
            formats: &["jpeg", "png", "webp"],
            max_side: Some(2000.0),
            max_bytes: 0.95 * MB,
            ..NONE
        },
        ("bluesky", "video") => Limits {
            containers: &["mp4"],
            codecs: &["h264"],
            max_duration: Some(180.0),
            max_bytes: 50.0 * MB,
            ..NONE
        },
        ("mastodon", "image") => Limits {
            formats: &["jpeg", "png", "gif", "webp"],
            max_bytes: 16.0 * MB,
            ..NONE
        },
        ("mastodon", "video") => Limits {
            containers: &["mp4", "mov", "webm"],
            max_bytes: 99.0 * MB,
            ..NONE
        },
        ("linkedin", "image") => Limits {
            formats: &["jpeg", "png", "gif"],
            max_bytes: 36.0 * MB,
            ..NONE
        },
        ("linkedin", "video") => Limits {
            containers: &["mp4"],
            min_duration: Some(3.0),
            max_duration: Some(1800.0),
            max_bytes: 5.0 * 1024.0 * MB,
            ..NONE
        },
        ("youtube", "video") => Limits {
            containers: &["mp4", "mov", "webm"],
            max_bytes: 256.0 * 1024.0 * MB,
            ..NONE
        },
        // A bot's upload holds 10 MB for a photo, 50 MB for a video.
        ("telegram", "image") => Limits {
            formats: &["jpeg", "png", "webp"],
            max_bytes: 10.0 * MB,
            ..NONE
        },
        ("telegram", "video") => Limits {
            containers: &["mp4"],
            max_bytes: 50.0 * MB,
            ..NONE
        },
        // A webhook's attachment holds 10 MB.
        ("discord", "image" | "video") => Limits {
            max_bytes: 10.0 * MB,
            ..NONE
        },
        _ => return None,
    })
}

/// A network's text limit: how it counts, how far, and what a longer text is named.
pub struct TextLimit {
    pub max: usize,
    pub utf16: bool,
    pub detail: &'static str,
}

impl TextLimit {
    pub fn count(&self, text: &str) -> usize {
        if self.utf16 {
            text.encode_utf16().count()
        } else {
            text.chars().count()
        }
    }
}

pub fn text_limit(network: &str, kind: &str) -> Option<TextLimit> {
    let (max, utf16, detail) = match (network, kind) {
        ("tiktok", "video") => (TIKTOK_VIDEO_CAPTION, true, "caption_too_long"),
        ("tiktok", "image") => (TIKTOK_PHOTO_DESCRIPTION, true, "caption_too_long"),
        ("bluesky", _) => (300, false, "text_too_long"),
        ("mastodon", _) => (500, false, "text_too_long"),
        ("threads", _) => (500, false, "text_too_long"),
        ("linkedin", _) => (3000, false, "text_too_long"),
        ("telegram", "text") => (4096, true, "text_too_long"),
        ("telegram", _) => (1024, true, "caption_too_long"),
        ("discord", _) => (2000, false, "text_too_long"),
        ("youtube", _) => (5000, false, "caption_too_long"),
        _ => return None,
    };
    Some(TextLimit { max, utf16, detail })
}

/// Whether the network pulls the media from a public URL instead of taking its bytes.
pub fn pulled(network: &str, kind: &str) -> bool {
    matches!(
        (network, kind),
        ("instagram" | "tiktok", "image") | ("threads", "image" | "video")
    )
}
