// Fabrique d'atomes ISO-BMFF minimaux pour les tests conteneur : uniquement ce
// que lisent `media_container.js` / `media_audio_track_probe.js` (ftyp, moov,
// trak/mdia/hdlr/minf/stbl/stsd, mdat).
import { Buffer } from 'node:buffer';

export const box = (type, ...payloads) => {
    const payload = Buffer.concat(payloads.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part || ''))));
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 'latin1');
    return Buffer.concat([header, payload]);
};

const hdlr = (handler) => box('hdlr', Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]), Buffer.from(handler, 'latin1'));
const stsd = (codec) => {
    const sampleEntry = Buffer.alloc(8);
    sampleEntry.writeUInt32BE(16, 0);
    sampleEntry.write(codec, 4, 'latin1');
    const entryCount = Buffer.alloc(4);
    entryCount.writeUInt32BE(1, 0);
    return box('stsd', Buffer.from([0, 0, 0, 0]), entryCount, sampleEntry);
};
const mdia = (handler, codec) => box('mdia', hdlr(handler), box('minf', box('stbl', stsd(codec))));
const trak = ({ handler, codec }) => box('trak', mdia(handler, codec));

export const buildMp4 = ({ tracks = [], fastStart = true, mdatBytes = 24 } = {}) => {
    const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), Buffer.from([0, 0, 0, 0]));
    const moov = box('moov', ...tracks.map(trak));
    const mdat = box('mdat', Buffer.alloc(mdatBytes));
    return fastStart
        ? Buffer.concat([ftyp, moov, mdat])
        : Buffer.concat([ftyp, mdat, moov]);
};
