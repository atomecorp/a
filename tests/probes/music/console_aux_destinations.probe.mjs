// R-183: an Aux lists the buses, the other audio tracks and « Nv. bus » (two tracks and a bus).
import * as K from '../../../eVe/intuition/tools/molecule/kernel/index.js';
import { mixAuxDestinations } from '../../../eVe/domains/rendering/molecule_mix_catalog.js';
let tl = K.createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'g' });
tl = K.addTrack(tl, { track_id: 'a', section_id: 'tl:section:1', kind: 'audio', name: 'A', order: 10 });
tl = K.addTrack(tl, { track_id: 'b', section_id: 'tl:section:1', kind: 'audio', name: 'B', order: 20 });
tl = K.addTrack(tl, { track_id: 'bus1', section_id: 'tl:section:1', kind: 'audio', role: 'group', name: 'Bus A', order: 30 });
const strips = K.resolveMixStrips(tl, { clipHasAudio: () => true });
const a = strips.find((s) => s.strip_id === 'a:audio');
const list = mixAuxDestinations({ timeline: tl, strip: a, strips }).map((e) => e.key);
console.log(JSON.stringify(list));
const ok = list.some((k) => k.includes('bus1')) && list.some((k) => k.includes('b:audio')) && list.includes('new_bus') && !list.some((k) => k.includes('a:audio'));
console.log(ok ? 'aux_destinations OK' : 'aux_destinations NO');
