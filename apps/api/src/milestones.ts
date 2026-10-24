// T-481 — milestones on the plan row, and the coverage view (ADR-0008's
// addendum of 2026-10-24).
//
// *In plain terms: a planned document can carry dates by which it should reach
// a status code. The firm producing it sets them; the client reads them on its
// schedule, with a count of where every planned document stands. A date that
// has passed without the document getting there is overdue — worked out when
// the plan is read, never stored.*
//
// The pure decisions (met, overdue, the spreadsheet cell, the summary line) live
// in `@infora/contracts` so the screens use the same ones. This file is the
// stored half: reading the set for a page of rows, replacing a row's set, the
// project's status-code list, and the coverage query over the rows the plan
// read shows.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { COVERAGE_STAGES, milestoneState, utcDay } from '@infora/contracts';
import type {
  CoverageRow,
  CoverageStage,
  GetPlanCoverageResponse,
  MilestoneInput,
  PlanMilestone,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canEditPlan } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { loadSchemeOrDefault } from './naming';

type MilestoneRow = typeof s.planMilestones.$inferSelect;

/** The project's status codes, in the order a document progresses — the allowed
 * values of the scheme field whose key is `suitability` (the seeded list is the
 * UK National Annex: S0–S7, A1, B1, CR). Empty where the scheme has no such field. */
export async function statusCodeList(db: Db, projectId: string): Promise<string[]> {
  const scheme = await loadSchemeOrDefault(db, projectId);
  return scheme.fields.find((f) => f.key === 'suitability')?.allowedValues ?? [];
}

/** The milestones of a page of rows — one query, never per row. */
export async function loadMilestones(db: Db, containerIds: string[]): Promise<Map<string, MilestoneRow[]>> {
  const out = new Map<string, MilestoneRow[]>();
  if (containerIds.length === 0) return out;
  const rows = await db
    .select()
    .from(s.planMilestones)
    .where(inArray(s.planMilestones.containerId, containerIds))
    .orderBy(s.planMilestones.targetDate, s.planMilestones.statusCode);
  for (const r of rows) out.set(r.containerId, [...(out.get(r.containerId) ?? []), r]);
  return out;
}

/** A row's milestones as the plan read shows them: soonest first, met and overdue worked out now. */
export function toPlanMilestones(
  rows: MilestoneRow[],
  metadata: Record<string, unknown>,
  codes: readonly string[],
  today: string,
  accepted = false,
): PlanMilestone[] {
  const current = typeof metadata['suitability'] === 'string' ? (metadata['suitability'] as string) : null;
  return rows.map((m) => ({
    statusCode: m.statusCode,
    targetDate: m.targetDate,
    ...milestoneState(m, current, codes, today, accepted),
  }));
}

/** Which of these rows have been accepted: the review cycle says so, or the work
 * item does (a row loaded already accepted has no cycle to point to). */
export async function acceptedAmong(db: Db, containerIds: string[], workItemStatus: Map<string, string>): Promise<Set<string>> {
  const out = new Set(containerIds.filter((id) => workItemStatus.get(id) === 'accepted'));
  if (containerIds.length === 0) return out;
  const cycles = await db
    .selectDistinct({ containerId: s.reviewCycles.containerId })
    .from(s.reviewCycles)
    .where(and(inArray(s.reviewCycles.containerId, containerIds), eq(s.reviewCycles.state, 'accepted')));
  for (const c of cycles) out.add(c.containerId);
  return out;
}

/**
 * Replace a row's whole set in one transaction: new codes inserted, a moved date
 * updated (with its setter), a code no longer listed deleted. An unchanged
 * milestone is left alone, so it keeps who set it and when.
 */
export async function replaceMilestones(
  db: Db,
  containerId: string,
  wanted: MilestoneInput[],
  participantId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, containerId));
    const byCode = new Map(existing.map((m) => [m.statusCode, m]));
    const keep = new Set(wanted.map((w) => w.statusCode));
    const gone = existing.filter((m) => !keep.has(m.statusCode)).map((m) => m.id);
    if (gone.length > 0) await tx.delete(s.planMilestones).where(inArray(s.planMilestones.id, gone));
    for (const w of wanted) {
      const was = byCode.get(w.statusCode);
      if (!was) {
        await tx.insert(s.planMilestones).values({
          containerId,
          statusCode: w.statusCode,
          targetDate: w.targetDate,
          setByParticipantId: participantId,
        });
      } else if (was.targetDate !== w.targetDate) {
        await tx
          .update(s.planMilestones)
          .set({ targetDate: w.targetDate, setByParticipantId: participantId, setAt: sql`now()` })
          .where(eq(s.planMilestones.id, was.id));
      }
    }
  });
}

