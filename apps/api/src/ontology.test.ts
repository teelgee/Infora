// T-241 acceptance — the project ontology over HTTP against the live dev
// database (ADR-0045): the owner-owned classification vocabulary, classifying a
// deliverable, and proposing / confirming / retiring typed edges — all
// access-resolved, with the wall held (an edge into a container the requester
// cannot see is never returned). Stamped data for shared-DB isolation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ClassificationSchemeResponse,
  ContainerClassificationsResponse,
  ContainerRelationshipsResponse,
  DocumentRelationship,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t241';

let ownerOrgId: string;
let producerOrgId: string;
let viewerOrgId: string; // a member org, shared A only
let projectId: string;
let producerSession: string;
let viewerSession: string;
let ownerParticipantId: string;
let viewerParticipantId: string;
let disciplineFacetId: string;
let disciplineTermId: string;
let containerA: string; // producer's, shared with viewer + acknowledged
let versionA: string;
let containerB: string; // producer's, NOT shared with viewer

async function makeUser(name: string, organisationId: string, orgRole: 'admin' | 'member') {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return participant!.id;
}

async function session(name: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

function req(path: string, cookie: string, method = 'GET', body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function makeContainer(ref: string): Promise<{ containerId: string; versionId: string }> {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: producerOrgId, documentReference: ref, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: `body ${ref}`, isCurrent: true })
    .returning();
  return { containerId: container!.id, versionId: version!.id };
}

// make a container visible to the viewer org: the owner's share + the viewer
// org's acknowledgement of the current version (ADR-0035 §4)
async function shareAndAck(containerId: string, versionId: string) {
  await db.insert(s.deliverableShares).values({
    containerId,
    organisationId: viewerOrgId,
    grantedByParticipantId: ownerParticipantId,
  });
  await db.insert(s.deliverableAcknowledgements).values({
    containerId,
    versionId,
    organisationId: viewerOrgId,
    acknowledgedByParticipantId: viewerParticipantId,
  });
}

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `Owner-${stamp}` }).returning();
  const [producer] = await db.insert(s.organisations).values({ name: `Producer-${stamp}` }).returning();
  const [viewer] = await db.insert(s.organisations).values({ name: `Viewer-${stamp}` }).returning();
  ownerOrgId = owner!.id;
  producerOrgId = producer!.id;
  viewerOrgId = viewer!.id;

  const [project] = await db
    .insert(s.projects)
    .values({ name: `P-${stamp}`, ownerOrganisationId: ownerOrgId })
    .returning();
  projectId = project!.id;
  for (const [orgId, role] of [
    [ownerOrgId, 'owner'],
    [producerOrgId, 'member'],
    [viewerOrgId, 'member'],
  ] as const) {
    await db.insert(s.memberships).values({ organisationId: orgId, projectId, role, state: 'active' });
  }

  // the classification vocabulary is copied into the project at creation
  await seedProjectOntology(db, projectId);
  const [facet] = await db
    .select()
    .from(s.classificationFacets)
    .where(and(eq(s.classificationFacets.projectId, projectId), eq(s.classificationFacets.key, 'discipline')))
    .limit(1);
  disciplineFacetId = facet!.id;
  const [term] = await db
    .select()
    .from(s.classificationTerms)
    .where(eq(s.classificationTerms.facetId, disciplineFacetId))
    .limit(1);
  disciplineTermId = term!.id;

  ownerParticipantId = await makeUser('own', ownerOrgId, 'admin');
  await makeUser('prod', producerOrgId, 'admin');
  viewerParticipantId = await makeUser('view', viewerOrgId, 'member');
  producerSession = await session('prod');
  viewerSession = await session('view');

  const a = await makeContainer(`WA-A-${stamp}`);
  containerA = a.containerId;
  versionA = a.versionId;
  const b = await makeContainer(`WA-B-${stamp}`);
  containerB = b.containerId;
  await shareAndAck(containerA, versionA); // viewer sees A, never B
});

