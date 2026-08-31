// T-310 acceptance — the findings store: what it keeps, who may read it, and
// the seam it closes.
//
// **The wall tests are the ones that carry the ticket.** ADR-0048 §6 makes a
// quoted rulebook clause org-private, and ADR-0053 §9 then makes a quoted
// PROJECT STYLE GUIDE clause not private, because the posture belongs to the
// source's scope rather than to the word "rulebook". A build that got that
// backwards would leak a competitor's internal drafting standards through a
// review comment — an ethical-wall breach delivered by a feature nobody thinks
// of as crossing the wall — and would pass every happy-path test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DraftFinding } from '@infora/capabilities';
import { createDb, schema as s } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { countOpenFindings, listFindings, writeFindings } from './findings';
import { countOpenItems, hasOpenItems } from './open-items';

const { db, pool } = createDb();
const stamp = Date.now();

let projectId: string;
let orgA: string;
let orgB: string;
let sliceA: EntitledSlice;
let sliceB: EntitledSlice;
let documentId: string;
let runId: string;
let firmRulebookId: string;
let styleGuideId: string;

const CONTENT = [
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading.',
].join('\n');

const anchor = {
  span: { start: CONTENT.indexOf('The Scheme'), end: CONTENT.indexOf('The Scheme') + 10 },
  paragraph: 2,
  verbatim: 'The Scheme',
};

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: `t310 owner ${stamp}` }).returning();
  const [b] = await db.insert(s.organisations).values({ name: `t310 producer ${stamp}` }).returning();
  orgA = a!.id;
  orgB = b!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t310 project ${stamp}`, ownerOrganisationId: orgA })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: orgB, projectId, role: 'member' },
  ]);

  const users = await db
    .insert(s.users)
    .values([
      { name: 't310-orla', email: `t310-orla-${stamp}@test.local`, organisationId: orgA },
      { name: 't310-eleanor', email: `t310-eleanor-${stamp}@test.local`, organisationId: orgB },
    ])
    .returning();
  const participants = await db
    .insert(s.participants)
    .values([
      { userId: users[0]!.id, projectId },
      { userId: users[1]!.id, projectId },
    ])
    .returning();
  sliceA = { projectId, organisationId: orgA, participantId: participants[0]!.id } as EntitledSlice;
  sliceB = { projectId, organisationId: orgB, participantId: participants[1]!.id } as EntitledSlice;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: `t310 area ${stamp}`,
      scope: 'single_org',
      owningOrganisationId: orgB,
      createdByParticipantId: participants[1]!.id,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: orgB,
      sandboxId: sandbox!.id,
      title: `t310 draft ${stamp}`,
      content: CONTENT,
      createdByParticipantId: participants[1]!.id,
    })
    .returning();
  documentId = document!.id;

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
      requesterParticipantId: participants[1]!.id,
    })
    .returning();
  runId = run!.id;

  // Org B's own drafting manual, and the project owner's style guide
  const [rulebook] = await db
    .insert(s.rulebooks)
    .values({
      organisationId: orgB,
      title: 'Ashcombe Drafting Manual',
      sourceFormat: 'docx',
      loadedByUserId: users[1]!.id,
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

const draft = (over: Partial<DraftFinding> = {}): DraftFinding => ({
  checkFamily: 'corpus_accuracy',
  anchor,
  defect: 'The record gives 9% where this says 12%.',
  severity: 'required',
  evidence: { input: 'corpus', citations: [] },
  ...over,
});

describe('a run’s findings are written, with the fix riding the Suggestion path', () => {
  it('stores each finding and hands it back', async () => {
    const written = await writeFindings(db, {
      runId,
      sandboxDocumentId: documentId,
      findings: [draft()],
    });
    expect(written).toHaveLength(1);
    expect(written[0]!.status).toBe('open');
    expect(written[0]!.closedBy).toBeNull();
    expect(written[0]!.checkFamily).toBe('corpus_accuracy');
  });

  it('a proposed fix becomes a Suggestion, and classifyFix decides whether it may be bulk-accepted', async () => {
    const written = await writeFindings(db, {
      runId,
      sandboxDocumentId: documentId,
      findings: [
        draft({
          checkFamily: 'style',
          evidence: {
            input: 'rulebook',
            clause: '§2.1',
            quote: 'Refer to the works as “the scheme”.',
            rulebookRef: styleGuideId,
            scope: 'project',
          },
          replacement: 'The scheme',
        }),
      ],
    });
    const [row] = await db.select().from(s.findings).where(eq(s.findings.id, written[0]!.id));
    expect(row!.proposedRevisionId).not.toBeNull();
    // one consistent substitution, statable in one line: the bulk lane
    expect(row!.fix).toEqual({
      kind: 'mechanical',
      find: 'Scheme',
      replace: 'scheme',
      occurrences: 1,
      summary: 'Scheme → scheme, 1 place',
    });

    const [suggestion] = await db
      .select()
      .from(s.suggestions)
      .where(eq(s.suggestions.id, row!.proposedRevisionId!));
    // ADR-0048 §3 — the checker gains no write path the drafting side lacks
    expect(suggestion!.kind).toBe('replace');
    expect(suggestion!.content).toBe('The scheme');
    expect(suggestion!.runId).toBe(runId);
  });

  it('a rewrite never reaches the bulk lane, whatever the model would have called it', async () => {
    const written = await writeFindings(db, {
      runId,
      sandboxDocumentId: documentId,
      findings: [
        draft({
          checkFamily: 'style',
          evidence: {
            input: 'rulebook',
            clause: '§4.2',
            quote: 'Avoid the passive voice.',
            rulebookRef: firmRulebookId,
            scope: 'organisation',
          },
          replacement: 'A twelve per cent reduction is delivered by it',
        }),
      ],
    });
    const [row] = await db.select().from(s.findings).where(eq(s.findings.id, written[0]!.id));
    expect((row!.fix as { kind: string }).kind).toBe('rewrite');
  });

  it('the store refuses a fix with no revision behind it, and a closed finding with nobody’s name on it', async () => {
    await expect(
      db.insert(s.findings).values({
        runId,
        sandboxDocumentId: documentId,
        checkFamily: 'style',
        input: 'draft',
        evidence: { input: 'draft', basis: 'x' },
        anchor,
        defect: 'x',
        severity: 'advisory',
        fix: { kind: 'rewrite', reason: 'x' },
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(s.findings).values({
        runId,
        sandboxDocumentId: documentId,
        checkFamily: 'style',
        input: 'draft',
        evidence: { input: 'draft', basis: 'x' },
        anchor,
        defect: 'x',
        severity: 'advisory',
        status: 'closed',
      }),
    ).rejects.toThrow();
  });

  it('the store refuses a row whose input column and evidence disagree', async () => {
    await expect(
      db.insert(s.findings).values({
        runId,
        sandboxDocumentId: documentId,
        checkFamily: 'style',
        input: 'corpus',
        evidence: { input: 'rulebook', clause: '§1', quote: 'x', rulebookRef: 'r', scope: 'project' },
        anchor,
        defect: 'x',
        severity: 'advisory',
      }),
    ).rejects.toThrow();
  });
});

describe('the wall is enforced in the READ (ADR-0048 §6, ADR-0053 §9)', () => {
  it('a quoted FIRM rulebook clause never reaches another organisation', async () => {
    const mine = await listFindings(db, sliceB, documentId);
    const theirs = await listFindings(db, sliceA, documentId);

    const quotesFirmRule = (findings: Awaited<ReturnType<typeof listFindings>>) =>
      findings.some(
        (finding) =>
          finding.evidence.input === 'rulebook' && finding.evidence.rulebookRef === firmRulebookId,
      );

    expect(quotesFirmRule(mine)).toBe(true);
    // absent, not redacted: a blanked finding still tells the other firm that
    // a rule of ours has something to say about this paragraph
    expect(quotesFirmRule(theirs)).toBe(false);
  });

  it('a quoted PROJECT style guide clause reaches everybody on the project', async () => {
    const theirs = await listFindings(db, sliceA, documentId);
    expect(
      theirs.some(
        (finding) =>
          finding.evidence.input === 'rulebook' && finding.evidence.rulebookRef === styleGuideId,
      ),
    ).toBe(true);
  });

  it('fails CLOSED on a rulebook reference that no longer resolves', async () => {
    await writeFindings(db, {
      runId,
      sandboxDocumentId: documentId,
      findings: [
        draft({
          checkFamily: 'style',
          evidence: {
            input: 'rulebook',
            clause: '§9',
            quote: 'A rule from a manual nobody can find.',
            rulebookRef: '00000000-0000-0000-0000-000000000000',
            scope: 'organisation',
          },
        }),
      ],
    });
    for (const slice of [sliceA, sliceB]) {
      const visible = await listFindings(db, slice, documentId);
      expect(visible.some((finding) => finding.defect.includes('nobody can find'))).toBe(false);
    }
  });
});

describe('the promotion gate’s seam is closed (T-332, ADR-0049 §7)', () => {
  it('counts the open findings this document really has, by severity', async () => {
    const count = await countOpenFindings(db, documentId);
    const rows = await db.select().from(s.findings).where(eq(s.findings.sandboxDocumentId, documentId));
    const open = rows.filter((row) => row.status === 'open');
    expect(count.open).toBe(open.length);
    expect(count.bySeverity.required + count.bySeverity.advisory).toBe(count.open);
    expect(count.open).toBeGreaterThan(0);
  });

  it('an open finding is a loose end, exactly as an open thread is', async () => {
    const items = await countOpenItems(db, documentId);
    expect(items.findings.open).toBeGreaterThan(0);
    expect(hasOpenItems(items)).toBe(true);
  });

  it('a document with no findings still counts zero — T-332’s empty case, unbroken', async () => {
    const [other] = await db
      .select({ id: s.sandboxDocuments.id })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.projectId, projectId))
      .limit(1);
    void other;
    const empty = await countOpenFindings(db, '00000000-0000-0000-0000-000000000000');
    expect(empty).toEqual({ open: 0, bySeverity: { required: 0, advisory: 0 } });
  });

  it('closing a finding clears it from the count, and records who and when', async () => {
    const rows = await db
      .select()
      .from(s.findings)
      .where(eq(s.findings.sandboxDocumentId, documentId));
    const before = await countOpenFindings(db, documentId);
    await db
      .update(s.findings)
      .set({
        status: 'closed',
        closedByParticipantId: sliceB.participantId,
        closedAt: new Date(),
      })
      .where(eq(s.findings.id, rows[0]!.id));
    const after = await countOpenFindings(db, documentId);
    expect(after.open).toBe(before.open - 1);

    const visible = await listFindings(db, sliceB, documentId);
    const closed = visible.find((finding) => finding.id === rows[0]!.id);
    expect(closed!.status).toBe('closed');
    expect(closed!.closedBy?.participantId).toBe(sliceB.participantId);
    expect(closed!.closedBy?.name).toBe('t310-eleanor');
    expect(closed!.closedAt).not.toBeNull();
  });
});

describe('the store is per run of one document, and knows nothing across runs', () => {
  it('a second run’s findings sit beside the first’s, with no dedupe and no carry-over', async () => {
    const [conversation] = await db
      .insert(s.conversations)
      .values({ projectId, surface: 'web' })
      .returning();
    const [second] = await db
      .insert(s.runs)
      .values({
        conversationId: conversation!.id,
        agentId: 'infora.qa_checker',
        agentProvenance: 'infora',
        request: 'check it again',
        environmentKey: projectId,
        requesterParticipantId: sliceB.participantId,
      })
      .returning();

    const identical = draft({ defect: 'The record gives 9% where this says 12%.' });
    await writeFindings(db, {
      runId: second!.id,
      sandboxDocumentId: documentId,
      findings: [identical],
    });

    const visible = await listFindings(db, sliceB, documentId);
    const same = visible.filter((finding) => finding.defect === identical.defect);
    // TWO rows, deliberately. Whether a re-raised finding should be recognised
    // as the one dismissed last week is ADR-0048's open lifecycle question
    // (ADR-0053 §13) and is NOT answered here.
    expect(same.length).toBeGreaterThanOrEqual(2);
    expect(new Set(same.map((finding) => finding.runId)).size).toBeGreaterThanOrEqual(2);
  });
});
