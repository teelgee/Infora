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
  // the sandbox resource itself, its folder tree, moves and scope grants
  // (ADR-0036, T-153/T-179) — bare paths, distinct from /sandbox-documents
  '/sandboxes',
  '/sandbox-scope-grants',
  '/folders',
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
  // T-283 — the Lens picker's options. A missing prefix here does not error,
  // it returns index.html, which parses as "no Lenses" and renders no chip at
  // all — a silent, plausible-looking nothing. The e2e caught it; the unit
  // tests could not, because they call the API directly.
  '/lenses',
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
