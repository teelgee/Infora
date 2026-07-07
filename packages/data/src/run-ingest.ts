// The ingest entrypoint: `pnpm --filter @infora/data run ingest` (loads the
// repo-root .env; needs VOYAGE_API_KEY and ANTHROPIC_API_KEY).
import { z } from 'zod';
import { createDb } from '@infora/db';
import { AnthropicChatAdapter, Router, VoyageEmbeddingAdapter } from '@infora/model';
import { ingestVersions } from './ingest';

const env = z.object({ VOYAGE_API_KEY: z.string().min(1) }).safeParse(process.env);
if (!env.success) {
  throw new Error('VOYAGE_API_KEY is required — set it in the repo-root .env');
}

const router = new Router(
  AnthropicChatAdapter.fromEnv(),
  new VoyageEmbeddingAdapter({ apiKey: env.data.VOYAGE_API_KEY }),
);

const { db, pool } = createDb();
const summary = await ingestVersions(db, router);
console.log(
  `ingested ${summary.versions} versions → ${summary.chunks} chunks, embedded by ${summary.model}`,
);
await pool.end();
