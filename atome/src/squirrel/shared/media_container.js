// Inspection pure des conteneurs média, partagée par le serveur (qui décide
// comment servir un fichier) et le client (qui sonde une piste audio locale
// avant import). Aucune dépendance Node ou DOM : uniquement des vues binaires.

const MAX_TOP_LEVEL_BOXES = 256;
const MAX_MOOV_BYTES = 32 * 1024 * 1024;

export const readMediaUint32 = (bytes, offset) => (
    ((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
);

const readMediaUint64 = (bytes, offset) => (
    readMediaUint32(bytes, offset) * 0x100000000 + readMediaUint32(bytes, offset + 4)
);

const boxType = (bytes, offset) => String.fromCharCode(
    bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]
);

// Vrai pour un conteneur ISO-BMFF/QuickTime (mp4, m4v, mov).
export const isMp4ContainerBytes = (bytes) => (
    bytes instanceof Uint8Array
    && bytes.length >= 12
    && readMediaUint32(bytes, 0) >= 8
    && boxType(bytes, 4) === 'ftyp'
);

// Parcourt les atomes de premier niveau. `totalSize` couvre un tampon partiel
// (tête de fichier) : un atome de taille 0 va jusqu'à la fin du média, pas du
// tampon lu.
export const readMp4TopLevelBoxes = (bytes, totalSize = bytes?.length || 0) => {
    const boxes = [];
    if (!(bytes instanceof Uint8Array)) return boxes;
    let offset = 0;
    while (offset + 8 <= bytes.length && boxes.length < MAX_TOP_LEVEL_BOXES) {
        let size = readMediaUint32(bytes, offset);
        const type = boxType(bytes, offset + 4);
        let headerSize = 8;
        if (size === 1) {
            if (offset + 16 > bytes.length) break;
            size = readMediaUint64(bytes, offset + 8);
            headerSize = 16;
        } else if (size === 0) {
            size = totalSize - offset;
        }
        if (!Number.isFinite(size) || size < headerSize) break;
        boxes.push({ type, start: offset, end: Math.min(offset + size, bytes.length) });
        offset += size;
    }
    return boxes;
};

const forEachMp4ChildBox = (bytes, start, end, visit) => {
    let offset = start;
    while (offset + 8 <= end) {
        let size = readMediaUint32(bytes, offset);
        const type = boxType(bytes, offset + 4);
        let headerSize = 8;
        if (size === 1) {
            if (offset + 16 > end) return;
            size = readMediaUint64(bytes, offset + 8);
            headerSize = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (!Number.isFinite(size) || size < headerSize || offset + size > end) return;
        visit({ type, start: offset, end: offset + size, contentStart: offset + headerSize });
        offset += size;
    }
};

// Nature des pistes d'un `moov` : handler `vide`/`soun` par `trak`, et codec
// (`avc1`, `hvc1`, …) lu dans le `stsd` pour savoir si le flux est décodable.
export const summarizeMp4Moov = (moovBytes) => {
    const tracks = { video: 0, audio: 0, videoCodecs: [] };
    if (!(moovBytes instanceof Uint8Array) || moovBytes.length < 16) return tracks;
    forEachMp4ChildBox(moovBytes, 8, moovBytes.length, (box) => {
        if (box.type !== 'trak') return;
        let handler = '';
        let codec = '';
        forEachMp4ChildBox(moovBytes, box.contentStart, box.end, (child) => {
            if (child.type !== 'mdia') return;
            forEachMp4ChildBox(moovBytes, child.contentStart, child.end, (mdiaChild) => {
                if (mdiaChild.type === 'hdlr' && mdiaChild.contentStart + 12 <= mdiaChild.end) {
                    handler = boxType(moovBytes, mdiaChild.contentStart + 8);
                }
                if (mdiaChild.type !== 'minf') return;
                forEachMp4ChildBox(moovBytes, mdiaChild.contentStart, mdiaChild.end, (minfChild) => {
                    if (minfChild.type !== 'stbl') return;
                    forEachMp4ChildBox(moovBytes, minfChild.contentStart, minfChild.end, (stblChild) => {
                        if (stblChild.type !== 'stsd' || codec) return;
                        // stsd = version/flags (4) + entry_count (4) + premier sample entry.
                        const entryStart = stblChild.contentStart + 8;
                        if (entryStart + 8 <= stblChild.end) codec = boxType(moovBytes, entryStart + 4);
                    });
                });
            });
        });
        if (handler === 'vide') {
            tracks.video += 1;
            if (codec) tracks.videoCodecs.push(codec.toLowerCase());
        } else if (handler === 'soun') {
            tracks.audio += 1;
        }
    });
    return tracks;
};

// Localise le `moov` dans le tampon lu (tête ou fichier entier). Renvoie ses
// octets pour analyse, jamais plus de 32 Mo.
export const readMp4MoovBytes = (bytes, totalSize = bytes?.length || 0) => {
    const boxes = readMp4TopLevelBoxes(bytes, totalSize);
    const moov = boxes.find((box) => box.type === 'moov');
    if (!moov) return null;
    const end = Math.min(moov.start + (moov.end - moov.start), bytes.length);
    if (end - moov.start > MAX_MOOV_BYTES) return null;
    return bytes.subarray(moov.start, end);
};

// Vrai seulement si le `moov` et tous ses octets tiennent dans le tampon lu.
// Un `moov` tronqué ferait croire à une absence de piste `soun` : on refuse
// alors de conclure.
export const isMp4MoovCompleteInBytes = (bytes, totalSize = bytes?.length || 0) => {
    if (!(bytes instanceof Uint8Array)) return false;
    let offset = 0;
    while (offset + 8 <= bytes.length) {
        let size = readMediaUint32(bytes, offset);
        const type = boxType(bytes, offset + 4);
        let headerSize = 8;
        if (size === 1) {
            if (offset + 16 > bytes.length) return false;
            size = readMediaUint64(bytes, offset + 8);
            headerSize = 16;
        } else if (size === 0) {
            size = totalSize - offset;
        }
        if (!Number.isFinite(size) || size < headerSize) return false;
        if (type === 'moov') return offset + size <= bytes.length;
        offset += size;
    }
    return false;
};

export const isMp4FastStart = (bytes, totalSize = bytes?.length || 0) => {
    const boxes = readMp4TopLevelBoxes(bytes, totalSize);
    const moovIndex = boxes.findIndex((box) => box.type === 'moov');
    if (moovIndex === -1) return false;
    const mdatIndex = boxes.findIndex((box) => box.type === 'mdat');
    return mdatIndex === -1 || moovIndex < mdatIndex;
};

// Retrouve un `moov` dans une fenêtre qui ne commence PAS à l'offset 0 du
// fichier (typiquement la queue lue pour un fichier non faststart). On balaie
// les en-têtes candidats et on ne retient que ceux dont la taille déclarée
// tient entièrement dans la fenêtre, pour ne jamais analyser des octets
// tronqués.
export const findMp4MoovInWindow = (bytes, windowStart = 0, totalSize = 0) => {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
    for (let candidate = 4; candidate + 4 <= bytes.length; candidate += 1) {
        if (boxType(bytes, candidate) !== 'moov') continue;
        const start = candidate - 4;
        let size = readMediaUint32(bytes, start);
        let headerSize = 8;
        if (size === 1) {
            if (start + 16 > bytes.length) continue;
            size = readMediaUint64(bytes, start + 8);
            headerSize = 16;
        } else if (size === 0) {
            size = (totalSize || windowStart + bytes.length) - (windowStart + start);
        }
        if (!Number.isFinite(size) || size < headerSize) continue;
        if (start + size > bytes.length) continue;
        if (size > MAX_MOOV_BYTES) continue;
        if (totalSize && windowStart + start + size > totalSize) continue;
        return bytes.subarray(start, start + size);
    }
    return null;
};
