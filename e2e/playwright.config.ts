// T-084 — the e2e harness: the api on its e2e substrate (real DB, fake
// providers — CI carries no keys) and the vite-served consultant app.
// Requires the dev database migrated and seeded, as in CI and the first-day
// path.
import { defineConfig } from '@playwright/test';

// Two checkouts running e2e on one machine collide on fixed ports (and a
// reused server from the other checkout would serve the other code), so the
// ports may be moved by env; the defaults are unchanged.
const API_PORT = process.env['E2E_API_PORT'] ?? '3210';
const WEB_PORT = process.env['E2E_WEB_PORT'] ?? '5273';
export const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // T-369 — the suites share ONE seeded world, including mutable project-wide
  // configuration: slice-a2 replaces the project's coding scheme while
  // slice-a2-ui is driving the New-deliverable modal against it, and
  // sandbox-structure derives folder candidates from a plan any other file can
  // grow. `fullyParallel: false` does NOT buy that safety — it only serialises
  // tests WITHIN a file, and files still distribute across workers, which is
  // what this comment used to claim and did not deliver. One worker is the
  // honest version of the same intent; the whole suite runs in well under a
  // minute, so the parallelism was never paying for the flakes it caused.
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: WEB_URL },
  webServer: [
    {
      command: 'pnpm --filter @infora/api run start:e2e',
      url: `${API_URL}/me`, // 401 counts as up
      env: { PORT: API_PORT },
      reuseExistingServer: !process.env['CI'],
    },
    {
      command: `pnpm --filter @infora/web exec vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: { API_PROXY_TARGET: API_URL },
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
