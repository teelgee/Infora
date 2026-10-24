// T-471 — the working set: reach, in one place (ADR-0022's addendum of
// 2026-10-24).
//
// *In plain terms: a person may hand the AI a few of their own drafts, taken
// from the working areas they are part of. This file is where the server
// decides, document by document, whether a person is in the working area a
// draft sits in — when they search for drafts to pin, when they pin one, when a
// run starts, and when somebody reads back what a run was handed.*
//
// 🔒 ONE PREDICATE, EVERYWHERE: `canAccessSandbox` over the sandbox's LIVE
// scope grants (ADR-0036). A document is reachable if and only if the reader
// holds a live grant on the sandbox it sits in — their organisation's grant or
// their own. The owning organisation's membership does not imply it, and
// neither does being in the same project. Every function below goes through
// `readableSandboxIds`, so there is no second way to be wrong.
//
// **The gap this closes.** Before T-471 the checker's attached ids were read by
// id alone (`excerptsOf`), and `POST …/attached-sources` stored a `sandbox`
// pin's `ref` without looking at it. A guessed or stale id from a working area
// the requester was not in was read into a prompt, or stored. Now an id the
// requester cannot reach is refused in words before anything is read.
import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import type { Id, WorkingAreaDocument, WorkingSetDocument, WorkingSetEntry } from '@infora/contracts';
import { WORKING_AREA_PAGE_SIZE } from '@infora/contracts';
import { canAccessSandbox } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { RunWorkingSet } from '@infora/orchestration';
import { z } from 'zod';

/** How much of a pinned document a prompt is shown (the checker's own figure). */
export const WORKING_SET_EXCERPT_CHARS = 4000;

const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * Of these sandboxes, the ones the slice is in: a live organisation-grant for
 * their organisation, or a live participant-grant for them. Ids are expected
 * to be sandboxes of the slice's own project; any that is not is not returned.
 */
export async function readableSandboxIds(
  db: Db,
  slice: EntitledSlice,
  sandboxIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(sandboxIds)].filter(isUuid);
  if (ids.length === 0) return new Set();
  const sandboxes = await db
    .select({ id: s.sandboxes.id })
    .from(s.sandboxes)
    .where(and(inArray(s.sandboxes.id, ids), eq(s.sandboxes.projectId, slice.projectId)));
  const inProject = sandboxes.map((row) => row.id);
  if (inProject.length === 0) return new Set();
  const grants = await db
    .select()
    .from(s.sandboxScopeGrants)
    .where(and(inArray(s.sandboxScopeGrants.sandboxId, inProject), isNull(s.sandboxScopeGrants.removedAt)));
  const bySandbox = new Map<string, typeof grants>();
  for (const grant of grants) {
    bySandbox.set(grant.sandboxId, [...(bySandbox.get(grant.sandboxId) ?? []), grant]);
  }
  const readable = new Set<string>();
  for (const id of inProject) {
    const live = (bySandbox.get(id) ?? []).map((g) => ({
      granteeType: g.granteeType,
      organisationId: g.organisationId,
      participantId: g.participantId,
      removedAt: g.removedAt,
    }));
    if (canAccessSandbox(slice, live)) readable.add(id);
  }
  return readable;
}

/** Every sandbox of the project the slice is in. */
async function projectSandboxesIn(db: Db, slice: EntitledSlice) {
  const all = await db
    .select({ id: s.sandboxes.id, name: s.sandboxes.name })
    .from(s.sandboxes)
    .where(eq(s.sandboxes.projectId, slice.projectId));
  const readable = await readableSandboxIds(db, slice, all.map((row) => row.id));
  return all.filter((row) => readable.has(row.id));
}

/**
 * `GET /projects/:id/working-area` — the documents this person may pin: every
 * live document in a working area they are in, searched by title, newest first,
 * one page of 50 at a time. **Assembled, not filtered**: the query only ever
 * names the sandboxes the grants admit, so a document from any other working
 * area is never selected, never counted and never hinted at by `hasMore`.
 */
