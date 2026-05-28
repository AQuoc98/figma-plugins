import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2017',
    lib: {
      entry: resolve(__dirname, 'src/plugin/code.ts'),
      formats: ['iife'],
      name: 'plugin',
      fileName: () => 'code.js'
    },
    rollupOptions: {
      output: { extend: true }
    }
  }
});
