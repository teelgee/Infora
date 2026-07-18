import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev serves the SPA and proxies the typed API (apps/api on :3000) so the
// session cookie stays same-origin — the skeleton's local topology. SPA
// routes share the /projects namespace with the API, so browser navigations
// (Accept: text/html — a reload or deep link) bypass the proxy and get the
// app; only fetches reach the API.
const apiPrefixes = [
  '/auth',
  '/me',
  '/projects',
  '/conversations',
  '/runs',
  '/work-items',
  '/sandbox-documents',
  '/sandbox-comments',
  '/suggestions',
  '/versions',
  // Slice A (T-117–T-128): administration, the plan, the cycle, renditions
  '/organisation',
  '/memberships',
  '/containers',
  '/authors',
  '/reviewers',
  '/shares',
  '/rounds',
  '/review-comments',
  '/cycles',
  '/renditions',
];

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      apiPrefixes.map((prefix) => [
        prefix,
        {
          target: apiTarget,
          bypass: (req: { headers: { accept?: string } }) =>
            req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
        },
      ]),
    ),
  },
});
