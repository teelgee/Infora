// T-340 — Purge: the deletion act the product has never had (ADR-0050 §5–§6).
//
// **Delete stays exactly as T-128 built it** — the bin, restorable,
// self-service, because recovery-without-a-helpdesk-ticket is a product virtue
// being deliberately kept. Purge is the *second* act, and the difference is not
// severity but reach: it genuinely erases, **including the derived stores**,
// which is the half that makes it real. A purge that deletes the row and leaves
// `version_chunks` has erased nothing — the text survives in the index, and the
// retrieval query would still find it.
//
// **Bounded by whose material it is, not by where it sits.** ADR-0050 §6: a
// member organisation may require complete deletion of its **own** material,
// and **never** anything promoted into the library — that is the owner's
// record, and removing from it is the owner's own act (§7, T-341). So this
// reaches the sandbox document, its ambient history, its working record, its
// **freeze-series** container (org-private by ADR-0032) and everything derived
// from it. It steps over the library boundary nowhere, and the test that
// matters most is the one proving it.
//
// **Two of the ticket's three Done-when clauses describe T-341's path**, as the
// board itself notes, and one describes infrastructure that does not exist:
//
//   * *purged text unfindable by retrieval and by direct chunk query* — ✅ done
//     here, and tested both ways;
//   * *the S3 object has no recoverable version* — ⚠ **not closable.** Slice
//     V1-I is parked, there is no object store, and the blob substrate is a
//     local directory. `purgeBlob` erases the file it can reach and is the
//     named seam where the version-level purge goes;
//   * *a run that cited it reports `unreconstructable`* — that is T-253's
//     behaviour on **library** chunks, which purge never touches. It is
//     recorded on T-341 rather than half-implemented here.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { deleteChunksForVersions } from '@infora/data';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import { deleteBlob } from './renditions';

/** what a purge reached, counted while there is still something to count */
export type PurgeReach = {
  ambientVersions: number;
  comments: number;
  checkoutEvents: number;
  bindingEvents: number;
  suggestions: number;
  signals: number;
  frozenVersions: number;
  chunks: number;
  renditions: number;
  blobs: number;
};

export type PurgeResult = { reach: PurgeReach; eventId: string };

const EMPTY: PurgeReach = {
  ambientVersions: 0,
  comments: 0,
  checkoutEvents: 0,
  bindingEvents: 0,
  suggestions: 0,
  signals: 0,
  frozenVersions: 0,
  chunks: 0,
  renditions: 0,
  blobs: 0,
};

/**
 * Erase a sandbox document and everything derived from it, and record that it
 * happened.
 *
 * One transaction, and the transaction declares two things:
 *
 *   * **`infora.project_id`** — `version_chunks` is under row-level security
 *     and the policy fails closed (T-247), so an unscoped delete would match
 *     nothing and leave the index intact while reporting success. That is the
 *     exact failure mode this act exists to prevent, arriving through the
 *     back door.
 *   * **`infora.purge`** — `versions`, `signals` and `comments` are append-only
 *     by trigger (T-008), and the trigger admits `DELETE` only while this is
 *     set (migration 0049). `UPDATE` stays forbidden either way: append-only
 *     exists to stop the record being *rewritten*, and erasure needs no
 *     ability to edit.
 *
 * Blobs are erased **after** the transaction commits, and that order is
 * deliberate: a rolled-back transaction must not leave files erased for rows
 * that still exist. The reverse leak — a committed purge whose blob delete
 * fails — leaves an unreferenced file, which the record names in its counts.
 */
