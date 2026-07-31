// T-249 — the access facts behind label propagation (docs/build/ask/09 R2).
//
// The policy is pure and lives in packages/governance (label.ts). The QUERIES
// live here, beside deliverableVisibleSql, because they read the same facts the
// wall reads — producer, owner, live share, live participant grant (ADR-0035
// §2–§5) — and two definitions of "who can reach this" would drift apart the
// moment one of them was edited.
//
// Sources come from the run's own Step rows: `source_set` records the
// access-resolved sources the run ACTUALLY admitted (ADR-0028 §7). Recomputing
// what it might have seen would answer a different question.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import {
  destinationAudience,
  sourceAudience,
  UNCONSTRAINED,
  type Audience,
  type SourceAccessFacts,
} from '@infora/governance';

/** The audience of everything a run's steps recorded seeing. */
export async function runSourceAudience(db: Db, runId: string): Promise<Audience> {
  const steps = await db
    .select({ sourceSet: s.steps.sourceSet })
    .from(s.steps)
    .where(eq(s.steps.runId, runId));

  const versionIds = new Set<string>();
  for (const step of steps) {
    for (const source of (step.sourceSet as Array<{ versionId?: string }>) ?? []) {
      if (typeof source.versionId === 'string') versionIds.add(source.versionId);
    }
  }
  return versionsAudience(db, [...versionIds]);
}

/** The audience of a named set of versions — the same computation, for a write path that names its sources explicitly (T-280). */
export async function versionsAudience(db: Db, versionIds: string[]): Promise<Audience> {
  if (versionIds.length === 0) return UNCONSTRAINED;

  const containers = await db
    .select({
      containerId: s.containers.id,
      projectId: s.containers.projectId,
      producingOrganisationId: s.containers.producingOrganisationId,
      ownerOrganisationId: s.projects.ownerOrganisationId,
    })
    .from(s.versions)
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .innerJoin(s.projects, eq(s.containers.projectId, s.projects.id))
    .where(inArray(s.versions.id, versionIds));
  if (containers.length === 0) return UNCONSTRAINED;

  const containerIds = containers.map((row) => row.containerId);
  const shares = await db
    .select({
      containerId: s.deliverableShares.containerId,
      organisationId: s.deliverableShares.organisationId,
    })
    .from(s.deliverableShares)
    .where(
      and(inArray(s.deliverableShares.containerId, containerIds), isNull(s.deliverableShares.revokedAt)),
    );
  const grants = await db
    .select({
      containerId: s.deliverableParticipantGrants.containerId,
      participantId: s.deliverableParticipantGrants.participantId,
    })
    .from(s.deliverableParticipantGrants)
    .where(
      and(
        inArray(s.deliverableParticipantGrants.containerId, containerIds),
        isNull(s.deliverableParticipantGrants.revokedAt),
      ),
    );

  const facts: SourceAccessFacts[] = containers.map((container) => {
    const narrowed = grants
      .filter((grant) => grant.containerId === container.containerId)
      .map((grant) => grant.participantId);
    return {
      producingOrganisationId: container.producingOrganisationId,
      ownerOrganisationId: container.ownerOrganisationId,
      sharedWithOrganisationIds: shares
        .filter((share) => share.containerId === container.containerId)
        .map((share) => share.organisationId),
      narrowedToParticipantIds: narrowed.length === 0 ? null : narrowed,
    };
  });

  return sourceAudience(facts, await memberOrganisationCount(db, containers[0]!.projectId));
}

/** The audience of a sandbox document's home: its sandbox's live scope grants. */
export async function sandboxDocumentAudience(db: Db, sandboxDocumentId: string): Promise<Audience> {
  const [document] = await db
    .select({ sandboxId: s.sandboxDocuments.sandboxId })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, sandboxDocumentId))
    .limit(1);
  if (!document) throw new Error(`sandbox document ${sandboxDocumentId} not found`);
  return sandboxAudience(db, document.sandboxId);
}

export async function sandboxAudience(db: Db, sandboxId: string): Promise<Audience> {
  const [sandbox] = await db
    .select({ projectId: s.sandboxes.projectId })
    .from(s.sandboxes)
    .where(eq(s.sandboxes.id, sandboxId))
    .limit(1);
  if (!sandbox) throw new Error(`sandbox ${sandboxId} not found`);

  const grants = await db
    .select({
      granteeType: s.sandboxScopeGrants.granteeType,
      organisationId: s.sandboxScopeGrants.organisationId,
      participantId: s.sandboxScopeGrants.participantId,
    })
    .from(s.sandboxScopeGrants)
    .where(
      and(eq(s.sandboxScopeGrants.sandboxId, sandboxId), isNull(s.sandboxScopeGrants.removedAt)),
    );

  const organisationIds = grants
    .filter((grant) => grant.granteeType === 'organisation' && grant.organisationId !== null)
    .map((grant) => grant.organisationId!);
  const participantIds = grants
    .filter((grant) => grant.granteeType === 'participant' && grant.participantId !== null)
    .map((grant) => grant.participantId!);

  const homes =
    participantIds.length === 0
      ? []
      : await db
          .select({ organisationId: s.users.organisationId })
          .from(s.participants)
          .innerJoin(s.users, eq(s.participants.userId, s.users.id))
          .where(inArray(s.participants.id, participantIds));

  return destinationAudience(
    {
      organisationIds,
      participantIds,
      participantOrganisationIds: homes.map((home) => home.organisationId),
    },
    await memberOrganisationCount(db, sandbox.projectId),
  );
}

async function memberOrganisationCount(db: Db, projectId: string): Promise<number> {
  const rows = await db
    .select({ organisationId: s.memberships.organisationId })
    .from(s.memberships)
    .where(and(eq(s.memberships.projectId, projectId), eq(s.memberships.state, 'active')));
  return new Set(rows.map((row) => row.organisationId)).size;
}

/**
 * T-253 — the passages behind a run's recorded chunk ids.
 *
 * Lives here, not in orchestration, for two reasons that agree: `version_chunks`
 * is fenced to this package and `data` by the T-247 source guard, and the read
 * must declare its project scope or row-level security returns nothing — which
 * would render every passage "unreconstructable" and quietly turn the audit
 * answer into an empty one.
 */
export async function readChunkPassages(
  db: Db,
  projectId: string,
  chunkIds: string[],
): Promise<Map<string, { chunkIndex: number; content: string }>> {
  if (chunkIds.length === 0) return new Map();
  const rows = await withProjectScope(db, projectId, (tx) =>
    tx
      .select({
        id: s.versionChunks.id,
        chunkIndex: s.versionChunks.chunkIndex,
        content: s.versionChunks.content,
      })
      .from(s.versionChunks)
      .where(inArray(s.versionChunks.id, chunkIds)),
  );
  return new Map(rows.map((row) => [row.id, { chunkIndex: row.chunkIndex, content: row.content }]));
}
