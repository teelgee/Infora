// T-474 — supersede impact: what already rests on a library document.
//
// *In plain terms: before the owner replaces or withdraws a document, and after
// it, someone needs to know whose work rested on it. This reads the record the
// product already keeps — which passages were cited, by which accepted
// suggestions and which past answers — and joins it to the working documents
// that still exist. It reads citations and runs, never the passage text, which
// is why it lives here beside the other readers of the audit.*
//
// 🔒 **IT DOES NOT APPLY THE WALL, AND THE CALLER MUST.** Every row carries the
// organisation whose work it is, and the function is built to be asked for ONE
// organisation's slice (`organisationId`) — that is the only way the API calls
// it for a person. `impactByOrganisation` returns every organisation's slice at
// once and exists for exactly one caller: the notification producer, which
// tells each organisation about its own work and nobody about anyone else's
// (ADR-0049's amendment of 2026-10-24). A count that summed organisations would
// be a way for the owner to learn that another firm's private draft cites a
// document, so this file offers none.
//
// ⚠ **ONE APPROXIMATION, STATED.** A *library version* is counted as affected
// when its bound working document accepted a suggestion citing the document
// BEFORE the library version was created. The record does not link a promoted
// version to the suggestions behind it, so "before it was made" is the closest
// honest reading — it can include a revision whose author deleted the sentence
// between the acceptance and the promotion. It is shown as "may rest on", never
// as a certainty.
import { and, eq, inArray, isNull, notExists, or, sql } from 'drizzle-orm';
import type { CitedVersionState, GroundedClaim } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export type ImpactedThing = {
  kind: 'draft' | 'run' | 'library-version';
  id: string;
  organisationId: string;
  title: string;
  at: Date;
  /** a draft's author — the notification producer addresses the person who wrote it */
  authorParticipantId?: string;
  containerId?: string;
};

/** Every version of a library document — what "citing this document" means for the act on it. */
export async function versionIdsOfContainer(db: Db, containerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: s.versions.id })
    .from(s.versions)
    .where(eq(s.versions.containerId, containerId));
  return rows.map((row) => row.id);
}

/**
 * Everything that rests on the named versions, optionally for one organisation.
 * Sorted newest first. Deleted working documents are not "current" and are left out.
 */
