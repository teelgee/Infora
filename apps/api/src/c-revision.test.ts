// T-392 acceptance — the `C` revision issues only on a CONTRACTUAL code
// (ADR-0003 as amended, ADR-0041).
//
// The 2021 National Annex's own `S4`/`S5` split: a deliverable can be **accepted
// for its stated purpose** without becoming the **contractual issue**. T-383
// stored `is_contractual` and said plainly that nothing consumed it; [cycle.ts]
// issued the C on `isAccepting` alone, so every accepting code produced a
// contractual revision whether or not the project's own scheme said it should.
//
// The failure is quiet in exactly the way that matters: a `C` version is
// immutable (`version_reference` cannot be rewritten — T-008/0013), so an
// over-issued contractual revision cannot be taken back. That is why the
// interesting case here is the NEGATIVE — an accepting, non-contractual code
// leaving the reviewed `P` revision standing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { PlanRow, PromotionResult, ReviewCycle } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t392';
let projectId: string;
let ownerOrg: string;
let producerOrg: string;
let ownerCookie: string;
let ownerParticipantId: string;
let leadCookie: string;
let leadParticipantId: string;
let codes: { contractual: string; acceptingOnly: string };

async function makeUser(name: string, organisationId: string, elevated = true) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated })
    .returning();
  return { user: user!, participant: participant! };
}
async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: asJson(cookie),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

/** Promote a fresh draft into round 1 and return the ids the acceptance needs. */
async function deliverableInReview(reference: string) {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: producerOrg, documentReference: reference })
    .returning();
  await db.insert(s.workItems).values({
    projectId,
    type: 'document_production',
    title: `Deliverable ${reference}`,
    status: 'planned',
    containerId: container!.id,
  });
  await db.insert(s.deliverableAuthors).values({
    containerId: container!.id,
    participantId: leadParticipantId,
    isLead: true,
    grantedByParticipantId: leadParticipantId,
  });
  await db.insert(s.deliverableReviewers).values({
    containerId: container!.id,
    participantId: ownerParticipantId,
    isLead: true,
    grantedByParticipantId: leadParticipantId,
    confirmedAt: new Date(),
    acceptedAt: new Date(),
  });
  const created = await post(leadCookie, `/projects/${projectId}/sandboxes`, {
    name: `t392 area ${reference}`,
    scope: 'single_org',
  });
  const sandboxId = ((await created.json()) as { id: string }).id;
  await db.update(s.sandboxes).set({ promotionRequiresQa: false }).where(eq(s.sandboxes.id, sandboxId));
  const doc = await post(leadCookie, `/projects/${projectId}/sandbox-documents`, {
    title: `Draft ${reference}`,
    sandboxId,
    containerId: container!.id,
  });
  const docId = ((await doc.json()) as { id: string }).id;
  await app.request(`/sandbox-documents/${docId}`, {
    method: 'PATCH',
    headers: asJson(leadCookie),
    body: JSON.stringify({ content: `The accepted content of ${reference}.` }),
  });
  const promoted = (await (await post(leadCookie, `/sandbox-documents/${docId}/promotion`)).json()) as PromotionResult;
  // ADR-0051 — the owner acknowledges the submission, which is what opens it
  await post(ownerCookie, `/rounds/${promoted.roundId}/acknowledge`);
  return { containerId: container!.id, roundId: promoted.roundId, versionId: promoted.versionId };
}

/** The lead reviewer's verdict, then the close-and-issue. */
async function acceptUnder(roundId: string, codeId: string) {
  const verdict = await post(ownerCookie, `/rounds/${roundId}/deliverable-code`, {
    acceptanceCodeId: codeId,
  });
  expect(verdict.status).toBe(200);
  const issued = await post(ownerCookie, `/rounds/${roundId}/issue`, {});
  expect(issued.status).toBe(200);
  return issued;
}

const versionsOf = (containerId: string) =>
  db.select().from(s.versions).where(eq(s.versions.containerId, containerId));
const currentOf = async (containerId: string) =>
  (
    await db
      .select()
      .from(s.versions)
      .where(and(eq(s.versions.containerId, containerId), eq(s.versions.isCurrent, true)))
  )[0]!;
