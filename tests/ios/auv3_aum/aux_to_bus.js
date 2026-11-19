// R-183 on the iPad: a track hearing the host input sends an Aux (Envoi 100 %, Passage 100 %) to a new bus; the
// track muted, the bus still receives (the engine's strip meters).
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const apply = (operation, command) => api.applyGroupTimelineOperation({ group_id: gid, operation, command });
  const batch = (operations) => api.applyGroupTimelineBatch({ group_id: gid, operations, batch_label: 'probe' });
  const audio = window.Squirrel.av.audio;
  const tl0 = timeline();
  const track = tl0.tracks.filter((t) => t.role === 'content' && !t.empty_slot)
    .sort((a, b) => tl0.clips.filter((c) => c.track_id === b.track_id).length - tl0.clips.filter((c) => c.track_id === a.track_id).length)[0];
  const stripId = `${track.track_id}:audio`;
  const busId = 'bus_probe_' + Date.now();
  const auxId = 'mixm_probe_' + Date.now();
  await batch([
    { operation: 'track.add', command: { track_id: busId, section_id: track.section_id, kind: 'audio', name: 'Bus P', role: 'group' } },
    { operation: 'mix.module.add', command: { strip_id: stripId, module_id: auxId, type: 'aux', index: 3, params: { send: 1, pass: 1 } } },
    { operation: 'mix.module.update', command: { strip_id: stripId, module_id: auxId, destination: { kind: 'bus', id: busId } } },
    { operation: 'mix.input.set', command: { strip_id: stripId, input: { kind: 'live_audio', device_id: 'host' } } }
  ]);
  const levels = async () => { await wait(1500); const l = await audio.mix_levels(); const pick = (id) => { const e = l.find((x) => x.strip_id === id); return e ? Math.round(e.rms * 1e5) / 1e5 : null; }; return { track: pick(stripId), bus: pick(`${busId}:audio`) }; };
  const open = await levels();
  await apply('molecule.track.update', { track_id: track.track_id, mute: true });
  const muted = await levels();
  // Back as it was.
  await apply('molecule.track.update', { track_id: track.track_id, mute: false });
  await batch([
    { operation: 'mix.input.set', command: { strip_id: stripId, input: { kind: 'track' } } },
    { operation: 'mix.module.remove', command: { strip_id: stripId, module_id: auxId } },
    { operation: 'track.remove', command: { track_id: busId } }
  ]);
  const prog = api.readGroupTimelineMixProgram();
  return { track: track.track_id, open, muted, err: prog.last_error };
};
