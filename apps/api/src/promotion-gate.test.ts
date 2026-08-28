// T-332 acceptance — promotion is BLOCKED by open comment threads or open
// findings (ADR-0049 §7), overridable only on `Participant.elevated` and
// audited (§8).
//
// Owner-ruled 2026-08-01 **against the recommendation to warn**, so the tests
// that carry the ticket are the refusals: a warn-and-record build passes a
// happy-path suite unchanged.
//
// **The empty-findings case is asserted explicitly rather than incidentally**,
// which is the ticket's own instruction. The finding SCHEMA exists (T-328) and
// nothing produces findings yet — the checker (T-310) is unbuilt — so the
// findings count is structurally zero today. A suite that only exercised
// threads would leave the second half of the gate untested *and* untestable,
// and nobody would know which.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { PromotionPreflight, PromotionResult, Sandbox } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t332';
let projectId: string;
let producerOrg: string;
let ownerParticipantId: string;

/** the elevated lead author (Eleanor's shape), and an un-elevated one */
let leadCookie: string;
let leadParticipantId: string;
let plainLeadCookie: string;
let plainLeadParticipantId: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
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

/**
 * A promotable draft: a plan row with both appointments, a QA-gate-off sandbox
 * (this suite is about the OPEN-ITEMS gate, not the QA source gate — T-355
 * proves that one), and a bound document with content.
 */
async function promotableDraft(reference: string, cookie: string, participantId: string) {
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
    participantId,
    isLead: true,
    grantedByParticipantId: participantId,
  });
  await db.insert(s.deliverableReviewers).values({
    containerId: container!.id,
    participantId: ownerParticipantId,
    isLead: true,
    grantedByParticipantId: participantId,
    confirmedAt: new Date(),
    acceptedAt: new Date(),
  });
  const created = await post(cookie, `/projects/${projectId}/sandboxes`, {
    name: `t332 area ${reference}`,
    scope: 'single_org',
  });
  const sandbox = (await created.json()) as Sandbox;
  await db
    .update(s.sandboxes)
    .set({ promotionRequiresQa: false })
    .where(eq(s.sandboxes.id, sandbox.id));
  const doc = await post(cookie, `/projects/${projectId}/sandbox-documents`, {
    title: `Draft ${reference}`,
    sandboxId: sandbox.id,
    containerId: container!.id,
  });
  const docId = ((await doc.json()) as { id: string }).id;
  await app.request(`/sandbox-documents/${docId}`, {
    method: 'PATCH',
    headers: asJson(cookie),
    body: JSON.stringify({ content: 'The draft, ready to promote.' }),
  });
  return { containerId: container!.id, docId };
}

const preflight = async (docId: string, cookie: string): Promise<PromotionPreflight> => {
  const res = await app.request(`/sandbox-documents/${docId}/promotion-preflight`, {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as PromotionPreflight;
};

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: `t332 owner ${stamp}` }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: `t332 producer ${stamp}` }).returning();
  producerOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t332 project ${stamp}`, ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  const owner = await makeUser('t332-orla', oA!.id, true);
  ownerParticipantId = owner.participant.id;
  const lead = await makeUser('t332-eleanor', oB!.id, true);
  leadParticipantId = lead.participant.id;
  leadCookie = await session(lead.user.email);
  const plain = await makeUser('t332-pat', oB!.id, false);
  plainLeadParticipantId = plain.participant.id;
  plainLeadCookie = await session(plain.user.email);
});

afterAll(async () => {
  await pool.end();
});

describe('nothing reaches the controlled library with loose ends (§7)', () => {
  it('promotes cleanly when nothing is open, and says so in the preflight', async () => {
    const { docId } = await promotableDraft(`T332-CLEAN-${stamp}`, leadCookie, leadParticipantId);
    const pre = await preflight(docId, leadCookie);
    expect(pre.blocker).toBeNull();
    // the empty case, asserted rather than assumed — both halves
    expect(pre.openItems.threads).toBe(0);
    expect(pre.openItems.findings).toEqual({ open: 0, bySeverity: { required: 0, advisory: 0 } });
    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`);
    expect(res.status).toBe(201);
  });

  it('refuses on an open comment thread, and the window can quantify it', async () => {
    const { docId } = await promotableDraft(`T332-OPEN-${stamp}`, leadCookie, leadParticipantId);
    await post(leadCookie, `/sandbox-documents/${docId}/comments`, {
      body: 'This figure needs a source.',
    });
    const pre = await preflight(docId, leadCookie);
    expect(pre.blocker).toBe('open_items');
    // "you cannot promote" is unactionable; "one open thread" is a place to go
    expect(pre.openItems.threads).toBe(1);

    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('open_items');
  });

  it('counts THREADS, not comments: a reply does not make one thread into two', async () => {
    const { docId } = await promotableDraft(`T332-REPLY-${stamp}`, leadCookie, leadParticipantId);
    const root = await post(leadCookie, `/sandbox-documents/${docId}/comments`, { body: 'Root.' });
    const rootId = ((await root.json()) as { id: string }).id;
    await post(leadCookie, `/sandbox-documents/${docId}/comments`, {
      body: 'A reply.',
      parentCommentId: rootId,
    });
    // counting comments would make a thread with an answer look twice as
    // blocking as one with none, which is backwards
    expect((await preflight(docId, leadCookie)).openItems.threads).toBe(1);
  });

  it('closing the thread clears the gate — the block is a stop, not a state', async () => {
    const { docId } = await promotableDraft(`T332-CLOSE-${stamp}`, leadCookie, leadParticipantId);
    const root = await post(leadCookie, `/sandbox-documents/${docId}/comments`, { body: 'Fix me.' });
    const rootId = ((await root.json()) as { id: string }).id;
    expect((await preflight(docId, leadCookie)).blocker).toBe('open_items');
    await post(leadCookie, `/sandbox-comments/${rootId}/status`, { status: 'closed' });
    expect((await preflight(docId, leadCookie)).blocker).toBeNull();
    expect((await post(leadCookie, `/sandbox-documents/${docId}/promotion`)).status).toBe(201);
  });
});

