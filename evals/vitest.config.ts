import { defineConfig } from 'vitest/config';

export default defineConfig({
  // the harness boots the app and runs cases end to end — slower than a unit
  // suite, and the determinism check runs one case ten times
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
});
