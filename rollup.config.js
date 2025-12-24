import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/main.mjs',
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    terser()
  ],
  output: {
    file: 'dist/bundle.min.js',
    format: 'iife',
    name: 'ZXSpec',
    sourcemap: true
  }
};
