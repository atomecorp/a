// Sample-accurate onsets (no smoothing): first sample above 20 % of the attack's own peak, against the 16th grid.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const c = timeline().clips.filter((x) => x.kind === 'audio').at(-1);
  const w = await readTakeWav(c.source.atome_id);
  const BIN = 24;
  const env = new Float32Array(Math.floor(w.n / BIN));
  for (let b = 0; b < env.length; b++) { let m = 0; for (let j = b * BIN; j < (b + 1) * BIN; j++) m = Math.max(m, Math.abs(w.sample(j))); env[b] = m; }
  const peak = env.reduce((a, b) => Math.max(a, b), 0);
  const out = []; let last = -1e9;
  for (let b = 40; b < env.length - 80; b++) {
    let pre = 0; for (let k = b - 30; k < b - 2; k++) pre = Math.max(pre, env[k]);
    let post = 0; for (let k = b; k < b + 40; k++) post = Math.max(post, env[k]);
    if (post - pre > peak * 0.15 && env[b] > pre + (post - pre) * 0.2 && b - last > 120) {
      const thr = pre + (post - pre) * 0.2;
      let i = (b - 2) * BIN; while (Math.abs(w.sample(i)) < thr) i++;
      out.push(i); last = b;
    }
  }
  const t0 = (c.timeline.start_frame - c.timeline.source_in_frame) / 48000;
  const tl = out.map((i) => t0 + i / 48000);
  const err = tl.map((x) => { const r = ((x % 0.125) + 0.125) % 0.125; return (r > 0.0625 ? r - 0.125 : r) * 1000; });
  const mean = err.reduce((a, b) => a + b, 0) / Math.max(1, err.length);
  const sd = Math.sqrt(err.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, err.length));
  return { clip_start: c.timeline.start_seconds, n: out.length, err_ms: err.map((x) => +x.toFixed(2)), mean_ms: +mean.toFixed(2), sd_ms: +sd.toFixed(2) };
};
