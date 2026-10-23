// T-303 — the bulk-load path: a corpus arrives as an **operator action**, not
// an interactive one.
//
// [operating-envelope.md](../../../docs/architecture/operating-envelope.md) is explicit
// that this is measured separately from interactive ingest and **is allowed to
// take hours**. What it may not do is two things, and both shape the code below
// rather than sitting in a comment:
//
//   * **it must not block an accepting action** — so it runs off any request
//     path, from a CLI, and it calls `ingestVersion` once per document rather
//     than going anywhere near the per-admission path T-302 dismantled;
//   * **it must not leave the corpus half-indexed on failure** — so a partial
//     load is **resumable** and **says what it did not load**.
//
// Resumability is the part that is easy to get wrong by doing less. Re-running
// after a crash must not duplicate what landed, and it must **finish** what
// half-landed: a document whose container was created and whose ingest then
// failed is *in the library and answers nothing*, which is worse than absent
// because the list says it is there. So the resume check is "does this
// document's current version have chunks for the pinned model", not "does a
// row exist".
//
// **What is admitted, ruled 2026-07-31 (T-304).** A legacy corpus is *received*
// material, not *produced* material, and V1 must not invent a lifecycle to
// admit it. Each document enters as a **reference-material container**:
// admitted to the library with a single genesis Version at `live`, so it
// grounds (ADR-0011) and rides every existing access and state pre-filter
// unchanged — and carrying **no work item**, which is the whole of what
// distinguishes it. No new state, no new table, no parallel lifecycle, and no
// marker column: the distinguishing fact is an absence, exactly as ADR-0038
// made `container_id` the sole distinguishing fact of a bound sandbox document.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { ingestVersion, isVersionIndexed } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { extractText, type ExtractableFormat } from './extract';
import { generateRenditions, putBlob } from './renditions';

const FORMATS: Record<string, ExtractableFormat> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
  '.pdf': 'pdf',
};

/** The genesis revision of received material. Not a P or a C: it was never issued *here*. */
const GENESIS_REVISION = 'R01';

export type LoadOutcome =
  /** admitted and indexed on this run */
  | { file: string; status: 'loaded'; reference: string; chunks: number }
  /** already present and already indexed — the resume case, and not an error */
  | { file: string; status: 'present'; reference: string }
  /** present but unindexed, and finished on this run — the OTHER resume case */
  | { file: string; status: 'reindexed'; reference: string; chunks: number }
  /** not loaded, and the reason, by name */
  | { file: string; status: 'refused'; reference: string; reason: string };

export type LoadReport = {
  loaded: number;
  present: number;
  reindexed: number;
  refused: number;
  outcomes: LoadOutcome[];
};

export type BulkLoadOptions = {
  /** the project whose library receives the corpus */
  projectId: string;
  /**
   * whose material this is. It becomes `producing_organisation_id`, which is
   * what the wall reads (ADR-0016/0035) — so received material is visible to
   * the organisation it belongs to and to the project owner, on the existing
   * rule, with no carve-out. A carve-out here would be a hole in the predicate
   * that grounding, the library list and citation resolution all share.
   */
  organisationId: string;
  /** a directory of documents; sub-directories are walked */
  directory: string;
  /** called per document, so an hours-long load is watchable */
  onOutcome?: (outcome: LoadOutcome) => void;
};

/**
 * Admit a directory of documents as reference material, ingesting each once.
 *
 * Never throws for one bad document: a corpus load that stops at the fortieth
 * file loses the other 460, and the ruling this implements is that an
 * unsupported document fails **per document**. The report is the deliverable —
 * a caller that ignores it has silently accepted a partial corpus.
 */
export async function bulkLoad(
  deps: { db: Db; router: Router },
  options: BulkLoadOptions,
): Promise<LoadReport> {
  const files = documentsUnder(options.directory);
  const report: LoadReport = { loaded: 0, present: 0, reindexed: 0, refused: 0, outcomes: [] };
  // a name collision WITHIN one run is a different fault from a re-run, and is
  // reported as a refusal rather than resolved by silently picking one
  const seen = new Set<string>();

  for (const file of files) {
    const outcome = await loadOne(deps, options, file, seen);
    report.outcomes.push(outcome);
    report[outcome.status] += 1;
    options.onOutcome?.(outcome);
  }
  return report;
}

