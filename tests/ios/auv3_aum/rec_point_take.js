// R-183 on the iPad in AUM: a take is taken at its strip's REC point — dry under IN, wet after VOL at -20 dB.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const apply = (operation, command) => api.applyGroupTimelineOperation({ group_id: gid, operation, command });
  const rms = (w) => { let s = 0, n = 0; for (let i = Math.floor(w.n * 0.1); i < Math.floor(w.n * 0.9); i++) { const v = w.sample(i); s += v * v; n++; } return Math.sqrt(s / Math.max(1, n)); };
  // The Timeline recorder's own call (project_view_timeline_recording.js#begin), on a given track.
  const take = async (ms, trackId = undefined) => {
    const before = timeline().clips.length;
    const started = trackId
      ? await api.startGroupTimelineGenericRecording({ group_id: gid, track_id: trackId, source_kind: 'audio', timeline_start_frame: transport().playhead_frame ?? 0 })
      : await content.recordOnTheFly({ source: 'audio', active: true });
    await wait(ms);
    const stopped = trackId ? await api.stopGroupTimelineGenericRecording({ group_id: gid }) : await content.recordOnTheFly({ active: false });
    await wait(2500);
    const clip = timeline().clips.slice(before).find((c) => c.kind === 'audio');
    if (!clip) return { started, stopped, clip: null };
    const w = await readTakeWav(clip.source.atome_id);
    return { track: clip.track_id, rms: rms(w), sr: w.sr, ch: w.fmt.ch, n: w.n, started: started?.ok ?? started, sa: started?.sample_accurate };
  };
  // A first take occupies a track; armed, it receives every next take.
  const first = await take(3000);
  if (!first.track) return { first };
  const dry = await take(4000, first.track);
  const stripId = `${first.track}:audio`;
  // The strip as the engine plays it (no mix document is stored before a first change).
  const programChain = () => api.readGroupTimelineMixProgram().strips.find((s) => s.id === stripId).chain;
  const chainOf = () => programChain().map((m) => `${m.type}${m.type === 'volume' ? ':' + (m.params?.gain_db ?? '') : ''}`);
  const strip = { chain: programChain() };
  const rec = { module_id: strip.chain.find((m) => m.type === 'record').id };
  const vol = { module_id: strip.chain.find((m) => m.type === 'volume').id, params: strip.chain.find((m) => m.type === 'volume').params };
  const chainBefore = chainOf();
  const g0 = vol.params.gain_db;
  await apply('mix.module.update', { strip_id: stripId, module_id: vol.module_id, params: { gain_db: -20 } });
  await apply('mix.module.move', { strip_id: stripId, module_id: rec.module_id, index: strip.chain.findIndex((m) => m.type === 'volume') });
  const chainWet = chainOf();
  await wait(800);
  const wet = await take(4000, first.track);
  // Back as it was.
  await apply('mix.module.move', { strip_id: stripId, module_id: rec.module_id, index: 0 });
  await apply('mix.module.update', { strip_id: stripId, module_id: vol.module_id, params: { gain_db: g0 } });
  const dry2 = await take(4000, first.track);
  return { first: first.track, dry, wet, dry2, chainBefore, chainWet, chainAfter: chainOf(), ratio: wet.rms / ((dry.rms + dry2.rms) / 2) };
};
