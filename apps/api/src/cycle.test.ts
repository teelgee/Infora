// T-120+ acceptance, against the live dev database: promotion as the
// near-empty hand-off launching the cycle (ADR-0002/0008/0014/0017/0032),
// then the round loop as its tickets land.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PromotionResult, ReviewCycle } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t120';
let projectId: string;
let ownerOrg: string;
let consultOrg: string;
let containerId: string;
let documentId: string;
let leadAuthorCookie: string; // consultant lead author
let colleagueCookie: string; // consultant non-lead author
let ownerCookie: string; // owner-side lead reviewer
let leadAuthorParticipantId: string;
let colleagueParticipantId: string;
let ownerParticipantId: string;

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
const promote = (cookie: string, docId = documentId) =>
  app.request(`/sandbox-documents/${docId}/promotion`, { method: 'POST', headers: asJson(cookie) });

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't120 owner org' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't120 consult org' }).returning();
  ownerOrg = oA!.id;
  consultOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't120 project', ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: consultOrg, projectId, role: 'member' },
  ]);
  await db.insert(s.acceptanceCodes).values([
    { projectId, code: 'A', description: 'Accepted', isAccepting: true, sortOrder: 1 },
    { projectId, code: 'C', description: 'Revise and resubmit', isAccepting: false, sortOrder: 2 },
  ]);

  const lead = await makeUser('t120-lena', consultOrg);
  const colleague = await makeUser('t120-cole', consultOrg);
  const owner = await makeUser('t120-opal', ownerOrg);
  leadAuthorParticipantId = lead.participant.id;
  colleagueParticipantId = colleague.participant.id;
  ownerParticipantId = owner.participant.id;
  leadAuthorCookie = await session(lead.user.email);
  colleagueCookie = await session(colleague.user.email);
  ownerCookie = await session(owner.user.email);

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: consultOrg,
      documentReference: `T120-DEL-${stamp}`,
      inLibrary: false,
    })
    .returning();
  containerId = container!.id;
  await db.insert(s.workItems).values({
    projectId,
    type: 'document_production',
    title: 't120 statement',
    status: 'drafting',
    containerId,
    assigneeParticipantId: leadAuthorParticipantId,
  });
  await db.insert(s.deliverableAuthors).values([
    {
      containerId,
      participantId: leadAuthorParticipantId,
      isLead: true,
      grantedByParticipantId: leadAuthorParticipantId,
    },
    {
      containerId,
      participantId: colleagueParticipantId,
      grantedByParticipantId: leadAuthorParticipantId,
    },
  ]);

  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: consultOrg,
      title: 't120 draft',
      content: 'The drafted statement, ready for round one.',
      containerId,
      createdByParticipantId: leadAuthorParticipantId,
    })
    .returning();
  documentId = doc!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('promotion (T-120)', () => {
  it('cannot launch without a confirmed lead reviewer (ADR-0005/0008)', async () => {
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('no_lead_reviewer');
    // appoint the owner as confirmed lead reviewer, by the owner
    await db.insert(s.deliverableReviewers).values({
      containerId,
      participantId: ownerParticipantId,
      isLead: true,
      grantedByParticipantId: ownerParticipantId,
      confirmedByParticipantId: ownerParticipantId,
      confirmedAt: new Date(),
    });
  });

  it('only the lead author promotes (ADR-0017)', async () => {
    const byColleague = await promote(colleagueCookie);
    expect(byColleague.status).toBe(403);
    const byOwner = await promote(ownerCookie);
    expect(byOwner.status).toBe(404); // not their sandbox — the wall, silent
  });

  it('the first promotion snapshots the head, launches the cycle and opens round 1', async () => {
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(201);
    const result = (await res.json()) as PromotionResult;
    expect(result.versionReference).toBe('v1');
    expect(result.roundNumber).toBe(1);

    const [version] = await db.select().from(s.versions).where(eq(s.versions.id, result.versionId));
    expect(version!.content).toBe('The drafted statement, ready for round one.');
    expect(version!.isCurrent).toBe(true);

    const cycleRead = await app.request(`/containers/${containerId}/cycle`, {
      headers: { cookie: ownerCookie },
    });
    expect(cycleRead.status).toBe(200);
    const cycle = (await cycleRead.json()) as ReviewCycle;
    expect(cycle.state).toBe('active');
    expect(cycle.editLockHolder).toBe('reviewing'); // the reviewers hold the pen
    expect(cycle.rounds).toHaveLength(1);
    expect(cycle.rounds[0]!.state).toBe('open');
    expect(cycle.rounds[0]!.transmittals).toHaveLength(1); // promotion IS the transmittal

    // the work item moved by the event, not a hand (ADR-0032 addendum)
    const [workItem] = await db
      .select()
      .from(s.workItems)
      .where(eq(s.workItems.containerId, containerId));
    expect(workItem!.status).toBe('in_review');
  });

  it('a second promotion while the round is open is refused — one round, one lock (ADR-0014)', async () => {
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('round_not_in_respond_phase');
  });

  it('an unplanned document cannot promote', async () => {
    const [adhoc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultOrg,
        title: 't120 ad hoc',
        createdByParticipantId: leadAuthorParticipantId,
      })
      .returning();
    const res = await promote(leadAuthorCookie, adhoc!.id);
    expect(res.status).toBe(400);
  });
});