/** Insert a new row's milestones (the create-only import) inside the caller's transaction. */
export async function insertMilestones(
  tx: Pick<Db, 'insert'>,
  containerId: string,
  wanted: MilestoneInput[],
  participantId: string,
): Promise<void> {
  if (wanted.length === 0) return;
  await tx
    .insert(s.planMilestones)
    .values(wanted.map((w) => ({ containerId, statusCode: w.statusCode, targetDate: w.targetDate, setByParticipantId: participantId })));
}

type CoverageContainer = {
  id: string;
  producingOrganisationId: string;
  reference: string | null;
  title: string;
  metadata: Record<string, unknown>;
  workItemStatus: string;
};

/** The rows the coverage view counts: the plan read's own reach (every
 * organisation's for the owner, the reader's own otherwise), library scope, live,
 * deliverables only — reference material is not planned work. */
async function coverageContainers(db: Db, slice: EntitledSlice): Promise<CoverageContainer[]> {
  const producerScope = slice.membershipRole === 'owner' ? null : slice.organisationId;
  const rows = await db
    .select({
      id: s.containers.id,
      producingOrganisationId: s.containers.producingOrganisationId,
      reference: s.containers.documentReference,
      title: s.workItems.title,
      metadata: s.containers.metadata,
      workItemStatus: s.workItems.status,
    })
    .from(s.containers)
    .innerJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(
      and(
        eq(s.containers.projectId, slice.projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.state, 'live'),
        producerScope === null ? undefined : eq(s.containers.producingOrganisationId, producerScope),
      ),
    );
  return rows.map((r) => ({ ...r, metadata: (r.metadata ?? {}) as Record<string, unknown> }));
}

const RANK = new Map<CoverageStage, number>(COVERAGE_STAGES.map((st, i) => [st, i]));
const furthest = (a: CoverageStage, b: CoverageStage): CoverageStage => (RANK.get(b)! > RANK.get(a)! ? b : a);

/** The furthest stage each row has reached, before the wall is applied. */
async function stagesOf(db: Db, rows: CoverageContainer[]): Promise<Map<string, CoverageStage>> {
  const ids = rows.map((r) => r.id);
  const stage = new Map<string, CoverageStage>(rows.map((r) => [r.id, 'planned']));
  const reach = (id: string, st: CoverageStage) => stage.set(id, furthest(stage.get(id) ?? 'planned', st));
  if (ids.length === 0) return stage;

  // bound: a working draft names this row as the one it is producing
  const drafts = await db
    .select({ id: s.sandboxDocuments.id, containerId: s.sandboxDocuments.containerId })
    .from(s.sandboxDocuments)
    .where(and(inArray(s.sandboxDocuments.containerId, ids), isNull(s.sandboxDocuments.deletedAt)));
  const rowOfDraft = new Map<string, string>();
  for (const d of drafts) {
    reach(d.containerId!, 'bound');
    rowOfDraft.set(d.id, d.containerId!);
  }

  // frozen / QA accepted: the draft's freeze series (a sandbox-scope container)
  // holds a version / its internal cycle was accepted
  if (rowOfDraft.size > 0) {
    const series = await db
      .select({ id: s.containers.id, draftId: s.containers.sandboxDocumentId })
      .from(s.containers)
      .where(and(eq(s.containers.scope, 'sandbox'), inArray(s.containers.sandboxDocumentId, [...rowOfDraft.keys()])));
    const rowOfSeries = new Map(series.map((x) => [x.id, rowOfDraft.get(x.draftId!)!]));
    if (rowOfSeries.size > 0) {
      const seriesIds = [...rowOfSeries.keys()];
      const frozen = await db.selectDistinct({ containerId: s.versions.containerId }).from(s.versions).where(inArray(s.versions.containerId, seriesIds));
      for (const f of frozen) reach(rowOfSeries.get(f.containerId)!, 'frozen');
      const accepted = await db
        .selectDistinct({ containerId: s.reviewCycles.containerId })
        .from(s.reviewCycles)
        .where(and(inArray(s.reviewCycles.containerId, seriesIds), eq(s.reviewCycles.state, 'accepted')));
      for (const a of accepted) reach(rowOfSeries.get(a.containerId)!, 'qa_accepted');
    }
  }

  // promoted: the library holds a version of the row
  const promoted = await db.selectDistinct({ containerId: s.versions.containerId }).from(s.versions).where(inArray(s.versions.containerId, ids));
  for (const p of promoted) reach(p.containerId, 'promoted');

  // in review / accepted: the row's own cycle. The work item's status is the
  // cycle's event-driven shadow (ADR-0032 addendum) and covers a row that was
  // seeded or loaded already accepted with no cycle to point to.
  const cycles = await db
    .select({ containerId: s.reviewCycles.containerId, state: s.reviewCycles.state })
    .from(s.reviewCycles)
    .where(inArray(s.reviewCycles.containerId, ids));
  for (const cy of cycles) {
    if (cy.state === 'active') reach(cy.containerId, 'in_review');
    else if (cy.state === 'accepted') reach(cy.containerId, 'accepted');
  }
  for (const r of rows) {
    if (r.workItemStatus === 'accepted') reach(r.id, 'accepted');
    else if (r.workItemStatus === 'in_review' || r.workItemStatus === 'responding') reach(r.id, 'in_review');
  }
  return stage;
}