async function loadOne(
  deps: { db: Db; router: Router },
  options: BulkLoadOptions,
  file: string,
  seen: Set<string>,
): Promise<LoadOutcome> {
  const name = file.slice(options.directory.length + 1);
  const reference = referenceFor(file);
  const refuse = (reason: string): LoadOutcome => ({ file: name, status: 'refused', reference, reason });

  if (seen.has(reference)) return refuse('duplicate_reference_in_load');
  seen.add(reference);

  const format = FORMATS[extname(file).toLowerCase()];
  if (format === undefined) return refuse('unsupported_format');

  // ── the resume check, before any work ────────────────────────────────────
  const [existing] = await deps.db
    .select({ containerId: s.containers.id })
    .from(s.containers)
    .where(
      and(
        eq(s.containers.projectId, options.projectId),
        eq(s.containers.documentReference, reference),
      ),
    )
    .limit(1);
  if (existing !== undefined) {
    const finished = await finishIfUnindexed(deps, options.projectId, existing.containerId);
    return finished === null
      ? { file: name, status: 'present', reference }
      : { file: name, status: 'reindexed', reference, chunks: finished };
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    return refuse('unreadable_file');
  }
  const extracted = extractText(format, bytes);
  if (!extracted.ok) return refuse(extracted.reason);

  // The blob first: a container pointing at a file that was never written is a
  // worse state to resume from than a file with no container.
  const fileRef = putBlob(bytes, format);

  const versionId = await deps.db.transaction(async (tx) => {
    const [container] = await tx
      .insert(s.containers)
      .values({
        projectId: options.projectId,
        producingOrganisationId: options.organisationId,
        documentReference: reference,
        // T-462 — reference material's own title: the file's name, made readable
        title: reference.replace(/_+/g, ' '),
        scope: 'library',
        // admitted directly: received material has no cycle to be accepted by,
        // and inventing one is what the 2026-07-31 ruling refuses
        inLibrary: true,
        state: 'live',
      })
      .returning();
    const [version] = await tx
      .insert(s.versions)
      .values({
        containerId: container!.id,
        versionReference: GENESIS_REVISION,
        content: extracted.text,
        isCurrent: true,
      })
      .returning();
    // NO work item is created, and that is the ticket rather than an omission.
    return version!.id;
  });

  // the native rendition is the file itself, so the Documents view opens the
  // real document rather than the extracted text
  await generateRenditions(
    deps.db,
    { id: versionId, content: extracted.text },
    { title: reference, origin: 'uploaded', format, fileRef },
  );

  // after the transaction commits (T-302): an outbound embedding call holds no
  // transaction open, and a failure here leaves a resumable half — which the
  // check at the top of this function is what makes true
  const summary = await ingestVersion(deps.db, deps.router, versionId);
  return { file: name, status: 'loaded', reference, chunks: summary.chunks };
}

/**
 * The half-landed case: a container exists, and its current version has no
 * chunks for the pinned model because a previous run died between the commit
 * and the embed. Returns the chunk count if it finished the job, `null` if
 * there was nothing to finish.
 */
async function finishIfUnindexed(
  deps: { db: Db; router: Router },
  projectId: string,
  containerId: string,
): Promise<number | null> {
  const [current] = await deps.db
    .select({ id: s.versions.id })
    .from(s.versions)
    .where(and(eq(s.versions.containerId, containerId), eq(s.versions.isCurrent, true)))
    .limit(1);
  if (current === undefined) return null;
  // asked through @infora/data rather than by reading the index here: the
  // grounding index has one reader by construction (source-rules.mjs RULE 1),
  // and this file is not it
  if (await isVersionIndexed(deps.db, deps.router, current.id, projectId)) return null;
  const summary = await ingestVersion(deps.db, deps.router, current.id);
  return summary.chunks;
}

/**
 * The document's reference is its **file name**, and that is a decision.
 *
 * The project's naming scheme composes references for *planned deliverables* —
 * TIDP rows the firm is going to produce. Received material was never in that
 * plan, so generating a scheme-conforming code for it would dress a consultee
 * response up as a deliverable, which is the laundering T-304 exists to
 * prevent. The file name is what the operator has, it is usually the document's
 * own printed reference, and it is stable across re-runs — which is what makes
 * the load resumable at all.
 */
export function referenceFor(path: string): string {
  const base = path.split(/[\\/]/).at(-1) ?? path;
  return base.replace(/\.[^.]+$/, '').trim().slice(0, 200);
}

/** every file under a directory, depth-first, in a stable order */
function documentsUnder(directory: string): string[] {
  const found: string[] = [];
  const walk = (at: string, depth: number): void => {
    if (depth > 16) return;
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name.startsWith('.')) continue;
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (statSync(path).isFile()) found.push(path);
    }
  };
  walk(directory, 0);
  return found;
}

/** the operator's line-by-line view of an hours-long run */
export function describeOutcome(outcome: LoadOutcome): string {
  switch (outcome.status) {
    case 'loaded':
      return `  loaded     ${outcome.file} → ${outcome.reference} (${outcome.chunks} chunks)`;
    case 'reindexed':
      return `  reindexed  ${outcome.file} → ${outcome.reference} (${outcome.chunks} chunks; a previous run left it unindexed)`;
    case 'present':
      return `  present    ${outcome.file} → ${outcome.reference}`;
    case 'refused':
      return `  REFUSED    ${outcome.file} — ${outcome.reason}`;
  }
}

/**
 * The summary an operator reads, and the one that must not let a partial load
 * look complete: every refused document is named again at the end, because a
 * 500-line log with forty refusals scattered through it is a log nobody reads
 * to the top of.
 */
export function describeReport(report: LoadReport): string {
  const lines = [
    `loaded ${report.loaded}, already present ${report.present}, finished ${report.reindexed}, REFUSED ${report.refused}`,
  ];
  if (report.refused > 0) {
    lines.push('', 'Not loaded — these documents are NOT in the corpus:');
    for (const outcome of report.outcomes) {
      if (outcome.status === 'refused') lines.push(`  ${outcome.file} — ${outcome.reason}`);
    }
    lines.push('', 'Fix or remove them and run the load again; what already landed is skipped.');
  }
  return lines.join('\n');
}
