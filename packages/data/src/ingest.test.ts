// T-012 acceptance, against the live dev database with a fake embeddings
// adapter (CI carries no provider key): chunks land beside the relational
// rows with the model id/version pinned per row, re-ingest replaces rather
// than duplicates, and a geometry change is refused, not mixed in.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema as s } from '@infora/db';
import { Router } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { ingestVersions } from './ingest';

const { db, pool } = createDb();

const fakeChat: ChatAdapter = {
  modelId: 'fake-chat',
  chat: () => Promise.reject(new Error('ingestion never chats')),
};

function fakeEmbeddings(dimensions: number, version = 'fake-1'): EmbeddingAdapter {
  return {
    modelId: 'fake-embed',
    dimensions,
    embed: (texts) =>
      Promise.resolve({
        embeddings: texts.map((_, at) => {
          const v = new Array<number>(dimensions).fill(0);
          v[at % dimensions] = 1;
          return v;
        }),
        model: { id: 'fake-embed', version },
      }),
  };
}

let versionId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't012 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't012 project', ownerOrganisationId: org!.id })
    .returning();
  const [container] = await db
    .insert(s.containers)
    .values({ projectId: project!.id, producingOrganisationId: org!.id, documentReference: `T012-${Date.now()}`, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({
      containerId: container!.id,
      versionReference: 'v1',
      content: 'First sentence of the fixture. Second sentence of the fixture. Third one.',
    })
    .returning();
  versionId = version!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('ingestVersions (T-012)', () => {
  it('chunks every version and pins the embedding model per row', async () => {
    const summary = await ingestVersions(db, new Router(fakeChat, fakeEmbeddings(1024)), {
      maxChars: 40,
    });
    expect(summary.versions).toBeGreaterThanOrEqual(1);

    const rows = await db
      .select()
      .from(s.versionChunks)
      .where(eq(s.versionChunks.versionId, versionId));
    expect(rows.length).toBeGreaterThan(1); // the cap forces a split
    expect(rows.map((r) => r.content).join(' ')).toBe(
      'First sentence of the fixture. Second sentence of the fixture. Third one.',
    );
    for (const row of rows) {
      expect(row.embedding).toHaveLength(1024);
      expect(row.embeddingModelId).toBe('fake-embed');
      expect(row.embeddingModelVersion).toBe('fake-1');
    }
  });

  it('re-ingest replaces a version’s chunks — no duplicates, no stale rows', async () => {
    await ingestVersions(db, new Router(fakeChat, fakeEmbeddings(1024, 'fake-2')));
    const rows = await db
      .select()
      .from(s.versionChunks)
      .where(eq(s.versionChunks.versionId, versionId));
    expect(rows).toHaveLength(1); // default cap: the fixture packs into one chunk
    expect(rows[0]!.embeddingModelVersion).toBe('fake-2');
  });

  it('refuses an embedding geometry the index is not pinned to (ADR-0024)', async () => {
    await expect(ingestVersions(db, new Router(fakeChat, fakeEmbeddings(512)))).rejects.toThrow(
      /re-index deliberately/,
    );
  });
});
