// Multi-project anchoring: a fingerprint of the open project's timeline, then two new projects created and opened,
// back to the first: nothing moved. The two projects are deleted at the end.
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const home = gid;
  const print = () => { const t = timeline(); return { clips: t.clips.length, tracks: t.tracks.length, sig: t.clips.map((c) => `${c.clip_id}@${c.track_id}:${c.timeline.start_frame}+${c.timeline.duration_frames}/${c.timeline.source_in_frame}`).sort().join('|') }; };
  // A project's timeline group is the project itself.
  const refresh = (pid) => { gid = pid; };
  const before = print();
  const created = [];
  for (const name of ['QA ancrage 2', 'QA ancrage 3']) {
    const c = await tool('projects.create', { name });
    const pid = c?.result?.result?.project_id || c?.result?.project_id;
    created.push({ ok: c?.ok, pid, err: c?.error || c?.result?.error });
    if (!pid) continue;
    const o = await tool('ui.project.open', { project_id: pid });
    await wait(3000);
    // A new project opens in its natural view: its Timeline is the one asked for.
    await tool('ui.timeline.activity.timeline', {});
    await wait(1500);
    refresh(pid);
    created.at(-1).active = api.getActiveGroupTimelineId() === pid;
    created.at(-1).opened = { ok: o?.ok, timeline: !!timeline()?.tracks };
  }
  const back = await tool('ui.project.open', { project_id: home });
  // Its Timeline view is kept on the project: touching it again would fold it back to the natural view.
  await wait(3500);
  refresh(home);
  const after = print();
  for (const entry of created) if (entry.pid) entry.deleted = (await tool('projects.delete', { project_id: entry.pid }))?.ok;
  return { before: { clips: before.clips, tracks: before.tracks }, created, back: { ok: back?.ok, home: gid === home }, after: { clips: after.clips, tracks: after.tracks }, identical: before.sig === after.sig };
};
