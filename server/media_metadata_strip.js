// What a shared picture keeps of its file (cahier FEAT-005 / O13, user default of 28 Oct. 2026: EXIF and GPS
// always stripped from a shared image or video). Pure functions over the bytes, no dependency: a JPEG
// loses its APP1 (Exif, XMP), APP13 (IPTC) and comments, keeping only its orientation (a minimal Exif of
// that one tag, so it still shows upright); a PNG its eXIf and text chunks; a WebP its EXIF and XMP chunks.
// Sounds and videos go through ffmpeg (server/news_media_cleaner.js). `mediaFormatOf` names a file by its bytes.

const ascii = (buffer, start, length) => buffer.subarray(start, start + length).toString('latin1');

export const mediaFormatOf = (buffer) => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
    if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
    if (buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WEBP') return 'webp';
    if (buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WAVE') return 'av';
    if (buffer.length >= 12 && ascii(buffer, 4, 4) === 'ftyp') {
        // An HEIF picture (an iPhone's photo) is not a sound or a video: its Exif is an item ffmpeg does not drop.
        return /^(heic|heix|hevc|heim|heis|mif1|msf1|avif)$/.test(ascii(buffer, 8, 4)) ? 'heif' : 'av';
    }
    if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) return 'av';
    if (buffer.length >= 4 && ['OggS', 'fLaC'].includes(ascii(buffer, 0, 4))) return 'av';
    if (buffer.length >= 3 && (ascii(buffer, 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))) return 'av';
    const head = ascii(buffer, 0, Math.min(buffer.length, 256)).trimStart();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
    return 'unknown';
};

// The orientation tag (0x0112) of a JPEG's Exif segment, or 0.
const exifOrientation = (segment) => {
    if (segment.length < 14 || ascii(segment, 0, 6) !== 'Exif\0\0') return 0;
    const tiff = segment.subarray(6), little = ascii(tiff, 0, 2) === 'II';
    const u16 = at => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
    const u32 = at => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
    const ifd = u32(4);
    if (ifd + 2 > tiff.length) return 0;
    for (let index = 0, count = u16(ifd); index < count; index += 1) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > tiff.length) return 0;
        if (u16(entry) === 0x0112) return u16(entry + 8);
    }
    return 0;
};
// An Exif segment holding the orientation alone (big-endian TIFF, one IFD entry).
const orientationSegment = (orientation) => {
    const segment = Buffer.alloc(36);
    segment.writeUInt16BE(0xffe1, 0); segment.writeUInt16BE(34, 2);
    segment.write('Exif\0\0', 4, 'latin1'); segment.write('MM', 10, 'latin1');
    segment.writeUInt16BE(42, 12); segment.writeUInt32BE(8, 14); segment.writeUInt16BE(1, 18);
    segment.writeUInt16BE(0x0112, 20); segment.writeUInt16BE(3, 22); segment.writeUInt32BE(1, 24); segment.writeUInt16BE(orientation, 28);
    return segment;
};
// Kept: APP0 (JFIF), APP2 (its colour profile), APP14 (Adobe's colour transform); every other APPn and COM go.
const KEPT_APP = new Set([0xe0, 0xe2, 0xee]);
const stripJpeg = (buffer) => {
    const parts = [buffer.subarray(0, 2)];
    let at = 2, orientation = 0, insertAt = 1;
    while (at + 4 <= buffer.length) {
        if (buffer[at] !== 0xff) throw new Error('media_metadata_jpeg_invalid');
        const marker = buffer[at + 1];
        if (marker === 0xff) { at += 1; continue; }
        if (marker === 0xda) { parts.push(buffer.subarray(at)); at = buffer.length; break; }
        const end = at + 2 + buffer.readUInt16BE(at + 2);
        if (end > buffer.length) throw new Error('media_metadata_jpeg_invalid');
        const metadata = (marker >= 0xe0 && marker <= 0xef && !KEPT_APP.has(marker)) || marker === 0xfe;
        if (marker === 0xe1) orientation ||= exifOrientation(buffer.subarray(at + 4, end));
        if (!metadata) { parts.push(buffer.subarray(at, end)); if (marker === 0xe0) insertAt = parts.length; }
        at = end;
    }
    if (at < buffer.length) throw new Error('media_metadata_jpeg_invalid');
    if (orientation > 1 && orientation <= 8) parts.splice(insertAt, 0, orientationSegment(orientation));
    return Buffer.concat(parts);
};

const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
const stripPng = (buffer) => {
    const parts = [buffer.subarray(0, 8)];
    for (let at = 8; at < buffer.length;) {
        const end = at + 12 + buffer.readUInt32BE(at);
        if (end > buffer.length) throw new Error('media_metadata_png_invalid');
        if (!PNG_DROPPED.has(ascii(buffer, at + 4, 4))) parts.push(buffer.subarray(at, end));
        at = end;
    }
    return Buffer.concat(parts);
};

// VP8X flags: bit 3 = an EXIF chunk follows, bit 2 = an XMP chunk.
const stripWebp = (buffer) => {
    const chunks = [];
    for (let at = 12; at < buffer.length;) {
        const size = buffer.readUInt32LE(at + 4), end = at + 8 + size + (size % 2);
        if (at + 8 + size > buffer.length) throw new Error('media_metadata_webp_invalid');
        const type = ascii(buffer, at, 4);
        if (type !== 'EXIF' && type !== 'XMP ') {
            const chunk = Buffer.from(buffer.subarray(at, Math.min(end, buffer.length)));
            if (type === 'VP8X') chunk[8] &= ~0x0c;
            chunks.push(chunk);
        }
        at = end;
    }
    const body = Buffer.concat(chunks), header = Buffer.from(buffer.subarray(0, 12));
    header.writeUInt32LE(body.length + 4, 4);
    return Buffer.concat([header, body]);
};

const STRIPPERS = { jpeg: stripJpeg, png: stripPng, webp: stripWebp };
// A picture's bytes without its metadata; any other format is the caller's (ffmpeg) or refused.
export const stripImageMetadata = (buffer) => {
    const strip = STRIPPERS[mediaFormatOf(buffer)];
    if (!strip) throw new Error('media_metadata_image_format_unsupported');
    return strip(buffer);
};
export const isStrippableImage = buffer => Object.hasOwn(STRIPPERS, mediaFormatOf(buffer));