describe('the cycle read is phased (ADR-0014)', () => {
  it('the open round hides its comments from the authoring side, not from reviewers', async () => {
    // the owner (a confirmed reviewer) drops a comment directly
    const [cycleRow] = await db
      .select()
      .from(s.reviewCycles)
      .where(and(eq(s.reviewCycles.containerId, containerId), eq(s.reviewCycles.state, 'active')));
    const [round] = await db.select().from(s.rounds).where(eq(s.rounds.cycleId, cycleRow!.id));
    const [version] = await db.select().from(s.versions).where(eq(s.versions.id, round!.versionId));
    await db.insert(s.reviewComments).values({
      roundId: round!.id,
      versionId: version!.id,
      authorParticipantId: ownerParticipantId,
      body: 'reviewer-side deliberation — walled while open',
    });

    const asReviewer = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: ownerCookie } })
    ).json()) as ReviewCycle;
    expect(asReviewer.rounds[0]!.comments).toHaveLength(1);

    const asAuthor = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: leadAuthorCookie } })
    ).json()) as ReviewCycle;
    expect(asAuthor.rounds[0]!.comments).toHaveLength(0); // hidden until issued
  });
});

describe('the round loop (T-123/T-124/T-126)', () => {
  let roundId: string;
  let commentId: string;
  let codes: { accepting: string; revise: string };

  it('reviewers comment and code while open; authors may not', async () => {
    const cycle = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: ownerCookie } })
    ).json()) as ReviewCycle;
    roundId = cycle.rounds[0]!.id;
    const codeRows = await db.select().from(s.acceptanceCodes).where(eq(s.acceptanceCodes.projectId, projectId));
    codes = {
      accepting: codeRows.find((r) => r.isAccepting)!.id,
      revise: codeRows.find((r) => !r.isAccepting)!.id,
    };

    const byAuthor = await app.request(`/rounds/${roundId}/comments`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ body: 'sneaky' }),
    });
    expect(byAuthor.status).toBe(403);

    const res = await app.request(`/rounds/${roundId}/comments`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({
        body: 'Clarify the drainage assumption.',
        anchor: { page: 1, quote: 'ready for round one' },
        acceptanceCodeId: codes.revise,
      }),
    });
    expect(res.status).toBe(201);
    const comment = (await res.json()) as { id: string; anchor: { page?: number } | null };
    commentId = comment.id;
    expect(comment.anchor?.page).toBe(1);
  });

  it('the lead reviewer moderates, sets the verdict, and issues — lock flips, round revealed', async () => {
    const moderated = await app.request(`/review-comments/${commentId}`, {
      method: 'PATCH',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ body: 'Clarify the drainage assumption at WS-TP07.' }),
    });
    expect(moderated.status).toBe(200);

    const verdict = await app.request(`/rounds/${roundId}/deliverable-code`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ acceptanceCodeId: codes.revise }),
    });
    expect(verdict.status).toBe(200);

    const issued = await app.request(`/rounds/${roundId}/issue`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ purposeCode: 'For review' }),
    });
    expect(issued.status).toBe(200);
    const { cycle } = (await issued.json()) as { cycle: ReviewCycle };
    expect(cycle.state).toBe('active'); // revise-and-resubmit, not accepted
    expect(cycle.editLockHolder).toBe('authoring');
    expect(cycle.rounds[0]!.state).toBe('issued');

    // the closed round is now visible to the authoring side (ADR-0014) —
    // both comments: the phasing test's direct one and the API one
    const asAuthor = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: leadAuthorCookie } })
    ).json()) as ReviewCycle;
    expect(asAuthor.rounds[0]!.comments).toHaveLength(2);

    const [workItem] = await db.select().from(s.workItems).where(eq(s.workItems.containerId, containerId));
    expect(workItem!.status).toBe('responding');
  });

  it('responses are the authoring side’s, one per comment, exactly one of link or no-change', async () => {
    const both = await app.request(`/review-comments/${commentId}/response`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ body: 'x', noChangeReason: 'y', nextVersionId: commentId }),
    });
    expect(both.status).toBe(400); // the zod refine

    const res = await app.request(`/review-comments/${commentId}/response`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ body: 'Assumption clarified in §3.2 of the next revision.', noChangeReason: 'section updated in v2' }),
    });
    expect(res.status).toBe(201);

    const dup = await app.request(`/review-comments/${commentId}/response`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ body: 'again', noChangeReason: 'again' }),
    });
    expect(dup.status).toBe(409);

    // the mandatory-response rule bites the transmittal back: one comment is
    // still unanswered, so promotion refuses (ADR-0004)
    const early = await promote(leadAuthorCookie);
    expect(early.status).toBe(409);
    expect(((await early.json()) as { detail?: string }).detail).toBe('unanswered_comments');

    // answer the remaining comment
    const asAuthor = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: leadAuthorCookie } })
    ).json()) as ReviewCycle;
    const unanswered = asAuthor.rounds[0]!.comments.filter((cm) => cm.response === null);
    for (const cm of unanswered) {
      const res = await app.request(`/review-comments/${cm.id}/response`, {
        method: 'POST',
        headers: asJson(leadAuthorCookie),
        body: JSON.stringify({ body: 'Noted for the record.', noChangeReason: 'deliberation point, no change required' }),
      });
      expect(res.status).toBe(201);
    }
  });

  it('the transmittal back: promote v2, round 2 opens, lock returns to reviewers', async () => {
    await db
      .update(s.sandboxDocuments)
      .set({ content: 'The drafted statement, drainage assumption clarified.' })
      .where(eq(s.sandboxDocuments.id, documentId));
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(201);
    const result = (await res.json()) as PromotionResult;
    expect(result.versionReference).toBe('v2');
    expect(result.roundNumber).toBe(2);

    const cycle = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: ownerCookie } })
    ).json()) as ReviewCycle;
    expect(cycle.editLockHolder).toBe('reviewing');
    expect(cycle.rounds.map((r) => r.state)).toEqual(['responded', 'open']);
  });

  it('an accepting verdict closes the cycle: work item accepted, the version admitted to grounding (T-126)', async () => {
    const cycle = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: ownerCookie } })
    ).json()) as ReviewCycle;
    const round2 = cycle.rounds[1]!;
    await app.request(`/rounds/${round2.id}/deliverable-code`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ acceptanceCodeId: codes.accepting }),
    });
    const issued = await app.request(`/rounds/${round2.id}/issue`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({}),
    });
    expect(issued.status).toBe(200);
    const closed = ((await issued.json()) as { cycle: ReviewCycle }).cycle;
    expect(closed.state).toBe('accepted');

    const [workItem] = await db.select().from(s.workItems).where(eq(s.workItems.containerId, containerId));
    expect(workItem!.status).toBe('accepted');
    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, containerId));
    expect(container!.inLibrary).toBe(true);

    // the accepted current version is chunked for grounding (T-012 sweep)
    const cycleRounds = closed.rounds;
    const acceptedVersionId = cycleRounds[1]!.versionId;
    const chunks = await db.select().from(s.versionChunks).where(eq(s.versionChunks.versionId, acceptedVersionId));
    expect(chunks.length).toBeGreaterThan(0);

    // promoting after acceptance is a NEW revision entering review: a fresh
    // cycle launches (the one-ACTIVE-cycle rule; the accepted record stands)
    const rePromote = await promote(leadAuthorCookie);
    expect(rePromote.status).toBe(201);
    const again = (await rePromote.json()) as PromotionResult;
    expect(again.cycleId).not.toBe(closed.id);
    expect(again.versionReference).toBe('v3');
    expect(again.roundNumber).toBe(1);
  });

  it('close-rejected is the explicit audited stop: container rejected, never grounds (ADR-0032)', async () => {
    // a second deliverable, launched then abandoned
    const [container2] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: consultOrg,
        documentReference: `T120-DEL2-${stamp}`,
        inLibrary: false,
      })
      .returning();
    await db.insert(s.workItems).values({
      projectId,
      type: 'document_production',
      title: 't120 abandoned',
      status: 'drafting',
      containerId: container2!.id,
    });
    await db.insert(s.deliverableAuthors).values({
      containerId: container2!.id,
      participantId: leadAuthorParticipantId,
      isLead: true,
      grantedByParticipantId: leadAuthorParticipantId,
    });
    await db.insert(s.deliverableReviewers).values({
      containerId: container2!.id,
      participantId: ownerParticipantId,
      isLead: true,
      grantedByParticipantId: ownerParticipantId,
      confirmedByParticipantId: ownerParticipantId,
      confirmedAt: new Date(),
    });
    const [doc2] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultOrg,
        title: 't120 abandoned draft',
        content: 'never to be',
        containerId: container2!.id,
        createdByParticipantId: leadAuthorParticipantId,
      })
      .returning();
    await promote(leadAuthorCookie, doc2!.id);

    const [cycle2] = await db
      .select()
      .from(s.reviewCycles)
      .where(and(eq(s.reviewCycles.containerId, container2!.id), eq(s.reviewCycles.state, 'active')));

    // a plain reviewer cannot close; the lead author can
    const sneaky = await app.request(`/cycles/${cycle2!.id}/close-rejected`, {
      method: 'POST',
      headers: asJson(colleagueCookie),
    });
    expect(sneaky.status).toBe(403);
    const closed = await app.request(`/cycles/${cycle2!.id}/close-rejected`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(closed.status).toBe(200);
    expect(((await closed.json()) as ReviewCycle).state).toBe('closed_rejected');

    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, container2!.id));
    expect(container!.state).toBe('rejected');
    const [workItem] = await db.select().from(s.workItems).where(eq(s.workItems.containerId, container2!.id));
    expect(workItem!.status).toBe('rejected');
  });
});

