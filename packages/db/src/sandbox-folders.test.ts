// T-146 acceptance: sandbox folders nest and documents move by re-parenting,
// and neither changes a document's identity or its access facts — a folder is
// a view object, never an access object (ADR-0036). Requires the dev database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

let sandboxId: string;
let participantId: string;
let organisationId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't146 org' }).returning();
  organisationId = org!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't146', email: `t146-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't146 project', ownerOrganisationId: org!.id })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  participantId = participant!.id;
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId: project!.id,
      name: 't146 sandbox',
      scope: 'single_org',
      owningOrganisationId: org!.id,
      createdByParticipantId: participant!.id,
    })
    .returning();
  sandboxId = sandbox!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('sandbox folders (T-146, ADR-0036)', () => {
  it('nests folders and moves a document by re-parenting without changing its identity or access', async () => {
    const [root] = await db
      .insert(s.sandboxFolders)
      .values({ sandboxId, name: 'Discipline', createdByParticipantId: participantId })
      .returning();
    const [child] = await db
      .insert(s.sandboxFolders)
      .values({
        sandboxId,
        parentFolderId: root!.id,
        name: 'Geotech',
        createdByParticipantId: participantId,
      })
      .returning();
    expect(child!.parentFolderId).toBe(root!.id);

    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId: (await db.select().from(s.sandboxes).where(eq(s.sandboxes.id, sandboxId)))[0]!
          .projectId,
        organisationId,
        sandboxId,
        folderId: child!.id,
        title: 'Geotech report',
        createdByParticipantId: participantId,
      })
      .returning();
    const docId = doc!.id;

    // move the document to the root folder — identity and access unchanged
    await db
      .update(s.sandboxDocuments)
      .set({ folderId: root!.id })
      .where(eq(s.sandboxDocuments.id, docId));
    const [moved] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, docId));
    expect(moved!.id).toBe(docId); // same document
    expect(moved!.folderId).toBe(root!.id); // new location
    expect(moved!.sandboxId).toBe(sandboxId); // access unchanged — folder is not an access object
    expect(moved!.organisationId).toBe(organisationId);

    // move the child folder to the sandbox root — nesting is re-parenting
    await db
      .update(s.sandboxFolders)
      .set({ parentFolderId: null })
      .where(eq(s.sandboxFolders.id, child!.id));
    const [reparented] = await db
      .select()
      .from(s.sandboxFolders)
      .where(eq(s.sandboxFolders.id, child!.id));
    expect(reparented!.id).toBe(child!.id);
    expect(reparented!.parentFolderId).toBeNull();
    expect(reparented!.sandboxId).toBe(sandboxId);
  });
});
