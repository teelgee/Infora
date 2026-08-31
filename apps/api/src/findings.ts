// T-310 — THE FINDINGS STORE: writing what a check run found, reading it back
// behind the wall, and counting what is still open.
//
// *In plain terms: the checker produces a list of problems in a draft. This
// writes them down, hands them back to the people entitled to see them, and
// answers the one question promotion asks — is anything still outstanding?
// Until this file, that last question was answered by a function that always
// said "nothing", because there was nowhere for a finding to live.*
//
// 🔒 **THE WALL IS ENFORCED IN THE READ, NOT IN THE RENDER** (ADR-0048 §6,
// ADR-0053 §9). A finding quoting **Org B's** rulebook must never appear on a
// surface **Org A** reads — leaking a competitor's internal drafting standards
// through a review comment is an ethical-wall breach delivered by a feature
// nobody thinks of as crossing the wall. So the predicate is here, in the
// server, on the same read that fetches the row; a surface that forgot to hide
// it would still never be handed it.
//
// **And the two style sources differ**, which is the whole reason the evidence
// carries a scope. A quoted **project style guide** clause is not private: it
// binds every organisation on the project and quoting it across the wall is the
// point of it. Privacy is a property of the source's **scope**, never of the
// word "rulebook".
//
// 🔒 **PER RUN OF ONE DOCUMENT, AND NOTHING ACROSS RUNS.** Nothing here reads
// the previous run's findings, dedupes against them, or carries a dismissal
// forward. That is ADR-0048's own open lifecycle question — given a driver by
// ADR-0053 §13 and deliberately not ruled — and building the carry-over here
// would be answering it in code.
import { and, eq, inArray } from 'drizzle-orm';
import { classifyFix } from '@infora/contracts';
import type {
  Finding,
  FindingEvidence,
  Fix,
  Id,
  Locator,
  OpenFindingCount,
  Suggestion,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import type { DraftFinding } from '@infora/capabilities';

/**
 * Write one run's findings, with their proposed fixes as **Suggestions**.
 *
 * ADR-0048 §3 is the load-bearing part and it is why this does not store free
 * text: a proposed revision enters the accept/edit/reject Suggestion path that
 * already exists, is already audited, is already reversible and already
 * produces Signals — so the checker acquires **no write path the drafting side
 * lacks**, and every change to a deliverable stays a human act.
 *
 * 🔒 **`classifyFix` RUNS HERE, AT THE ADMISSION BOUNDARY, AND NOTHING ELSE MAY
 * SET `fix`** (ADR-0053 §6, T-398). The model proposes a replacement; the
 * structural test decides whether that replacement may ever appear under an
 * accept-all. A field the model filled in would let *"avoid the passive voice"*
 * ride fifty-five rewritten sentences in behind one button, which is precisely
 * what ADR-0048 §3 exists to prevent.
 */
export async function writeFindings(
  db: Db,
  input: { runId: Id; sandboxDocumentId: Id; findings: readonly DraftFinding[] },
): Promise<Finding[]> {
  if (input.findings.length === 0) return [];

  const written: Finding[] = [];
  for (const draft of input.findings) {
    let proposedRevisionId: Id | null = null;
    let fix: Fix | null = null;
    if (draft.replacement !== undefined && draft.replacement !== '') {
      fix = classifyFix(draft.anchor.verbatim, draft.replacement);
      const [suggestion] = await db
        .insert(s.suggestions)
        .values({
          runId: input.runId,
          sandboxDocumentId: input.sandboxDocumentId,
          kind: 'replace',
          // the Suggestion's own anchor is the advisory quoted span it has
          // always been (T-112's pattern); the finding carries the offset-grade
          // one, which is what the mark is drawn from
          anchor: { quote: draft.anchor.verbatim },
          content: draft.replacement,
          rationale: draft.defect,
        })
        .returning({ id: s.suggestions.id });
      proposedRevisionId = (suggestion?.id ?? null) as Id | null;
    }

    const [row] = await db
      .insert(s.findings)
      .values({
        runId: input.runId,
        sandboxDocumentId: input.sandboxDocumentId,
        checkFamily: draft.checkFamily,
        input: draft.evidence.input,
        evidence: draft.evidence,
        anchor: draft.anchor,
        defect: draft.defect,
        severity: draft.severity,
        proposedRevisionId,
        fix,
      })
      .returning();
    if (row === undefined) continue;
    written.push(toFinding(row, null, null));
  }
  return written;
}

/**
 * One document's findings, as the requester is entitled to see them.
 *
 * **Assembled, not filtered** in the sense that matters here: a finding the
 * requester may not see is **absent** from the result, never returned with its
 * quote blanked. A redacted finding still tells Org A that Org B's manual has
 * a rule about this paragraph, which is most of what the rule was protecting.
 */
export async function listFindings(
  db: Db,
  slice: EntitledSlice,
  sandboxDocumentId: string,
): Promise<Finding[]> {
  const rows = await db
    .select()
    .from(s.findings)
    .where(eq(s.findings.sandboxDocumentId, sandboxDocumentId));
  if (rows.length === 0) return [];

  const readable = await readableRows(db, slice, rows);

  // the names the surface shows for a resolution, resolved in one query rather
  // than per row
  const closers = readable
    .map((row) => row.closedByParticipantId)
    .filter((id): id is string => id !== null);
  const names = closers.length === 0 ? new Map() : await namesOf(db, closers);

  const suggestionIds = readable
    .map((row) => row.proposedRevisionId)
    .filter((id): id is string => id !== null);
  const suggestions =
    suggestionIds.length === 0 ? new Map<string, Suggestion>() : await suggestionsOf(db, suggestionIds);

  return readable.map((row) =>
    toFinding(
      row,
      row.closedByParticipantId === null ? null : names.get(row.closedByParticipantId) ?? null,
      row.proposedRevisionId === null ? null : suggestions.get(row.proposedRevisionId) ?? null,
    ),
  );
}

type FindingRow = typeof s.findings.$inferSelect;

/**
 * THE WALL PREDICATE (ADR-0048 §6, ADR-0053 §9).
 *
 * Only rows quoting an **organisation-scoped** rulebook are ever withheld, and
 * a row is withheld unless the requester's own organisation owns that rulebook.
 * The owning organisation is read from `rulebooks` rather than copied onto the
 * finding, so the wall has **one answer** to "whose is this" — the store's — and
 * a stale copy cannot open a gap.
 *
 * A row naming a rulebook the requester's organisation does not own, or one
 * that no longer resolves at all, is withheld. **Failing closed is the only
 * safe direction**: an unresolvable reference is not evidence that the clause
 * was shareable.
 */
async function readableRows(
  db: Db,
  slice: EntitledSlice,
  rows: readonly FindingRow[],
): Promise<FindingRow[]> {
  const private_ = rows.filter((row) => scopeOf(row) === 'organisation');
  if (private_.length === 0) return [...rows];

  const refs = [...new Set(private_.map((row) => rulebookRefOf(row)).filter((ref) => ref !== ''))];
  const owned =
    refs.length === 0
      ? []
      : await db
          .select({ id: s.rulebooks.id })
          .from(s.rulebooks)
          .where(
            and(
              inArray(s.rulebooks.id, refs),
              eq(s.rulebooks.organisationId, slice.organisationId),
            ),
          );
  const mine = new Set(owned.map((rulebook) => rulebook.id));
  return rows.filter((row) => scopeOf(row) !== 'organisation' || mine.has(rulebookRefOf(row)));
}

function evidenceOf(row: FindingRow): FindingEvidence {
  return row.evidence as FindingEvidence;
}

function scopeOf(row: FindingRow): string | null {
  const evidence = evidenceOf(row);
  return evidence.input === 'rulebook' ? evidence.scope : null;
}

function rulebookRefOf(row: FindingRow): string {
  const evidence = evidenceOf(row);
  return evidence.input === 'rulebook' ? evidence.rulebookRef : '';
}

/**
 * The findings half of T-332's count, **and this is the seam being closed**.
 *
 * T-332 built the promotion gate over both lists with this body returning a
 * structural zero, and said so in a comment rather than hiding it, precisely so
 * that the ticket landing the store would change one body and no caller. That
 * is what has happened: the signature is the one T-332 wrote, its empty-case
 * test still asserts zero on a document with no findings, and nothing in the
 * promotion path changed.
 *
 * **No wall predicate here, deliberately, and the reason is who asks.**
 * Promotion is an act of the organisation whose sandbox the draft is in, over
 * its own document; the gate is a count of what is outstanding on that
 * document, at the grain ADR-0049 §7 takes it. Hiding a row from the count
 * would let an unreadable finding block a promotion nobody could clear, which
 * is worse than either behaviour it was chosen between.
 */
export async function countOpenFindings(
  db: Db,
  sandboxDocumentId: string,
): Promise<OpenFindingCount> {
  const rows = await db
    .select({ severity: s.findings.severity })
    .from(s.findings)
    .where(
      and(
        eq(s.findings.sandboxDocumentId, sandboxDocumentId),
        eq(s.findings.status, 'open'),
      ),
    );
  const bySeverity = { required: 0, advisory: 0 };
  for (const row of rows) bySeverity[row.severity] += 1;
  return { open: rows.length, bySeverity };
}

async function namesOf(db: Db, participantIds: readonly string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ participantId: s.participants.id, name: s.users.name })
    .from(s.participants)
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(inArray(s.participants.id, [...participantIds]));
  return new Map(rows.map((row) => [row.participantId, row.name]));
}

