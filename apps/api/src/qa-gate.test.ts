// T-355 (S9, ADR-0032 addendum 2026-08-09) acceptance — the QA gate as policy,
// and the internal QA cycle's row read. Default ON for a project sandbox, off
// for the personal one; with the gate on, the live-head promotion source is
// refused and what promotes is the QA-ACCEPTED FROZEN version — never the head
// as it has drifted since QA. The freeze container resolves through qa-row for
// its own organisation only (the wall untouched).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FreezeResult, PlanRow, PromotionResult, Sandbox } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t355';
let projectId: string;
let containerId: string;
let docId: string;
let sandboxId: string;
let eleanorCookie: string; // producing super user + lead author
let eleanorParticipantId: string;
let ownerCookie: string;

const FROZEN = 'The QA-assured statement, frozen and reviewed.';
const DRIFTED = 'The head, drifted AFTER QA accepted the frozen version.';

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
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

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't355 owner' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't355 consult' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't355 project', ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  await db.insert(s.acceptanceCodes).values([
    { projectId, code: 'A', description: 'Accepted', isAccepting: true, sortOrder: 1 },
    { projectId, code: 'C', description: 'Revise', isAccepting: false, sortOrder: 2 },
  ]);
  const eleanor = await makeUser('t355-eleanor', oB!.id, true);
  eleanorParticipantId = eleanor.participant.id;
  eleanorCookie = await session(eleanor.user.email);
  ownerCookie = await session((await makeUser('t355-owner', oA!.id, true)).user.email);

  // the plan row + reviewers so promotion's role gates pass
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: oB!.id, documentReference: `T355-${stamp}` })
    .returning();
  containerId = container!.id;
  await db.insert(s.workItems).values({
    projectId,
    type: 'document_production',
    title: 'QA-gated deliverable',
    status: 'planned',
    containerId,
  });
  await db.insert(s.deliverableAuthors).values({
    containerId,
    participantId: eleanorParticipantId,
    isLead: true,
    grantedByParticipantId: eleanorParticipantId,
  });
  const ownerRoster = await db
    .select({ id: s.participants.id })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.users.organisationId, oA!.id));
  await db.insert(s.deliverableReviewers).values({
    containerId,
    participantId: ownerRoster[0]!.id,
    isLead: true,
    grantedByParticipantId: eleanorParticipantId,
    confirmedAt: new Date(),
    // T-372 — the receipt waits on the appointee's own acceptance. This suite
    // is about the QA SOURCE gate, so the appointment arrives already answered
    // rather than re-testing what cycle.test.ts proves.
    acceptedAt: new Date(),
  });

  // a project (single_org) sandbox — created through the API, so the gate
  // default is exactly what a real team gets
  const created = await post(eleanorCookie, `/projects/${projectId}/sandboxes`, {
    name: 't355 team area',
    scope: 'single_org',
  });
  const sandbox = (await created.json()) as Sandbox;
  sandboxId = sandbox.id;

  const doc = await post(eleanorCookie, `/projects/${projectId}/sandbox-documents`, {
    title: 'QA-gated draft',
    sandboxId,
    containerId,
  });
  docId = ((await doc.json()) as { id: string }).id;
  await app.request(`/sandbox-documents/${docId}`, {
    method: 'PATCH',
    headers: asJson(eleanorCookie),
    body: JSON.stringify({ content: FROZEN }),
  });
});

afterAll(async () => {
  await pool.end();
});

