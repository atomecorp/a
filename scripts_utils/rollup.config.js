import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';

export default {
    input: 'src/index.js',
    output: {
        file: 'dist/squirrel.js',
        format: 'iife',
        name: 'Squirrel',
        exports: 'named',
        sourcemap: false,
        banner: `/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * https://github.com/your-org/squirrel
 * 
 * Copyright (c) 2025 Squirrel Team
 * Released under the MIT License
 * Generated: ${new Date().toISOString()}
 */`
    },
    external: [],
    plugins: [
        replace({
            'define(\'view\'': 'define$1(\'view\'',
            'define("view"': 'define$1("view"',
            delimiters: ['', ''],
            preventAssignment: true
        }),
        nodeResolve({
            browser: true,
            preferBuiltins: false
        }),
        commonjs(),
        terser({
            format: {
                comments: false
            }
        })
    ]
};