export async function purgeSandboxDocument(
  db: Db,
  input: { documentId: string; projectId: string; organisationId: string; userId: string },
): Promise<PurgeResult | null> {
  const [document] = await db
    .select({
      id: s.sandboxDocuments.id,
      title: s.sandboxDocuments.title,
      organisationId: s.sandboxDocuments.organisationId,
      projectId: s.sandboxDocuments.projectId,
      fileRef: s.sandboxDocuments.fileRef,
    })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, input.documentId))
    .limit(1);
  // an org admin reaches its OWN organisation's material and nothing else
  // (ADR-0050 §6) — a mismatch is answered as absence, never as a refusal
  // (contracts principle 4), because "not yours" and "not there" must look the
  // same from outside
  if (!document || document.organisationId !== input.organisationId) return null;
  if (document.projectId !== input.projectId) return null;

  const reach = { ...EMPTY };
  const blobRefs: string[] = [];
  if (document.fileRef !== null) blobRefs.push(document.fileRef);

  const eventId = await withProjectScope(db, input.projectId, async (tx) => {
    await tx.execute(sql`select set_config('infora.purge', 'on', true)`);

    // ── the freeze series: org-private by ADR-0032, and never the library ────
    const frozen = await tx
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(
        and(
          eq(s.containers.sandboxDocumentId, document.id),
          // belt and braces on the boundary that matters: the unique index
          // already makes a library container unable to hold a sandbox
          // document id, and this says out loud that purge never crosses it
          eq(s.containers.scope, 'sandbox'),
        ),
      );
    const containerIds = frozen.map((row) => row.id);

    if (containerIds.length > 0) {
      const versions = await tx
        .select({ id: s.versions.id })
        .from(s.versions)
        .where(inArray(s.versions.containerId, containerIds));
      const versionIds = versions.map((row) => row.id);
      reach.frozenVersions = versionIds.length;

      if (versionIds.length > 0) {
        // the DERIVED half, and the reason this act is more than a DELETE: the
        // chunk carries the document's text and its embedding, so a purge that
        // stops at the row has erased nothing a retrieval could not still find.
        // Asked of @infora/data rather than done here — the grounding index has
        // one reader and one writer by construction (source-rules RULE 1), and
        // unmaking a chunk is the same knowledge as making one.
        reach.chunks = await deleteChunksForVersions(tx, versionIds);

        const renditions = await tx
          .delete(s.renditions)
          .where(inArray(s.renditions.versionId, versionIds))
          .returning({ contentRef: s.renditions.contentRef });
        reach.renditions = renditions.length;
        blobRefs.push(...renditions.map((row) => row.contentRef));

        await tx.delete(s.citations).where(inArray(s.citations.versionId, versionIds));
        await tx.delete(s.versions).where(inArray(s.versions.id, versionIds));
      }
      await tx.delete(s.containers).where(inArray(s.containers.id, containerIds));
    }

    // ── the AI's proposals against this document, and their resolutions ──────
    // a Signal is the firm's own material (ADR-0050 §6) and it quotes the
    // document's text in `edited_content`, so it goes with it
    const suggestions = await tx
      .select({ id: s.suggestions.id })
      .from(s.suggestions)
      .where(eq(s.suggestions.sandboxDocumentId, document.id));
    const suggestionIds = suggestions.map((row) => row.id);
    reach.suggestions = suggestionIds.length;
    if (suggestionIds.length > 0) {
      const signals = await tx
        .delete(s.signals)
        .where(inArray(s.signals.suggestionId, suggestionIds))
        .returning({ id: s.signals.id });
      reach.signals = signals.length;
      await tx.delete(s.citations).where(inArray(s.citations.suggestionId, suggestionIds));
      await tx.delete(s.suggestions).where(inArray(s.suggestions.id, suggestionIds));
    }

    // ── the working record ──────────────────────────────────────────────────
    const ambient = await tx
      .delete(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, document.id))
      .returning({ id: s.sandboxDocumentVersions.id, fileRef: s.sandboxDocumentVersions.fileRef });
    reach.ambientVersions = ambient.length;
    // T-453 — since 0070 a working revision keeps its own file, so erasing the
    // document erases every file it ever was, not only the current one. The
    // newest revision shares the head's blob, so the list is de-duplicated
    // before it is counted.
    for (const { fileRef } of ambient) {
      if (fileRef !== null && !blobRefs.includes(fileRef)) blobRefs.push(fileRef);
    }

    const comments = await tx
      .delete(s.sandboxComments)
      .where(eq(s.sandboxComments.sandboxDocumentId, document.id))
      .returning({ id: s.sandboxComments.id });
    reach.comments = comments.length;

    const checkouts = await tx
      .delete(s.sandboxCheckoutEvents)
      .where(eq(s.sandboxCheckoutEvents.sandboxDocumentId, document.id))
      .returning({ id: s.sandboxCheckoutEvents.id });
    reach.checkoutEvents = checkouts.length;

    const bindings = await tx
      .delete(s.bindingEvents)
      .where(eq(s.bindingEvents.sandboxDocumentId, document.id))
      .returning({ id: s.bindingEvents.id });
    reach.bindingEvents = bindings.length;

    await tx.delete(s.documentPresence).where(eq(s.documentPresence.sandboxDocumentId, document.id));
    // an attached source is a free-text `ref` rather than a foreign key, so a
    // pin naming this document is matched by value — the row is a pointer into
    // a working set and outliving its target would leave a dead pin on screen
    await tx
      .delete(s.attachedSources)
      .where(and(eq(s.attachedSources.kind, 'sandbox'), eq(s.attachedSources.ref, document.id)));

    // A conversation is DETACHED rather than deleted: it is a Run record that
    // may hold work about more than this document, and erasing an audit trail
    // as a side effect of erasing a draft would be a wider act than the one
    // asked for. The thread stops naming a document that no longer exists.
    await tx
      .update(s.conversations)
      .set({ sandboxDocumentId: null })
      .where(eq(s.conversations.sandboxDocumentId, document.id));

    await tx.delete(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, document.id));

    reach.blobs = blobRefs.length;
    const [event] = await tx
      .insert(s.purgeEvents)
      .values({
        projectId: input.projectId,
        organisationId: input.organisationId,
        purgedByUserId: input.userId,
        subjectKind: 'sandbox_document',
        subjectId: document.id,
        // the title survives the document deliberately: a purge record naming
        // only a uuid answers "something was erased" and nothing else
        subjectTitle: document.title,
        reached: reach,
      })
      .returning({ id: s.purgeEvents.id });
    return event!.id;
  });

  // after the commit: a rolled-back purge must not leave files erased for rows
  // that still exist
  for (const ref of blobRefs) deleteBlob(ref);
  return { reach, eventId };
}

