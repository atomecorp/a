import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const banner = `/*!
 * Squirrel.js v${process.env.npm_package_version || '1.0.0'}
 * Modern Web Component Framework
 * https://github.com/your-org/squirrel-framework
 * 
 * Copyright (c) 2025 Squirrel Team
 * Released under the MIT License
 * Generated: ${new Date().toISOString()}
 */`;

export default [
  // ESM build
  {
    input: 'cdn_npm_maker/bundle-entry.js',
    output: {
      file: 'dist/squirrel.esm.js',
      format: 'es',
      banner
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: []
  },
  
  // CommonJS build
  {
    input: 'cdn_npm_maker/bundle-entry.js',
    output: {
      file: 'dist/squirrel.cjs.js',
      format: 'cjs',
      banner,
      exports: 'named'
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: []
  },
  
  // UMD build (pour navigateurs)
  {
    input: 'cdn_npm_maker/bundle-entry.js',
    output: {
      file: 'dist/squirrel.umd.js',
      format: 'umd',
      name: 'Squirrel',
      banner
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: []
  },
  
  // UMD minifié
  {
    input: 'cdn_npm_maker/bundle-entry.js',
    output: {
      file: 'dist/squirrel.min.js',
      format: 'umd',
      name: 'Squirrel',
      banner: `/*! Squirrel.js v${process.env.npm_package_version || '1.0.0'} | MIT License */`
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      terser()
    ],
    external: []
  }
];
