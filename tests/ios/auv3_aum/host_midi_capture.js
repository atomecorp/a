// The host sequencer plays into Atome: a 4 s MIDI capture (rec. › MIDI) must hold the host's notes.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const started = await tool('ui.capture.midi', { active: true });
  await wait(4000);
  const stopped = await tool('ui.capture.midi', { active: false });
  const r = stopped?.result || {};
  const short = (o, d = 0) => (o && typeof o === 'object' && d < 2) ? Object.fromEntries(Object.entries(o).slice(0, 16).map(([k, v]) => [k, Array.isArray(v) ? `[${v.length}] ${JSON.stringify(v[0])?.slice(0, 160)}` : short(v, d + 1)])) : (typeof o === 'string' ? o.slice(0, 120) : o);
  return { start: short(started?.result), stop: short(r) };
};
