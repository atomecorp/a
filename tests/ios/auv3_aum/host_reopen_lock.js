// R-179 defect 4: the host playing (AUM in Play), the project left for another then opened again lands playing,
// locked on the host (sample-accurate, its position the host's).
// The probe body; run.sh appends `return probe();` to the evaluated page body.
const probe = async () => {
  const home = gid;
  const listed = await window.AdoleAPI.projects.list();
  const projects = listed?.tauri?.projects || listed?.fastify?.projects || Object.values(listed || {}).find(Array.isArray) || [];
  const other = projects.find((p) => (p.id || p.atome_id) !== home);
  if (!other) return { error: 'a second project is needed' };
  const t0 = transport();
  await tool('ui.project.open', { project_id: other.id || other.atome_id });
  await wait(3500);
  await tool('ui.project.open', { project_id: home });
  await wait(5000);
  gid = api.getActiveGroupTimelineId();
  const t1 = transport();
  await wait(2000);
  const t2 = transport();
  return { before: { playing: t0.playing }, after: { gid, back: gid === home, playing: t1.playing, p1: t1.position, p2: t2.position, sa: t2.sample_accurate, host: t2.host_locked ?? t2.host } };
};
