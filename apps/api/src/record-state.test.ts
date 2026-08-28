// T-384/T-385 acceptance, against the live dev database — record state, and the
// publication boundary that decides who may write it (ADR-0013 §2/§5 as amended
// 2026-08-27, closing `Q-036`).
//
// The two halves the ruling separates, and the reason this suite exists: T-189's
// withdrawal removes a row from a producer's own PLAN, while ADR-0013's
// withdrawal stops a PUBLISHED deliverable being relied on. Same enum column,
// opposite owners, and the build implemented only the first — so the interesting
// cases here are all on the published side, which no test previously reached.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlanRow } from '@infora/contracts';
import { eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t384';
let projectId: string;
let ownerOrg: string;
let producerOrg: string;
let ownerCookie: string;
let ownerPlainCookie: string; // owner side, no elevated capability
let producerCookie: string;
let ownerParticipantId: string;
let producerParticipantId: string;

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

/** A published deliverable: a plan row promoted into the owner's library. The
 * lifecycle that puts it there is exercised elsewhere (slice-a.spec.ts); here it
 * is a precondition, so it is set directly. */
async function publishedRow(reference: string): Promise<string> {
  const res = await app.request(`/projects/${projectId}/plan`, {
    method: 'POST',
    headers: asJson(producerCookie),
    body: JSON.stringify({ documentReference: reference, title: 'Published chapter' }),
  });
  const row = (await res.json()) as PlanRow;
  await db.update(s.containers).set({ inLibrary: true }).where(eq(s.containers.id, row.containerId));
  return row.containerId;
}

const readRow = async (containerId: string, cookie: string): Promise<PlanRow> => {
  const res = await app.request(`/projects/${projectId}/plan`, { headers: { cookie } });
  const body = (await res.json()) as { items: PlanRow[] };
  return body.items.find((r) => r.containerId === containerId)!;
};

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: `t384 owner ${stamp}` }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: `t384 producer ${stamp}` }).returning();
  ownerOrg = oA!.id;
  producerOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t384 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: producerOrg, projectId, role: 'member' },
  ]);
  const owner = await makeUser('t384-orla', ownerOrg, true);
  const ownerPlain = await makeUser('t384-oscar', ownerOrg);
  const producer = await makeUser('t384-pia', producerOrg, true);
  ownerParticipantId = owner.participant.id;
  producerParticipantId = producer.participant.id;
  ownerCookie = await session(owner.user.email);
  ownerPlainCookie = await session(ownerPlain.user.email);
  producerCookie = await session(producer.user.email);
});

afterAll(async () => {
  await pool.end();
});

