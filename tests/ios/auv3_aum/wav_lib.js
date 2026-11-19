// Reads a take's WAV through its media atome; returns { sr, n, sample(i) } (channel 0).
const readTakeWav = async (atomeId) => {
  const st = await window.Atome.getStateCurrent(atomeId);
  const url = String(st?.properties?.media_url).replace(/media_user_id=[^&]*/, globalThis.__MEDIA_USER ? `media_user_id=${globalThis.__MEDIA_USER}` : '$&');
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= dv.byteLength) { const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3)); const len = dv.getUint32(off + 4, true); if (id === 'fmt ') fmt = { tag: dv.getUint16(off + 8, true), ch: dv.getUint16(off + 10, true), sr: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) }; if (id === 'data') { data = { off: off + 8, len }; break; } off += 8 + len + (len & 1); }
  const bps = fmt.bits / 8, n = Math.floor(data.len / (bps * fmt.ch));
  const at = (i) => data.off + i * bps * fmt.ch;
  const sample = (i) => (fmt.tag === 3 || fmt.bits === 32 ? dv.getFloat32(at(i), true)
    : fmt.bits === 24 ? ((dv.getUint8(at(i)) | (dv.getUint8(at(i) + 1) << 8) | (dv.getInt8(at(i) + 2) << 16)) / 8388608)
      : dv.getInt16(at(i), true) / 32768);
  return { url, fmt, sr: fmt.sr, n, sample };
};
const envelope = (w, ms) => { const win = Math.round(w.sr * ms / 1000), env = []; for (let i = 0; i + win <= w.n; i += win) { let m = 0; for (let j = i; j < i + win; j++) m = Math.max(m, Math.abs(w.sample(j))); env.push(m); } return env; };