export async function readImpact(
  db: Db,
  versionIds: string[],
  opts: { organisationId?: string } = {},
): Promise<ImpactedThing[]> {
  if (versionIds.length === 0) return [];
  const sd = s.sandboxDocuments;
  const orgOf = (column: typeof sd.organisationId) =>
    opts.organisationId === undefined ? undefined : eq(column, opts.organisationId);

  // sandbox document id -> the earliest moment it is known to have rested on the source
  const drafts = new Map<
    string,
    { thing: ImpactedThing; since: Date; containerId: string | null }
  >();
  const note = (
    row: {
      id: string;
      title: string;
      organisationId: string;
      updatedAt: Date;
      author: string;
      containerId: string | null;
    },
    since: Date,
  ) => {
    const known = drafts.get(row.id);
    if (known) {
      if (since < known.since) known.since = since;
      return;
    }
    drafts.set(row.id, {
      since,
      containerId: row.containerId,
      thing: {
        kind: 'draft',
        id: row.id,
        organisationId: row.organisationId,
        title: row.title,
        at: row.updatedAt,
        authorParticipantId: row.author,
      },
    });
  };
  const documentColumns = {
    id: sd.id,
    title: sd.title,
    organisationId: sd.organisationId,
    updatedAt: sd.updatedAt,
    author: sd.createdByParticipantId,
    containerId: sd.containerId,
  };

  // 1. an accepted (or edited-then-accepted) suggestion whose citation names it
  const accepted = await db
    .select({ ...documentColumns, since: sql<Date>`min(${s.signals.resolvedAt})` })
    .from(s.citations)
    .innerJoin(s.suggestions, eq(s.suggestions.id, s.citations.suggestionId))
    .innerJoin(
      s.signals,
      and(
        eq(s.signals.suggestionId, s.suggestions.id),
        inArray(s.signals.resolution, ['accepted', 'edited']),
      ),
    )
    .innerJoin(sd, eq(sd.id, s.suggestions.sandboxDocumentId))
    .where(and(inArray(s.citations.versionId, versionIds), isNull(sd.deletedAt), orgOf(sd.organisationId)))
    .groupBy(sd.id);
  for (const row of accepted) note(row, new Date(row.since));

  // 2. a document the creator built, whose building run cited it (T-474's trail)
  const built = await db
    .select({ ...documentColumns, since: sd.updatedAt })
    .from(sd)
    .innerJoin(s.runs, sql`${s.runs.id}::text = ${sd.authoringMetadata}->>'createdByRunId'`)
    .innerJoin(s.steps, eq(s.steps.runId, s.runs.id))
    .innerJoin(s.citations, eq(s.citations.stepId, s.steps.id))
    .where(and(inArray(s.citations.versionId, versionIds), isNull(sd.deletedAt), orgOf(sd.organisationId)))
    .groupBy(sd.id);
  for (const row of built) note(row, new Date(row.since));

  // 3. a checker finding whose evidence cites it — a jsonb containment test per version
  const containment = versionIds.map(
    (versionId) =>
      sql`${s.findings.evidence} @> ${JSON.stringify({ citations: [{ source: { versionId } }] })}::jsonb`,
  );
  const checked = await db
    .select({ ...documentColumns, since: sql<Date>`min(${s.findings.createdAt})` })
    .from(s.findings)
    .innerJoin(sd, eq(sd.id, s.findings.sandboxDocumentId))
    .where(and(or(...containment), isNull(sd.deletedAt), orgOf(sd.organisationId)))
    .groupBy(sd.id);
  for (const row of checked) note(row, new Date(row.since));

  const things: ImpactedThing[] = [...drafts.values()].map((entry) => entry.thing);

  // 4. a past answer whose steps' citations name it — leaving out a run that
  //    built a document still standing, which is already counted as that document
  const runs = await db
    .select({
      id: s.runs.id,
      request: s.runs.request,
      startedAt: s.runs.startedAt,
      organisationId: s.users.organisationId,
    })
    .from(s.citations)
    .innerJoin(s.steps, eq(s.steps.id, s.citations.stepId))
    .innerJoin(s.runs, eq(s.runs.id, s.steps.runId))
    .innerJoin(s.participants, eq(s.participants.id, s.runs.requesterParticipantId))
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(
      and(
        inArray(s.citations.versionId, versionIds),
        opts.organisationId === undefined ? undefined : eq(s.users.organisationId, opts.organisationId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(sd)
            .where(sql`${sd.authoringMetadata}->>'createdByRunId' = ${s.runs.id}::text`),
        ),
      ),
    )
    .groupBy(s.runs.id, s.users.organisationId);
  for (const run of runs) {
    things.push({
      kind: 'run',
      id: run.id,
      organisationId: run.organisationId,
      title: run.request.length > 120 ? `${run.request.slice(0, 117)}…` : run.request,
      at: run.startedAt,
    });
  }

  // 5. a library revision made after its bound working document took the citation
  const sinceByContainer = new Map<string, Date>();
  for (const entry of drafts.values()) {
    if (entry.containerId === null) continue;
    const known = sinceByContainer.get(entry.containerId);
    if (known === undefined || entry.since < known) sinceByContainer.set(entry.containerId, entry.since);
  }
  if (sinceByContainer.size > 0) {
    const revisions = await db
      .select({
        id: s.versions.id,
        containerId: s.versions.containerId,
        versionReference: s.versions.versionReference,
        createdAt: s.versions.createdAt,
        documentReference: s.containers.documentReference,
        title: s.containers.title,
        organisationId: s.containers.producingOrganisationId,
      })
      .from(s.versions)
      .innerJoin(s.containers, eq(s.containers.id, s.versions.containerId))
      .where(
        and(
          inArray(s.versions.containerId, [...sinceByContainer.keys()]),
          eq(s.containers.inLibrary, true),
          opts.organisationId === undefined
            ? undefined
            : eq(s.containers.producingOrganisationId, opts.organisationId),
        ),
      );
    for (const rev of revisions) {
      const since = sinceByContainer.get(rev.containerId);
      if (since === undefined || rev.createdAt < since) continue;
      things.push({
        kind: 'library-version',
        id: rev.id,
        organisationId: rev.organisationId,
        title: `${rev.documentReference ?? rev.title ?? 'A library document'} ${rev.versionReference}`,
        at: rev.createdAt,
        containerId: rev.containerId,
      });
    }
  }

  return things.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Each organisation's own slice, for the one caller entitled to ask for all of them: the notification producer. */
export function groupByOrganisation(things: ImpactedThing[]): Map<string, ImpactedThing[]> {
  const out = new Map<string, ImpactedThing[]>();
  for (const thing of things) {
    const list = out.get(thing.organisationId) ?? [];
    list.push(thing);
    out.set(thing.organisationId, list);
  }
  return out;
}

// ── stale grounding: one document's recorded citations, and what they cite now ──

export type DocumentGrounding = {
  content: string;
  claims: GroundedClaim[];
  states: CitedVersionState[];
};

/**
 * What one working document rests on: the claims its accepted suggestions
 * recorded (each located by the claim's recorded span in the suggestion's own
 * text), the creator's citation trail, and the current state of every version
 * those cite. The check itself is a pure function elsewhere.
 */
export async function readDocumentGrounding(
  db: Db,
  sandboxDocumentId: string,
): Promise<DocumentGrounding | null> {
  const [doc] = await db
    .select({ content: s.sandboxDocuments.content, metadata: s.sandboxDocuments.authoringMetadata })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, sandboxDocumentId))
    .limit(1);
  if (!doc) return null;

  const claims: GroundedClaim[] = [];
  const accepted = await db
    .select({
      suggestionId: s.suggestions.id,
      content: s.suggestions.content,
      editedContent: s.signals.editedContent,
      citationId: s.citations.id,
      versionId: s.citations.versionId,
      chunkId: s.citations.chunkId,
      claimSpan: s.citations.claimSpan,
    })
    .from(s.suggestions)
    .innerJoin(
      s.signals,
      and(
        eq(s.signals.suggestionId, s.suggestions.id),
        inArray(s.signals.resolution, ['accepted', 'edited']),
      ),
    )
    .innerJoin(s.citations, eq(s.citations.suggestionId, s.suggestions.id))
    .where(eq(s.suggestions.sandboxDocumentId, sandboxDocumentId));
  const byClaim = new Map<string, GroundedClaim>();
  for (const row of accepted) {
    if (row.versionId === null) continue; // an authority reference has no library state
    const span = row.claimSpan as { start?: unknown; end?: unknown } | null;
    const text =
      span !== null && typeof span.start === 'number' && typeof span.end === 'number'
        ? row.content.slice(span.start, span.end).trim() || null
        : null;
    const key = `${row.suggestionId}:${text ?? row.citationId}`;
    const claim = byClaim.get(key) ?? { text, citations: [] };
    claim.citations.push({
      id: row.citationId,
      versionId: row.versionId,
      ...(row.chunkId !== null && { chunkId: row.chunkId }),
    });
    byClaim.set(key, claim);
  }
  claims.push(...byClaim.values());

  const runId = (doc.metadata as { createdByRunId?: unknown } | null)?.createdByRunId;
  if (typeof runId === 'string') {
    const trail = await db
      .select({ id: s.citations.id, versionId: s.citations.versionId, chunkId: s.citations.chunkId })
      .from(s.citations)
      .innerJoin(s.steps, eq(s.steps.id, s.citations.stepId))
      .where(eq(s.steps.runId, runId));
    for (const row of trail) {
      if (row.versionId === null) continue;
      // the creator's record keeps no sentence text, so these point at the document
      claims.push({
        text: null,
        citations: [
          { id: row.id, versionId: row.versionId, ...(row.chunkId !== null && { chunkId: row.chunkId }) },
        ],
      });
    }
  }

  const versionIds = [...new Set(claims.flatMap((claim) => claim.citations.map((c) => c.versionId)))];
  return { content: doc.content, claims, states: await readCitedVersionStates(db, versionIds) };
}