async function suggestionsOf(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, Suggestion>> {
  const rows = await db
    .select()
    .from(s.suggestions)
    .where(inArray(s.suggestions.id, [...ids]));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id as Id,
        runId: row.runId as Id,
        workItemId: (row.workItemId ?? null) as Id | null,
        sandboxDocumentId: row.sandboxDocumentId as Id,
        kind: row.kind,
        ...(row.anchor !== null && { anchor: row.anchor as { quote: string } }),
        content: row.content,
        rationale: row.rationale,
        citations: [],
      } satisfies Suggestion,
    ]),
  );
}

function toFinding(row: FindingRow, closerName: string | null, suggestion: Suggestion | null): Finding {
  return {
    id: row.id as Id,
    runId: row.runId as Id,
    checkFamily: row.checkFamily,
    sandboxDocumentId: row.sandboxDocumentId as Id,
    anchor: row.anchor as Locator,
    defect: row.defect,
    severity: row.severity,
    evidence: evidenceOf(row),
    ...(suggestion !== null && { proposedRevision: suggestion }),
    ...(row.fix !== null && { fix: row.fix as Fix }),
    status: row.status,
    closedBy:
      row.closedByParticipantId === null
        ? null
        : { participantId: row.closedByParticipantId as Id, name: closerName ?? 'a colleague' },
    closedAt: row.closedAt === null ? null : row.closedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
