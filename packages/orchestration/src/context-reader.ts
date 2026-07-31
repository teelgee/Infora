// T-253 — the assembled-context reconstruction (docs/build/ask/09 R5).
//
// `step.source_set` records what each step saw. Since this ticket it records it
// at PASSAGE grain — the chunk id beside the version id — and chunk rows are
// immutable, so the exact text the model was shown is reconstructible without
// storing it a second time.
//
// What this converts: "we log what it saw" is a claim; showing the passages,
// in order, with the step that admitted each, is a demonstration. That is the
// difference the question gets asked in — a client security review.
//
// A store read and nothing more: it resolves no permissions, exactly like
// readRun. The API decides who may ask, and the answer is producer-private
// like the rest of the run record (the 2026-07-12 ruling).
import { asc, eq, inArray } from 'drizzle-orm';
import type { AssembledPassage, GetRunContextResponse, Id } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { readChunkPassages } from '@infora/knowledge';

type RecordedSource = { versionId?: string; authorityRef?: string; chunkId?: string };

export async function readRunContext(db: Db, runId: Id): Promise<GetRunContextResponse> {
  const [run] = await db
    .select({ environmentKey: s.runs.environmentKey })
    .from(s.runs)
    .where(eq(s.runs.id, runId))
    .limit(1);
  if (!run) return { runId, passages: [], unreconstructable: 0 };

  const steps = await db
    .select({ id: s.steps.id, type: s.steps.type, sourceSet: s.steps.sourceSet })
    .from(s.steps)
    .where(eq(s.steps.runId, runId))
    .orderBy(asc(s.steps.startedAt));

  const seen = new Set<string>();
  const recorded: Array<{ stepId: string; stepType: (typeof steps)[number]['type']; source: RecordedSource }> = [];
  for (const step of steps) {
    for (const source of (step.sourceSet as RecordedSource[]) ?? []) {
      if (source.versionId === undefined) continue; // authority refs resolve elsewhere (T-277)
      // one entry per passage, attributed to the FIRST step that saw it —
      // later steps working from the same set would otherwise triple it
      const key = `${source.versionId}:${source.chunkId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recorded.push({ stepId: step.id, stepType: step.type, source });
    }
  }
  if (recorded.length === 0) return { runId, passages: [], unreconstructable: 0 };

  const chunkIds = recorded
    .map((entry) => entry.source.chunkId)
    .filter((id): id is string => id !== undefined);
  // the passages come back through knowledge, which owns access to the
  // grounding index and declares the project scope row-level security requires
  const chunkById = await readChunkPassages(db, run.environmentKey, chunkIds);

  const versionIds = [...new Set(recorded.map((entry) => entry.source.versionId!))];
  const versions = await db
    .select({
      id: s.versions.id,
      versionReference: s.versions.versionReference,
      documentReference: s.containers.documentReference,
    })
    .from(s.versions)
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(inArray(s.versions.id, versionIds));
  const versionById = new Map(versions.map((version) => [version.id, version]));

  let unreconstructable = 0;
  const passages: AssembledPassage[] = recorded.map((entry) => {
    const version = versionById.get(entry.source.versionId!);
    const chunk = entry.source.chunkId === undefined ? undefined : chunkById.get(entry.source.chunkId);
    // a passage recorded before T-253, or whose chunk row has since been
    // replaced by a re-ingest, cannot be reconstructed — counted and stated,
    // never quietly rendered as an empty passage
    if (chunk === undefined) unreconstructable += 1;
    return {
      stepId: entry.stepId,
      stepType: entry.stepType,
      versionId: entry.source.versionId!,
      documentReference: version?.documentReference ?? null,
      versionReference: version?.versionReference ?? '',
      chunkId: entry.source.chunkId ?? null,
      chunkIndex: chunk?.chunkIndex ?? null,
      content: chunk?.content ?? null,
    };
  });

  return { runId, passages, unreconstructable };
}