describe('the QA gate (T-355, ADR-0032 addendum)', () => {
  it('defaults ON for every sandbox — the personal workspace included, so it is not a way round the gate', async () => {
    const sandboxes = (await (
      await app.request(`/projects/${projectId}/sandboxes`, { headers: { cookie: eleanorCookie } })
    ).json()) as { items: Sandbox[] };
    expect(sandboxes.items.find((x) => x.id === sandboxId)?.promotionRequiresQa).toBe(true);
    const personal = sandboxes.items.find((x) => x.isPersonal);
    expect(personal?.promotionRequiresQa).toBe(true);

    // the bypass this closes: nothing binds a plan row's draft to the team's
    // sandbox, so drafting a gated deliverable in the personal workspace and
    // promoting from there would have walked around the gate entirely
    const [bypassContainer] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: (await db.select().from(s.containers).where(eq(s.containers.id, containerId)))[0]!
          .producingOrganisationId,
        documentReference: `T355-BYPASS-${stamp}`,
      })
      .returning();
    await db.insert(s.workItems).values({
      projectId,
      type: 'document_production',
      title: 'Bypass attempt',
      status: 'planned',
      containerId: bypassContainer!.id,
    });
    await db.insert(s.deliverableAuthors).values({
      containerId: bypassContainer!.id,
      participantId: eleanorParticipantId,
      isLead: true,
      grantedByParticipantId: eleanorParticipantId,
    });
    const [reviewer] = await db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.containerId, containerId));
    await db.insert(s.deliverableReviewers).values({
      containerId: bypassContainer!.id,
      participantId: reviewer!.participantId,
      isLead: true,
      grantedByParticipantId: eleanorParticipantId,
      confirmedAt: new Date(),
      acceptedAt: new Date(), // T-372 — see above; this suite tests the QA gate

    });
    const inPersonal = await post(eleanorCookie, `/projects/${projectId}/sandbox-documents`, {
      title: 'drafted in my own workspace',
      sandboxId: personal!.id,
      containerId: bypassContainer!.id,
    });
    const bypassDocId = ((await inPersonal.json()) as { id: string }).id;
    await app.request(`/sandbox-documents/${bypassDocId}`, {
      method: 'PATCH',
      headers: asJson(eleanorCookie),
      body: JSON.stringify({ content: 'unassured, straight from my desk' }),
    });
    const refused = await post(eleanorCookie, `/sandbox-documents/${bypassDocId}/promotion`);
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { detail: string }).detail).toBe('qa_acceptance_required');
  });

  it('refuses the live-head source while the gate is on', async () => {
    const refused = await post(eleanorCookie, `/sandbox-documents/${docId}/promotion`);
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { detail: string }).detail).toBe('qa_acceptance_required');
  });

  it('promotes the QA-accepted frozen version — never the drifted head — and says so', async () => {
    // freeze (plain check-out), self-appoint the internal lead reviewer on the
    // freeze container (auto-confirmed at sandbox scope), release, refreeze to
    // open the formal round, accept and issue it
    const f1 = (await (await post(eleanorCookie, `/sandbox-documents/${docId}/freeze`)).json()) as FreezeResult;
    const grant = await post(eleanorCookie, `/containers/${f1.containerId}/reviewers`, {
      participantId: eleanorParticipantId,
      isLead: true,
    });
    expect(grant.status).toBe(201);
    const f2 = await post(eleanorCookie, `/sandbox-documents/${docId}/freeze`);
    if (f2.status !== 201) console.error('freeze2:', f2.status, await f2.clone().text());
    expect(f2.status).toBe(201);
    const cycle = (await (
      await app.request(`/containers/${f1.containerId}/cycle`, { headers: { cookie: eleanorCookie } })
    ).json()) as { rounds: { id: string }[] };
    const roundId = cycle.rounds.at(-1)!.id;
    const codes = (await (
      await app.request(`/projects/${projectId}/acceptance-codes`, { headers: { cookie: eleanorCookie } })
    ).json()) as { items: { id: string; isAccepting: boolean }[] };
    const coded = await post(eleanorCookie, `/rounds/${roundId}/deliverable-code`, {
      acceptanceCodeId: codes.items.find((c) => c.isAccepting)!.id,
    });
    expect(coded.status).toBe(200);
    const issued = await post(eleanorCookie, `/rounds/${roundId}/issue`);
    expect(issued.status).toBe(200);

    // the head drifts AFTER QA accepted the frozen version
    await app.request(`/sandbox-documents/${docId}`, {
      method: 'PATCH',
      headers: asJson(eleanorCookie),
      body: JSON.stringify({ content: DRIFTED }),
    });

    const promoted = await post(eleanorCookie, `/sandbox-documents/${docId}/promotion`);
    if (promoted.status !== 201) console.error('promoted:', promoted.status, await promoted.clone().text());
    expect(promoted.status).toBe(201);
    const result = (await promoted.json()) as PromotionResult;
    expect(result.source).toBe('qa_accepted_frozen');
    const [version] = await db
      .select({ content: s.versions.content })
      .from(s.versions)
      .where(eq(s.versions.id, result.versionId));
    expect(version!.content).toBe(FROZEN);
    expect(version!.content).not.toContain('drifted');
  });

  it('one promotion per QA acceptance: the next revision needs a fresh pass, not the spent one', async () => {
    // the previous test promoted P01 off the accepted QA version. Drive the
    // client round to the respond phase (acknowledge → revise verdict → issue)
    // so re-promotion is legal on every OTHER gate, and only the QA one is
    // under test here.
    const codesForRound = (await (
      await app.request(`/projects/${projectId}/acceptance-codes`, { headers: { cookie: ownerCookie } })
    ).json()) as { items: { id: string; isAccepting: boolean }[] };
    const projectCycle = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: ownerCookie } })
    ).json()) as { rounds: { id: string }[] };
    const round1 = projectCycle.rounds.at(-1)!.id;
    await post(ownerCookie, `/rounds/${round1}/acknowledge`);
    await post(ownerCookie, `/rounds/${round1}/deliverable-code`, {
      acceptanceCodeId: codesForRound.items.find((x) => !x.isAccepting)!.id,
    });
    const issuedBack = await post(ownerCookie, `/rounds/${round1}/issue`);
    expect(issuedBack.status).toBe(200);

    // promoting again would re-issue identical content: the acceptance is spent
    await app.request(`/sandbox-documents/${docId}`, {
      method: 'PATCH',
      headers: asJson(eleanorCookie),
      body: JSON.stringify({ content: 'answering the client, revision two' }),
    });
    const stale = await post(eleanorCookie, `/sandbox-documents/${docId}/promotion`);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { detail: string }).detail).toBe('qa_acceptance_stale');

    // a fresh freeze + QA pass re-arms it, and the NEW frozen content promotes
    await post(eleanorCookie, `/sandbox-documents/${docId}/freeze`);
    const qa = (await (
      await app.request(`/containers/${(await db.select({ id: s.containers.id }).from(s.containers).where(eq(s.containers.sandboxDocumentId, docId)))[0]!.id}/cycle`, {
        headers: { cookie: eleanorCookie },
      })
    ).json()) as { rounds: { id: string }[] };
    const codes = (await (
      await app.request(`/projects/${projectId}/acceptance-codes`, { headers: { cookie: eleanorCookie } })
    ).json()) as { items: { id: string; isAccepting: boolean }[] };
    await post(eleanorCookie, `/rounds/${qa.rounds.at(-1)!.id}/deliverable-code`, {
      acceptanceCodeId: codes.items.find((x) => x.isAccepting)!.id,
    });
    await post(eleanorCookie, `/rounds/${qa.rounds.at(-1)!.id}/issue`);

    const p02 = await post(eleanorCookie, `/sandbox-documents/${docId}/promotion`);
    expect(p02.status).toBe(201);
    const result = (await p02.json()) as PromotionResult;
    expect(result.source).toBe('qa_accepted_frozen');
    const [version] = await db
      .select({ content: s.versions.content })
      .from(s.versions)
      .where(eq(s.versions.id, result.versionId));
    expect(version!.content).toBe('answering the client, revision two'); // the NEW pass, not the old
  });

  it('a super user turns the gate off deliberately, and the live head becomes legal again — stated as the source', async () => {
    const off = await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(eleanorCookie),
      body: JSON.stringify({ promotionRequiresQa: false }),
    });
    expect(off.status).toBe(200);
    expect(((await off.json()) as Sandbox).promotionRequiresQa).toBe(false);

    // a second doc in the same sandbox, promoted straight from the head
    const [c2] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: (await db.select().from(s.containers).where(eq(s.containers.id, containerId)))[0]!.producingOrganisationId, documentReference: `T355-B-${stamp}` })
      .returning();
    await db.insert(s.workItems).values({
      projectId,
      type: 'document_production',
      title: 'Ungated sibling',
      status: 'planned',
      containerId: c2!.id,
    });
    await db.insert(s.deliverableAuthors).values({ containerId: c2!.id, participantId: eleanorParticipantId, isLead: true, grantedByParticipantId: eleanorParticipantId });
    const [reviewer] = await db.select().from(s.deliverableReviewers).where(eq(s.deliverableReviewers.containerId, containerId));
    await db.insert(s.deliverableReviewers).values({
      containerId: c2!.id,
      participantId: reviewer!.participantId,
      isLead: true,
      grantedByParticipantId: eleanorParticipantId,
      confirmedAt: new Date(),
      acceptedAt: new Date(), // T-372 — see above; this suite tests the QA gate

    });
    const doc2 = await post(eleanorCookie, `/projects/${projectId}/sandbox-documents`, {
      title: 'ungated draft',
      sandboxId,
      containerId: c2!.id,
    });
    const doc2Id = ((await doc2.json()) as { id: string }).id;
    await app.request(`/sandbox-documents/${doc2Id}`, {
      method: 'PATCH',
      headers: asJson(eleanorCookie),
      body: JSON.stringify({ content: 'straight off the head' }),
    });
    const promoted = await post(eleanorCookie, `/sandbox-documents/${doc2Id}/promotion`);
    expect(promoted.status).toBe(201);
    expect(((await promoted.json()) as PromotionResult).source).toBe('head');
  });
});

