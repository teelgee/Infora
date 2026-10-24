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
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
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
import { readCurrencies, readDocumentGrounding } from '@infora/knowledge';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { readableDocumentIds } from './working-set';
import { staleGroundingCheck } from '@infora/capabilities';
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

  const found = await withCurrency(
    db,
    readable.map((row) =>
      toFinding(
        row,
        row.closedByParticipantId === null ? null : names.get(row.closedByParticipantId) ?? null,
        row.proposedRevisionId === null ? null : suggestions.get(row.proposedRevisionId) ?? null,
      ),
    ),
  );

  // T-471 — a finding that quotes an attached draft carries that draft's title
  // and up to 4,000 characters of it. Show them only to a reader who is in the
  // working area the draft sits in (ADR-0022's addendum, ruling 5); everyone
  // else keeps the finding and loses the quote and the id.
  const attachedIds = found.flatMap((finding) =>
    finding.evidence.input === 'attached' ? [finding.evidence.attachedSourceId] : [],
  );
  if (attachedIds.length === 0) return found;
  const mayRead = await readableDocumentIds(db, slice, attachedIds);
  return found.map((finding) =>
    finding.evidence.input === 'attached' && !mayRead.has(finding.evidence.attachedSourceId)
      ? { ...finding, evidence: { input: 'attached' as const, attachedSourceId: '' as Id, excerpt: '', hidden: true as const } }
      : finding,
  );
}

type FindingRow = typeof s.findings.$inferSelect;

/**
 * T-473 — a finding's citations carry the cited document's currency AS OF THIS
 * READ, like every other citation (never stored: it changes after the check).
 */
async function withCurrency(db: Db, findings: Finding[]): Promise<Finding[]> {
  const versionIds = [
    ...new Set(
      findings.flatMap((f) =>
        f.evidence.input === 'corpus'
          ? f.evidence.citations.flatMap((c) => ('versionId' in c.source ? [c.source.versionId] : []))
          : [],
      ),
    ),
  ];
  if (versionIds.length === 0) return findings;
  const homes = await db
    .select({ versionId: s.versions.id, containerId: s.versions.containerId })
    .from(s.versions)
    .where(inArray(s.versions.id, versionIds));
  const containerOf = new Map(homes.map((h) => [h.versionId, h.containerId]));
  const currencies = await readCurrencies(db, [...containerOf.values()]);
  return findings.map((f) => {
    if (f.evidence.input !== 'corpus') return f;
    return {
      ...f,
      evidence: {
        ...f.evidence,
        citations: f.evidence.citations.map((c) => {
          const bare = { ...c };
          delete bare.currency; // never trust a stored copy: it is read fresh, below
          const now = 'versionId' in c.source ? currencies.get(containerOf.get(c.source.versionId) ?? '') : undefined;
          return now === null || now === undefined ? bare : { ...bare, currency: now };
        }),
      },
    };
  });
}

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

