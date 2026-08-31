// T-328 acceptance — ADR-0048's obligations pinned as SHAPES, following
// principles.test.ts's pattern: the guarantee is a type, so pin the type and
// make changing it a reviewable event rather than a silent drift.
//
// Every `@ts-expect-error` below is a real assertion: `pnpm run typecheck`
// covers this file, so a line that stops being an error fails the build. What
// is under test is that the DISHONEST OBJECT DOES NOT COMPILE — a checker that
// cites the firm's own rulebook cannot be written by accident, because the
// union on `input` gives it nowhere to put the citation.
import { describe, expect, it } from 'vitest';
import type { SandboxComment } from './endpoints';
import { classifyFix, MECHANICAL_SUMMARY_LIMIT } from './finding';
import type {
  Finding,
  FindingEvidence,
  FindingSeverity,
  FindingStatus,
  OpenFindingCount,
} from './finding';
import type { Locator } from './assembly';

type ExactUnion<T, U extends T> = [Exclude<T, U>] extends [never] ? true : false;

const anchor: Locator = {
  span: { start: 120, end: 184 },
  paragraph: 4,
  verbatim: 'The scheme delivers a 12% reduction in peak flow.',
};

const base = {
  id: 'f-1',
  runId: 'r-1',
  checkFamily: 'corpus_accuracy' as const,
  sandboxDocumentId: 'sd-1',
  anchor,
  defect: 'This paragraph asserts a 12% figure with no source in the library.',
  severity: 'required' as const,
  status: 'open' as const,
  closedBy: null,
  closedAt: null,
  createdAt: '2026-08-27T00:00:00.000Z',
};

describe('ADR-0048 §7 — three inputs, three honest treatments, one schema', () => {
  it('a corpus finding cites normally', () => {
    const finding: Finding = {
      ...base,
      evidence: {
        input: 'corpus',
        citations: [{ id: 'c-1', source: { versionId: 'v-1', documentReference: 'HOL-ENV-WQ-001' } }],
      },
    };
    expect(finding.evidence.input).toBe('corpus');
  });

  it('an attached document is quoted and never cited (ADR-0022)', () => {
    const finding: Finding = {
      ...base,
      evidence: { input: 'attached', attachedSourceId: 'as-1', excerpt: 'peak flow 9%' },
    };
    expect(finding.evidence.input).toBe('attached');
  });

  it('the rulebook is quoted VERBATIM and never cited (§5)', () => {
    const finding: Finding = {
      ...base,
      severity: 'advisory',
      evidence: {
        input: 'rulebook',
        clause: '§4.2',
        quote: 'Avoid the passive voice.',
        rulebookRef: 'ashcombe-drafting-manual',
        scope: 'organisation',
      },
    };
    expect(finding.evidence.input).toBe('rulebook');
  });

  it('a rulebook finding has NOWHERE to put a citation', () => {
    const evidence: FindingEvidence = {
      input: 'rulebook',
      clause: '§4.2',
      quote: 'Avoid the passive voice.',
      rulebookRef: 'ashcombe-drafting-manual',
      // @ts-expect-error — §5: quotable but never cited. This is the whole ruling.
      citations: [{ id: 'c-1', source: { versionId: 'v-1', documentReference: 'X' } }],
    };
    expect(evidence.input).toBe('rulebook');
  });

  it('an attached-source finding has nowhere to put a citation either', () => {
    const evidence: FindingEvidence = {
      input: 'attached',
      attachedSourceId: 'as-1',
      excerpt: 'peak flow 9%',
      // @ts-expect-error — ADR-0022: the working set never grounds and is never cited.
      citations: [{ id: 'c-1', source: { versionId: 'v-1', documentReference: 'X' } }],
    };
    expect(evidence.input).toBe('attached');
  });

  it('a corpus finding cannot smuggle a clause quote in beside its citations', () => {
    const evidence: FindingEvidence = {
      input: 'corpus',
      citations: [],
      // @ts-expect-error — the clause quote belongs to the rulebook treatment alone.
      clause: '§4.2',
    };
    expect(evidence.input).toBe('corpus');
  });
});

