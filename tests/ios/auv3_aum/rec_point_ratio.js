// Reads the last three audio takes (dry, wet, dry of rec_point_take.js) and gives the wet/dry ratio in dB.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const clips = timeline().clips.filter((c) => c.kind === 'audio').slice(-3);
  const r = [];
  for (const c of clips) { const w = await readTakeWav(c.source.atome_id); let s = 0, n = 0; for (let i = Math.floor(w.n * 0.1); i < Math.floor(w.n * 0.9); i++) { const v = w.sample(i); s += v * v; n++; } r.push(Math.sqrt(s / n)); }
  return { rms: r, ratio: r[1] / ((r[0] + r[2]) / 2), db: 20 * Math.log10(r[1] / ((r[0] + r[2]) / 2)) };
};
