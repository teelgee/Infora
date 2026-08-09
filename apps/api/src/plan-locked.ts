// T-365 (S7, ADR-0040 addendum 2026-08-09) — the plan-locked derivation. In a
// plan-locked sandbox the tree is DERIVED from the owning organisation's own
// plan rows: a discipline folder (the schema field) over a working folder per
// deliverable (reference + title). Folders appear as rows are created (a batch
// import's rows in the same reconcile), a folder's name tracks its row, and a
// withdrawn row's folder is KEPT — this sync only ever adds and renames, never
// deletes or re-parents, so nothing a team filed is orphaned. Idempotent by
// the (sandbox, container) unique index and the by-name discipline lookup.
import { and, eq } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export async function syncPlanLockedFolders(
  db: Db,
  projectId: string,
  organisationId: string,
  actorParticipantId: string,
): Promise<void> {
  const lockedSandboxes = await db
    .select({ id: s.sandboxes.id })
    .from(s.sandboxes)
    .where(
      and(
        eq(s.sandboxes.projectId, projectId),
        eq(s.sandboxes.owningOrganisationId, organisationId),
        eq(s.sandboxes.planLocked, true),
      ),
    );
  if (lockedSandboxes.length === 0) return;

  // the org's live plan rows and their titles — the derivation's one source
  const rows = await db
    .select({ container: s.containers, title: s.workItems.title })
    .from(s.containers)
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(
      and(
        eq(s.containers.projectId, projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.producingOrganisationId, organisationId),
        eq(s.containers.state, 'live'),
      ),
    );

  for (const sandbox of lockedSandboxes) {
    const folders = await db
      .select()
      .from(s.sandboxFolders)
      .where(eq(s.sandboxFolders.sandboxId, sandbox.id));
    const byContainer = new Map(
      folders.filter((f) => f.containerId !== null).map((f) => [f.containerId!, f]),
    );
    const disciplineByName = new Map(
      folders.filter((f) => f.kind === 'discipline').map((f) => [f.name, f]),
    );

    for (const { container, title } of rows) {
      if (!container.documentReference || title === null) continue; // reference material is not a working folder
      const workingName = `${container.documentReference} — ${title}`;
      const existing = byContainer.get(container.id);
      if (existing) {
        // rename tracks the row (retitle renames the folder); the folder is
        // never re-parented or deleted — content is never orphaned. The
        // discipline folder is only ensured when a working folder is CREATED,
        // so a later discipline change cannot spawn empty discipline folders.
        if (existing.name !== workingName) {
          await db
            .update(s.sandboxFolders)
            .set({ name: workingName })
            .where(eq(s.sandboxFolders.id, existing.id));
        }
        continue;
      }

      const disciplineRaw = (container.metadata as Record<string, unknown>)['discipline'];
      const discipline =
        typeof disciplineRaw === 'string' && disciplineRaw.trim() !== '' ? disciplineRaw.trim() : null;
      let disciplineFolderId: string | null = null;
      if (discipline) {
        const cached = disciplineByName.get(discipline);
        if (cached) {
          disciplineFolderId = cached.id;
        } else {
          // concurrent syncs race on the same discipline — the partial unique
          // index (0044) referees; the loser re-selects the winner's row
          const [created] = await db
            .insert(s.sandboxFolders)
            .values({
              sandboxId: sandbox.id,
              parentFolderId: null,
              name: discipline,
              kind: 'discipline',
              createdByParticipantId: actorParticipantId,
            })
            .onConflictDoNothing()
            .returning();
          const disciplineFolder =
            created ??
            (
              await db
                .select()
                .from(s.sandboxFolders)
                .where(
                  and(
                    eq(s.sandboxFolders.sandboxId, sandbox.id),
                    eq(s.sandboxFolders.kind, 'discipline'),
                    eq(s.sandboxFolders.name, discipline),
                  ),
                )
                .limit(1)
            )[0]!;
          disciplineByName.set(discipline, disciplineFolder);
          disciplineFolderId = disciplineFolder.id;
        }
      }

      await db
        .insert(s.sandboxFolders)
        .values({
          sandboxId: sandbox.id,
          parentFolderId: disciplineFolderId,
          name: workingName,
          kind: 'deliverable',
          containerId: container.id,
          createdByParticipantId: actorParticipantId,
        })
        // two concurrent syncs may race on the same row — the unique index
        // decides, and losing the race means the folder already exists
        .onConflictDoNothing();
    }
  }
}

/** Does this folder sit inside a deliverable's working folder (itself included)?
 * The plan-locked mode's member-freedom boundary: the derived levels above are
 * system-owned; inside a deliverable's folder the allowMemberFolderCreate
 * toggle governs (the two settings compose — ADR-0040 addendum). */
export async function withinDeliverableFolder(db: Db, folderId: string | null): Promise<boolean> {
  let cursor = folderId;
  for (let depth = 0; cursor !== null && depth < 50; depth++) {
    const [folder] = await db
      .select({ kind: s.sandboxFolders.kind, parentFolderId: s.sandboxFolders.parentFolderId })
      .from(s.sandboxFolders)
      .where(eq(s.sandboxFolders.id, cursor))
      .limit(1);
    if (!folder) return false;
    if (folder.kind === 'deliverable') return true;
    cursor = folder.parentFolderId;
  }
  return false;
}