describe('the withdrawal guard follows the publication boundary (T-384)', () => {
  it('pre-publication the record is the producer’s: it withdraws directly, and the owner cannot', async () => {
    const res = await app.request(`/projects/${projectId}/plan`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ documentReference: `T384-PRE-${stamp}`, title: 'Unpublished chapter' }),
    });
    const containerId = ((await res.json()) as PlanRow).containerId;

    // the owner sees the row (the MIDP consolidation) and still holds no act on
    // it — T-189's guard is correct and is kept
    const byOwner = await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ reason: 'not mine to remove' }),
    });
    expect(byOwner.status).toBe(404);

    const byProducer = await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ reason: 'Descoped at planning' }),
    });
    expect(byProducer.status).toBe(200);
    const row = (await byProducer.json()) as PlanRow;
    expect(row.state).toBe('withdrawn');
    expect(row.withdrawnReason).toBe('Descoped at planning');
    // which SIDE acted — the half that did not exist before this ticket
    expect(row.withdrawnBy?.participantId).toBe(producerParticipantId);
    expect(row.withdrawnBy?.side).toBe('producer');
    expect(row.withdrawalProposal).toBeNull();
  });

  it('once published the record is the owner’s: the owner withdraws it outright', async () => {
    const containerId = await publishedRow(`T384-OWN-${stamp}`);
    const res = await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ reason: 'Superseded by the revised scheme' }),
    });
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlanRow;
    expect(row.state).toBe('withdrawn');
    expect(row.withdrawnBy?.participantId).toBe(ownerParticipantId);
    expect(row.withdrawnBy?.side).toBe('owner');

    // the reason's visibility follows the container (ADR-0013 §4): the producing
    // organisation reads why its own deliverable was withdrawn
    const asProducer = await readRow(containerId, producerCookie);
    expect(asProducer.withdrawnReason).toBe('Superseded by the revised scheme');
    expect(asProducer.withdrawnBy?.side).toBe('owner');
  });

  it('once published the producer PROPOSES, and the proposal is not in force', async () => {
    const containerId = await publishedRow(`T384-PROP-${stamp}`);
    const res = await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ reason: 'The survey it rests on has been retracted' }),
    });
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlanRow;
    // nothing has happened to the record yet — this is the whole point
    expect(row.state).toBe('live');
    expect(row.withdrawnReason).toBeNull();
    expect(row.withdrawnBy).toBeNull();
    expect(row.withdrawalProposal).toEqual({
      participantId: producerParticipantId,
      name: 't384-pia',
      reason: 'The survey it rests on has been retracted',
    });
    // and the owner sees it standing against them
    expect((await readRow(containerId, ownerCookie)).withdrawalProposal?.reason).toBe(
      'The survey it rests on has been retracted',
    );

    // a second proposal is refused rather than silently overwriting the first
    const again = await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ reason: 'and again' }),
    });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { detail: string }).detail).toBe('withdrawal_already_proposed');
  });

  it('the owner accepts a proposal under the proposer’s reason, and the owner is who withdrew it', async () => {
    const containerId = await publishedRow(`T384-ACC-${stamp}`);
    await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ reason: 'Ground model invalidated' }),
    });

    // the producer cannot answer its own proposal
    const byProducer = await app.request(
      `/containers/${containerId}/withdrawal-proposal/resolution`,
      { method: 'POST', headers: asJson(producerCookie), body: JSON.stringify({ accept: true }) },
    );
    expect(byProducer.status).toBe(404);

    const res = await app.request(`/containers/${containerId}/withdrawal-proposal/resolution`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ accept: true }),
    });
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlanRow;
    expect(row.state).toBe('withdrawn');
    // the producer said why; rewriting that in the owner's words would lose the
    // only account of it
    expect(row.withdrawnReason).toBe('Ground model invalidated');
    // but the act is the owner's, and §5's restore rule reads exactly this
    expect(row.withdrawnBy?.side).toBe('owner');
    expect(row.withdrawnBy?.participantId).toBe(ownerParticipantId);
    expect(row.withdrawalProposal).toBeNull();
  });

  it('a declined proposal leaves the record untouched and clears itself', async () => {
    const containerId = await publishedRow(`T384-DEC-${stamp}`);
    await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ reason: 'we would rather it went' }),
    });
    const res = await app.request(`/containers/${containerId}/withdrawal-proposal/resolution`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ accept: false }),
    });
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlanRow;
    expect(row.state).toBe('live');
    expect(row.withdrawalProposal).toBeNull();
    expect(row.withdrawnReason).toBeNull();
    expect(row.withdrawnBy).toBeNull();

    // and with nothing proposed there is nothing to resolve
    const empty = await app.request(`/containers/${containerId}/withdrawal-proposal/resolution`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ accept: true }),
    });
    expect(empty.status).toBe(409);
    expect(((await empty.json()) as { detail: string }).detail).toBe('no_withdrawal_proposed');
  });

  it('the elevated tier gates the proposal too, and the refusal is recorded', async () => {
    const containerId = await publishedRow(`T384-TIER-${stamp}`);
    const res = await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(ownerPlainCookie),
      body: JSON.stringify({ reason: 'not mine to end' }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { detail: string }).detail).toBe('super_user_required');
    const refusals = await db
      .select()
      .from(s.elevatedRefusals)
      .where(eq(s.elevatedRefusals.containerId, containerId));
    expect(refusals.map((r) => r.action)).toEqual(['container_withdraw']);
  });
});

// T-388 — context state on the deliverable read: whether the AI may rely on
// this deliverable, and if not, why. DERIVED, never stored — a switch that set
// it independently of its inputs would give the platform two state machines
// that could disagree, invisibly, because every citation would still resolve.
describe('context state, and the badge that names its reason (T-388)', () => {
  const contextOf = async (containerId: string) =>
    (await readRow(containerId, ownerCookie)).contextState;

  it('names withdrawal, supersession and rejection by their own words', async () => {
    for (const state of ['withdrawn', 'superseded', 'rejected'] as const) {
      const containerId = await publishedRow(`T388-${state.toUpperCase()}-${stamp}`);
      expect(await contextOf(containerId)).toEqual({ grounds: true, reason: null });
      await db.update(s.containers).set({ state }).where(eq(s.containers.id, containerId));
      // whatever code got the deliverable there — a project may configure which
      // codes admit, never configure its way past this (ADR-0013 §6)
      expect(await contextOf(containerId)).toEqual({ grounds: false, reason: state });
    }
  });

  it('names the admitting code’s own description when the code does not ground', async () => {
    const [preliminary] = await db
      .insert(s.acceptanceCodes)
      .values({
        projectId,
        code: `B1-${stamp}`,
        description: 'partial sign-off',
        isAccepting: true,
        grounds: false,
      })
      .returning();
    const containerId = await publishedRow(`T388-CODE-${stamp}`);
    const [cycle] = await db
      .insert(s.reviewCycles)
      .values({ containerId, state: 'accepted' })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId, versionReference: 'C01', content: 'accepted in part', isCurrent: true })
      .returning();
    await db.insert(s.rounds).values({
      cycleId: cycle!.id,
      number: 1,
      versionId: version!.id,
      state: 'issued',
      deliverableCodeId: preliminary!.id,
    });

    // the reason is the PROJECT's own words: the 2021 National Annex requires
    // each Published code's meaning to be written into the project's
    // information standard, so no platform phrase is true of every project
    expect(await contextOf(containerId)).toEqual({ grounds: false, reason: 'partial sign-off' });
  });

  it('an unpublished plan row is out of reach, and says which condition failed', async () => {
    const res = await app.request(`/projects/${projectId}/plan`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ documentReference: `T388-PLAN-${stamp}`, title: 'Not yet published' }),
    });
    const containerId = ((await res.json()) as PlanRow).containerId;
    expect(await contextOf(containerId)).toEqual({
      grounds: false,
      reason: 'not in the project library',
    });
  });
});

