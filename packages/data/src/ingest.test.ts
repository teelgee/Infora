// T-012 acceptance, against the live dev database with a fake embeddings
// adapter (CI carries no provider key): chunks land beside the relational
// rows with the model id/version pinned per row, re-ingest replaces rather
// than duplicates, and a geometry change is refused, not mixed in.
//
// T-302 extends it: `ingestVersion` indexes the version it was named and
// **nothing else**, which is the whole point — the sweep it replaces was
// linear in the corpus on every library admission.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, schema as s, withProjectScope } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { ingestAllVersions, ingestVersion } from './ingest';

const { db, pool } = createDb();

const fakeChat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: () => Promise.reject(new Error('ingestion never chats')),
};

// the model id is a parameter because each pinned model is its own index
// (ADR-0024): the T-302 cases below run under an id of their own, so a sweep
// from another suite sharing the dev database cannot index their fixtures for
// them and make "only the named version" pass by accident.
function fakeEmbeddings(dimensions: number, version = 'fake-1', modelId = 'fake-embed'): EmbeddingAdapter {
  return {
    modelId,
    dimensions,
    attributes: SELF_HOSTED_UK,
    embed: (texts) =>
      Promise.resolve({
        embeddings: texts.map((_, at) => {
          const v = new Array<number>(dimensions).fill(0);
          v[at % dimensions] = 1;
          return v;
        }),
        model: { id: modelId, version },
      }),
  };
}

let versionId: string;
let siblingVersionId: string;
let projectId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't012 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't012 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
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
  const [sibling] = await db
    .insert(s.versions)
    .values({
      containerId: container!.id,
      versionReference: 'v2',
      content: 'A sibling version, in the same container and the same project.',
    })
    .returning();
  siblingVersionId = sibling!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('ingestAllVersions (T-012)', () => {
  it('chunks every version and pins the embedding model per row', async () => {
    const summary = await ingestAllVersions(db, new Router(fakeChat, fakeEmbeddings(1024)), {
      maxChars: 40,
    });
    expect(summary.versions).toBeGreaterThanOrEqual(1);

    // T-247 — the chunk index is under row-level security, so a read must
    // declare its project scope exactly as retrieval does. An unscoped read
    // returning nothing is the policy working, not a broken fixture.
    const rows = await withProjectScope(db, projectId, (tx) =>
      tx.select().from(s.versionChunks).where(eq(s.versionChunks.versionId, versionId)),
    );
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
    await ingestAllVersions(db, new Router(fakeChat, fakeEmbeddings(1024, 'fake-2')));
    const rows = await withProjectScope(db, projectId, (tx) =>
      tx.select().from(s.versionChunks).where(eq(s.versionChunks.versionId, versionId)),
    );
    expect(rows).toHaveLength(1); // default cap: the fixture packs into one chunk
    expect(rows[0]!.embeddingModelVersion).toBe('fake-2');
  });

  it('refuses an embedding geometry the index is not pinned to (ADR-0024)', async () => {
    await expect(ingestAllVersions(db, new Router(fakeChat, fakeEmbeddings(512)))).rejects.toThrow(
      /re-index deliberately/,
    );
  });
});

// T-302 — the fix that makes a 100–500 document corpus loadable at all: the
// per-admission path took a version id instead of walking the table.
describe('ingestVersion (T-302) — a version id, not a full-table walk', () => {
  const pinned = 'fake-embed-t302';
  const router = (dimensions = 1024, version = 'fake-1') =>
    new Router(fakeChat, fakeEmbeddings(dimensions, version, pinned));

  const chunksFor = (id: string) =>
    withProjectScope(db, projectId, (tx) =>
      tx
        .select()
        .from(s.versionChunks)
        .where(and(eq(s.versionChunks.versionId, id), eq(s.versionChunks.embeddingModelId, pinned))),
    );

  it('indexes the version it was named, and leaves every other version alone', async () => {
    const summary = await ingestVersion(db, router(), versionId, { maxChars: 40 });
    expect(summary.versions).toBe(1);

    const mine = await chunksFor(versionId);
    expect(mine.length).toBeGreaterThan(1); // the cap forces a split
    expect(mine.map((r) => r.content).join(' ')).toBe(
      'First sentence of the fixture. Second sentence of the fixture. Third one.',
    );

    // the sibling shares this container and project and is untouched — under
    // the sweep it would have been re-chunked and re-embedded for free
    expect(await chunksFor(siblingVersionId)).toHaveLength(0);
  });

  it('replaces that version’s rows on re-ingest, still without reaching the corpus', async () => {
    await ingestVersion(db, router(1024, 'fake-2'), versionId);
    const mine = await chunksFor(versionId);
    expect(mine).toHaveLength(1); // default cap: the fixture packs into one chunk
    expect(mine[0]!.embeddingModelVersion).toBe('fake-2');
    expect(await chunksFor(siblingVersionId)).toHaveLength(0);
  });

  it('refuses a version id that is not there rather than indexing nothing quietly', async () => {
    await expect(ingestVersion(db, router(), crypto.randomUUID())).rejects.toThrow(
      /does not exist/,
    );
  });

  it('refuses an embedding geometry the index is not pinned to (ADR-0024)', async () => {
    await expect(ingestVersion(db, router(512), versionId)).rejects.toThrow(
      /re-index deliberately/,
    );
  });
});