// ── T-311 — THE MARKED-UP EDIT, over HTTP ───────────────────────────────────
//
// *In plain terms: the reviewer's side. Read the marks on a draft, take one
// suggested correction or set it aside, and — where the corrections are the
// same small change made over and over — take a whole group in one click.*
//
// **Two views of ONE set** (ADR-0053 §6, the owner's own sketch): the document
// with marks anchored into the text, and a panel grouped by check that unrolls
// to its findings. There is one endpoint behind both, deliberately — a second
// read for the panel would be a second answer to *"what did the checker find"*,
// and the two would eventually disagree about which marks exist.
//
// 🔒 **THE MECHANICAL/REWRITE SPLIT IS ENFORCED HERE, NOT ON THE SCREEN.** The
// surface renders the accept-all above a group's mechanical fixes and withholds
// it from its rewrites, and that is the honest fact being SHOWN — but a client
// that sent a rewrite in a bulk batch anyway would be sending the exact request
// ADR-0048 §3 exists to refuse. So the server checks every id first and refuses
// the batch **whole**: a half-applied batch is a decision the reviewer never
// took, landing on the half nobody looked at.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bulkResolveFindingsBody, resolveFindingBody } from '@infora/contracts';
import type {
  ApiError,
  ListFindingsResponse,
  ResolveFindingsResponse,
  RunReach,
  StaleGroundingResponse,
} from '@infora/contracts';
import { resolveSuggestion } from '@infora/orchestration';
import { resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

export function findingRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const documentScope = resourceScope(deps, 'id', resourceHomes.sandboxDocument);

  // T-474 — the same stale-grounding comparison the checker stores as a finding,
  // run NOW against the library as it stands. Unstored on purpose: a stored
  // finding is a run record (findings.run_id is not null) and this is no run, so
  // the author sees an out-of-date source the moment it happens without anyone
  // having to run the checker. The route sits behind the document's own scope —
  // only a person who can open the draft can read what it rests on.
  app.get('/sandbox-documents/:id/stale-grounding', documentScope, async (c) => {
    const grounding = await readDocumentGrounding(deps.db, c.req.param('id'));
    if (grounding === null) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    const result = staleGroundingCheck(grounding);
    return c.json({
      computedAt: new Date().toISOString(),
      claimsChecked: result.claimsChecked,
      items: result.items,
    } satisfies StaleGroundingResponse);
  });

  /**
   * One document's marks, as this requester is entitled to see them.
   *
   * The wall predicate lives in `listFindings` above, on the same read that
   * fetches the row — so a surface that forgot to hide an org-private quote
   * would still never be handed one.
   */
  app.get('/sandbox-documents/:id/findings', documentScope, async (c) => {
    const slice = c.get('slice');
    const items = await listFindings(deps.db, slice, c.req.param('id'));
    // T-470 — what the newest check run behind these findings reached, for the
    // panel's header. Only a run THIS requester made: its counts were taken
    // under the maker's own visibility, so another person's are not theirs to see.
    const runIds = [...new Set(items.map((item) => item.runId))];
    let reach: RunReach | null = null;
    if (runIds.length > 0) {
      const [newest] = await deps.db
        .select({ reach: s.runs.reach })
        .from(s.runs)
        .where(
          and(
            inArray(s.runs.id, runIds),
            eq(s.runs.requesterParticipantId, slice.participantId),
            isNotNull(s.runs.reach),
          ),
        )
        .orderBy(desc(s.runs.startedAt))
        .limit(1);
      reach = (newest?.reach as RunReach | null | undefined) ?? null;
    }
    return c.json({ items, reach } satisfies ListFindingsResponse);
  });

  /**
   * One mark, taken or set aside.
   *
   * `accepted` / `edited` require a proposed revision to resolve; `dismissed`
   * needs none, and most findings have none — most are for a person to fix.
   */
  app.post('/sandbox-documents/:id/findings/:findingId/resolution', documentScope, async (c) => {
    const body = resolveFindingBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c, 'resolution is accepted, edited or dismissed');
    if ((body.data.resolution === 'edited') !== (body.data.editedContent !== undefined)) {
      return invalid(c, 'editedContent is required for `edited` and refused otherwise');
    }
    const documentId = c.req.param('id');
    const [row] = await deps.db
      .select()
      .from(s.findings)
      .where(
        and(eq(s.findings.id, c.req.param('findingId')), eq(s.findings.sandboxDocumentId, documentId)),
      )
      .limit(1);
    // a finding this requester may not read does not exist to them, exactly as
    // every other unreachable thing does (principle 4)
    const visible = row === undefined ? [] : await readableRows(deps.db, c.get('slice'), [row]);
    if (visible.length === 0) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    if (row!.status === 'closed') return c.json({ error: 'conflict' } satisfies ApiError, 409);

    const outcome = await resolveOne(deps.db, row!, body.data, c.get('slice').participantId);
    if (outcome === 'no_revision') {
      return invalid(c, 'this finding proposes no revision — it can be dismissed, not accepted');
    }
    return c.json(
      await respond(deps.db, documentId, {
        applied: outcome === 'applied' ? [row!.id] : [],
        dismissed: outcome === 'dismissed' ? [row!.id] : [],
        drifted: outcome === 'drifted' ? [row!.id] : [],
      }),
    );
  });

  /**
   * A group, in one act (ADR-0053 §6).
   *
   * **`accept` is mechanical-only and is checked before anything is applied.**
   * **`dismiss` takes anything and records no reason** — declining forty
   * advisory findings from one rule is one professional judgement, not forty
   * skipped — and it **resolves** findings rather than overriding ADR-0049 §7's
   * promotion gate, which goes on blocking until they are resolved and is
   * unaffected in kind by how they were.
   */
  app.post('/sandbox-documents/:id/findings/bulk', documentScope, async (c) => {
    const body = bulkResolveFindingsBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c, 'action and findingIds are required');
    const documentId = c.req.param('id');

    const rows = await deps.db
      .select()
      .from(s.findings)
      .where(
        and(
          eq(s.findings.sandboxDocumentId, documentId),
          inArray(s.findings.id, body.data.findingIds),
        ),
      );
    const visible = await readableRows(deps.db, c.get('slice'), rows);
    if (visible.length !== body.data.findingIds.length) {
      return c.json({ error: 'not_found' } satisfies ApiError, 404);
    }
    const open = visible.filter((row) => row.status === 'open');

    if (body.data.action === 'accept') {
      // 🔒 EVERY id is checked BEFORE any of them is applied. A batch holding
      // one rewrite is refused whole: half-applying it would ship the reviewer
      // a decision they did not take, on the half nobody read.
      const rewrite = open.find((row) => (row.fix as { kind?: string } | null)?.kind !== 'mechanical');
      if (rewrite !== undefined) {
        return invalid(
          c,
          'a rewrite cannot be accepted in bulk — model-written prose is read one mark at a time',
        );
      }
    }

    const applied: string[] = [];
    const dismissed: string[] = [];
    const drifted: string[] = [];
    // DESCENDING by anchor, so applying one span never moves the next one. The
    // alternative is re-resolving every remaining anchor after each write,
    // which is the same arithmetic done less reliably.
    for (const row of [...open].sort((a, b) => spanStart(b) - spanStart(a))) {
      const outcome = await resolveOne(
        deps.db,
        row,
        {
          resolution: body.data.action === 'accept' ? 'accepted' : 'dismissed',
        },
        c.get('slice').participantId,
      );
      if (outcome === 'drifted') drifted.push(row.id);
      else if (outcome === 'dismissed') dismissed.push(row.id);
      else if (outcome === 'applied') applied.push(row.id);
    }
    return c.json(await respond(deps.db, documentId, { applied, dismissed, drifted }));
  });

  return app;
}

