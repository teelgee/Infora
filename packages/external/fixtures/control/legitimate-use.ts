// MUST COMPILE — the control. Without it, "the fixtures fail to compile" would
// be satisfied by a broken tsconfig, and the barrier test would pass while
// asserting nothing.
import type { ExternalSource } from '@infora/contracts';
import { externalSource } from '../../src/web-research';

const fetched: ExternalSource = externalSource({
  url: 'https://example.invalid/npsn',
  publisher: 'Example',
  title: 'A public page',
  publishedDate: '2026-01-01',
  retrievedAt: '2026-07-30T00:00:00.000Z',
  excerpt: 'A passage from a public page.',
  relevance: 'bears on the question',
});

// external sources are held as external sources, in their own field — which is
// how the orchestrator will hold them beside (never within) the working input
export const research: { sources: ExternalSource[]; searchNote: string } = {
  sources: [fetched],
  searchNote: 'searched 1 source',
};
