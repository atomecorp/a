// Rollup configuration for Squirrel Framework (Vanilla JS)
// Build configuration for framework A and application bundling

export default {
  input: 'src/js/app.js',
  output: {
    file: 'src/js/bundle.js',
    format: 'iife',
    name: 'SquirrelApp',
    sourcemap: true
  },
  plugins: [
    // Future plugins for vanilla JS optimization can be added here
  ],
  external: [],
  watch: {
    clearScreen: false
  }
};