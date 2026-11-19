// R-183: a take on the trailing empty track (a new project's « Piste 1 ») compiles its strip with its REC point.
import * as K from '../../../eVe/intuition/tools/molecule/kernel/index.js';
import { compileMoleculeMixProgram } from '../../../eVe/core/media_engine/molecule_mix_engine.js';
const tl = K.createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'g' });
const empty = tl.tracks.find((t) => t.empty_slot);
const idle = compileMoleculeMixProgram(tl, { clipHasAudio: () => true }).filter((s) => s.id === `${empty.track_id}:audio`);
const taking = compileMoleculeMixProgram(tl, { clipHasAudio: () => true, takes: new Map([[empty.track_id, { kind: 'live_audio', device_id: 'host' }]]) })
    .find((s) => s.id === `${empty.track_id}:audio`);
const ok = idle.length === 0 && taking && taking.input.kind === 'live_audio' && taking.chain.some((m) => m.type === 'record');
console.log(JSON.stringify({ empty: empty.track_id, idle: idle.length, input: taking?.input, chain: taking?.chain.map((m) => m.type) }));
console.log(ok ? 'empty_track_take OK' : 'empty_track_take NO');
