import { defineConfig } from 'vitest/config';

// Root vitest covers repo tooling only; each package runs its own suite via
// `turbo run test` (packages/db needs the live dev database, for instance).
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs'],
  },
});
