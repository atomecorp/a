// A Record region (audio, 2 bars) dropped ahead on the empty track, the host playing: Play locks on the host
// and the region's take lands exactly where it is.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const tl0 = timeline();
  const track = [...tl0.tracks].reverse().find((t) => t.role === 'content' && t.empty_slot);
  const rate = tl0.timebase.sample_rate;
  if (!transport().playing) { await content.transport('play'); await wait(500); }
  const here = transport().position;
  await content.transport('stop');
  const startSec = Math.ceil((here + 7) / 2) * 2; // on a bar, ~7 s ahead
  const regionId = `record_region_probe_${Date.now()}`;
  const added = await api.applyGroupTimelineOperation({ group_id: gid, operation: 'record_region.add', command: {
    record_region_id: regionId, section_id: track.section_id, track_id: track.track_id, source_kind: 'audio',
    start_frame: Math.round(startSec * rate), duration_frames: Math.round(4 * rate), fill_mode: 'fixed', armed: true } });
  const before = new Set(timeline().clips.map((c) => c.clip_id));
  const played = await content.transport('play');
  const tr1 = transport();
  await wait((startSec + 4 + 2.5 - tr1.position) * 1000);
  const clip = timeline().clips.find((c) => !before.has(c.clip_id));
  const region = timeline().record_regions.find((r) => r.record_region_id === regionId);
  return { track: track.track_id, here, startSec, added: added?.ok, played: { ok: played?.ok, playing: played?.playing, locked: played?.host_locked ?? played?.hostLocked, sa: played?.sample_accurate }, tr1: tr1.position,
    clip: clip && { id: clip.clip_id, track: clip.track_id, start: clip.timeline.start_seconds, dur: clip.timeline.duration_seconds, in: clip.timeline.source_in_frame, kind: clip.kind },
    region: region && { armed: region.armed, start: region.start_frame / rate }, now: transport() };
};
