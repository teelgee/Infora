import { defineConfig } from 'vitest/config';

export default defineConfig({
  // the barrier test spawns tsc over the fixtures — slower than a unit test
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
});