/**
 * The coverage query: the plan read, counted. Each live deliverable row the
 * reader's plan read shows falls in exactly one stage. THE WALL: `frozen` and
 * `qa_accepted` are the producing organisation's private machinery (ADR-0032),
 * so they are reported only on the reader's OWN organisation's rows; on any
 * other organisation's row they fold into `bound`, which the owner already
 * sees. The view therefore discloses nothing the plan read does not.
 */
export async function computeCoverage(db: Db, slice: EntitledSlice, now: Date = new Date()): Promise<GetPlanCoverageResponse> {
  const rows = await coverageContainers(db, slice);
  const [raw, milestones, codes] = await Promise.all([
    stagesOf(db, rows),
    loadMilestones(db, rows.map((r) => r.id)),
    statusCodeList(db, slice.projectId),
  ]);
  const today = utcDay(now);
  const counts = Object.fromEntries(COVERAGE_STAGES.map((st) => [st, 0])) as Record<CoverageStage, number>;
  let overdueMilestones = 0;
  let overdueRows = 0;
  const out: CoverageRow[] = rows.map((r) => {
    let stage = raw.get(r.id) ?? 'planned';
    if (r.producingOrganisationId !== slice.organisationId && (stage === 'frozen' || stage === 'qa_accepted')) stage = 'bound';
    counts[stage] += 1;
    const overdue = toPlanMilestones(milestones.get(r.id) ?? [], r.metadata, codes, today, raw.get(r.id) === 'accepted').filter((m) => m.overdue).length;
    overdueMilestones += overdue;
    if (overdue > 0) overdueRows += 1;
    return { containerId: r.id, stage, overdueMilestones: overdue };
  });
  return { total: rows.length, counts, overdueMilestones, overdueRows, rows: out };
}

/** An overdue milestone, with the row it is on — what the work queue lists. */
export type OverdueMilestone = { containerId: string; reference: string | null; title: string; statusCode: string; targetDate: string };

/**
 * The overdue milestones this person is told about (ADR-0008 addendum, ruling
 * 5): the owner organisation's people see every row's, because they read the
 * consolidated schedule; anyone else is told of their own organisation's rows,
 * and only if they can edit the row's plan metadata — the producer's super
 * user, or the row's live lead author. A producer member who cannot edit is
 * not told: it is not theirs to move.
 */
export async function overdueMilestonesFor(db: Db, slice: EntitledSlice, now: Date = new Date()): Promise<OverdueMilestone[]> {
  const rows = await coverageContainers(db, slice);
  let reach = rows;
  if (slice.membershipRole !== 'owner' && !canEditPlan(slice)) {
    const led = await db
      .select({ containerId: s.deliverableAuthors.containerId })
      .from(s.deliverableAuthors)
      .where(and(eq(s.deliverableAuthors.participantId, slice.participantId), eq(s.deliverableAuthors.isLead, true), isNull(s.deliverableAuthors.revokedAt)));
    const ledIds = new Set(led.map((l) => l.containerId));
    reach = rows.filter((r) => ledIds.has(r.id));
  }
    const [milestones, codes, stages] = await Promise.all([
    loadMilestones(db, reach.map((r) => r.id)),
    statusCodeList(db, slice.projectId),
    stagesOf(db, reach),
  ]);
  const today = utcDay(now);
  const out: OverdueMilestone[] = [];
  for (const r of reach) {
    for (const m of toPlanMilestones(milestones.get(r.id) ?? [], r.metadata, codes, today, stages.get(r.id) === 'accepted')) {
      if (m.overdue) out.push({ containerId: r.id, reference: r.reference, title: r.title, statusCode: m.statusCode, targetDate: m.targetDate });
    }
  }
  return out.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
}