afterAll(async () => {
  await pool.end();
});

describe('classification vocabulary', () => {
  it('serves the seeded owner-owned scheme (facets + terms)', async () => {
    const res = await req(`/projects/${projectId}/classification-scheme`, producerSession);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClassificationSchemeResponse;
    const keys = body.facets.map((f) => f.key);
    expect(keys).toEqual(['discipline', 'system', 'document_type', 'phase', 'work_package']);
    const discipline = body.facets.find((f) => f.key === 'discipline')!;
    expect(discipline.source).toBe('iso_19650');
    expect(discipline.terms.length).toBeGreaterThan(0);
  });

  it('lets the producing org classify its own deliverable; a non-producer cannot', async () => {
    const set = await req(`/containers/${containerA}/classifications`, producerSession, 'PUT', {
      facetId: disciplineFacetId,
      termId: disciplineTermId,
    });
    expect(set.status).toBe(204);

    const read = await req(`/containers/${containerA}/classifications`, producerSession);
    const body = (await read.json()) as ContainerClassificationsResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.facetKey).toBe('discipline');
    expect(body.items[0]!.proposed).toBe(false); // human-set

    // the viewer org (sees A via share, but does not produce it) cannot set it
    const denied = await req(`/containers/${containerA}/classifications`, viewerSession, 'PUT', {
      facetId: disciplineFacetId,
      termId: disciplineTermId,
    });
    expect(denied.status).toBe(404);
  });
});

describe('relationship edges — propose / confirm / retire', () => {
  let edgeId: string;

  it('proposes an edge (no effect), then confirms it live', async () => {
    const proposed = await req(`/containers/${containerA}/relationships`, producerSession, 'POST', {
      toContainerId: containerB,
      type: 'references',
    });
    expect(proposed.status).toBe(201);
    const edge = (await proposed.json()) as DocumentRelationship;
    expect(edge.proposed).toBe(true);
    expect(edge.confirmedByParticipantId).toBeNull();
    edgeId = edge.id;

    const confirmed = await req(`/relationships/${edgeId}/confirmation`, producerSession, 'POST');
    expect(confirmed.status).toBe(200);
    const live = (await confirmed.json()) as DocumentRelationship;
    expect(live.proposed).toBe(false);
    expect(live.confirmedByParticipantId).not.toBeNull();
  });

  it('rejects a duplicate live edge of the same type', async () => {
    const dup = await req(`/containers/${containerA}/relationships`, producerSession, 'POST', {
      toContainerId: containerB,
      type: 'references',
    });
    expect(dup.status).toBe(409);
  });

  it('lists the edge for the producer (sees both ends)', async () => {
    const res = await req(`/containers/${containerA}/relationships`, producerSession);
    const body = (await res.json()) as ContainerRelationshipsResponse;
    const ref = body.items.find((e) => e.id === edgeId);
    expect(ref).toBeDefined();
    expect(ref!.direction).toBe('outgoing');
    expect(ref!.otherContainerId).toBe(containerB);
  });

  it('the wall: hides an edge into a container the requester cannot see', async () => {
    // the viewer sees A (shared + acknowledged) but not B — so the A→B edge is
    // filtered out of A's relationships for the viewer
    const res = await req(`/containers/${containerA}/relationships`, viewerSession);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ContainerRelationshipsResponse;
    expect(body.items.find((e) => e.id === edgeId)).toBeUndefined();
    // and the viewer cannot even see container B at all
    const bClass = await req(`/containers/${containerB}/classifications`, viewerSession);
    expect(bClass.status).toBe(404);
  });

  it('retires the edge (currency-by-state; leaves the record)', async () => {
    const retired = await req(`/relationships/${edgeId}/retirement`, producerSession, 'POST');
    expect(retired.status).toBe(200);
    const res = await req(`/containers/${containerA}/relationships`, producerSession);
    const body = (await res.json()) as ContainerRelationshipsResponse;
    expect(body.items.find((e) => e.id === edgeId)).toBeUndefined();
  });
});
