// What a shared picture keeps of its file (server/media_metadata_strip.js, ported; cahier
// FEAT-005 / O13: EXIF and GPS always stripped from a shared image or video). Pure functions
// over the bytes: a JPEG loses its APP1 (Exif, XMP), APP13 (IPTC) and comments, keeping only
// its orientation (a minimal Exif of that one tag, so it still shows upright); a PNG its eXIf
// and text chunks; a WebP its EXIF and XMP chunks. Sounds and videos go through ffmpeg
// (social/news/media.rs). `format_of` names a file by its bytes.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Format {
    Jpeg,
    Png,
    Webp,
    Av,
    Heif,
    Svg,
    Unknown,
}

impl Format {
    pub fn name(self) -> &'static str {
        match self {
            Self::Jpeg => "jpeg",
            Self::Png => "png",
            Self::Webp => "webp",
            Self::Av => "av",
            Self::Heif => "heif",
            Self::Svg => "svg",
            Self::Unknown => "unknown",
        }
    }
}

fn u16_be(bytes: &[u8], at: usize) -> usize {
    usize::from(u16::from_be_bytes([bytes[at], bytes[at + 1]]))
}

fn u32_be(bytes: &[u8], at: usize) -> usize {
    u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) as usize
}

fn u32_le(bytes: &[u8], at: usize) -> usize {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) as usize
}

pub fn format_of(bytes: &[u8]) -> Format {
    let starts =
        |at: usize, tag: &[u8]| bytes.len() >= at + tag.len() && &bytes[at..at + tag.len()] == tag;
    if starts(0, &[0xff, 0xd8, 0xff]) {
        return Format::Jpeg;
    }
    if starts(0, &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Format::Png;
    }
    if bytes.len() >= 12 && starts(0, b"RIFF") {
        if starts(8, b"WEBP") {
            return Format::Webp;
        }
        if starts(8, b"WAVE") {
            return Format::Av;
        }
    }
    if bytes.len() >= 12 && starts(4, b"ftyp") {
        // An HEIF picture (an iPhone's photo) is not a sound or a video: its Exif is an item ffmpeg does not drop.
        let brand = &bytes[8..12];
        let heif = [
            b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1", b"avif",
        ];
        return if heif.iter().any(|tag| &tag[..] == brand) {
            Format::Heif
        } else {
            Format::Av
        };
    }
    if starts(0, &[0x1a, 0x45, 0xdf, 0xa3])
        || (bytes.len() >= 4 && (starts(0, b"OggS") || starts(0, b"fLaC")))
    {
        return Format::Av;
    }
    if starts(0, b"ID3") || (bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0) {
        return Format::Av;
    }
    let head: String = bytes[..bytes.len().min(256)]
        .iter()
        .map(|&b| char::from(b))
        .collect();
    let head = head.trim_start();
    if head.starts_with("<svg") || (head.starts_with("<?xml") && head.contains("<svg")) {
        return Format::Svg;
    }
    Format::Unknown
}

// The orientation tag (0x0112) of a JPEG's Exif segment, or 0.
fn exif_orientation(segment: &[u8]) -> usize {
    if segment.len() < 14 || &segment[..6] != b"Exif\0\0" {
        return 0;
    }
    let tiff = &segment[6..];
    let little = &tiff[..2] == b"II";
    let u16_at = |at: usize| {
        let pair = [tiff[at], tiff[at + 1]];
        usize::from(if little {
            u16::from_le_bytes(pair)
        } else {
            u16::from_be_bytes(pair)
        })
    };
    let u32_at = |at: usize| {
        if little {
            u32_le(tiff, at)
        } else {
            u32_be(tiff, at)
        }
    };
    let ifd = u32_at(4);
    if ifd + 2 > tiff.len() {
        return 0;
    }
    for index in 0..u16_at(ifd) {
        let entry = ifd + 2 + index * 12;
        if entry + 12 > tiff.len() {
            return 0;
        }
        if u16_at(entry) == 0x0112 {
            return u16_at(entry + 8);
        }
    }
    0
}

