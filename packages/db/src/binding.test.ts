// T-147 acceptance (ADR-0038): binding is a first-class, append-only,
// one-way event. binding_events cannot be mutated; a bound document's
// container_id can never change or clear. Requires the dev database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

let projectId: string;
let organisationId: string;
let participantId: string;
let containerA: string;
let containerB: string;
let unboundDoc: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't147 org' }).returning();
  organisationId = org!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't147', email: `t147-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't147 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db
    .insert(s.memberships)
    .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  participantId = participant!.id;
  const [a] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: org!.id, documentReference: `T147-A-${Date.now()}` })
    .returning();
  containerA = a!.id;
  const [b] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: org!.id, documentReference: `T147-B-${Date.now()}` })
    .returning();
  containerB = b!.id;
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({ projectId, name: 'sb', scope: 'single_org', owningOrganisationId: organisationId, createdByParticipantId: participantId })
    .returning();
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({ projectId, organisationId, sandboxId: sandbox!.id, title: 'unbound draft', createdByParticipantId: participantId })
    .returning();
  unboundDoc = doc!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('binding as a first-class one-way event (T-147, ADR-0038)', () => {
  it('binds an unbound document (NULL → container) and records an append-only event', async () => {
    await db
      .update(s.sandboxDocuments)
      .set({ containerId: containerA })
      .where(eq(s.sandboxDocuments.id, unboundDoc));
    const [ev] = await db
      .insert(s.bindingEvents)
      .values({ sandboxDocumentId: unboundDoc, containerId: containerA, boundByParticipantId: participantId })
      .returning();
    expect(ev!.containerId).toBe(containerA);

    // binding_events is append-only
    await expectDbError(
      db.update(s.bindingEvents).set({ containerId: containerB }).where(eq(s.bindingEvents.id, ev!.id)),
      /append-only/i,
    );
    await expectDbError(
      db.delete(s.bindingEvents).where(eq(s.bindingEvents.id, ev!.id)),
      /append-only/i,
    );
  });

  it('rejects re-binding a bound document to a different container (one-way)', async () => {
    await expectDbError(
      db.update(s.sandboxDocuments).set({ containerId: containerB }).where(eq(s.sandboxDocuments.id, unboundDoc)),
      /one-way/i,
    );
  });

  it('rejects clearing a bound document back to unbound', async () => {
    await expectDbError(
      db.update(s.sandboxDocuments).set({ containerId: null }).where(eq(s.sandboxDocuments.id, unboundDoc)),
      /one-way/i,
    );
  });

  it('allows non-binding updates on a bound document (title, authoring metadata)', async () => {
    await db
      .update(s.sandboxDocuments)
      .set({ title: 'renamed', authoringMetadata: { revision: 'P01' } })
      .where(eq(s.sandboxDocuments.id, unboundDoc));
    const [row] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, unboundDoc));
    expect(row!.title).toBe('renamed');
    expect(row!.authoringMetadata).toEqual({ revision: 'P01' });
    expect(row!.containerId).toBe(containerA); // still bound to A
  });
});
