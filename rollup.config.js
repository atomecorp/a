import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import svelte from 'rollup-plugin-svelte';

export default {
  input: 'src/svelte/index.js',
  output: {
    file: 'src/svelte/build/bundle.js',
    format: 'iife',
    name: 'SquirrelSvelte',
    sourcemap: true,
    exports: 'named'
  },
  plugins: [
    svelte({
      // Compiler options
      compilerOptions: {
        dev: process.env.NODE_ENV !== 'production',
        generate: 'dom'
      },
      // CSS handling
      emitCss: false // CSS will be included in the bundle
    }),
    nodeResolve({
      browser: true,
      dedupe: ['svelte']
    }),
    commonjs(),
    // Minify only in production
    process.env.NODE_ENV === 'production' && terser({
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    })
  ].filter(Boolean),
  external: [],
  watch: {
    clearScreen: false
  }
};