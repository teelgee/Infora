// T-311 acceptance — the marked-up edit: one mark at a time, a mechanical group
// in one act, and the two things that must never happen.
//
// **The refusals carry the ticket.** ADR-0053 §6 narrowed ADR-0048 §3's
// no-bulk-accept rule to *rewrites* — and the narrowing is only safe because
// the test is structural. A build that let a rewrite through an accept-all
// would pass every happy-path suite while shipping fifty-five paragraphs of
// model-written prose unread, which is the outcome §3 exists to prevent.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Finding, ResolveFindingsResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { writeFindings } from './findings';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t311';

let projectId: string;
let producerOrg: string;
let authorCookie: string;
let authorParticipantId: string;
let otherCookie: string;
let sandboxId: string;
let runId: string;
let firmRulebookId: string;
let styleGuideId: string;

const CONTENT = [
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading.',
  '',
  'Conclusions',
  '',
  'A reduction was delivered by the Scheme.',
].join('\n');

const at = (needle: string) => {
  const start = CONTENT.indexOf(needle);
  return { span: { start, end: start + needle.length }, paragraph: 2, verbatim: needle };
};

async function makeUser(name: string, organisationId: string) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
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

const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

/** A fresh draft with its own run, so each case starts from the same words. */
async function draftDocument(): Promise<string> {
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: producerOrg,
      sandboxId,
      title: `t311 draft ${Math.random()}`,
      content: CONTENT,
      createdByParticipantId: authorParticipantId,
    })
    .returning();
  return document!.id;
}

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: `t311 owner ${stamp}` }).returning();
  const [oB] = await db
    .insert(s.organisations)
    .values({ name: `t311 producer ${stamp}` })
    .returning();
  producerOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t311 project ${stamp}`, ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);

  const author = await makeUser('t311-eleanor', oB!.id);
  authorParticipantId = author.participant.id;
  authorCookie = await session(author.user.email);
  const other = await makeUser('t311-orla', oA!.id);
  otherCookie = await session(other.user.email);

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: `t311 area ${stamp}`,
      scope: 'multi_org',
      owningOrganisationId: producerOrg,
      createdByParticipantId: authorParticipantId,
    })
    .returning();
  sandboxId = sandbox!.id;
  // the other organisation is granted the sandbox, so the wall case is a REAL
  // one: a document Org A can genuinely open, carrying a quote it may not read
  await db.insert(s.sandboxScopeGrants).values({
    sandboxId,
    granteeType: 'organisation',
    organisationId: oA!.id,
    grantedByParticipantId: authorParticipantId,
  });

  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId: conversation!.id,
      agentId: 'infora.qa_checker',
      agentProvenance: 'infora',
      request: 'check this draft',
      environmentKey: projectId,
      requesterParticipantId: authorParticipantId,
    })
    .returning();
  runId = run!.id;

  const users = await db.select().from(s.users).where(eq(s.users.organisationId, producerOrg));
  const [rulebook] = await db
    .insert(s.rulebooks)
    .values({
      organisationId: producerOrg,
      title: 'Ashcombe Drafting Manual',
      sourceFormat: 'docx',
      loadedByUserId: users[0]!.id,
    })
    .returning();
  firmRulebookId = rulebook!.id;
  const [guide] = await db
    .insert(s.projectStyleGuides)
    .values({
      projectId,
      title: 'Wrenfield Project Style Guide',
      sourceFormat: 'docx',
      loadedByUserId: users[0]!.id,
    })
    .returning();
  styleGuideId = guide!.id;
});

afterAll(async () => {
  await pool.end();
});

const mechanical = (documentId: string) =>
  writeFindings(db, {
    runId,
    sandboxDocumentId: documentId,
    findings: [
      {
        checkFamily: 'style',
        anchor: at('The Scheme'),
        defect: 'The works are capitalised.',
        severity: 'advisory',
        evidence: {
          input: 'rulebook',
          clause: '§2.1',
          quote: 'Refer to the works as “the scheme”, in lower case.',
          rulebookRef: styleGuideId,
          scope: 'project',
        },
        replacement: 'The scheme',
      },
    ],
  });

const rewrite = (documentId: string) =>
  writeFindings(db, {
    runId,
    sandboxDocumentId: documentId,
    findings: [
      {
        checkFamily: 'style',
        anchor: at('A reduction was delivered by the Scheme.'),
        defect: 'This sentence is passive.',
        severity: 'advisory',
        evidence: {
          input: 'rulebook',
          clause: '§4.2',
          quote: 'Avoid the passive voice.',
          rulebookRef: firmRulebookId,
          scope: 'organisation',
        },
        replacement: 'The scheme delivered a reduction.',
      },
    ],
  });

const list = async (documentId: string, cookie: string): Promise<Finding[]> => {
  const res = await app.request(`/sandbox-documents/${documentId}/findings`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: Finding[] }).items;
};

const contentOf = async (documentId: string): Promise<string> => {
  const [row] = await db
    .select({ content: s.sandboxDocuments.content })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, documentId))
    .limit(1);
  return row!.content;
};

describe('anchoring is the whole point (ADR-0048 §2)', () => {
  it('accepting a fix REPLACES the span it pointed at, rather than appending', async () => {
    const documentId = await draftDocument();
    const [finding] = await mechanical(documentId);
    const res = await post(
      authorCookie,
      `/sandbox-documents/${documentId}/findings/${finding!.id}/resolution`,
      { resolution: 'accepted' },
    );
    expect(res.status).toBe(200);
    const content = await contentOf(documentId);
    expect(content).toContain('The scheme delivers a 12% reduction');
    // the whole point: the correction is IN the sentence, not stuck on the end
    expect(content).not.toMatch(/reduction\.\n\nThe scheme$/);
    expect(content.split('\n')).toHaveLength(CONTENT.split('\n').length);
  });

  it('a drifted anchor degrades and never blocks — nothing written, finding stays open', async () => {
    const documentId = await draftDocument();
    const [finding] = await mechanical(documentId);
    // the head is mutable by design: somebody edits while the marks are up
    await db
      .update(s.sandboxDocuments)
      .set({ content: 'Rewritten entirely by hand.' })
      .where(eq(s.sandboxDocuments.id, documentId));

    const res = await post(
      authorCookie,
      `/sandbox-documents/${documentId}/findings/${finding!.id}/resolution`,
      { resolution: 'accepted' },
    );
    const body = (await res.json()) as ResolveFindingsResponse;
    expect(body.driftedAnchors).toEqual([finding!.id]);
    expect(body.applied).toEqual([]);
    expect(await contentOf(documentId)).toBe('Rewritten entirely by hand.');
    // the defect has not been dealt with, so the finding is still outstanding
    const [row] = await db.select().from(s.findings).where(eq(s.findings.id, finding!.id));
    expect(row!.status).toBe('open');
    // and no Signal was written: an acceptance that could not land resolved nothing
    const signals = await db
      .select()
      .from(s.signals)
      .where(eq(s.signals.suggestionId, row!.proposedRevisionId!));
    expect(signals).toHaveLength(0);
  });
});

describe('bulk acceptance is for MECHANICAL fixes only (ADR-0053 §6)', () => {
  it('accepts a group of mechanical fixes in one act', async () => {
    const documentId = await draftDocument();
    const [finding] = await mechanical(documentId);
    const res = await post(authorCookie, `/sandbox-documents/${documentId}/findings/bulk`, {
      action: 'accept',
      findingIds: [finding!.id],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ResolveFindingsResponse).applied).toEqual([finding!.id]);
    expect(await contentOf(documentId)).toContain('The scheme delivers');
  });

  it('🔒 refuses a batch containing a rewrite, and applies NOTHING', async () => {
    const documentId = await draftDocument();
    const [mech] = await mechanical(documentId);
    const [rew] = await rewrite(documentId);

    const res = await post(authorCookie, `/sandbox-documents/${documentId}/findings/bulk`, {
      action: 'accept',
      findingIds: [mech!.id, rew!.id],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toContain('one mark at a time');
    // whole, not half: a half-applied batch is a decision the reviewer never took
    expect(await contentOf(documentId)).toBe(CONTENT);
    const rows = await db
      .select()
      .from(s.findings)
      .where(eq(s.findings.sandboxDocumentId, documentId));
    expect(rows.every((row) => row.status === 'open')).toBe(true);
  });

  it('a rewrite is still acceptable ONE MARK AT A TIME', async () => {
    const documentId = await draftDocument();
    const [rew] = await rewrite(documentId);
    const res = await post(
      authorCookie,
      `/sandbox-documents/${documentId}/findings/${rew!.id}/resolution`,
      { resolution: 'accepted' },
    );
    expect(res.status).toBe(200);
    expect(await contentOf(documentId)).toContain('The scheme delivered a reduction.');
  });
});

describe('bulk dismissal takes anything, records no reason, and does not lift the gate', () => {
  it('dismisses a group without writing a reason or a Signal', async () => {
    const documentId = await draftDocument();
    const [mech] = await mechanical(documentId);
    const [rew] = await rewrite(documentId);

    const res = await post(authorCookie, `/sandbox-documents/${documentId}/findings/bulk`, {
      action: 'dismiss',
      findingIds: [mech!.id, rew!.id],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResolveFindingsResponse;
    expect(body.dismissed).toHaveLength(2);
    // dismissing changes no work product
    expect(await contentOf(documentId)).toBe(CONTENT);

    const rows = await db
      .select()
      .from(s.findings)
      .where(eq(s.findings.sandboxDocumentId, documentId));
    expect(rows.every((row) => row.status === 'closed')).toBe(true);
    // there is no column for a reason, deliberately — and the resolution names
    // who did it, which is what makes it an audit record
    expect(rows.every((row) => row.closedByParticipantId === authorParticipantId)).toBe(true);
    for (const row of rows) {
      const signals = await db
        .select()
        .from(s.signals)
        .where(eq(s.signals.suggestionId, row.proposedRevisionId!));
      expect(signals).toHaveLength(0);
    }
  });

  it('dismissal RESOLVES rather than overrides — the gate counts what is still open', async () => {
    const documentId = await draftDocument();
    const [mech] = await mechanical(documentId);
    const [rew] = await rewrite(documentId);
    const { countOpenFindings } = await import('./findings');

    expect((await countOpenFindings(db, documentId)).open).toBe(2);
    await post(authorCookie, `/sandbox-documents/${documentId}/findings/bulk`, {
      action: 'dismiss',
      findingIds: [mech!.id],
    });
    // one fewer, and the other still stops a promotion. ADR-0049 §7 is
    // unaffected in kind by HOW a finding was resolved.
    expect((await countOpenFindings(db, documentId)).open).toBe(1);
    expect((await countOpenFindings(db, documentId)).bySeverity.advisory).toBe(1);
    void rew;
  });
});

describe('the wall holds on the reviewer’s surface too (ADR-0048 §6, ADR-0053 §9)', () => {
  it('the whole draft is already org-private at the route, so the findings wall sits BEHIND that', async () => {
    const documentId = await draftDocument();
    await rewrite(documentId);
    await mechanical(documentId);

    expect(await list(documentId, authorCookie)).toHaveLength(2);
    // ⚠ Recorded rather than asserted-around: EVERY `/sandbox-documents/:id/*`
    // route runs `documentScope`, which is org-private on the document's own
    // organisation — so today the other organisation cannot reach the document
    // at all, share or no share, and this endpoint follows that established
    // posture rather than inventing a wider one. The finding-level wall is
    // therefore DEFENCE IN DEPTH here, and its own guarantee is proven at store
    // grain in findings.test.ts, where the read is exercised directly.
    const res = await app.request(`/sandbox-documents/${documentId}/findings`, {
      headers: { cookie: otherCookie },
    });
    expect(res.status).toBe(404);
  });

  it('a finding the requester cannot read cannot be resolved either', async () => {
    const documentId = await draftDocument();
    const [rew] = await rewrite(documentId);
    const res = await post(
      otherCookie,
      `/sandbox-documents/${documentId}/findings/${rew!.id}/resolution`,
      { resolution: 'dismissed' },
    );
    // 404 and not 403: denial and nonexistence read identically (principle 4)
    expect(res.status).toBe(404);
    const [row] = await db.select().from(s.findings).where(eq(s.findings.id, rew!.id));
    expect(row!.status).toBe('open');
  });
});

describe('the small refusals', () => {
  it('a finding with no proposed revision can be dismissed, not accepted', async () => {
    const documentId = await draftDocument();
    const [finding] = await writeFindings(db, {
      runId,
      sandboxDocumentId: documentId,
      findings: [
        {
          checkFamily: 'readability',
          anchor: at('Assessment'),
          defect: 'This section is denser than the rest of the draft.',
          severity: 'advisory',
          evidence: { input: 'draft', basis: 'the project’s grade-14 reading target' },
        },
      ],
    });
    const bad = await post(
      authorCookie,
      `/sandbox-documents/${documentId}/findings/${finding!.id}/resolution`,
      { resolution: 'accepted' },
    );
    expect(bad.status).toBe(400);
    const good = await post(
      authorCookie,
      `/sandbox-documents/${documentId}/findings/${finding!.id}/resolution`,
      { resolution: 'dismissed' },
    );
    expect(good.status).toBe(200);
  });

  it('a second resolution of the same mark is a conflict', async () => {
    const documentId = await draftDocument();
    const [finding] = await mechanical(documentId);
    const path = `/sandbox-documents/${documentId}/findings/${finding!.id}/resolution`;
    expect((await post(authorCookie, path, { resolution: 'dismissed' })).status).toBe(200);
    expect((await post(authorCookie, path, { resolution: 'dismissed' })).status).toBe(409);
  });

  it('`edited` requires the reviewer’s own wording, and the other two refuse it', async () => {
    const documentId = await draftDocument();
    const [finding] = await mechanical(documentId);
    const path = `/sandbox-documents/${documentId}/findings/${finding!.id}/resolution`;
    expect((await post(authorCookie, path, { resolution: 'edited' })).status).toBe(400);
    expect(
      (await post(authorCookie, path, { resolution: 'dismissed', editedContent: 'x' })).status,
    ).toBe(400);
    const res = await post(authorCookie, path, {
      resolution: 'edited',
      editedContent: 'The scheme',
    });
    expect(res.status).toBe(200);
    expect(await contentOf(documentId)).toContain('The scheme delivers');
  });
});
