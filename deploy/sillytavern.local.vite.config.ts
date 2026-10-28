import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';

// Serve an existing Tavern build locally, including cross-origin helper iframes.
// Keep this separate from the production config and bind only to loopback.
export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: '/',
  build: {outDir: 'dist-tavern'},
  preview: {
    host: '127.0.0.1',
    port: 5185,
    strictPort: true,
    cors: true,
  },
});
