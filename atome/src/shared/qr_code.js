// A QR code (ISO/IEC 18004) of any text: byte mode (UTF-8), versions 1–40, error correction L, M, Q or H (raised for
// free while the version holds), the mask of lowest penalty. One brick for the client, the server and MCP; its pictures
// are qr_code_image.js. Follows the reference construction (finder, timing, alignment, format and version patterns,
// Reed–Solomon over GF(256) with 0x11D, blocks interleaved, codewords laid in two-column zigzags).
const ECC = { L: { bits: 1, i: 0 }, M: { bits: 0, i: 1 }, Q: { bits: 3, i: 2 }, H: { bits: 2, i: 3 } };
const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]];
const BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]];
const bit = (value, i) => ((value >>> i) & 1) !== 0;

const rawModules = (version) => {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) { const align = Math.floor(version / 7) + 2; result -= (25 * align - 10) * align - 55; if (version >= 7) result -= 36; }
    return result;
};
const dataCodewords = (version, ecc) => Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[ecc.i][version] * BLOCKS[ecc.i][version];

const gfMultiply = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i -= 1) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
};
const rsDivisor = (degree) => {
    const result = new Array(degree).fill(0); result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i += 1) {
        for (let j = 0; j < degree; j += 1) { result[j] = gfMultiply(result[j], root); if (j + 1 < degree) result[j] ^= result[j + 1]; }
        root = gfMultiply(root, 0x02);
    }
    return result;
};
const rsRemainder = (data, divisor) => {
    const result = divisor.map(() => 0);
    for (const value of data) {
        const factor = value ^ result.shift(); result.push(0);
        divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
    }
    return result;
};

// The data codewords, their error correction per block, interleaved.
const withCorrection = (data, version, ecc) => {
    const blocks = BLOCKS[ecc.i][version], eccLen = ECC_PER_BLOCK[ecc.i][version], raw = Math.floor(rawModules(version) / 8);
    const shortCount = blocks - (raw % blocks), shortLen = Math.floor(raw / blocks), divisor = rsDivisor(eccLen), all = [];
    for (let i = 0, k = 0; i < blocks; i += 1) {
        const block = data.slice(k, k + shortLen - eccLen + (i < shortCount ? 0 : 1)); k += block.length;
        const correction = rsRemainder(block, divisor);
        if (i < shortCount) block.push(0);
        all.push(block.concat(correction));
    }
    const out = [];
    for (let i = 0; i < all[0].length; i += 1) all.forEach((block, j) => { if (i !== shortLen - eccLen || j >= shortCount) out.push(block[i]); });
    return out;
};

const alignmentPositions = (version, size) => {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2, step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2, result = [6];
    for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
    return result;
};

const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

// The penalty of a finished symbol (runs, 2×2 blocks, finder-like patterns, dark balance): the lowest is kept.
const FINDER_LIKE = ['10111010000', '00001011101'];
const penalty = (m, size) => {
    let score = 0, dark = 0;
    const lines = [];
    for (let y = 0; y < size; y += 1) { lines.push(m[y].map(Number).join('')); lines.push(m.map(row => Number(row[y])).join('')); }
    for (const line of lines) {
        for (const run of line.match(/0{5,}|1{5,}/g) || []) score += 3 + run.length - 5;
        for (const pattern of FINDER_LIKE) for (let at = line.indexOf(pattern); at >= 0; at = line.indexOf(pattern, at + 1)) score += 40;
    }
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        if (m[y][x]) dark += 1;
        if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
    const total = size * size;
    return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
};

const symbol = (codewords, version, ecc, mask) => {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; fixed[y][x] = true; };
    for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
        for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
            const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
            if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
        }
    }
    const align = alignmentPositions(version, size), last = align.length - 1;
    align.forEach((ay, i) => align.forEach((ax, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const data = (ecc.bits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const format = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(format, i));
    set(8, 7, bit(format, 6)); set(8, 8, bit(format, 7)); set(7, 8, bit(format, 8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(format, i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(format, i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(format, i));
    set(8, size - 8, true);
    if (version >= 7) {
        let vrem = version;
        for (let i = 0; i < 12; i += 1) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1f25);
        const bits = (version << 12) | vrem;
        for (let i = 0; i < 18; i += 1) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); }
    }
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert += 1) for (let j = 0; j < 2; j += 1) {
            const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
            if (!fixed[y][x] && index < codewords.length * 8) { modules[y][x] = bit(codewords[index >>> 3], 7 - (index & 7)); index += 1; }
        }
    }
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!fixed[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
    return modules;
};

// `text` → { version, size, ecc, mask, modules: rows of booleans (true = dark) }. Throws `qr_text_required` /
// `qr_text_too_long` (more than version 40 holds at the level asked).
export const encodeQr = (text, { ecc: level = 'M' } = {}) => {
    const value = String(text ?? '');
    if (!value) throw new Error('qr_text_required');
    if (!ECC[level]) throw new Error('qr_ecc_invalid');
    const bytes = [...new TextEncoder().encode(value)];
    const bitsFor = version => 4 + (version <= 9 ? 8 : 16) + bytes.length * 8;
    let version = 1;
    while (version <= 40 && bitsFor(version) > dataCodewords(version, ECC[level]) * 8) version += 1;
    if (version > 40) throw new Error('qr_text_too_long');
    let ecc = ECC[level];
    for (const higher of ['M', 'Q', 'H']) if (ECC[higher].i > ecc.i && bitsFor(version) <= dataCodewords(version, ECC[higher]) * 8) ecc = ECC[higher];
    const capacity = dataCodewords(version, ecc) * 8, stream = [];
    const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) stream.push((value >>> i) & 1); };
    push(0b0100, 4); push(bytes.length, version <= 9 ? 8 : 16);
    for (const byte of bytes) push(byte, 8);
    push(0, Math.min(4, capacity - stream.length));
    push(0, (8 - (stream.length % 8)) % 8);
    for (let pad = 0xec; stream.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < stream.length; i += 8) data.push(stream.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
    const codewords = withCorrection(data, version, ecc);
    let best = null;
    for (let mask = 0; mask < 8; mask += 1) {
        const modules = symbol(codewords, version, ecc, mask), score = penalty(modules, modules.length);
        if (!best || score < best.score) best = { modules, mask, score };
    }
    return { version, size: version * 4 + 17, ecc: Object.keys(ECC).find(key => ECC[key] === ecc), mask: best.mask, modules: best.modules };
};
