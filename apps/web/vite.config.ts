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
  // T-431 — the external recipient's read (ADR-0055). The API namespace is
  // deliberately distinct from the SPA route (/external/:token) it serves, so
  // one prefix never has to mean two things: the page is a browser navigation
  // and the document is a fetch.
  '/external-documents',
  // T-443 — the app builder's own namespaces (ADR-0056). **They were missing,
  // and the failure was the silent one the `/lenses` note above describes**: a
  // browser opening an app's page fetched `/apps/:id`, the proxy handed back
  // `index.html`, the JSON parse failed and the screen sat on "Loading…"
  // forever. Nothing errored, and no unit or API test could see it — the app
  // routes were only ever driven through the API directly (T-440 → T-444), so
  // the whole builder surface had never been opened in a browser. This
  // ticket's chart test opened one, and found it.
  '/apps',
  '/app-tables',
  '/app-rows',
  // review 2026-09-07 — the sweep the T-443 finding demanded: every namespace
  // api.ts fetches was checked against this list, and these seven were missing
  // with the same silent failure waiting. The rule from here on: a new API
  // namespace lands with its prefix in this list in the same commit.
  '/notifications',
  '/acceptance-codes',
  '/conflict-exclusions',
  '/naming-proposals',
  '/attached-sources',
  '/external-issues',
  '/relationships',
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
          // the two prefixes that serve FILES have no SPA route of their own,
          // and their <object> embeds and download links navigate with
          // Accept: text/html — bypassing them to index.html would render the
          // router's 404 inside the PDF frame
          bypass:
            prefix === '/renditions' || prefix === '/external-documents'
              ? undefined
              : (req: { headers: { accept?: string } }) =>
                  req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
        },
      ]),
    ),
  },
});
