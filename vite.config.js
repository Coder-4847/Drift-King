import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repo name.
export default defineConfig({
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 900 },
});
