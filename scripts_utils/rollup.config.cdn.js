import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'scripts_utils/bundle-entry-cdn-simple.js',
  output: [
    {
      file: 'dist/squirrel.js',
      format: 'iife',
      name: 'Squirrel',
      exports: 'named',
      extend: true,
      banner: `/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * Generated: ${new Date().toISOString()}
 */`,
      intro: `
        // Create global define function for kickstart compatibility
        if (typeof window.define === 'undefined') {
          window.templateRegistry = window.templateRegistry || new Map();
          window.define = function(id, config) {
            window.templateRegistry.set(id, config);
            return config;
          };
        }
      `,
      outro: `
        // Force global exposure after bundle execution
        if (typeof window !== 'undefined' && Squirrel) {
          // Ensure all APIs are globally available
          console.log('🔍 Bundle loaded, exposing globals...');
        }
      `
    },
    {
      file: 'dist/squirrel.min.js',
      format: 'iife',
      name: 'Squirrel',
      exports: 'named',
      extend: true,
      plugins: [terser()],
      banner: `/*! Squirrel.js v1.0.0 | MIT License | ${new Date().toISOString()} */`
    }
  ],
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    })
  ],
  external: []
};