/** The library's current state of each named version. */
export async function readCitedVersionStates(
  db: Db,
  versionIds: string[],
): Promise<CitedVersionState[]> {
  if (versionIds.length === 0) return [];
  const rows = await db
    .select({
      versionId: s.versions.id,
      containerId: s.containers.id,
      documentReference: s.containers.documentReference,
      title: s.containers.title,
      versionReference: s.versions.versionReference,
      isCurrent: s.versions.isCurrent,
      recordState: s.containers.state,
    })
    .from(s.versions)
    .innerJoin(s.containers, eq(s.containers.id, s.versions.containerId))
    .where(inArray(s.versions.id, versionIds));
  const containerIds = [...new Set(rows.map((row) => row.containerId))];
  const current = containerIds.length
    ? await db
        .select({ containerId: s.versions.containerId, ref: s.versions.versionReference })
        .from(s.versions)
        .where(and(inArray(s.versions.containerId, containerIds), eq(s.versions.isCurrent, true)))
    : [];
  const currentRef = new Map(current.map((row) => [row.containerId, row.ref]));
  const supersessions = containerIds.length
    ? await db
        .select({ target: s.documentRelationships.toContainerId, ref: s.containers.documentReference })
        .from(s.documentRelationships)
        .innerJoin(s.containers, eq(s.containers.id, s.documentRelationships.fromContainerId))
        .where(
          and(
            inArray(s.documentRelationships.toContainerId, containerIds),
            eq(s.documentRelationships.type, 'supersedes'),
            isNull(s.documentRelationships.retiredAt),
            sql`${s.documentRelationships.confirmedAt} is not null`,
          ),
        )
    : [];
  const supersededBy = new Map(supersessions.map((row) => [row.target, row.ref]));
  return rows.map((row) => ({
    versionId: row.versionId,
    containerId: row.containerId,
    documentReference: row.documentReference ?? row.title ?? 'A library document',
    versionReference: row.versionReference,
    recordState: row.recordState,
    isCurrent: row.isCurrent,
    currentVersionReference: currentRef.get(row.containerId) ?? null,
    supersededByReference: supersededBy.get(row.containerId) ?? null,
  }));
}
