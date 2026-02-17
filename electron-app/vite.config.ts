import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: './renderer',
  base: './',
  server: {
    port: 5174, // Use different port from web-app (5173)
  },
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './renderer'),
    },
  },
  define: {
    'process.env': {},
  },
});
