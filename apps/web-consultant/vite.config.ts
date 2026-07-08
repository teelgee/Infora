import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev serves the SPA and proxies the typed API (apps/api on :3000) so the
// session cookie stays same-origin — the skeleton's local topology.
const apiPrefixes = [
  '/auth',
  '/me',
  '/projects',
  '/conversations',
  '/runs',
  '/work-items',
  '/sandbox-documents',
  '/suggestions',
];

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(apiPrefixes.map((prefix) => [prefix, apiTarget])),
  },
});
