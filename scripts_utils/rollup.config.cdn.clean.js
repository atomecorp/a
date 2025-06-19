export default {
  input: 'scripts_utils/bundle-entry-clean.js',
  output: {
    file: 'dist/squirrel.js',
    format: 'iife',
    name: 'Squirrel',
    banner: `/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * Generated: ${new Date().toISOString()}
 */`
  }
};
