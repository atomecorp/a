import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: './scripts_utils/bundle.js',
  output: {
    file: './dist/squirrel.js',
    format: 'umd',
    name: 'Squirrel',
    exports: 'named',
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    commonjs(),
  ],
};
