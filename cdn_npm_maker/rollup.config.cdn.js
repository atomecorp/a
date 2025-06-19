import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'cdn_npm_maker/bundle-entry.js',
  output: [
    {
      file: 'dist/squirrel.js',
      format: 'iife',
      name: 'Squirrel',
      banner: `/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * https://github.com/your-org/squirrel
 * 
 * Copyright (c) 2025 Squirrel Team
 * Released under the MIT License
 * Generated: ${new Date().toISOString()}
 */`,
      globals: {
        // Pas de dépendances externes
      }
    },
    {
      file: 'dist/squirrel.min.js',
      format: 'iife',
      name: 'Squirrel',
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
  external: [] // Pas de dépendances externes
};