// ── T-341 — library removal (ADR-0050 §7) ──────────────────────────────────
//
// **Two steps, and the first is already built.** `containers.state = 'live'` is
// a pre-filter *inside* the retrieval query, in the same statement as the wall,
// so **withdraw already stops a container grounding** the moment it is
// withdrawn. This is the second step: the text goes.
//
// **The authority sits with the owner organisation**, not the producer, and
// that is the decision rather than a detail. It is where the property already
// sits (ADR-0016), and it forecloses the failure the alternative invites — a
// consultancy erasing six months of corpus ahead of a dispute, leaving the
// produced record intact but **uncheckable**, every citation in every accepted
// deliverable resolving to nothing.
//
// **The citing run stays, and does not lie.** A run's evidence lives in
// `steps.source_set` — jsonb, no foreign key — so erasing the version cannot
// touch it. The run-context read then finds the chunk gone and reports T-253's
// `unreconstructable`: *"I read something here and it can no longer be
// produced"*, which is neither erased nor false. `citations` rows DO go, because
// their foreign key to `versions` compels it and the CHECK forbids nulling the
// column — worth knowing, and harmless, because the guarantee the ADR makes
// rests on the step record rather than on that table.

export type RemovalRefusal =
  | 'not_withdrawn'
  | 'not_owner'
  | 'not_library'
  | 'has_review_record';

export type RemovalResult =
  | { ok: true; reach: { versions: number; chunks: number; renditions: number; blobs: number }; eventId: string }
  | { ok: false; reason: RemovalRefusal };

/**
 * Remove a **withdrawn** library container, and everything derived from it.
 *
 * ⚠ **Refused on a container carrying a review record**, and that is where two
 * clauses of the same ADR pull against each other. §7 says removal erases; §8
 * says the library owner **retains the deliverables and the review-cycle
 * metadata, named individuals included**. Erasing a deliverable that has been
 * through a cycle would destroy a signed-off record to solve a problem that
 * record does not have.
 *
 * The ticket's own stated incident settles which way to go: *"the first real
 * corpus load is also the first real test, so a document belonging to a
 * different client going in is the failure to design for."* That document is
 * **loaded reference material** — no work item, no cycle (T-304) — and removal
 * is scoped to exactly it. Removing a produced deliverable is a different act
 * against a different clause, and it is left **unruled rather than decided by
 * this implementation**.
 */
