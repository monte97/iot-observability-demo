import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// base '/' (default): la SPA è servita alla root da nginx. Il dev server espone
// :8090 per comodità; in compose è nginx a servire la build.
export default defineConfig({
  plugins: [vue()],
  server: { host: true, port: 8090 },
});
