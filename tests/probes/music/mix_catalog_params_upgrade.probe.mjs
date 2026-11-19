// PE-08: a project saved before a catalogue change opens (load path = normalizeTimelineMix, then validateTimeline).
import assert from 'node:assert/strict';
import * as K from '../../../eVe/intuition/tools/molecule/kernel/index.js';
import { MIX_DSP_EFFECTS } from '../../../eVe/intuition/tools/molecule/kernel/mix_dsp_catalog.js';

const base = K.createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'g' });
const track = base.tracks.find((t) => t.empty_slot);
const stripId = `${track.track_id}:audio`;
const withChain = (chain) => {
  const tl = structuredClone(base);
  tl.mix = tl.mix || { strips: {}, groups: [], detached_strip_ids: [] };
  tl.mix.strips[stripId] = { chain, output: { destination: { kind: 'main' }, enabled: true }, input: { kind: 'track' } };
  return tl;
};
const rec = { module_id: 'rec', type: 'record', bypass: false, params: {} };
const oldReverb = { decay_s: 2, size: 0.55, damping_hz: 8000, predelay_ms: 13, mix: 0.34 };
const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); } };

check('old reverb is refused raw', () => assert.throws(() => K.validateTimeline(withChain([rec, { module_id: 'r1', type: 'dsp', bypass: false, effect: 'reverb', params: { ...oldReverb } }]))));
check('old reverb opens after load normalization, saved values kept, space = default', () => {
  const tl = K.normalizeTimelineMix(withChain([rec, { module_id: 'r1', type: 'dsp', bypass: false, effect: 'reverb', params: { ...oldReverb } }]));
  K.validateTimeline(tl);
  const p = tl.mix.strips[stripId].chain[1].params;
  for (const [k, v] of Object.entries(oldReverb)) assert.equal(p[k], v, k);
  assert.equal(p.space, MIX_DSP_EFFECTS.reverb.space.default);
});
check('a complete timeline is returned as is (same object)', () => {
  const full = K.normalizeTimelineMix(withChain([rec]));
  assert.equal(K.normalizeTimelineMix(full), full);
});
check('an invalid saved value is still refused', () => {
  const tl = K.normalizeTimelineMix(withChain([rec, { module_id: 'r1', type: 'dsp', bypass: false, effect: 'reverb', params: { ...oldReverb, space: 99 } }]));
  assert.throws(() => K.validateTimeline(tl), /space/);
});
check('an unknown effect is still refused by the validator', () => {
  const tl = K.normalizeTimelineMix(withChain([rec, { module_id: 'x', type: 'dsp', bypass: false, effect: 'nope', params: {} }]));
  assert.throws(() => K.validateTimeline(tl), /nope/);
});
check('a Kira fx reverb of older projects still converts and opens', () => {
  const tl = K.normalizeTimelineMix(withChain([rec, { module_id: 'k1', type: 'fx', bypass: false, effect: 'reverb', params: { feedback: 0.9, damping: 0.1, mix: 0.3 } }]));
  K.validateTimeline(tl);
  assert.equal(tl.mix.strips[stripId].chain[1].type, 'dsp');
});
for (const r of results) console.log(r.join(' · '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