describe('ADR-0048 §2 — anchoring is not optional', () => {
  it('a finding without an anchor does not compile: a report is not a tool', () => {
    // @ts-expect-error — `anchor` is required, deliberately (§2).
    const finding: Finding = {
      id: base.id,
      runId: base.runId,
      sandboxDocumentId: base.sandboxDocumentId,
      defect: base.defect,
      severity: base.severity,
      status: base.status,
      closedBy: null,
      closedAt: null,
      createdAt: base.createdAt,
      evidence: { input: 'corpus', citations: [] },
    };
    expect(finding.defect.length).toBeGreaterThan(0);
  });

  it('the anchor is T-271’s locator grain, not a second anchor type', () => {
    const finding: Finding = { ...base, evidence: { input: 'corpus', citations: [] } };
    const span: { start: number; end: number } = finding.anchor.span;
    expect(span.end).toBeGreaterThan(span.start);
    // `page` is absent on a sandbox draft — there is no pagination to derive
    // one from, and an invented locator is worse than none (T-305).
    expect(finding.anchor.page).toBeUndefined();
  });
});

describe('ADR-0048 §3 — the checker may propose a fix and may never apply one', () => {
  it('a proposed revision is a Suggestion, so free text does not compile', () => {
    const finding: Finding = {
      ...base,
      evidence: { input: 'corpus', citations: [] },
      // @ts-expect-error — a fix rides the accept/edit/reject path or it does
      // not exist; free text would be a write path the drafting side lacks.
      proposedRevision: 'Rewrite the sentence in the active voice.',
    };
    expect(finding.proposedRevision).toBeDefined();
  });

  it('absent is the normal case — most findings are for a person to fix', () => {
    const finding: Finding = { ...base, evidence: { input: 'corpus', citations: [] } };
    expect(finding.proposedRevision).toBeUndefined();
  });
});

describe('severity — T-328’s call, pinned so a third level is argued for', () => {
  it('is exactly two levels', () => {
    const vocabulary: ExactUnion<FindingSeverity, 'required' | 'advisory'> = true;
    expect(vocabulary).toBe(true);
  });

  it('carries no word that reads as a verdict on the document', () => {
    // `critical`/`major`/`minor` grade the draft; a finding states a defect and
    // never a verdict (§3, component 6 §6). The refusal is the point.
    const severities: FindingSeverity[] = ['required', 'advisory'];
    expect(severities).not.toContain('critical' as unknown as FindingSeverity);
  });

  it('is not per-organisation configurable — no organisation id reaches it', () => {
    const finding: Finding = { ...base, evidence: { input: 'corpus', citations: [] } };
    expect(Object.keys(finding)).not.toContain('organisationId');
  });
});

describe('ADR-0049 §7 — findings and threads are counted identically', () => {
  it('the status vocabulary IS the sandbox comment’s, word for word', () => {
    // Two words for one state is how "why does this list stop me and that one
    // not" starts needing an answer. §7 exists to make that question absurd.
    const identical: ExactUnion<FindingStatus, SandboxComment['status']> = true;
    const reverse: ExactUnion<SandboxComment['status'], FindingStatus> = true;
    expect(identical && reverse).toBe(true);
  });

  it('closing is attributed, like a thread’s', () => {
    const finding: Finding = {
      ...base,
      evidence: { input: 'corpus', citations: [] },
      status: 'closed',
      closedBy: { participantId: 'p-1', name: 'Iris' },
      closedAt: '2026-08-27T09:00:00.000Z',
    };
    expect(finding.closedBy?.name).toBe('Iris');
  });

  it('the promotion gate counts open, and severity gates nothing', () => {
    const count: OpenFindingCount = { open: 3, bySeverity: { required: 2, advisory: 1 } };
    // every open finding blocks (ADR-0049 §7, against the recommendation to
    // warn); the breakdown says how much is outstanding, never what is optional
    expect(count.open).toBe(count.bySeverity.required + count.bySeverity.advisory);
  });
});