export async function listWorkingArea(
  db: Db,
  slice: EntitledSlice,
  query: { q?: string | undefined; page: number },
): Promise<{ items: WorkingAreaDocument[]; hasMore: boolean }> {
  const sandboxes = await projectSandboxesIn(db, slice);
  if (sandboxes.length === 0) return { items: [], hasMore: false };
  const nameOf = new Map(sandboxes.map((row) => [row.id, row.name]));
  const needle = query.q?.trim() ?? '';
  const rows = await db
    .select({
      id: s.sandboxDocuments.id,
      title: s.sandboxDocuments.title,
      sandboxId: s.sandboxDocuments.sandboxId,
      updatedAt: s.sandboxDocuments.updatedAt,
    })
    .from(s.sandboxDocuments)
    .where(
      and(
        inArray(s.sandboxDocuments.sandboxId, [...nameOf.keys()]),
        isNull(s.sandboxDocuments.deletedAt),
        // a literal substring: % and _ typed by a person are not wildcards
        needle === '' ? undefined : ilike(s.sandboxDocuments.title, `%${needle.replace(/[\\%_]/g, '\\$&')}%`),
      ),
    )
    .orderBy(desc(s.sandboxDocuments.updatedAt), desc(s.sandboxDocuments.id))
    .limit(WORKING_AREA_PAGE_SIZE + 1)
    .offset((query.page - 1) * WORKING_AREA_PAGE_SIZE);
  return {
    items: rows.slice(0, WORKING_AREA_PAGE_SIZE).map((row) => ({
      id: row.id as Id,
      title: row.title,
      sandboxId: row.sandboxId as Id,
      sandboxName: nameOf.get(row.sandboxId) ?? '',
      updatedAt: row.updatedAt.toISOString(),
    })),
    hasMore: rows.length > WORKING_AREA_PAGE_SIZE,
  };
}

/** One document, as a run uses it. `title` is the pin's label. */
export type ReachableDocument = { id: Id; title: string; content: string; sandboxId: Id };

/**
 * Check a list of document ids for the requester, per document. Returns the
 * reachable documents in the order asked and the ids that are not — a malformed
 * id, a document that does not exist, one that has been deleted, and one in a
 * working area the requester is not in are all the same answer ("not reachable"),
 * so the answer discloses nothing about which.
 */
export async function checkReach(
  db: Db,
  slice: EntitledSlice,
  documentIds: readonly string[],
): Promise<{ reachable: ReachableDocument[]; unreachable: string[] }> {
  const wanted = [...new Set(documentIds)];
  const valid = wanted.filter(isUuid);
  const rows =
    valid.length === 0
      ? []
      : await db
          .select({
            id: s.sandboxDocuments.id,
            title: s.sandboxDocuments.title,
            content: s.sandboxDocuments.content,
            sandboxId: s.sandboxDocuments.sandboxId,
            projectId: s.sandboxDocuments.projectId,
          })
          .from(s.sandboxDocuments)
          .where(and(inArray(s.sandboxDocuments.id, valid), isNull(s.sandboxDocuments.deletedAt)));
  const readable = await readableSandboxIds(db, slice, rows.map((row) => row.sandboxId));
  const ok = new Map(
    rows
      .filter((row) => row.projectId === slice.projectId && readable.has(row.sandboxId))
      .map((row) => [row.id, { id: row.id as Id, title: row.title, content: row.content, sandboxId: row.sandboxId as Id }]),
  );
  return {
    reachable: wanted.flatMap((id) => (ok.has(id) ? [ok.get(id)!] : [])),
    unreachable: wanted.filter((id) => !ok.has(id)),
  };
}

/** The words a run is refused in when a document it was handed is out of reach. */
export function unreachableRefusal(names: readonly string[]): string {
  const list = names.join(', ');
  return names.length === 1
    ? `${list} is not in a working area you are part of, so it cannot be handed to this run. Remove it from your working set and ask again.`
    : `${list} are not in working areas you are part of, so they cannot be handed to this run. Remove them from your working set and ask again.`;
}

/**
 * Resolve ids the requester supplied (the checker's and the creator's launcher
 * bodies) to the working set a run is handed — or the refusal, in words, naming
 * each document by the id that was sent. Nothing is dropped silently.
 */
export async function resolveWorkingSetIds(
  db: Db,
  slice: EntitledSlice,
  documentIds: readonly string[],
): Promise<{ ok: true; workingSet: RunWorkingSet[] } | { ok: false; detail: string }> {
  if (documentIds.length === 0) return { ok: true, workingSet: [] };
  const { reachable, unreachable } = await checkReach(db, slice, documentIds);
  if (unreachable.length > 0) {
    return { ok: false, detail: unreachableRefusal(unreachable.map((id) => `the document ${id}`)) };
  }
  return { ok: true, workingSet: reachable.map(excerptOf) };
}

const excerptOf = (doc: ReachableDocument): RunWorkingSet => ({
  sandboxDocumentId: doc.id,
  label: doc.title,
  excerpt: doc.content.slice(0, WORKING_SET_EXCERPT_CHARS),
});

/**
 * The working set a CONVERSATION hands its next run: its live `sandbox` pins,
 * checked per document for the person who is starting the run.
 *
 * A pin outlives the moment it was made — the document may have been moved,
 * the grant closed, the pinner may be a colleague. So reach is checked again
 * here, for THIS requester, and an unreachable pin refuses the run in words,
 * naming the document by the label its pinner saw when the pinner is the
 * requester, and plainly as "a document a colleague pinned" otherwise (a
 * colleague outside that working area must not learn its title from a refusal).
 */
