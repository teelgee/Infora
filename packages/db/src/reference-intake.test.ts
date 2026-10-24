// T-472 — the intake table and the not-citable mark (migration 0078), against
// the dev database. *In plain terms: the four document types reference material
// needs are in every project's vocabulary — old projects by the migration's
// data step, new ones by the seed — the intake table takes a row and keeps
// who confirmed it, and a version's not-citable mark is set once at insert.*
//
// There is no row-level security test because the table has none, as the
// sandbox tables have none: the wall for it is the API route's (owner
// organisation, super user), proved in apps/api/src/reference-intake.test.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { seedProjectOntology } from './ontology-seed.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();
const NEW_CODES = ['STD', 'GDN', 'LEG', 'CRS'];

let projectId: string;
let organisationId: string;
let participantId: string;

/** the migration's own data step, read off the file so the test cannot drift from it */
const migrationInsert = (): string => {
  const file = readFileSync(join(import.meta.dirname, '..', 'migrations', '0078_reference-intake.sql'), 'utf8');
  const at = file.indexOf('INSERT INTO "classification_terms"');
  expect(at).toBeGreaterThan(-1);
  return file.slice(at);
};

const documentTypeTerms = async (): Promise<Array<{ code: string; label: string; sortOrder: number }>> => {
  const [facet] = await db
    .select()
    .from(s.classificationFacets)
    .where(and(eq(s.classificationFacets.projectId, projectId), eq(s.classificationFacets.key, 'document_type')));
  return db
    .select({ code: s.classificationTerms.code, label: s.classificationTerms.label, sortOrder: s.classificationTerms.sortOrder })
    .from(s.classificationTerms)
    .where(eq(s.classificationTerms.facetId, facet!.id))
    .orderBy(s.classificationTerms.sortOrder);
};

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t472 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't472', email: `t472-${stamp}@test.local`, organisationId })
    .returning();
  const [project] = await db.insert(s.projects).values({ name: `t472 project ${stamp}`, ownerOrganisationId: organisationId }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  participantId = participant!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('the four document types for reference material (T-472)', () => {
  it('a new project gets them from the seed', async () => {
    await seedProjectOntology(db, projectId);
    const terms = await documentTypeTerms();
    expect(terms.map((t) => t.label)).toEqual(
      expect.arrayContaining(['Standard', 'Guidance', 'Legislation', 'Consultee response']),
    );
    expect(terms.filter((t) => NEW_CODES.includes(t.code))).toHaveLength(4);
  });

  it('an existing project gets them from the migration, once, after what it already had', async () => {
    // make this project look like one that existed before the migration
    const [facet] = await db
      .select()
      .from(s.classificationFacets)
      .where(and(eq(s.classificationFacets.projectId, projectId), eq(s.classificationFacets.key, 'document_type')));
    await db
      .delete(s.classificationTerms)
      .where(and(eq(s.classificationTerms.facetId, facet!.id), inArray(s.classificationTerms.code, NEW_CODES)));
    const before = await documentTypeTerms();
    expect(before.some((t) => NEW_CODES.includes(t.code))).toBe(false);

    await db.execute(sql.raw(migrationInsert()));
    const after = await documentTypeTerms();
    expect(after.filter((t) => NEW_CODES.includes(t.code)).map((t) => t.label)).toEqual([
      'Standard',
      'Guidance',
      'Legislation',
      'Consultee response',
    ]);
    // after the old ones, in order
    expect(Math.min(...after.filter((t) => NEW_CODES.includes(t.code)).map((t) => t.sortOrder))).toBeGreaterThan(
      Math.max(...before.map((t) => t.sortOrder)),
    );

    // running it again adds nothing
    await db.execute(sql.raw(migrationInsert()));
    expect(await documentTypeTerms()).toHaveLength(after.length);
  });
});

describe('the intake row and the not-citable mark (T-472)', () => {
  it('takes a row, moves from proposed to confirmed and keeps who confirmed it', async () => {
    const [row] = await db
      .insert(s.referenceIntake)
      .values({
        projectId,
        organisationId,
        uploadedByParticipantId: participantId,
        fileRef: 'blob:none.pdf',
        format: 'pdf',
        originalFilename: 'BS 5228.pdf',
        extractedText: 'text',
        textStatus: 'extracted',
        proposedTitle: 'BS 5228',
      })
      .returning();
    expect(row!.status).toBe('proposed');
    expect(row!.proposedClassifications).toBeNull();
    const [done] = await db
      .update(s.referenceIntake)
      .set({ status: 'confirmed', confirmedByParticipantId: participantId, confirmedAt: new Date() })
      .where(eq(s.referenceIntake.id, row!.id))
      .returning();
    expect(done).toMatchObject({ status: 'confirmed', confirmedByParticipantId: participantId });
    await db.delete(s.referenceIntake).where(eq(s.referenceIntake.id, row!.id));
  });

  it('a version is citable unless marked at insert, and the mark cannot be changed afterwards', async () => {
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: organisationId, documentReference: `T472-${Date.now()}`, inLibrary: true })
      .returning();
    const [plain] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'R01', content: 'text', isCurrent: true })
      .returning();
    expect(plain!.notCitable).toBe(false);
    const [scan] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'R02', content: '', isCurrent: false, notCitable: true })
      .returning();
    expect(scan!.notCitable).toBe(true);
    // versions are append-only: the mark is set at insert and at no other time
    await expect(db.update(s.versions).set({ notCitable: false }).where(eq(s.versions.id, scan!.id))).rejects.toThrow();
  });

  it('a confirmer who is not the uploader cascades too: removing either participant removes the row, never blocks the removal', async () => {
    const [user] = await db
      .insert(s.users)
      .values({ name: 't472b', email: `t472b-${Date.now()}@test.local`, organisationId })
      .returning();
    const [other] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
    const [row] = await db
      .insert(s.referenceIntake)
      .values({
        projectId,
        organisationId,
        uploadedByParticipantId: participantId,
        fileRef: 'blob:none.pdf',
        format: 'pdf',
        originalFilename: 'x.pdf',
        textStatus: 'extracted',
        proposedTitle: 'x',
        status: 'confirmed',
        confirmedByParticipantId: other!.id,
        confirmedAt: new Date(),
      })
      .returning();
    await db.delete(s.participants).where(eq(s.participants.id, other!.id));
    expect(await db.select().from(s.referenceIntake).where(eq(s.referenceIntake.id, row!.id))).toHaveLength(0);
  });
});