describe('renditions ride the promotion (T-121, ADR-0034)', () => {
  it('an authored promotion stores a real PDF and docx; the bytes stream back scoped', async () => {
    const [version] = await db
      .select()
      .from(s.versions)
      .where(and(eq(s.versions.containerId, containerId), eq(s.versions.isCurrent, true)));
    const list = await app.request(`/versions/${version!.id}/renditions`, {
      headers: { cookie: ownerCookie },
    });
    expect(list.status).toBe(200);
    const { items } = (await list.json()) as { items: Array<{ id: string; kind: string; format: string }> };
    const kinds = items.map((i) => `${i.kind}/${i.format}`).sort();
    expect(kinds).toEqual(['native/docx', 'pdf/pdf']);

    const pdf = items.find((i) => i.kind === 'pdf')!;
    const file = await app.request(`/renditions/${pdf.id}/file`, { headers: { cookie: ownerCookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    const docx = items.find((i) => i.kind === 'native')!;
    const docxFile = await app.request(`/renditions/${docx.id}/file`, { headers: { cookie: colleagueCookie } });
    expect(docxFile.status).toBe(200);
    const docxBytes = Buffer.from(await docxFile.arrayBuffer());
    expect(docxBytes.readUInt32LE(0)).toBe(0x04034b50); // a real zip — a real docx

    // renditions are records: the append-only trigger holds (T-114)
    const [row] = await db.select().from(s.renditions).where(eq(s.renditions.id, pdf.id));
    await db
      .update(s.renditions)
      .set({ contentRef: 'blob:tampered' })
      .where(eq(s.renditions.id, row!.id))
      .then(
        () => {
          throw new Error('tamper should have been rejected');
        },
        (error: unknown) => {
          expect(String((error as Error).cause ?? error)).toMatch(/append-only/);
        },
      );
  });
});

describe('upload & conversion (T-122, ADR-0034)', () => {
  it('a docx uploads native-canonical, converts in place, and the original survives', async () => {
    // build a real docx via the T-121 generator, upload it as a file
    const { textToDocx } = await import('./renditions.js');
    const docxBytes = textToDocx('Uploaded paragraph one.\nAnd paragraph two.');
    const form = new FormData();
    form.append('file', new File([new Uint8Array(docxBytes)], 'Drainage Strategy.docx'));
    const res = await app.request(`/projects/${projectId}/sandbox-uploads`, {
      method: 'POST',
      headers: { cookie: leadAuthorCookie },
      body: form,
    });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: string; origin: string; format: string; title: string };
    expect(doc.origin).toBe('uploaded');
    expect(doc.format).toBe('docx');
    expect(doc.title).toBe('Drainage Strategy');

    const converted = await app.request(`/sandbox-documents/${doc.id}/conversion`, {
      method: 'POST',
      headers: { cookie: leadAuthorCookie },
    });
    expect(converted.status).toBe(200);
    const authored = (await converted.json()) as { origin: string; format: string; content: string };
    expect(authored.origin).toBe('authored');
    expect(authored.format).toBe('infora_text');
    expect(authored.content).toContain('Uploaded paragraph one.');
    expect(authored.content).toContain('And paragraph two.');

    // converting twice is refused; the original file ref survives on the row
    const again = await app.request(`/sandbox-documents/${doc.id}/conversion`, {
      method: 'POST',
      headers: { cookie: leadAuthorCookie },
    });
    expect(again.status).toBe(400);
    const [row] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc.id));
    expect(row!.fileRef).not.toBeNull();
  });

  it('unsupported formats are refused honestly', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(Buffer.from('csv,data'))], 'table.csv'));
    const res = await app.request(`/projects/${projectId}/sandbox-uploads`, {
      method: 'POST',
      headers: { cookie: leadAuthorCookie },
      body: form,
    });
    expect(res.status).toBe(400);
  });
});

