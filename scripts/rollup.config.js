// Single build config. `rollup.config.npm.js` and `rollup.config.cdn.js` were
// byte-identical apart from two comment lines: both wrote UMD to
// ./dist/squirrel.js, so `build:all` produced the same artefact twice and the
// second overwrote the first. Every output below is a file package.json
// actually declares (main / module / browser / exports / unpkg).
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { minify } from 'terser';

const banner = '/* squirrel-framework — https://github.com/atomecorp/a */';

// Minified UMD for unpkg/jsdelivr. Terser is a direct dependency of the tree
// already; no shell post-processing step, so the .min.js can no longer drift
// months behind the .js (it was four months stale).
const minifyUmd = () => ({
  name: 'squirrel-minified-umd',
  async generateBundle(_options, bundle) {
    const entry = Object.values(bundle).find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
    if (!entry) return;
    const result = await minify(entry.code, { format: { comments: false }, sourceMap: false });
    this.emitFile({ type: 'asset', fileName: 'squirrel.min.js', source: banner + '\n' + result.code });
  }
});

export default {
  input: './scripts/bundle.js',
  plugins: [nodeResolve(), commonjs(), minifyUmd()],
  output: [
    { file: './dist/squirrel.js', format: 'umd', name: 'Squirrel', exports: 'named', sourcemap: true, banner },
    { file: './dist/squirrel.umd.js', format: 'umd', name: 'Squirrel', exports: 'named', sourcemap: true, banner },
    { file: './dist/squirrel.esm.js', format: 'es', exports: 'named', sourcemap: true, banner },
    { file: './dist/squirrel.cjs.js', format: 'cjs', exports: 'named', sourcemap: true, banner }
  ]
};
