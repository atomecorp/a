// Bundle entry for Basic Pitch — see scripts/bundle-basic-pitch.js.
//
// This file is NOT shipped: esbuild reads it to produce the single self-contained
// ESM bundle that eVe loads at runtime. It exists because the upstream ESM build
// of @spotify/basic-pitch cannot be loaded by a browser as-is — it re-exports
// through extensionless relative specifiers (`from './inference'`) and imports
// `@tensorflow/tfjs` as a bare specifier. Both are unresolvable by the native
// module loader, which is why bundling is a requirement here and not a taste.
//
// `tf` is re-exported because the caller must pick a backend explicitly
// (WebGL, with a CPU fallback) and load the local GraphModel itself.

export * as tf from '@tensorflow/tfjs';
export { BasicPitch } from '@spotify/basic-pitch';
export {
    addPitchBendsToNoteEvents,
    noteFramesToTime,
    outputToNotesPoly
} from '@spotify/basic-pitch';
export { Midi } from '@tonejs/midi';
