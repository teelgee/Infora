// T-242 acceptance, against the live dev database: the ontology's semantic
// pre-filter (ADR-0045). Two library documents match the query equally; once
// one is classified under a discipline term, a retrieval scoped to that term
// returns ONLY it — the structural narrowing that scopes a 100k-document corpus
// before the vector comparison. The scope is a SQL pre-filter, so it composes
// with the access+state pre-filter in the one query, never a post-filter.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntitledSlice } from '@infora/governance';
import { createDb, schema as s, seedProjectOntology } from '@infora/db';
import { groundedLibrary } from './retrieval';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const deps = { db, router: fakeRouter() };

let slice: EntitledSlice;
let disciplineTermId: string;
let classifiedVersionId: string;
let unclassifiedVersionId: string;

const CONTENT = 'drainage attenuation design basis and runoff calculations';

async function addDoc(projectId: string, orgId: string, reference: string): Promise<string> {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: orgId, documentReference: reference, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: CONTENT, isCurrent: true })
    .returning();
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content: CONTENT,
    embedding: fakeVector(CONTENT),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });
  return version!.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t242-${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t242 ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't242', email: `t242-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  slice = {
    organisationId: org!.id,
    participantId: participant!.id,
    projectId: project!.id,
    membershipRole: 'owner',
    elevated: false,
  };

  await seedProjectOntology(db, project!.id);
  const [facet] = await db
    .select()
    .from(s.classificationFacets)
    .where(and(eq(s.classificationFacets.projectId, project!.id), eq(s.classificationFacets.key, 'discipline')))
    .limit(1);
  const [term] = await db
    .select()
    .from(s.classificationTerms)
    .where(eq(s.classificationTerms.facetId, facet!.id))
    .limit(1);
  disciplineTermId = term!.id;

  const classifiedRef = `T242-CLS-${stamp}`;
  classifiedVersionId = await addDoc(project!.id, org!.id, classifiedRef);
  unclassifiedVersionId = await addDoc(project!.id, org!.id, `T242-UNC-${stamp}`);

  const [classified] = await db
    .select()
    .from(s.containers)
    .where(eq(s.containers.documentReference, classifiedRef))
    .limit(1);
  await db.insert(s.containerClassifications).values({
    containerId: classified!.id,
    facetId: facet!.id,
    termId: disciplineTermId,
    setByParticipantId: participant!.id,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('classification-scoped retrieval (T-242)', () => {
  it('unscoped retrieval returns both matching documents', async () => {
    const { items } = await groundedLibrary(deps, slice, { text: CONTENT, mode: 'baseline' });
    const versionIds = new Set(items.map((i) => (i.source as { versionId: string }).versionId));
    expect(versionIds.has(classifiedVersionId)).toBe(true);
    expect(versionIds.has(unclassifiedVersionId)).toBe(true);
  });

  it('scoping to the discipline term narrows to the classified document only', async () => {
    const { items } = await groundedLibrary(deps, slice, {
      text: CONTENT,
      mode: 'baseline',
      classificationTermIds: [disciplineTermId],
    });
    const versionIds = new Set(items.map((i) => (i.source as { versionId: string }).versionId));
    expect(versionIds.has(classifiedVersionId)).toBe(true);
    expect(versionIds.has(unclassifiedVersionId)).toBe(false);
  });
});
