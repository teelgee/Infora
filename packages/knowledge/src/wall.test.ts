// T-033 — the wall through the gateway (M2 acceptance): the same query
// returns content to the entitled requester and nothing to the unentitled;
// the superseded Version never appears; every item is channel-annotated; and
// no parameter exists by which a caller could widen scope — checked at the
// type level, because the guarantee is the signature's shape (ADR-0029).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssembledItem, AssemblyRequest } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { createAssembler } from './gateway';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const assemble = createAssembler({ db, router: fakeRouter() });

let projectId: string;
let entitled: AssemblyRequest['requester'];
let unentitled: AssemblyRequest['requester']; // a real participant — of another project
let supersededVersionId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const [orgA] = await db.insert(s.organisations).values({ name: 't033 org A' }).returning();
  const [orgC] = await db.insert(s.organisations).values({ name: 't033 org C' }).returning();

  const [project] = await db
    .insert(s.projects)
    .values({ name: 't033 project', ownerOrganisationId: orgA!.id })
    .returning();
  projectId = project!.id;
  await db
    .insert(s.memberships)
    .values({ organisationId: orgA!.id, projectId, role: 'owner' });

  const [alice] = await db
    .insert(s.users)
    .values({ name: 't033 alice', email: `t033-alice-${stamp}@test.local`, organisationId: orgA!.id })
    .returning();
  const [aliceParticipant] = await db
    .insert(s.participants)
    .values({ userId: alice!.id, projectId })
    .returning();
  entitled = { organisationId: orgA!.id, participantId: aliceParticipant!.id };

  // org C holds a genuine Participant — on its own project, not this one
  const [otherProject] = await db
    .insert(s.projects)
    .values({ name: 't033 other project', ownerOrganisationId: orgC!.id })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId: orgC!.id, projectId: otherProject!.id, role: 'owner' });
  const [dara] = await db
    .insert(s.users)
    .values({ name: 't033 dara', email: `t033-dara-${stamp}@test.local`, organisationId: orgC!.id })
    .returning();
  const [daraParticipant] = await db
    .insert(s.participants)
    .values({ userId: dara!.id, projectId: otherProject!.id })
    .returning();
  unentitled = { organisationId: orgC!.id, participantId: daraParticipant!.id };

  // one library document with a superseded v1 and a live v2, both indexed
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, documentReference: `T33-LIB-GIR-${stamp}`, inLibrary: true })
    .returning();
  const versions = [
    { ref: 'v1', current: false, content: 'alpha superseded: no exceedances recorded.' },
    { ref: 'v2', current: true, content: 'alpha current: elevated PAH concentrations recorded.' },
  ];
  for (const v of versions) {
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: v.ref, content: v.content, isCurrent: v.current })
      .returning();
    if (!v.current) supersededVersionId = version!.id;
    await db.insert(s.versionChunks).values({
      versionId: version!.id,
      chunkIndex: 0,
      content: v.content,
      embedding: fakeVector(v.content),
      embeddingModelId: FAKE_EMBED_MODEL,
      embeddingModelVersion: 'fake-1',
    });
  }
});

afterAll(async () => {
  await pool.end();
});

const query = (requester: AssemblyRequest['requester']): AssemblyRequest => ({
  request: { text: 'alpha contamination question', mode: 'baseline' },
  environment: { kind: 'project', projectId },
  requester,
});

describe('the wall through the gateway (T-033)', () => {
  it('same query: content for the entitled, nothing for the unentitled', async () => {
    const forEntitled = await assemble(query(entitled));
    const forUnentitled = await assemble(query(unentitled));

    expect(forEntitled.items.length).toBeGreaterThan(0);
    expect(forEntitled.budget.tokensUsed).toBeGreaterThan(0);
    expect(forUnentitled.items).toEqual([]);
    expect(forUnentitled.budget.tokensUsed).toBe(0);
  });

  it('the superseded Version is never returned, even to the entitled', async () => {
    const { items } = await assemble(query(entitled));
    for (const item of items) {
      expect(item.source).not.toEqual({ versionId: supersededVersionId });
      expect(item.content).not.toContain('superseded');
    }
  });

  it('every returned item is annotated with channel and source identity', async () => {
    const { items } = await assemble(query(entitled));
    for (const item of items) {
      expect(['grounded', 'guiding', 'informing']).toContain(item.channel);
      if (item.channel === 'grounded') expect(item.corpus).toBe('library');
      expect('versionId' in item.source || 'authorityRef' in item.source).toBe(true);
    }
  });

  it('no parameter exists to widen scope — the signature is the guarantee', () => {
    // compile-time exact-key checks: adding any widening parameter (corpus,
    // store, visibility, extra requester fields…) breaks this test's types
    type ExactKeys<T, K extends keyof T> = [Exclude<keyof T, K>] extends [never]
      ? [Exclude<K, keyof T>] extends [never]
        ? true
        : false
      : false;

    const requestShape: ExactKeys<AssemblyRequest, 'request' | 'environment' | 'requester'> = true;
    const requesterShape: ExactKeys<
      AssemblyRequest['requester'],
      'organisationId' | 'participantId'
    > = true;
    const queryShape: ExactKeys<AssemblyRequest['request'], 'text' | 'mode'> = true;
    const itemShape: ExactKeys<AssembledItem, 'channel' | 'corpus' | 'source' | 'content'> = true;

    expect([requestShape, requesterShape, queryShape, itemShape]).toEqual([true, true, true, true]);
  });
});