describe('the override is elevated-only, and every use is audited (§8)', () => {
  it('an elevated lead author forces it, and the record says what was open', async () => {
    const { containerId, docId } = await promotableDraft(
      `T332-FORCE-${stamp}`,
      leadCookie,
      leadParticipantId,
    );
    await post(leadCookie, `/sandbox-documents/${docId}/comments`, { body: 'One.' });
    await post(leadCookie, `/sandbox-documents/${docId}/comments`, { body: 'Two.' });

    const pre = await preflight(docId, leadCookie);
    expect(pre.blocker).toBe('open_items');
    expect(pre.canOverrideOpenItems).toBe(true);

    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`, {
      overrideOpenItems: true,
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as PromotionResult;

    const [override] = await db
      .select()
      .from(s.promotionOverrides)
      .where(eq(s.promotionOverrides.containerId, containerId));
    expect(override).toBeDefined();
    expect(override!.overriddenByParticipantId).toBe(leadParticipantId);
    expect(override!.versionId).toBe(result.versionId);
    // "what was open AT THE TIME" — the numbers are stored because afterwards
    // there is nothing to count
    expect(override!.openThreads).toBe(2);
    expect(override!.openFindings).toBe(0);
  });

  it('an ordinary participant cannot pass the gate, and the attempt is recorded', async () => {
    const { containerId, docId } = await promotableDraft(
      `T332-PLAIN-${stamp}`,
      plainLeadCookie,
      plainLeadParticipantId,
    );
    await post(plainLeadCookie, `/sandbox-documents/${docId}/comments`, { body: 'Open.' });

    const pre = await preflight(docId, plainLeadCookie);
    expect(pre.blocker).toBe('open_items');
    // the control is absent rather than offered-and-refused
    expect(pre.canOverrideOpenItems).toBe(false);

    const res = await post(plainLeadCookie, `/sandbox-documents/${docId}/promotion`, {
      overrideOpenItems: true,
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { detail?: string }).detail).toBe('elevated_required');

    // T-301's rule: a control nobody can see operating is a control nobody can
    // audit — so the refusal leaves a row, exactly as the other elevated acts do
    const refusals = await db
      .select()
      .from(s.elevatedRefusals)
      .where(
        and(
          eq(s.elevatedRefusals.containerId, containerId),
          eq(s.elevatedRefusals.action, 'promote_over_open_items'),
        ),
      );
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.attemptedByParticipantId).toBe(plainLeadParticipantId);
    // and nothing promoted
    const versions = await db
      .select()
      .from(s.versions)
      .where(eq(s.versions.containerId, containerId));
    expect(versions).toHaveLength(0);
  });

  it('holding the tier is not the same as using it — an elevated promote with no flag is still blocked', async () => {
    const { containerId, docId } = await promotableDraft(
      `T332-UNASKED-${stamp}`,
      leadCookie,
      leadParticipantId,
    );
    await post(leadCookie, `/sandbox-documents/${docId}/comments`, { body: 'Still open.' });
    // a tier that silently waived the block would make §7 read "blocked unless
    // you happen to be senior", which is not what was ruled
    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('open_items');
    expect(
      await db
        .select()
        .from(s.promotionOverrides)
        .where(eq(s.promotionOverrides.containerId, containerId)),
    ).toHaveLength(0);
  });

  it('an override on a clean draft writes no record — the row means something', async () => {
    const { containerId, docId } = await promotableDraft(
      `T332-NOOP-${stamp}`,
      leadCookie,
      leadParticipantId,
    );
    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`, {
      overrideOpenItems: true,
    });
    expect(res.status).toBe(201);
    // a record of forcing a gate that was not closed would dilute every real
    // one in the same table
    expect(
      await db
        .select()
        .from(s.promotionOverrides)
        .where(eq(s.promotionOverrides.containerId, containerId)),
    ).toHaveLength(0);
  });

  it('the override record is append-only — the tier cannot tidy its own trail', async () => {
    const [row] = await db
      .select()
      .from(s.promotionOverrides)
      .where(eq(s.promotionOverrides.overriddenByParticipantId, leadParticipantId))
      .limit(1);
    await expect(
      db.delete(s.promotionOverrides).where(eq(s.promotionOverrides.id, row!.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.promotionOverrides)
        .set({ openThreads: 0 })
        .where(eq(s.promotionOverrides.id, row!.id)),
    ).rejects.toThrow();
  });
});