/** What became of one finding's resolution. */
type ResolveOutcome = 'applied' | 'dismissed' | 'drifted' | 'no_revision';

/**
 * One finding resolved: the Suggestion's Signal where there is one, the
 * anchored apply where the fix was taken, and the finding closed with the name
 * of whoever closed it.
 *
 * **`dismissed` writes no Signal and no reason.** A Signal is an opinion about
 * a piece of proposed prose (ADR-0026's raw material); setting a defect aside
 * is a judgement about the defect itself, and most findings carry no proposal
 * at all — most are for a person to fix.
 */
async function resolveOne(
  db: Db,
  row: FindingRow,
  body: { resolution: 'accepted' | 'edited' | 'dismissed'; editedContent?: string },
  participantId: string,
): Promise<ResolveOutcome> {
  if (body.resolution !== 'dismissed') {
    if (row.proposedRevisionId === null) return 'no_revision';
    const anchor = row.anchor as Locator;
    const result = await resolveSuggestion(db, {
      suggestionId: row.proposedRevisionId as Id,
      resolution: body.resolution,
      ...(body.editedContent !== undefined && { editedContent: body.editedContent }),
      resolvedByParticipantId: participantId as Id,
      anchor: { start: anchor.span.start, end: anchor.span.end, verbatim: anchor.verbatim },
    });
    // a drifted anchor degrades, never blocks: the finding stays OPEN, because
    // the defect it names has not been dealt with
    if (result.outcome === 'drifted') return 'drifted';
  }
  await db
    .update(s.findings)
    .set({ status: 'closed', closedByParticipantId: participantId, closedAt: new Date() })
    .where(eq(s.findings.id, row.id));
  return body.resolution === 'dismissed' ? 'dismissed' : 'applied';
}

const spanStart = (row: FindingRow): number => (row.anchor as Locator).span.start;

/** The lists, plus the document as it now stands. */
async function respond(
  db: Db,
  documentId: string,
  lists: { applied: string[]; dismissed: string[]; drifted: string[] },
): Promise<ResolveFindingsResponse> {
  const [document] = await db
    .select({ content: s.sandboxDocuments.content })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, documentId))
    .limit(1);
  return {
    applied: lists.applied as Id[],
    dismissed: lists.dismissed as Id[],
    driftedAnchors: lists.drifted as Id[],
    content: document?.content ?? null,
  };
}

const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);