describe('internal QA can send a revision back (T-355)', () => {
  it('the deliverable’s own authors answer an internal “revise” — the freeze container holds no authors of its own', async () => {
    const [freeze] = await db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(eq(s.containers.sandboxDocumentId, docId));

    // a fresh internal round that ends in REVISE rather than acceptance
    await post(eleanorCookie, `/sandbox-documents/${docId}/freeze`);
    const qa = (await (
      await app.request(`/containers/${freeze!.id}/cycle`, { headers: { cookie: eleanorCookie } })
    ).json()) as { rounds: { id: string; state: string }[] };
    const round = qa.rounds.at(-1)!;
    const comment = await post(eleanorCookie, `/rounds/${round.id}/comments`, {
      body: 'The methodology section needs the assumed thickness stated.',
    });
    expect(comment.status).toBe(201);
    const codes = (await (
      await app.request(`/projects/${projectId}/acceptance-codes`, { headers: { cookie: eleanorCookie } })
    ).json()) as { items: { id: string; isAccepting: boolean }[] };
    await post(eleanorCookie, `/rounds/${round.id}/deliverable-code`, {
      acceptanceCodeId: codes.items.find((x) => !x.isAccepting)!.id,
    });
    await post(eleanorCookie, `/rounds/${round.id}/issue`);

    // the authoring side answers — the freeze container has no author grants,
    // so this only works because the deliverable's authors carry the internal
    // cycle too. Before the fix this was 403 authors_only and the QA round
    // could never be closed out.
    const issuedQa = (await (
      await app.request(`/containers/${freeze!.id}/cycle`, { headers: { cookie: eleanorCookie } })
    ).json()) as { rounds: { comments: { id: string }[] }[] };
    const internalComment = issuedQa.rounds.at(-1)!.comments[0]!;
    const responded = await post(eleanorCookie, `/review-comments/${internalComment.id}/response`, {
      body: 'Thickness now stated per parcel.',
      nextVersionAnchor: { quote: 'assumed thickness per parcel' },
    });
    expect(responded.status).toBe(201);

    // and the qa-row read carries those same authors, so the screen can offer it
    const qaRow = (await (
      await app.request(`/containers/${freeze!.id}/qa-row`, { headers: { cookie: eleanorCookie } })
    ).json()) as PlanRow;
    expect(qaRow.authors.some((a) => a.participantId === eleanorParticipantId && a.isLead)).toBe(true);
  });
});

describe('the qa-row read (T-355)', () => {
  it('serves the freeze container in the plan-row shape to its own organisation, and 404s the owner — the wall untouched', async () => {
    const [freeze] = await db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(eq(s.containers.sandboxDocumentId, docId));
    const own = await app.request(`/containers/${freeze!.id}/qa-row`, {
      headers: { cookie: eleanorCookie },
    });
    expect(own.status).toBe(200);
    const row = (await own.json()) as PlanRow;
    expect(row.documentReference).toBeNull(); // no coded reference at sandbox scope
    expect(row.reviewers.some((g) => g.participantId === eleanorParticipantId)).toBe(true);

    const acrossTheWall = await app.request(`/containers/${freeze!.id}/qa-row`, {
      headers: { cookie: ownerCookie },
    });
    expect(acrossTheWall.status).toBe(404);

    // and a LIBRARY container is not served here — it has a plan read already
    const wrongScope = await app.request(`/containers/${containerId}/qa-row`, {
      headers: { cookie: eleanorCookie },
    });
    expect(wrongScope.status).toBe(404);
  });
});
