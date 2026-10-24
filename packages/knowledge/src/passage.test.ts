// T-468 — one recorded passage, read back by id. Against the live dev database.
// The read is by id and nothing else: a chunk that has gone is null (the card
// then says so), and a chunk belonging to another version is refused, so a
// version the requester can see cannot be used to fish for someone else's text.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema as s, withProjectScope } from '@infora/db';
import { readChunkPassage } from './passage';

const { db, pool } = createDb();

const CITED = 'The scheme delivers a 12% reduction in peak flow.';
const CONTENT = `First page.\fSecond page opens here. ${CITED}\nNext paragraph.`;

let projectId: string;
let versionId: string;
let otherVersionId: string;
let chunkId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t468k ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t468k ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  const make = async (reference: string, content: string) => {
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: org!.id, documentReference: reference, inLibrary: true })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'C01', content, isCurrent: true })
      .returning();
    return version!.id;
  };
  versionId = await make(`T468K-${stamp}`, CONTENT);
  otherVersionId = await make(`T468K2-${stamp}`, 'Another.');
  const start = CONTENT.indexOf(CITED);
  const [chunk] = await withProjectScope(db, projectId, (tx) =>
    tx
      .insert(s.versionChunks)
      .values({
        versionId,
        chunkIndex: 3,
        content: CITED,
        embedding: Array.from({ length: 1024 }, () => 0.01),
        embeddingModelId: 'test-t468k',
        embeddingModelVersion: 't1',
        startOffset: start,
        endOffset: start + CITED.length,
      })
      .returning(),
  );
  chunkId = chunk!.id;
});

afterAll(async () => {
  await withProjectScope(db, projectId, (tx) =>
    tx.delete(s.versionChunks).where(eq(s.versionChunks.embeddingModelId, 'test-t468k')),
  );
  await pool.end();
});

describe('readChunkPassage (T-468)', () => {
  it('reads the one recorded chunk: verbatim text, page and index', async () => {
    const read = await readChunkPassage(db, projectId, versionId, chunkId);
    expect(read).not.toBeNull();
    expect(read).not.toBe('other_version');
    const passage = read as Exclude<typeof read, null | 'other_version'>;
    expect(passage.chunkIndex).toBe(3);
    expect(passage.locator).toMatchObject({ page: 2, verbatim: CITED });
  });

  it('a chunk that is no longer held is null — never a neighbour', async () => {
    expect(await readChunkPassage(db, projectId, versionId, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('a chunk of a different version is refused', async () => {
    expect(await readChunkPassage(db, projectId, otherVersionId, chunkId)).toBe('other_version');
  });
});