const planRow = async (containerId: string): Promise<PlanRow> => {
  const res = await app.request(`/projects/${projectId}/plan`, { headers: { cookie: leadCookie } });
  const body = (await res.json()) as { items: PlanRow[] };
  return body.items.find((r) => r.containerId === containerId)!;
};

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: `t392 owner ${stamp}` }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: `t392 producer ${stamp}` }).returning();
  ownerOrg = oA!.id;
  producerOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t392 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: producerOrg, projectId, role: 'member' },
  ]);
  // the two acceptances the ruling distinguishes, as the 2021 NA writes them
  const inserted = await db
    .insert(s.acceptanceCodes)
    .values([
      {
        projectId,
        code: 'A1',
        description: 'Published — authorized and accepted',
        isAccepting: true,
        isContractual: true,
        grounds: true,
        sortOrder: 1,
      },
      {
        projectId,
        code: 'B1',
        description: 'Accepted for the stated purpose — partial sign-off',
        isAccepting: true,
        isContractual: false,
        grounds: true,
        sortOrder: 2,
      },
      { projectId, code: 'S4', description: 'Reviewed — revise', isAccepting: false, sortOrder: 3 },
    ])
    .returning();
  codes = {
    contractual: inserted.find((c) => c.code === 'A1')!.id,
    acceptingOnly: inserted.find((c) => c.code === 'B1')!.id,
  };
  const owner = await makeUser('t392-orla', ownerOrg);
  ownerParticipantId = owner.participant.id;
  ownerCookie = await session(owner.user.email);
  const lead = await makeUser('t392-eleanor', producerOrg);
  leadParticipantId = lead.participant.id;
  leadCookie = await session(lead.user.email);
});

afterAll(async () => {
  await pool.end();
});

describe('acceptance under a CONTRACTUAL code (unchanged behaviour)', () => {
  it('closes the cycle, admits the deliverable, and issues the C revision', async () => {
    const { containerId, roundId } = await deliverableInReview(`T392-CON-${stamp}`);
    const res = await acceptUnder(roundId, codes.contractual);
    const { cycle } = (await res.json()) as { cycle: ReviewCycle };
    expect(cycle.state).toBe('accepted');

    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, containerId));
    expect(container!.inLibrary).toBe(true);
    const current = await currentOf(containerId);
    expect(current.versionReference).toBe('C01');
    expect((await versionsOf(containerId)).map((v) => v.versionReference).sort()).toEqual([
      'C01',
      'P01',
    ]);
  });
});

describe('acceptance under an ACCEPTING but NOT CONTRACTUAL code (T-392)', () => {
  it('closes the cycle and admits the deliverable, and issues no C revision at all', async () => {
    const { containerId, roundId } = await deliverableInReview(`T392-NONCON-${stamp}`);
    const res = await acceptUnder(roundId, codes.acceptingOnly);
    const { cycle } = (await res.json()) as { cycle: ReviewCycle };
    // the cycle still ENDS — an accepting code is an accepting code
    expect(cycle.state).toBe('accepted');
    expect(cycle.closedAt).not.toBeNull();

    // and the deliverable is still ADMITTED: admission is what `is_accepting`
    // decides, and whether it GROUNDS is the code's own `grounds` flag, read
    // live by retrieval (T-387)
    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, containerId));
    expect(container!.inLibrary).toBe(true);

    // the whole ticket, in one assertion: no C, and the accepted content keeps
    // its reviewed P revision as the current one
    const versions = await versionsOf(containerId);
    expect(versions.map((v) => v.versionReference)).toEqual(['P01']);
    expect((await currentOf(containerId)).versionReference).toBe('P01');
  });

  it('the work item still accepts — the verdict is about the record, not the work', async () => {
    const [item] = await db
      .select()
      .from(s.workItems)
      .where(eq(s.workItems.title, `Deliverable T392-NONCON-${stamp}`));
    expect(item!.status).toBe('accepted');
  });

  it('the surface can state WHICH acceptance happened, rather than implying C', async () => {
    // the plan read carries `isContractual` beside the verdict (T-392), so the
    // accepted-status screen never has to infer the answer from a revision
    // prefix — reading an outcome backwards from its side effect
    const nonContractual = await planRow(
      (
        await db
          .select()
          .from(s.containers)
          .where(eq(s.containers.documentReference, `T392-NONCON-${stamp}`))
      )[0]!.id,
    );
    expect(nonContractual.deliverableCode).toEqual({
      code: 'B1',
      description: 'Accepted for the stated purpose — partial sign-off',
      isContractual: false,
    });
    expect(nonContractual.currentVersion!.versionReference).toBe('P01');

    const contractual = await planRow(
      (
        await db
          .select()
          .from(s.containers)
          .where(eq(s.containers.documentReference, `T392-CON-${stamp}`))
      )[0]!.id,
    );
    expect(contractual.deliverableCode!.isContractual).toBe(true);
    expect(contractual.currentVersion!.versionReference).toBe('C01');
  });

  it('a later revision promotes as the next P — the series is unbroken', async () => {
    // the non-obvious consequence of NOT issuing a C: the P series is what
    // continues, so a second submission is P02 and not "P02 after a C01 that
    // was never there"
    const [container] = await db
      .select()
      .from(s.containers)
      .where(eq(s.containers.documentReference, `T392-NONCON-${stamp}`));
    const [doc] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.containerId, container!.id));
    const res = await post(leadCookie, `/sandbox-documents/${doc!.id}/promotion`);
    expect(res.status).toBe(201);
    expect(((await res.json()) as PromotionResult).versionReference).toBe('P02');
  });
});
