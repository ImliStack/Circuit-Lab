import { defineConfig } from 'vite';

// base './' so the build works from any static host or sub-folder
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
