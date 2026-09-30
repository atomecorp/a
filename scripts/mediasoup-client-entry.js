// Bundle entry for mediasoup-client — see scripts/bundle-mediasoup-client.js.
//
// NOT shipped: esbuild reads it to produce one self-contained browser ESM file. The npm
// package is CommonJS (`require("debug")`, `exports.*`), which the browser module loader
// cannot load; bundling is a requirement, not a taste. `Device` is the whole client API
// the visio runtime needs (transports, producers and consumers hang off it).
export { Device, version, detectDeviceAsync } from 'mediasoup-client';
