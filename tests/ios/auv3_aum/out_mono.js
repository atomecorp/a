// R-183 on the iPad: OUT set to the main output's channel 1 alone (mono), the strip still plays; then back to 1-2.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const apply = (operation, command) => api.applyGroupTimelineOperation({ group_id: gid, operation, command });
  const audio = window.Squirrel.av.audio;
  const tl0 = timeline();
  const track = tl0.tracks.find((t) => t.role === 'content' && !t.empty_slot && tl0.clips.some((c) => c.track_id === t.track_id));
  const stripId = `${track.track_id}:audio`;
  await apply('mix.input.set', { strip_id: stripId, input: { kind: 'live_audio', device_id: 'host' } });
  await apply('mix.output.set', { strip_id: stripId, destination: { kind: 'main', mono: 0 } });
  await wait(1500);
  const prog = api.readGroupTimelineMixProgram();
  const strip = prog.strips.find((s) => s.id === stripId);
  const lv = (await audio.mix_levels()).find((x) => x.strip_id === stripId);
  await apply('mix.output.set', { strip_id: stripId, destination: { kind: 'main' } });
  await apply('mix.input.set', { strip_id: stripId, input: { kind: 'track' } });
  return { output: strip?.output, err: prog.last_error, rms: lv?.rms };
};
