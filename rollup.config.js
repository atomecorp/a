import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

export default {
    input: 'src/main.js',
    output: {
        file: 'dist/squirrel.js',
        format: 'umd',
        name: 'Squirrel',
        exports: 'named',
        globals: {
            // Ajoutez ici les dépendances externes si nécessaire
        }
    },
    plugins: [
        resolve(),
        commonjs(),
        terser()
    ],
    watch: {
        exclude: 'node_modules/**'
    }
};