// T-372 acceptance — the appointee's own act (ADR-0033 addendum §2, 2026-08-22).
//
// The property under test is the one propose-then-confirm could not have: A
// NAMED PERSON SAYS YES. Appointment was two organisations acting *about*
// someone — proposed by one side, confirmed by the other — and a lead reviewer
// holds the deliverable's contractual verdict, which nobody can undertake on
// another's behalf. So every case below checks that the act belongs to the
// appointee alone, that a refusal is a state rather than an error, and that the
// refusal's REASON stays inside the owner organisation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PlanRow, ReviewerGrant } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t372';
let projectId: string;
let containerId: string;
let ownerCookie: string; // trina — owner org, super user (confirms, and appoints)
let consultCookie: string; // cal — producing org lead author (proposes)
let outsideCookie: string; // otto — a third organisation with a live share
let ownerReviewerCookie: string; // opal — owner-side appointee
let ownerReviewerParticipantId: string;
let outsideParticipantId: string;
let consultParticipantId: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
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
const detail = async (res: Response) => ((await res.json()) as { detail?: string }).detail;

/** The deliverable's live lead-reviewer grant as THIS requester reads it. */
async function leadGrant(cookie: string): Promise<ReviewerGrant> {
  const plan = (await (
    await app.request(`/projects/${projectId}/plan`, { headers: { cookie } })
  ).json()) as { items: PlanRow[] };
  return plan.items
    .find((r) => r.containerId === containerId)!
    .reviewers.find((g) => g.isLead && g.revokedAt === null && g.declinedAt === null)!;
}

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t372 owner ${stamp}` }).returning();
  const [consultOrg] = await db.insert(s.organisations).values({ name: `t372 consult ${stamp}` }).returning();
  const [outsideOrg] = await db.insert(s.organisations).values({ name: `t372 outside ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t372 project ${stamp}`, ownerOrganisationId: ownerOrg!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg!.id, projectId, role: 'owner', state: 'active' },
    { organisationId: consultOrg!.id, projectId, role: 'member', state: 'active' },
    { organisationId: outsideOrg!.id, projectId, role: 'member', state: 'active' },
  ]);

  const trina = await makeUser('t372-trina', ownerOrg!.id, true);
  const opal = await makeUser('t372-opal', ownerOrg!.id);
  const cal = await makeUser('t372-cal', consultOrg!.id, true);
  const otto = await makeUser('t372-otto', outsideOrg!.id);
  ownerCookie = await session(trina.user.email);
  ownerReviewerCookie = await session(opal.user.email);
  consultCookie = await session(cal.user.email);
  outsideCookie = await session(otto.user.email);
  ownerReviewerParticipantId = opal.participant.id;
  outsideParticipantId = otto.participant.id;
  consultParticipantId = cal.participant.id;

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      scope: 'library',
      producingOrganisationId: consultOrg!.id,
      documentReference: `T372-${String(stamp).slice(-6)}`,
      inLibrary: true,
    })
    .returning();
  containerId = container!.id;
  await db.insert(s.deliverableAuthors).values({
    containerId,
    participantId: consultParticipantId,
    isLead: true,
    grantedByParticipantId: consultParticipantId,
  });
  // the outside organisation holds a live share, so ADR-0015's share-first
  // invariant is already satisfied for it and confirmation is legal
  await db.insert(s.deliverableShares).values({
    containerId,
    organisationId: outsideOrg!.id,
    grantedByParticipantId: trina.participant.id,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('an owner-side appointee: acceptance IS the confirmation', () => {
  let grantId: string;

  it('the producing side proposes; the proposal confers nothing', async () => {
    const res = await post(consultCookie, `/containers/${containerId}/reviewers`, {
      participantId: ownerReviewerParticipantId,
      isLead: true,
    });
    expect(res.status).toBe(201);
    const grant = (await res.json()) as ReviewerGrant;
    grantId = grant.id;
    expect(grant.confirmedAt).toBeNull();
    expect(grant.acceptedAt).toBeNull();
    // and the appointment names who asked, because the undertaking card does
    expect(grant.grantedBy.participantId).toBe(consultParticipantId);
  });

  it('is nobody else’s to give — not the proposer’s, not the owner super-user’s', async () => {
    // 404, not 403: the act does not exist for anyone but its subject, and
    // saying "forbidden" would confirm the appointment to a bystander
    expect((await post(consultCookie, `/reviewers/${grantId}/acceptance`)).status).toBe(404);
    expect((await post(ownerCookie, `/reviewers/${grantId}/acceptance`)).status).toBe(404);
    expect((await post(outsideCookie, `/reviewers/${grantId}/acceptance`)).status).toBe(404);
  });

  it('collapses appointment and access into one click, because the appointee is owner-side', async () => {
    const res = await post(ownerReviewerCookie, `/reviewers/${grantId}/acceptance`);
    expect(res.status).toBe(200);
    const grant = (await res.json()) as ReviewerGrant;
    expect(grant.acceptedAt).not.toBeNull();
    // a proposal is non-confirming "unless the proposer is owner-side" — and
    // they are, so the owner's separate confirmation was never needed
    expect(grant.confirmedAt).not.toBeNull();
    expect(grant.declinedAt).toBeNull();
  });

  it('is answered once, one way', async () => {
    expect(await detail(await post(ownerReviewerCookie, `/reviewers/${grantId}/acceptance`))).toBe(
      'already_accepted',
    );
    const declined = await post(ownerReviewerCookie, `/reviewers/${grantId}/declination`, {
      reason: 'changed my mind',
    });
    expect(await detail(declined)).toBe('already_accepted');
  });
});

describe('a decline is a state, not an error', () => {
  let fresh: ReviewerGrant;

  it('starts from an appointment that was never accepted', async () => {
    // retire the accepted one and propose again, so the refusal below is tested
    // on an unanswered appointment rather than a change of mind
    const standing = await leadGrant(ownerCookie);
    expect((await post(ownerCookie, `/reviewers/${standing.id}/revocation`)).status).toBe(200);
    fresh = (await (
      await post(consultCookie, `/containers/${containerId}/reviewers`, {
        participantId: ownerReviewerParticipantId,
        isLead: true,
      })
    ).json()) as ReviewerGrant;
    expect(fresh.acceptedAt).toBeNull();
    expect(fresh.declinedAt).toBeNull();
  });

  it('needs a reason — the whole point of recording a refusal rather than revoking it', async () => {
    expect((await post(ownerReviewerCookie, `/reviewers/${fresh.id}/declination`, {})).status).toBe(400);
    expect(
      (await post(ownerReviewerCookie, `/reviewers/${fresh.id}/declination`, { reason: '  ' })).status,
    ).toBe(400);
  });

  it('leaves the deliverable awaiting a lead reviewer, and lets a replacement be named at once', async () => {
    const declined = await post(ownerReviewerCookie, `/reviewers/${fresh.id}/declination`, {
      reason: 'I am the approving officer for the land purchase and should not also review it.',
    });
    expect(declined.status).toBe(200);
    const grant = (await declined.json()) as ReviewerGrant;
    expect(grant.declinedAt).not.toBeNull();
    expect(grant.acceptedAt).toBeNull();
    // the interval stays OPEN: the refusal is on the record, not deleted
    expect(grant.revokedAt).toBeNull();

    // and a replacement is nameable immediately — the one-live-lead index
    // excludes a declined appointment, so a refusal never blocks the
    // replacement it exists to ask for
    const replacement = await post(consultCookie, `/containers/${containerId}/reviewers`, {
      participantId: outsideParticipantId,
      isLead: true,
    });
    expect(replacement.status).toBe(201);
  });

  it('stops the decliner acting on the appointment they refused', async () => {
    const rows = await db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.containerId, containerId));
    const refused = rows.find((r) => r.declinedAt !== null)!;
    expect(refused.participantId).toBe(ownerReviewerParticipantId);
    // they were confirmed once, so access is not the question — the undertaking
    // is, and they declined it
    const plan = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: ownerCookie } })
    ).json()) as { items: PlanRow[] };
    const live = plan.items
      .find((r) => r.containerId === containerId)!
      .reviewers.filter((g) => g.revokedAt === null && g.declinedAt === null);
    expect(live.some((g) => g.participantId === ownerReviewerParticipantId)).toBe(false);
  });
});

describe('an appointee outside the owner organisation', () => {
  it('waits for the owner’s confirmation, because that is where access begins', async () => {
    const rows = await db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.containerId, containerId));
    const outside = rows.find(
      (r) => r.participantId === outsideParticipantId && r.revokedAt === null,
    )!;
    expect(outside.confirmedAt).toBeNull();
    // ADR-0015's share-first invariant runs at confirmation; there is nothing
    // to accept until it has
    expect(await detail(await post(outsideCookie, `/reviewers/${outside.id}/acceptance`))).toBe(
      'confirmation_required',
    );

    expect((await post(ownerCookie, `/reviewers/${outside.id}/confirmation`)).status).toBe(200);
    const accepted = await post(outsideCookie, `/reviewers/${outside.id}/acceptance`);
    expect(accepted.status).toBe(200);
    expect(((await accepted.json()) as ReviewerGrant).acceptedAt).not.toBeNull();
  });
});

describe('the refusal’s reason stays inside the owner organisation', () => {
  it('is read by the owner side and by its author, and by nobody else', async () => {
    const asOwner = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: ownerCookie } })
    ).json()) as { items: PlanRow[] };
    const ownerView = asOwner.items
      .find((r) => r.containerId === containerId)!
      .reviewers.find((g) => g.declinedAt !== null)!;
    expect(ownerView.declineReason).toContain('approving officer');

    // the producing side learns THAT a lead reviewer is awaited, never why —
    // the decline itself is visible, because it is the reason the deliverable
    // is waiting; only the person's words are withheld
    const asProducer = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: consultCookie } })
    ).json()) as { items: PlanRow[] };
    const producerView = asProducer.items
      .find((r) => r.containerId === containerId)!
      .reviewers.find((g) => g.declinedAt !== null)!;
    expect(producerView.declinedAt).not.toBeNull();
    expect(producerView.declineReason).toBeNull();
  });
});

describe('only a lead appointment carries an undertaking', () => {
  it('refuses acceptance on a plain reviewer row', async () => {
    const plain = (await (
      await post(ownerCookie, `/containers/${containerId}/reviewers`, {
        participantId: ownerReviewerParticipantId,
        isLead: false,
      })
    ).json()) as ReviewerGrant;
    expect(plain.confirmedAt).not.toBeNull(); // an owner grant auto-confirms
    expect(await detail(await post(ownerReviewerCookie, `/reviewers/${plain.id}/acceptance`))).toBe(
      'lead_appointment_only',
    );
  });
});

// T-377 — the lead swap is ONE transactional act (ADR-0008/0033 addenda,
// 2026-08-22: the lead author "may amend the review group, the lead reviewer
// included"). Fired as a separate revoke and grant, a failure between the two
// strands the deliverable with no lead at all — the half-applied state the
// promotion-window audit reproduced. The fixture arrives here with otto
// (outside org) as the confirmed-and-accepted lead.
describe('naming a lead reviewer replaces the standing one in one act (T-377)', () => {
  it('the producing side swaps the lead: the old grant closes and the new one is a bare proposal, atomically', async () => {
    const before = await leadGrant(consultCookie); // otto, confirmed + accepted
    expect(before.confirmedAt).not.toBeNull();

    const res = await post(consultCookie, `/containers/${containerId}/lead-reviewer`, {
      participantId: ownerReviewerParticipantId,
    });
    expect(res.status).toBe(201);
    const swap = (await res.json()) as { grant: ReviewerGrant; revoked: ReviewerGrant | null };
    // the displaced lead's interval closed in the same act…
    expect(swap.revoked?.id).toBe(before.id);
    expect(swap.revoked?.revokedAt).not.toBeNull();
    // …and the naming is a PROPOSAL: the proposer is producing-side, so the
    // wall stays shut — confirmation remains the owner's act (ADR-0033)
    expect(swap.grant.isLead).toBe(true);
    expect(swap.grant.confirmedAt).toBeNull();
    expect(swap.grant.acceptedAt).toBeNull();

    // exactly one live lead stands — the one-live-lead invariant held through
    // the swap because it never existed half-applied
    const rows = await db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.containerId, containerId));
    const liveLeads = rows.filter((r) => r.isLead && r.revokedAt === null && r.declinedAt === null);
    expect(liveLeads).toHaveLength(1);
    expect(liveLeads[0]!.participantId).toBe(ownerReviewerParticipantId);
  });

  it('naming the standing lead again is refused, not silently re-granted', async () => {
    expect(
      await detail(
        await post(consultCookie, `/containers/${containerId}/lead-reviewer`, {
          participantId: ownerReviewerParticipantId,
        }),
      ),
    ).toBe('already_lead_reviewer');
  });

  it('a bystander organisation cannot fire it', async () => {
    // otto's lead grant was revoked above; his organisation is neither owner
    // nor producer, so the act reads as nonexistence (the wall, silent)
    const res = await post(outsideCookie, `/containers/${containerId}/lead-reviewer`, {
      participantId: outsideParticipantId,
    });
    expect(res.status).toBe(404);
  });

  it('an owner-side swap auto-confirms the new lead, exactly as an owner grant does', async () => {
    const res = await post(ownerCookie, `/containers/${containerId}/lead-reviewer`, {
      participantId: consultParticipantId,
    });
    expect(res.status).toBe(201);
    const swap = (await res.json()) as { grant: ReviewerGrant; revoked: ReviewerGrant | null };
    expect(swap.revoked?.revokedAt).not.toBeNull(); // opal's proposal closed
    expect(swap.grant.confirmedAt).not.toBeNull(); // owner naming confirms
    expect(swap.grant.acceptedAt).toBeNull(); // the undertaking stays the appointee's own
  });
});
