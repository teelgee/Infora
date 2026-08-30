import { defineConfig } from 'vitest/config';

// T-395 — `apps/web` runs a vitest suite like every other package.
//
// `dedupe` is not boilerplate. The kit (`@infora/ui`) is consumed as SOURCE
// across the workspace, so without it a component from the kit and a component
// from this app resolve two different copies of React, and every hook in a kit
// component throws *"Cannot read properties of null (reading 'useState')"* —
// which reads as a broken component rather than as a resolution problem.
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  resolve: { dedupe: ['react', 'react-dom'] },
});
