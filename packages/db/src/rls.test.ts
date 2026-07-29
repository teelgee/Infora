// T-247 acceptance: row-level security is LOAD-BEARING, not decorative
// (finding F6). The application's own pre-filters are deliberately absent from
// these queries — that is the point. A raw read of the grounding index must
// return nothing without a declared project scope, and only the declared
// project's rows with one.
//
// A wrong implementation (policy present but permissive, or ENABLE without
// FORCE so the owner bypasses it) fails these.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, withProjectScope } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

let orgId: string;
let projectOne: string;
let projectTwo: string;
let versionOne: string;
let versionTwo: string;

const vector = (seed: number) => `[${Array.from({ length: 1024 }, () => seed).join(',')}]`;

async function seedProject(name: string) {
  const [project] = await db
    .insert(s.projects)
    .values({ name, ownerOrganisationId: orgId })
    .returning();
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId: project!.id,
      producingOrganisationId: orgId,
      documentReference: `T247-${name}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: name, isCurrent: true })
    .returning();
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content: `chunk for ${name}`,
    embedding: sql.raw(`'${vector(0.1)}'::vector`) as unknown as number[],
    embeddingModelId: 't247-fake',
    embeddingModelVersion: '1',
  });
  return { projectId: project!.id, versionId: version!.id };
}

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t247 ${stamp}` }).returning();
  orgId = org!.id;
  const one = await seedProject(`t247-one-${stamp}`);
  const two = await seedProject(`t247-two-${stamp}`);
  projectOne = one.projectId;
  versionOne = one.versionId;
  projectTwo = two.projectId;
  versionTwo = two.versionId;
});

afterAll(async () => {
  await pool.end();
});

/** A deliberately unguarded read — no project filter, no visibility join. */
const allChunks = (client: typeof db) =>
  client.select({ id: s.versionChunks.id, versionId: s.versionChunks.versionId }).from(s.versionChunks);

describe('RLS on version_chunks (T-247, finding F6)', () => {
  it('an UNSCOPED raw read returns nothing — the policy fails closed', async () => {
    const rows = await allChunks(db);
    expect(rows).toHaveLength(0);
  });

  it('a scoped read returns only the declared project’s chunks', async () => {
    const rows = await withProjectScope(db, projectOne, (tx) => allChunks(tx));
    expect(rows.map((r) => r.versionId)).toEqual([versionOne]);
  });

  it('the other project’s chunks are invisible under that scope', async () => {
    const rows = await withProjectScope(db, projectOne, (tx) => allChunks(tx));
    expect(rows.map((r) => r.versionId)).not.toContain(versionTwo);
  });

  it('switching scope switches the visible set — the setting, not the query, decides', async () => {
    const rows = await withProjectScope(db, projectTwo, (tx) => allChunks(tx));
    expect(rows.map((r) => r.versionId)).toEqual([versionTwo]);
  });

  it('a targeted read of a known row still returns nothing unscoped', async () => {
    // knowing the id is not entitlement — the classic "direct object reference"
    const rows = await db
      .select({ id: s.versionChunks.id })
      .from(s.versionChunks)
      .where(eq(s.versionChunks.versionId, versionOne));
    expect(rows).toHaveLength(0);
  });

  it('the scope is transaction-local and does not leak to the next query', async () => {
    await withProjectScope(db, projectOne, (tx) => allChunks(tx));
    // same pooled connection may be reused; the setting must not survive
    const after = await allChunks(db);
    expect(after).toHaveLength(0);
  });

  it('FORCE is on, so the table owner is not exempt', async () => {
    const result = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'version_chunks'`,
    );
    const row = result.rows[0];
    expect(row?.relrowsecurity).toBe(true);
    expect(row?.relforcerowsecurity).toBe(true);
  });

  it('writes are deliberately not scoped — ingestion and seeding stay app-layer', async () => {
    // the finding this closes is about READS leaking a corpus; scoping writes
    // would force every fixture and seed to carry the setting for no gain
    const [version] = await db
      .select({ id: s.versions.id })
      .from(s.versions)
      .where(eq(s.versions.id, versionOne))
      .limit(1);
    await db.insert(s.versionChunks).values({
      versionId: version!.id,
      chunkIndex: 99,
      content: 'unscoped write',
      embedding: sql.raw(`'${vector(0.2)}'::vector`) as unknown as number[],
      embeddingModelId: 't247-fake',
      embeddingModelVersion: '1',
    });
    // …and it is immediately invisible to an unscoped read
    expect(await allChunks(db)).toHaveLength(0);
  });
});