export async function removeLibraryContainer(
  db: Db,
  input: { containerId: string; projectId: string; organisationId: string; userId: string },
): Promise<RemovalResult> {
  const [row] = await db
    .select({
      id: s.containers.id,
      scope: s.containers.scope,
      state: s.containers.state,
      inLibrary: s.containers.inLibrary,
      reference: s.containers.documentReference,
      ownerOrganisationId: s.projects.ownerOrganisationId,
    })
    .from(s.containers)
    .innerJoin(s.projects, eq(s.projects.id, s.containers.projectId))
    .where(and(eq(s.containers.id, input.containerId), eq(s.containers.projectId, input.projectId)))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_owner' }; // absence and denial look alike
  if (row.ownerOrganisationId !== input.organisationId) return { ok: false, reason: 'not_owner' };
  if (row.scope !== 'library' || !row.inLibrary) return { ok: false, reason: 'not_library' };
  // the two steps cannot collapse into one click: withdraw is reversible and
  // this is not, so the reversible one has to have happened first
  if (row.state !== 'withdrawn') return { ok: false, reason: 'not_withdrawn' };

  const [workItem] = await db
    .select({ id: s.workItems.id })
    .from(s.workItems)
    .where(eq(s.workItems.containerId, row.id))
    .limit(1);
  const [cycle] = await db
    .select({ id: s.reviewCycles.id })
    .from(s.reviewCycles)
    .where(eq(s.reviewCycles.containerId, row.id))
    .limit(1);
  if (workItem !== undefined || cycle !== undefined) return { ok: false, reason: 'has_review_record' };

  const blobRefs: string[] = [];
  const reach = { versions: 0, chunks: 0, renditions: 0, blobs: 0 };

  const eventId = await withProjectScope(db, input.projectId, async (tx) => {
    await tx.execute(sql`select set_config('infora.purge', 'on', true)`);
    const versions = await tx
      .select({ id: s.versions.id })
      .from(s.versions)
      .where(eq(s.versions.containerId, row.id));
    const versionIds = versions.map((version) => version.id);
    reach.versions = versionIds.length;

    if (versionIds.length > 0) {
      reach.chunks = await deleteChunksForVersions(tx, versionIds);
      const renditions = await tx
        .delete(s.renditions)
        .where(inArray(s.renditions.versionId, versionIds))
        .returning({ contentRef: s.renditions.contentRef });
      reach.renditions = renditions.length;
      blobRefs.push(...renditions.map((rendition) => rendition.contentRef));
      await tx.delete(s.deliverableAcknowledgements).where(inArray(s.deliverableAcknowledgements.versionId, versionIds));
      await tx.delete(s.citations).where(inArray(s.citations.versionId, versionIds));
      await tx.delete(s.versions).where(inArray(s.versions.id, versionIds));
    }
    await tx.delete(s.containerClassifications).where(eq(s.containerClassifications.containerId, row.id));
    // T-472 — the intake row that admitted this document goes with it: it names
    // the uploader and the confirmer, and an erased document keeps no such trace
    await tx.delete(s.referenceIntake).where(eq(s.referenceIntake.containerId, row.id));
    await tx.delete(s.deliverableShares).where(eq(s.deliverableShares.containerId, row.id));
    await tx.delete(s.containers).where(eq(s.containers.id, row.id));

    reach.blobs = blobRefs.length;
    const [event] = await tx
      .insert(s.purgeEvents)
      .values({
        projectId: input.projectId,
        organisationId: input.organisationId,
        purgedByUserId: input.userId,
        // the same record as a sandbox purge, distinguished by kind: both are
        // acts of erasure with a name against them, and one register is one
        // place to look rather than two
        subjectKind: 'library_container',
        subjectId: row.id,
        subjectTitle: row.reference ?? row.id,
        reached: reach,
      })
      .returning({ id: s.purgeEvents.id });
    return event!.id;
  });

  for (const ref of blobRefs) deleteBlob(ref);
  return { ok: true, reach, eventId };
}
