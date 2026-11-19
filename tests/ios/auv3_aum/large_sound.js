// PE-26 on the iPad (tests/parcours_musique/10_persistance_plateformes.md): a 91.7 MB AIFF goes through the upload's duration read (asset_box_media.js#probeAudioDurationFromBlob),
// that is JS → swiftBridge (base64) → NativeKiraEngine.loadClipBytes → FFI atome_ios_audio_load_clip_bytes.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const seconds = 520, frames = 44100 * seconds, soundLen = frames * 4;
  const bytes = new Uint8Array(54 + soundLen); const view = new DataView(bytes.buffer);
  const tag = (at, text) => { for (let i = 0; i < 4; i += 1) bytes[at + i] = text.charCodeAt(i); };
  tag(0, 'FORM'); view.setUint32(4, 46 + soundLen); tag(8, 'AIFF'); tag(12, 'COMM'); view.setUint32(16, 18);
  view.setUint16(20, 2); view.setUint32(22, frames); view.setUint16(26, 16);
  bytes.set([0x40, 0x0E, 0xAC, 0x44, 0, 0, 0, 0, 0, 0], 28); tag(38, 'SSND'); view.setUint32(42, 8 + soundLen);
  for (let i = 54; i < bytes.length; i += 1) bytes[i] = i & 0xff;
  const media = await import('/chunks/shared/__AB__');
  // resolveUploadMediaSizeParticles, the upload's own call (asset_box_file_upload.js): the export taking `probeAudioDuration`.
  const resolveParticles = Object.values(media).find((f) => typeof f === 'function' && String(f).includes('probeAudioDuration:'));
  if (!resolveParticles) return { error: 'upload_size_resolver_missing' };
  const started = performance.now();
  let probed = null, error = null;
  try { probed = await resolveParticles(new File([bytes], 'large_sound.aiff', { type: 'audio/aiff' }), 'sound'); } catch (e) { error = String(e?.message || e); }
  return { size: bytes.length, particles: probed, error, ms: Math.round(performance.now() - started) };
};