// ── T-398 — the mechanical/rewrite test, which is CODE ──────────────────────
//
// ADR-0053 §6 permits bulk acceptance for mechanical fixes only, and the whole
// safety of that narrowing rests on the classification being structural rather
// than a field the model fills in. So these cases are the guard: each one is a
// fix a model would plausibly call "a simple consistency change", and three of
// them are not.
describe('classifyFix (T-398, ADR-0053 §6)', () => {
  it("THE CASE THE RULE EXISTS FOR: one substitution, applied everywhere, in one line", () => {
    const original = 'The Scheme was assessed. The Scheme is in Bedford. The Scheme continues.';
    const fix = classifyFix(original, original.split('Scheme').join('scheme'));
    expect(fix.kind).toBe('mechanical');
    if (fix.kind !== 'mechanical') throw new Error('unreachable');
    expect(fix.find).toBe('Scheme');
    expect(fix.replace).toBe('scheme');
    expect(fix.occurrences).toBe(3);
    // the one line a reviewer reads before taking the whole decision at once
    expect(fix.summary).toBe('Scheme → scheme, 3 places');
  });

  it('THE CASE IT EXISTS TO STOP: fifty-five rewritten sentences are not one decision', () => {
    // "avoid the passive voice" — each sentence is rewritten differently, so no
    // single substitution reproduces the proposal, and this is precisely what
    // would otherwise ride in behind an accept-all
    const fix = classifyFix(
      'The survey was carried out by the team. The report was written by Ada.',
      'The team carried out the survey. Ada wrote the report.',
    );
    expect(fix.kind).toBe('rewrite');
  });

  it('a whole sentence replaced by another sentence is a REWRITE, not a substitution', () => {
    // the reordering that makes it prose is exactly what stops one substitution
    // reproducing it; where a sentence IS swapped wholesale the one-line cap is
    // what catches it instead (the last case in this block)
    const fix = classifyFix(
      'The ground investigation recorded contamination at three of the trial pits.',
      'Contamination was recorded at three trial pits during the ground investigation.',
    );
    expect(fix.kind).toBe('rewrite');
  });

  it('two unrelated edits in one revision are two decisions, and not bulk-acceptable', () => {
    const fix = classifyFix(
      'The Scheme was assessed in 2019 by the Applicant.',
      'The scheme was assessed in 2021 by the Applicant.',
    );
    expect(fix.kind).toBe('rewrite');
  });

  it('a pure insertion has nothing to find, so it cannot be applied anywhere else', () => {
    const fix = classifyFix(
      'Contamination was recorded.',
      'Contamination was recorded. It was found at three pits.',
    );
    expect(fix.kind).toBe('rewrite');
    if (fix.kind !== 'rewrite') throw new Error('unreachable');
    expect(fix.reason).toContain('inserts');
  });

  it('a proposal that changes nothing is not a fix at all', () => {
    expect(classifyFix('unchanged', 'unchanged').kind).toBe('rewrite');
  });

  it('a single-occurrence substitution IS mechanical, and says "1 place"', () => {
    // one occurrence is still one decision applied consistently; the count is
    // there to tell the reviewer the SIZE of what they are accepting, not to
    // set a threshold
    const fix = classifyFix('Use SI units throughout.', 'Use metric units throughout.');
    expect(fix.kind).toBe('mechanical');
    if (fix.kind !== 'mechanical') throw new Error('unreachable');
    expect(fix.summary).toBe('SI → metric, 1 place');
  });

  it('the one-line cap catches the substitution that is really prose', () => {
    // a term swapped for a phrase nobody could read at a glance: it IS one
    // substitution applied consistently, and it is still not something a
    // reviewer can take fifty-five of on one click
    const long = 'x'.repeat(MECHANICAL_SUMMARY_LIMIT);
    const fix = classifyFix(`a ${long} b`, `a ${long}${long} b`);
    expect(fix.kind).toBe('rewrite');
    if (fix.kind !== 'rewrite') throw new Error('unreachable');
    expect(fix.reason).toContain('one line');
  });
});
