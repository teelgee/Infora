// T-046 — the immutable audit read: append-only rows reconstructed into the
// contracts §2 Run shape (principle 5 — there is no mutating verb here).
// Citations resolve their documentReference through the version's container;
// the Signal, when present, rides its Suggestion.
import { asc, eq, inArray } from 'drizzle-orm';
import type { Citation, Id, Run, Step, Suggestion } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export async function readRun(db: Db, runId: Id): Promise<Run | null> {
  const [run] = await db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
  if (!run) return null;

  const [stepRows, suggestionRows] = await Promise.all([
    db.select().from(s.steps).where(eq(s.steps.runId, runId)).orderBy(asc(s.steps.startedAt)),
    db.select().from(s.suggestions).where(eq(s.suggestions.runId, runId)),
  ]);

  return {
    id: run.id,
    conversationId: run.conversationId,
    parentRunId: run.parentRunId,
    agentId: run.agentId,
    agentProvenance: run.agentProvenance,
    state: run.state,
    request: run.request,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    steps: stepRows.map(toStep),
    suggestions: await readSuggestions(db, suggestionRows),
  };
}

function toStep(row: typeof s.steps.$inferSelect): Step {
  return {
    id: row.id,
    runId: row.runId,
    parentStepId: row.parentStepId,
    type: row.type,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    ...(row.modelId !== null && {
      model: { id: row.modelId, version: row.modelVersion ?? row.modelId },
    }),
    ...(row.tokensPrompt !== null && {
      usage: {
        tokensPrompt: row.tokensPrompt,
        tokensCompletion: row.tokensCompletion ?? 0,
        cost: row.cost === null ? 0 : Number(row.cost),
      },
    }),
    sourceSet: row.sourceSet as Step['sourceSet'],
    railOutcomes: row.railOutcomes as Step['railOutcomes'],
    ...(row.childRunId !== null && { childRunId: row.childRunId }),
  };
}

async function readSuggestions(
  db: Db,
  rows: Array<typeof s.suggestions.$inferSelect>,
): Promise<Suggestion[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [citationRows, signalRows] = await Promise.all([
    db
      .select({
        citation: s.citations,
        documentReference: s.containers.documentReference,
      })
      .from(s.citations)
      .leftJoin(s.versions, eq(s.citations.versionId, s.versions.id))
      .leftJoin(s.containers, eq(s.versions.containerId, s.containers.id))
      .where(inArray(s.citations.suggestionId, ids)),
    db.select().from(s.signals).where(inArray(s.signals.suggestionId, ids)),
  ]);

  return rows.map((row) => {
    const signal = signalRows.find((sig) => sig.suggestionId === row.id);
    return {
      id: row.id,
      runId: row.runId,
      workItemId: row.workItemId,
      sandboxDocumentId: row.sandboxDocumentId,
      kind: row.kind,
      ...(row.anchor !== null && { anchor: row.anchor as { quote: string } }),
      content: row.content,
      rationale: row.rationale,
      citations: citationRows
        .filter((c) => c.citation.suggestionId === row.id)
        .map((c) => toCitation(c.citation, c.documentReference)),
      ...(signal !== undefined && {
        signal: { resolution: signal.resolution, resolvedAt: signal.resolvedAt.toISOString() },
      }),
    };
  });
}

function toCitation(
  row: typeof s.citations.$inferSelect,
  documentReference: string | null,
): Citation {
  return {
    id: row.id,
    source:
      row.versionId !== null
        ? { versionId: row.versionId, documentReference: documentReference ?? '' }
        : { authorityRef: row.authorityRef! },
    ...(row.claimSpan !== null && { claimSpan: row.claimSpan as { start: number; end: number } }),
  };
}