describe('the freeze & the internal cycle (T-125, ADR-0032)', () => {
  let internalDocId: string;
  let freezeContainerId: string;

  it('a plain freeze snapshots without ceremony; the series is P-numbered and org-private', async () => {
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultOrg,
        title: 't125 management plan',
        content: 'Internal management plan, first cut.',
        createdByParticipantId: leadAuthorParticipantId,
      })
      .returning();
    internalDocId = doc!.id;
    const res = await app.request(`/sandbox-documents/${internalDocId}/freeze`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(res.status).toBe(201);
    const frozen = (await res.json()) as { versionReference: string; containerId: string };
    expect(frozen.versionReference).toBe('P1');
    freezeContainerId = frozen.containerId;

    // org-private: the project OWNER cannot see the freeze series (ADR-0032)
    const ownerRead = await app.request(`/containers/${freezeContainerId}/cycle`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownerRead.status).toBe(404);
    // and its versions 404 on the project-wide library read (T-114)
    const [pVersion] = await db
      .select()
      .from(s.versions)
      .where(and(eq(s.versions.containerId, freezeContainerId), eq(s.versions.isCurrent, true)));
    const versionRead = await app.request(`/versions/${pVersion!.id}`, {
      headers: { cookie: ownerCookie },
    });
    expect(versionRead.status).toBe(404);
  });

  it('with an internal lead reviewer granted, the next freeze opens the round and locks the head', async () => {
    // the org appoints its own reviewer on the freeze container — auto-confirmed
    const grant = await app.request(`/containers/${freezeContainerId}/reviewers`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ participantId: colleagueParticipantId, isLead: true }),
    });
    expect(grant.status).toBe(201);
    expect(((await grant.json()) as { confirmedAt: string | null }).confirmedAt).not.toBeNull();

    await db
      .update(s.sandboxDocuments)
      .set({ content: 'Internal management plan, ready for QA.' })
      .where(eq(s.sandboxDocuments.id, internalDocId));
    const res = await app.request(`/sandbox-documents/${internalDocId}/freeze`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { versionReference: string }).versionReference).toBe('P2');

    const [doc] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, internalDocId));
    expect(doc!.headLocked).toBe(true); // checked out

    // the locked head refuses manual edits (409 head_locked)
    const edit = await app.request(`/sandbox-documents/${internalDocId}`, {
      method: 'PATCH',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ content: 'drifting' }),
    });
    expect(edit.status).toBe(409);
    expect(((await edit.json()) as { detail?: string }).detail).toBe('head_locked');

    // a third freeze while the round is open refuses
    const again = await app.request(`/sandbox-documents/${internalDocId}/freeze`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(again.status).toBe(409);
  });

  it('QA acceptance releases the lock and never touches the library; the record stays producer-private', async () => {
    const cycle = (await (
      await app.request(`/containers/${freezeContainerId}/cycle`, { headers: { cookie: colleagueCookie } })
    ).json()) as ReviewCycle;
    const round = cycle.rounds.at(-1)!;
    const codeRows = await db.select().from(s.acceptanceCodes).where(eq(s.acceptanceCodes.projectId, projectId));
    const accepting = codeRows.find((r) => r.isAccepting)!.id;
    await app.request(`/rounds/${round.id}/deliverable-code`, {
      method: 'POST',
      headers: asJson(colleagueCookie),
      body: JSON.stringify({ acceptanceCodeId: accepting }),
    });
    const issued = await app.request(`/rounds/${round.id}/issue`, {
      method: 'POST',
      headers: asJson(colleagueCookie),
      body: JSON.stringify({}),
    });
    expect(issued.status).toBe(200);
    expect(((await issued.json()) as { cycle: ReviewCycle }).cycle.state).toBe('accepted');

    const [doc] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, internalDocId));
    expect(doc!.headLocked).toBe(false); // the pen is back
    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, freezeContainerId));
    expect(container!.inLibrary).toBe(false); // QA evidence, never the corpus
  });

  it('promotion takes the QA-accepted frozen version, never a drifted head (ADR-0032)', async () => {
    // link the doc to a fresh plan row so it can promote
    const [container3] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: consultOrg,
        documentReference: `T125-DEL-${stamp}`,
        inLibrary: false,
      })
      .returning();
    await db.insert(s.workItems).values({
      projectId,
      type: 'document_production',
      title: 't125 plan deliverable',
      status: 'drafting',
      containerId: container3!.id,
    });
    await db.insert(s.deliverableAuthors).values({
      containerId: container3!.id,
      participantId: leadAuthorParticipantId,
      isLead: true,
      grantedByParticipantId: leadAuthorParticipantId,
    });
    await db.insert(s.deliverableReviewers).values({
      containerId: container3!.id,
      participantId: ownerParticipantId,
      isLead: true,
      grantedByParticipantId: ownerParticipantId,
      confirmedByParticipantId: ownerParticipantId,
      confirmedAt: new Date(),
    });
    await db
      .update(s.sandboxDocuments)
      .set({ containerId: container3!.id, content: 'Head drifted AFTER the QA acceptance.' })
      .where(eq(s.sandboxDocuments.id, internalDocId));

    const res = await app.request(`/sandbox-documents/${internalDocId}/promotion`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as PromotionResult;
    const [version] = await db.select().from(s.versions).where(eq(s.versions.id, result.versionId));
    // the promoted content is the ACCEPTED frozen version, not the drifted head
    expect(version!.content).toBe('Internal management plan, ready for QA.');
  });

  it('promotion refuses while an internal cycle is active', async () => {
    // a fresh planned deliverable whose QA is mid-flight
    const [container4] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: consultOrg,
        documentReference: `T125-DEL2-${stamp}`,
        inLibrary: false,
      })
      .returning();
    await db.insert(s.deliverableAuthors).values({
      containerId: container4!.id,
      participantId: leadAuthorParticipantId,
      isLead: true,
      grantedByParticipantId: leadAuthorParticipantId,
    });
    await db.insert(s.deliverableReviewers).values({
      containerId: container4!.id,
      participantId: ownerParticipantId,
      isLead: true,
      grantedByParticipantId: ownerParticipantId,
      confirmedByParticipantId: ownerParticipantId,
      confirmedAt: new Date(),
    });
    const [doc4] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultOrg,
        title: 't125 mid-QA draft',
        content: 'Mid-QA content.',
        containerId: container4!.id,
        createdByParticipantId: leadAuthorParticipantId,
      })
      .returning();
    // freeze once (plain), appoint the internal reviewer, freeze again → round opens
    await app.request(`/sandbox-documents/${doc4!.id}/freeze`, { method: 'POST', headers: asJson(leadAuthorCookie) });
    const [fc] = await db.select().from(s.containers).where(eq(s.containers.sandboxDocumentId, doc4!.id));
    await app.request(`/containers/${fc!.id}/reviewers`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
      body: JSON.stringify({ participantId: colleagueParticipantId, isLead: true }),
    });
    await db.update(s.sandboxDocuments).set({ headLocked: false }).where(eq(s.sandboxDocuments.id, doc4!.id));
    const frozen = await app.request(`/sandbox-documents/${doc4!.id}/freeze`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(frozen.status).toBe(201);

    const res = await app.request(`/sandbox-documents/${doc4!.id}/promotion`, {
      method: 'POST',
      headers: asJson(leadAuthorCookie),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('internal_cycle_active');
  });
});