// T-389 — the Documents screen is where these acts live, so what it reads has
// to carry enough to offer them to the right side and to nobody else.
describe('the Documents read carries what the lifecycle buttons need (T-389)', () => {
  it('names the producer by id and surfaces a standing proposal to both sides', async () => {
    const containerId = await publishedRow(`T389-DOC-${stamp}`);
    await db
      .insert(s.versions)
      .values({ containerId, versionReference: 'C01', content: 'published', isCurrent: true });

    const listed = async (cookie: string) => {
      const res = await app.request(`/projects/${projectId}/library`, { headers: { cookie } });
      const body = (await res.json()) as { items: Array<Record<string, unknown>> };
      return body.items.find((i) => i['containerId'] === containerId) as
        | { producingOrganisationId: string; withdrawalProposal: { name: string; reason: string } | null }
        | undefined;
    };

    // the id, not the display name: which side you are on decides which act you
    // hold, and a name cannot answer that
    expect((await listed(ownerCookie))?.producingOrganisationId).toBe(producerOrg);
    expect((await listed(ownerCookie))?.withdrawalProposal).toBeNull();

    await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(producerCookie),
      body: JSON.stringify({ reason: 'The alignment moved' }),
    });

    // a proposal leaves the deliverable LIVE, so it is still on the list — which
    // is the point: it is where the owner is asked to answer
    for (const cookie of [ownerCookie, producerCookie]) {
      const row = await listed(cookie);
      expect(row?.withdrawalProposal).toEqual({
        participantId: producerParticipantId,
        name: 't384-pia',
        reason: 'The alignment moved',
      });
    }
  });
});

// T-385 — as built, either side could restore what the other withdrew and
// neither act recorded the other. The comment that justified free restoration
// (*"recovery is never a helpdesk ticket"*) was reasoning about a producer
// undoing its own mistake, and does not survive a cross-organisation act.
describe('restoration stops being symmetric (T-385)', () => {
  it('the producer cannot undo the owner’s withdrawal of a published deliverable', async () => {
    const containerId = await publishedRow(`T385-OWN-${stamp}`);
    await app.request(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ reason: 'Ended by the client' }),
    });

    const byProducer = await app.request(`/containers/${containerId}/restoration`, {
      method: 'POST',
      headers: asJson(producerCookie),
    });
    expect(byProducer.status).toBe(403);
    expect(((await byProducer.json()) as { detail: string }).detail).toBe(
      'restoration_not_permitted',
    );
    expect((await readRow(containerId, ownerCookie)).state).toBe('withdrawn');

    const byOwner = await app.request(`/containers/${containerId}/restoration`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(byOwner.status).toBe(200);
    const row = (await byOwner.json()) as PlanRow;
    expect(row.state).toBe('live');
    expect(row.withdrawnBy).toBeNull();
    expect(row.withdrawnReason).toBeNull();
  });

  it('a producer undoes its own act, and the owner may undo it too', async () => {
    const make = async (ref: string) => {
      const res = await app.request(`/projects/${projectId}/plan`, {
        method: 'POST',
        headers: asJson(producerCookie),
        body: JSON.stringify({ documentReference: ref, title: 'Planned chapter' }),
      });
      const id = ((await res.json()) as PlanRow).containerId;
      await app.request(`/containers/${id}/withdrawal`, {
        method: 'POST',
        headers: asJson(producerCookie),
        body: JSON.stringify({ reason: 'Descoped' }),
      });
      return id;
    };

    const own = await make(`T385-SELF-${stamp}`);
    const bySelf = await app.request(`/containers/${own}/restoration`, {
      method: 'POST',
      headers: asJson(producerCookie),
    });
    expect(bySelf.status).toBe(200);
    expect(((await bySelf.json()) as PlanRow).state).toBe('live');

    // §5's other half: the owner may undo a producer's act — it may un-break,
    // never break (it has no withdrawal act on an unpublished row at all)
    const other = await make(`T385-OVER-${stamp}`);
    const byOwner = await app.request(`/containers/${other}/restoration`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(byOwner.status).toBe(200);
    expect(((await byOwner.json()) as PlanRow).state).toBe('live');
  });

  it('restoration is for withdrawal alone — a superseded container is not undone here', async () => {
    const containerId = await publishedRow(`T385-SUP-${stamp}`);
    await db
      .update(s.containers)
      .set({ state: 'superseded' })
      .where(eq(s.containers.id, containerId));
    const res = await app.request(`/containers/${containerId}/restoration`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(res.status).toBe(409);
    // the way back from `superseded` is retiring the edge that set it (T-386)
    expect(((await res.json()) as { detail: string }).detail).toBe('not_withdrawn');
  });
});