// An Exif segment holding the orientation alone (big-endian TIFF, one IFD entry).
fn orientation_segment(orientation: usize) -> Vec<u8> {
    let mut segment = vec![0u8; 36];
    segment[0..2].copy_from_slice(&0xffe1u16.to_be_bytes());
    segment[2..4].copy_from_slice(&34u16.to_be_bytes());
    segment[4..10].copy_from_slice(b"Exif\0\0");
    segment[10..12].copy_from_slice(b"MM");
    segment[12..14].copy_from_slice(&42u16.to_be_bytes());
    segment[14..18].copy_from_slice(&8u32.to_be_bytes());
    segment[18..20].copy_from_slice(&1u16.to_be_bytes());
    segment[20..22].copy_from_slice(&0x0112u16.to_be_bytes());
    segment[22..24].copy_from_slice(&3u16.to_be_bytes());
    segment[24..28].copy_from_slice(&1u32.to_be_bytes());
    segment[28..30].copy_from_slice(&(orientation as u16).to_be_bytes());
    segment
}

// Kept: APP0 (JFIF), APP2 (its colour profile), APP14 (Adobe's colour transform); every other APPn and COM go.
fn strip_jpeg(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let invalid = || "media_metadata_jpeg_invalid".to_string();
    let mut parts: Vec<Vec<u8>> = vec![bytes[..2].to_vec()];
    let (mut at, mut orientation, mut insert_at) = (2, 0, 1);
    while at + 4 <= bytes.len() {
        if bytes[at] != 0xff {
            return Err(invalid());
        }
        let marker = bytes[at + 1];
        if marker == 0xff {
            at += 1;
            continue;
        }
        if marker == 0xda {
            parts.push(bytes[at..].to_vec());
            at = bytes.len();
            break;
        }
        let end = at + 2 + u16_be(bytes, at + 2);
        if end > bytes.len() {
            return Err(invalid());
        }
        let metadata = ((0xe0..=0xef).contains(&marker) && ![0xe0, 0xe2, 0xee].contains(&marker))
            || marker == 0xfe;
        if marker == 0xe1 && orientation == 0 {
            orientation = exif_orientation(&bytes[at + 4..end]);
        }
        if !metadata {
            parts.push(bytes[at..end].to_vec());
            if marker == 0xe0 {
                insert_at = parts.len();
            }
        }
        at = end;
    }
    if at < bytes.len() {
        return Err(invalid());
    }
    if (2..=8).contains(&orientation) {
        parts.insert(insert_at, orientation_segment(orientation));
    }
    Ok(parts.concat())
}

fn strip_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = bytes[..8].to_vec();
    let mut at = 8;
    while at < bytes.len() {
        if at + 8 > bytes.len() {
            return Err("media_metadata_png_invalid".into());
        }
        let end = at + 12 + u32_be(bytes, at);
        if end > bytes.len() {
            return Err("media_metadata_png_invalid".into());
        }
        if ![&b"eXIf"[..], b"tEXt", b"zTXt", b"iTXt", b"tIME"].contains(&&bytes[at + 4..at + 8]) {
            out.extend_from_slice(&bytes[at..end]);
        }
        at = end;
    }
    Ok(out)
}

// VP8X flags: bit 3 = an EXIF chunk follows, bit 2 = an XMP chunk.
fn strip_webp(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    let mut at = 12;
    while at < bytes.len() {
        if at + 8 > bytes.len() {
            return Err("media_metadata_webp_invalid".into());
        }
        let size = u32_le(bytes, at + 4);
        let end = at + 8 + size + size % 2;
        if at + 8 + size > bytes.len() {
            return Err("media_metadata_webp_invalid".into());
        }
        let kind = &bytes[at..at + 4];
        if kind != b"EXIF" && kind != b"XMP " {
            let mut chunk = bytes[at..end.min(bytes.len())].to_vec();
            if kind == b"VP8X" && chunk.len() > 8 {
                chunk[8] &= !0x0c;
            }
            body.extend_from_slice(&chunk);
        }
        at = end;
    }
    let mut out = bytes[..12].to_vec();
    out[4..8].copy_from_slice(&((body.len() + 4) as u32).to_le_bytes());
    out.extend_from_slice(&body);
    Ok(out)
}

/// A picture's bytes without its metadata; any other format is the caller's (ffmpeg) or refused.
pub fn strip_image(bytes: &[u8]) -> Result<Vec<u8>, String> {
    match format_of(bytes) {
        Format::Jpeg => strip_jpeg(bytes),
        Format::Png => strip_png(bytes),
        Format::Webp => strip_webp(bytes),
        _ => Err("media_metadata_image_format_unsupported".into()),
    }
}