export async function conversationWorkingSet(
  db: Db,
  slice: EntitledSlice,
  conversationId: string,
): Promise<{ ok: true; workingSet: RunWorkingSet[] } | { ok: false; detail: string }> {
  const pins = await db
    .select()
    .from(s.attachedSources)
    .where(
      and(
        eq(s.attachedSources.conversationId, conversationId),
        eq(s.attachedSources.kind, 'sandbox'),
        isNull(s.attachedSources.removedAt),
      ),
    );
  if (pins.length === 0) return { ok: true, workingSet: [] };
  const { reachable, unreachable } = await checkReach(db, slice, pins.map((pin) => pin.ref));
  if (unreachable.length > 0) {
    const bad = new Set(unreachable);
    const names = pins
      .filter((pin) => bad.has(pin.ref))
      .map((pin) =>
        pin.pinnedByParticipantId === slice.participantId
          ? `"${pin.label ?? pin.ref}"`
          : 'a document a colleague pinned',
      );
    return { ok: false, detail: unreachableRefusal([...new Set(names)]) };
  }
  return { ok: true, workingSet: reachable.map(excerptOf) };
}

/**
 * A run's recorded working set, as THIS reader may see it: each entry whose
 * document sits in a working area the reader is in is returned as it was; every
 * other entry is replaced by `{ hidden: true }` — no id, no title. A document
 * that can no longer be found cannot be shown to anyone, so it is hidden too.
 */
export async function visibleWorkingSet(
  db: Db,
  slice: EntitledSlice,
  recorded: readonly WorkingSetDocument[] | undefined,
): Promise<WorkingSetEntry[] | undefined> {
  if (recorded === undefined || recorded.length === 0) return undefined;
  const ids = recorded.map((entry) => entry.sandboxDocumentId).filter(isUuid);
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({ id: s.sandboxDocuments.id, sandboxId: s.sandboxDocuments.sandboxId })
          .from(s.sandboxDocuments)
          .where(inArray(s.sandboxDocuments.id, ids));
  const readable = await readableSandboxIds(db, slice, rows.map((row) => row.sandboxId));
  const sandboxOf = new Map(rows.map((row) => [row.id, row.sandboxId]));
  return recorded.map((entry) => {
    const sandboxId = sandboxOf.get(entry.sandboxDocumentId);
    return sandboxId !== undefined && readable.has(sandboxId)
      ? { sandboxDocumentId: entry.sandboxDocumentId, label: entry.label }
      : { hidden: true as const };
  });
}

/** A run, or anything carrying a working set, with that set shown as this reader may see it. */
export async function withVisibleWorkingSet<T extends { workingSet?: readonly WorkingSetEntry[] | undefined }>(
  db: Db,
  slice: EntitledSlice,
  value: T,
): Promise<T> {
  if (value.workingSet === undefined) return value;
  const shown = await visibleWorkingSet(db, slice, value.workingSet as WorkingSetDocument[]);
  const rest: Record<string, unknown> = { ...value };
  delete rest['workingSet'];
  return (shown === undefined ? rest : { ...rest, workingSet: shown }) as T;
}


/** Of these sandbox-document ids, the ones whose sandbox the reader is in. */
export async function readableDocumentIds(
  db: Db,
  slice: EntitledSlice,
  documentIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(documentIds)].filter(isUuid);
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: s.sandboxDocuments.id, sandboxId: s.sandboxDocuments.sandboxId })
    .from(s.sandboxDocuments)
    .where(inArray(s.sandboxDocuments.id, ids));
  const readable = await readableSandboxIds(db, slice, rows.map((row) => row.sandboxId));
  return new Set(rows.filter((row) => readable.has(row.sandboxId)).map((row) => row.id));
}

const attachedIdsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string' && value !== ''
      ? value.split(',').map((entry) => entry.trim())
      : [];

/**
 * A plan with its steps' `attached_document_ids` shown as this reader may see
 * them: an id whose draft sits in a working area the reader is not in becomes
 * the string "hidden" — kept in place, so the count stays the reader's to see.
 */
export async function withVisiblePlanInputs<
  T extends { steps: ReadonlyArray<{ inputs: Record<string, unknown> }> },
>(db: Db, slice: EntitledSlice, plan: T): Promise<T> {
  const all = plan.steps.flatMap((step) => attachedIdsOf(step.inputs['attached_document_ids']));
  if (all.length === 0) return plan;
  const readable = await readableDocumentIds(db, slice, all);
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      'attached_document_ids' in step.inputs
        ? {
            ...step,
            inputs: {
              ...step.inputs,
              attached_document_ids: attachedIdsOf(step.inputs['attached_document_ids']).map((id) =>
                readable.has(id) ? id : 'hidden',
              ),
            },
          }
        : step,
    ),
  };
}
