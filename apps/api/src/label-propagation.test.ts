// T-249 acceptance, end to end against the live dev database: finding F2, and
// the two ways it is now closed.
//
// THE SCENARIO IS THE FINDING. A deliverable is shared with the consultant's
// organisation and then NARROWED to one named participant (ADR-0035 §3). An
// answer grounded on it must not land in a document whose sandbox is granted
// to two organisations — which is precisely what "Open in editor" did, and
// what a document-targeted run's Suggestion did, before this ticket.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import type { Run, SandboxDocument } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t249';
let projectId: string;
let ownerOrg: string;
let consultantOrg: string;
let thirdOrg: string;
let narrowed: string; // the participant the deliverable is narrowed to
let colleague: string; // same organisation, outside the narrowing
let narrowedCookie: string;
let wideSandbox: string; // granted to two organisations
let narrowSandbox: string; // granted to the narrowed participant only
let conversationId: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return { user: user!, participantId: participant!.id, email: `${name}-${stamp}@test.local` };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const post = (cookie: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function makeSandbox(
  name: string,
  scope: 'multi_org' | 'named_user',
  createdBy: string,
  grants: Array<{ organisationId?: string; participantId?: string }>,
): Promise<string> {
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name,
      scope,
      owningOrganisationId: consultantOrg,
      createdByParticipantId: createdBy,
    })
    .returning();
  await db.insert(s.sandboxScopeGrants).values(
    grants.map((grant) => ({
      sandboxId: sandbox!.id,
      granteeType: grant.organisationId !== undefined ? ('organisation' as const) : ('participant' as const),
      organisationId: grant.organisationId ?? null,
      participantId: grant.participantId ?? null,
      grantedByParticipantId: createdBy,
    })),
  );
  return sandbox!.id;
}

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t249 owner ${stamp}` }).returning();
  const [consultant] = await db.insert(s.organisations).values({ name: `t249 consultant ${stamp}` }).returning();
  const [third] = await db.insert(s.organisations).values({ name: `t249 third ${stamp}` }).returning();
  ownerOrg = owner!.id;
  consultantOrg = consultant!.id;
  thirdOrg = third!.id;

  const [project] = await db
    .insert(s.projects)
    .values({ name: `t249 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: consultantOrg, projectId, role: 'member' },
    { organisationId: thirdOrg, projectId, role: 'member' },
  ]);

  const rachel = await makeUser('t249-owner', ownerOrg);
  const iris = await makeUser('t249-narrowed', consultantOrg);
  const tom = await makeUser('t249-colleague', consultantOrg);
  narrowed = iris.participantId;
  colleague = tom.participantId;
  narrowedCookie = await session(iris.email);

  // one library deliverable, produced by the owner, shared with the
  // consultant's organisation, acknowledged, and then NARROWED to Iris
  const content = 'The commercially sensitive lining figure is carried at four point two million.';
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: ownerOrg,
      documentReference: `T249-COM-RSK-${stamp}`,
      inLibrary: true,
    })
    .returning();
  await db.insert(s.deliverableShares).values({
    containerId: container!.id,
    organisationId: consultantOrg,
    grantedByParticipantId: rachel.participantId,
  });
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content })
    .returning();
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content,
    embedding: fakeVector(content),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });
  await db.insert(s.deliverableAcknowledgements).values({
    containerId: container!.id,
    versionId: version!.id,
    organisationId: consultantOrg,
    acknowledgedByParticipantId: narrowed,
  });
  // ADR-0035 §3: a live grant set means only these participants reach it
  await db.insert(s.deliverableParticipantGrants).values({
    containerId: container!.id,
    organisationId: consultantOrg,
    participantId: narrowed,
    grantedByParticipantId: narrowed,
  });

  wideSandbox = await makeSandbox('t249 shared area', 'multi_org', narrowed, [
    { organisationId: consultantOrg },
    { organisationId: thirdOrg },
  ]);
  narrowSandbox = await makeSandbox('t249 private area', 'named_user', narrowed, [
    { participantId: narrowed },
  ]);

  conversationId = ((await (
    await post(narrowedCookie, `/projects/${projectId}/conversations`, { surface: 'web' })
  ).json()) as { conversationId: string }).conversationId;
});

afterAll(async () => {
  await pool.end();
});

