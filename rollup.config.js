// Rollup configuration for Squirrel Framework (Vanilla JS)
// Build configuration for framework A and application bundling

import { defineConfig } from 'rollup';
import { terser } from '@rollup/plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default defineConfig([
  // Development build
  {
    input: 'src/js/app.js',
    output: {
      file: 'src/js/bundle.js',
      format: 'iife',
      name: 'SquirrelApp',
      sourcemap: true
    },
    plugins: [
      nodeResolve({ browser: true })
    ],
    external: [],
    watch: {
      clearScreen: false
    }
  },
  // Production build
  {
    input: 'src/js/app.js',
    output: {
      file: 'src/js/bundle.min.js',
      format: 'iife',
      name: 'SquirrelApp',
      sourcemap: false
    },
    plugins: [
      nodeResolve({ browser: true }),
      terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info']
        },
        mangle: {
          reserved: ['A', 'defineParticle', 'Matrix', 'Module', 'Slider']
        }
      })
    ],
    external: []
  }
]);