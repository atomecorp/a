/**
 * 🚀 ROLLUP CONFIG SIMPLE - Nouvelle Architecture
 * Bundle principal : squirrel.js (avec kickstart)
 * Bundle core : squirrel-core.js (sans kickstart)
 */

import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [
  // === BUILD 1: PRINCIPAL (MINIMAL AVEC KICKSTART) ===
  {
    input: 'scripts_utils/bundle-minimal.js',
    output: [
      {
        file: 'dist/squirrel.js',
        format: 'iife',
        name: 'Squirrel',
        exports: 'default',
        banner: '/* 🐿️ Squirrel.js v1.0.0 - https://github.com/atomecorp/a */',
      },
      {
        file: 'dist/squirrel.min.js',
        format: 'iife',
        name: 'Squirrel',
        exports: 'default',
        plugins: [terser({
          format: {
            comments: false
          }
        })],
        banner: '/* 🐿️ Squirrel.js v1.0.0 (minified) */',
      }
    ],
    plugins: [
      nodeResolve()
    ]
  },

  // === BUILD 2: CORE UNIQUEMENT (SANS KICKSTART) ===
  {
    input: 'scripts_utils/bundle-core.js',
    output: [
      {
        file: 'dist/squirrel-core.js',
        format: 'iife',
        name: 'Squirrel',
        banner: '/* 🐿️ Squirrel.js Core-Only v1.0.0 - https://github.com/atomecorp/a */',
      },
      {
        file: 'dist/squirrel-core.min.js',
        format: 'iife',
        name: 'Squirrel',
        plugins: [terser({
          format: {
            comments: false
          }
        })],
        banner: '/* 🐿️ Squirrel.js Core-Only v1.0.0 (minified) */',
      }
    ],
    plugins: [
      nodeResolve()
    ]
  }
];