async function ask(): Promise<Run> {
  const res = await post(narrowedCookie, `/conversations/${conversationId}/runs`, {
    request: 'What lining figure is carried?',
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Run;
}

describe('label propagation on write-back (T-249, finding F2)', () => {
  it('refuses to carry a narrowed answer into a two-organisation sandbox, naming both labels', async () => {
    const run = await ask();
    expect(run.steps.some((step) => step.sourceSet.length > 0)).toBe(true); // it really grounded

    const res = await post(narrowedCookie, `/runs/${run.id}/sandbox-document`, {
      sandboxId: wideSandbox,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe('forbidden');
    expect(body.detail).toContain('participant narrowed'); // the sources
    expect(body.detail).toContain('multi organisation'); // the destination
  });

  it('allows the same answer into a sandbox no broader than its sources', async () => {
    const run = await ask();
    const res = await post(narrowedCookie, `/runs/${run.id}/sandbox-document`, {
      sandboxId: narrowSandbox,
    });
    expect(res.status).toBe(201);
    const document = (await res.json()) as SandboxDocument;
    expect(document.content).toBe(run.response);
  });

  it('an override is explicit, reasoned, recorded and attributed — never a setting', async () => {
    const run = await ask();
    const res = await post(narrowedCookie, `/runs/${run.id}/sandbox-document`, {
      sandboxId: wideSandbox,
      override: { reason: 'Cleared with the client commercial lead on 31 July.' },
    });
    expect(res.status).toBe(201);
    const document = (await res.json()) as SandboxDocument;

    const [record] = await db
      .select()
      .from(s.labelOverrides)
      .where(eq(s.labelOverrides.destinationId, document.id));
    expect(record).toMatchObject({
      runId: run.id,
      destinationKind: 'sandbox_document',
      sourceLabel: 'participant_narrowed',
      destinationLabel: 'multi_organisation',
      reason: 'Cleared with the client commercial lead on 31 July.',
      overriddenByParticipantId: narrowed,
    });

    // and it cannot be tidied away afterwards (append-only, migration 0036)
    await expect(
      db.delete(s.labelOverrides).where(eq(s.labelOverrides.id, record!.id)),
    ).rejects.toThrow();
  });

  it('an override with no reason is not an override', async () => {
    const run = await ask();
    const res = await post(narrowedCookie, `/runs/${run.id}/sandbox-document`, {
      sandboxId: wideSandbox,
      override: { reason: '' },
    });
    expect(res.status).toBe(400);
  });

  it("a colleague cannot carry someone else's answer anywhere", async () => {
    const run = await ask();
    const colleagueCookie = await session(`t249-colleague-${stamp}@test.local`);
    const res = await post(colleagueCookie, `/runs/${run.id}/sandbox-document`, {
      sandboxId: narrowSandbox,
    });
    expect(res.status).toBe(404);
    expect(colleague).toBeTruthy();
  });

  it('a document-targeted run writes no Suggestion into a broader sandbox, and says why', async () => {
    // the second half of F2: the agent's own write path, which no client
    // controls — the refusal has to live inside the chain
    const [document] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultantOrg,
        sandboxId: wideSandbox,
        title: 't249 shared draft',
        createdByParticipantId: narrowed,
      })
      .returning();

    const res = await post(narrowedCookie, `/conversations/${conversationId}/runs`, {
      request: 'Draft the lining position',
      sandboxDocumentId: document!.id,
    });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;

    expect(run.suggestions).toEqual([]); // nothing landed in the document
    const cite = run.steps.find((step) => step.type === 'cite')!;
    expect(cite.railOutcomes).toEqual([
      {
        rail: 'label_propagation',
        outcome: 'withheld',
        detail: expect.stringContaining('participant narrowed') as unknown as string,
      },
    ]);
    // the answer itself still came back: it is the WRITE that would widen it,
    // not the reading, and the requester may already read these sources
    expect(run.response).not.toBeNull();
  });

  it('the same run writes its Suggestion normally into a sandbox within the narrowing', async () => {
    const [document] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultantOrg,
        sandboxId: narrowSandbox,
        title: 't249 private draft',
        createdByParticipantId: narrowed,
      })
      .returning();

    const run = (await (
      await post(narrowedCookie, `/conversations/${conversationId}/runs`, {
        request: 'Draft the lining position',
        sandboxDocumentId: document!.id,
      })
    ).json()) as Run;

    expect(run.suggestions).toHaveLength(1);
    const cite = run.steps.find((step) => step.type === 'cite')!;
    expect(cite.railOutcomes).toEqual([]);
  });

  it('the label is computed, never stored: revoking the narrowing changes the answer', async () => {
    // a stored label would still say participant_narrowed here — which is the
    // reason it is computed from the access facts on every call
    await db
      .update(s.deliverableParticipantGrants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(s.deliverableParticipantGrants.participantId, narrowed),
          isNull(s.deliverableParticipantGrants.revokedAt),
        ),
      );

    const run = await ask();
    const res = await post(narrowedCookie, `/runs/${run.id}/sandbox-document`, {
      sandboxId: wideSandbox,
    });
    // owner + consultant reach the source; the destination adds the third
    // organisation, so it is still refused — but now as an organisation-set
    // widening rather than a participant narrowing
    expect(res.status).toBe(403);
    expect(((await res.json()) as { detail: string }).detail).toContain(
      'organisation the sources do not',
    );
  });
});
