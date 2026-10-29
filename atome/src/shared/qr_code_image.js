// The pictures of a QR code (qr_code.js): an SVG for the panels (crisp at any size) and a PNG for the person's media,
// dark modules on white with the four-module quiet zone the standard asks for.
const QUIET_MODULES = 4;

export const qrSvg = ({ size, modules }) => {
    const side = size + QUIET_MODULES * 2;
    let path = '';
    modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + QUIET_MODULES} ${y + QUIET_MODULES}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
};
export const qrSvgDataUrl = qr => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(qr))}`;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = value => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const chunk = (type, data) => { const body = [...new TextEncoder().encode(type), ...data]; return [...u32(data.length), ...body, ...u32(crc32(body))]; };
const deflate = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

// An 8-bit grey PNG, `scale` pixels per module (the zlib stream by the platform's CompressionStream).
export const qrPng = async ({ size, modules }, { scale = 8 } = {}) => {
    const side = (size + QUIET_MODULES * 2) * scale, raw = new Uint8Array(side * (side + 1));
    for (let py = 0; py < side; py += 1) {
        const y = Math.floor(py / scale) - QUIET_MODULES, at = py * (side + 1);
        for (let px = 0; px < side; px += 1) {
            const x = Math.floor(px / scale) - QUIET_MODULES;
            raw[at + 1 + px] = modules[y]?.[x] ? 0 : 255;
        }
    }
    const header = [...u32(side), ...u32(side), 8, 0, 0, 0, 0];
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', header), ...chunk('IDAT', [...await deflate(raw)]), ...chunk('IEND', [])]);
};
