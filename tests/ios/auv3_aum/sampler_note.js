// Atome's internal instrument (Sampler) in the AUv3: create, one zone from a take, a note, its strip's meter;
// the instrument is deleted at the end.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const mcp = (m, p) => window.handleAtomeMCPRequestAsync({ jsonrpc: '2.0', id: m, method: m, params: p }, { source: { type: 'system', layer: 'probe' } });
  const res = (r) => r?.result?.result?.result ?? r?.result?.result ?? r?.result ?? r;
  const yes = async (m, p) => { const f = res(await mcp(m, p)); return f?.confirmation_required ? res(await mcp(m, { ...p, confirmed: true, confirmation_id: f.confirmation_id })) : f; };
  const rack = (await import('/chunks/shared/__FX__').catch((e) => ({ err: String(e) })));
  const levels = async () => rack.getFxRackRuntime ? (await rack.getFxRackRuntime().levels()) : rack.err;
  const take = timeline().clips.filter((c) => c.kind === 'audio').at(-1);
  const created = await yes('audio_fx.instrument_create', { name: 'QA Sampler AUv3' });
  const id = created?.instrument_id;
  const placed = id && await yes('audio_fx.samples_place', { instrument_id: id, media_atome_ids: [take.source.atome_id], note: 60, velocity: 89, spread: 'fit' });
  await wait(800);
  const before = await levels();
  const played = id && await yes('audio_fx.note_play', { instrument_id: id, note: 60, velocity: 100, duration_ms: 900 });
  let peak = 0; const trail = [];
  for (let i = 0; i < 15; i++) { await wait(80); const l = await levels(); const p = Array.isArray(l) ? Math.max(0, ...l.map((x) => x.peak || 0)) : -1; trail.push(+p.toFixed(3)); peak = Math.max(peak, p); }
  const removed = id ? (await yes('audio_fx.instrument_delete', { instrument_id: id }))?.ok : null;
  return { removed, created: { ok: created?.ok, id, err: created?.error, reason: created?.reason }, placed: { ok: placed?.ok, err: placed?.error, reason: placed?.reason, zones: placed?.zone_ids?.length },
    played: { ok: played?.ok, err: played?.error, reason: played?.reason, keys: played && Object.keys(played).slice(0, 10) }, before: Array.isArray(before) ? before.length : before, peak, trail };
};
