// T-008 acceptance: UPDATE and DELETE are rejected at the DB layer on every
// append-only table; runs/steps allow only the lifecycle transition while
// 'running'. Requires the dev database (docker compose up -d && pnpm migrate).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

// drizzle wraps PG errors (DrizzleQueryError); the trigger text is on .cause
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

let participantId: string;
let versionId: string;
let containerId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't008 org' }).returning();
  const [user] = await db
    .insert(s.users)
    .values({ name: 't008', email: `t008-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't008 project', ownerOrganisationId: org!.id })
    .returning();
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  participantId = participant!.id;
  const [container] = await db
    .insert(s.containers)
    .values({ projectId: project!.id, producingOrganisationId: org!.id, documentReference: `T008-${Date.now()}`, inLibrary: true })
    .returning();
  containerId = container!.id;
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: 'immutable content' })
    .returning();
  versionId = version!.id;
});

afterAll(async () => {
  await pool.end();
});

const fixtureIds = () => ({ participantId, versionId, containerId });

async function makeRun() {
  const ids = fixtureIds();
  const [container] = await db.select().from(s.containers).where(eq(s.containers.id, ids.containerId));
  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId: container!.projectId, surface: 'web' })
    .returning();
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId: conversation!.id,
      agentId: 'infora.document_production',
      agentProvenance: 'infora',
      request: 'draft the section',
      environmentKey: container!.projectId,
      requesterParticipantId: ids.participantId,
    })
    .returning();
  return run!;
}

describe('strictly insert-only tables', () => {
  it('rejects UPDATE and DELETE on versions', async () => {
    await expectDbError(db.update(s.versions).set({ content: 'tampered' }).where(eq(s.versions.id, versionId)), /append-only/);
    await expectDbError(db.delete(s.versions).where(eq(s.versions.id, versionId)), /append-only/);
  });

  it('rejects UPDATE and DELETE on renditions — a rendition is a snapshot of the record (ADR-0034, T-114)', async () => {
    const [rendition] = await db
      .insert(s.renditions)
      .values({ versionId, kind: 'pdf', format: 'pdf', contentRef: 'blob://t114-test' })
      .returning();
    await expectDbError(
      db.update(s.renditions).set({ contentRef: 'blob://tampered' }).where(eq(s.renditions.id, rendition!.id)),
      /append-only/,
    );
    await expectDbError(db.delete(s.renditions).where(eq(s.renditions.id, rendition!.id)), /append-only/);
  });

  it('rejects UPDATE and DELETE on elevated_refusals — the tier cannot erase its own refusals (T-301)', async () => {
    const [refusal] = await db
      .insert(s.elevatedRefusals)
      .values({
        projectId: (await db.select().from(s.containers).where(eq(s.containers.id, containerId)).limit(1))[0]!
          .projectId,
        containerId,
        attemptedByParticipantId: participantId,
        action: 'container_withdraw',
      })
      .returning();
    await expectDbError(
      db.update(s.elevatedRefusals).set({ requiredTier: 'none' }).where(eq(s.elevatedRefusals.id, refusal!.id)),
      /append-only/,
    );
    await expectDbError(db.delete(s.elevatedRefusals).where(eq(s.elevatedRefusals.id, refusal!.id)), /append-only/);
  });

  it('rejects UPDATE and DELETE on signals and comments', async () => {
    const run = await makeRun();
    const organisationId = (await db.select().from(s.organisations).limit(1))[0]!.id;
    const [sandbox] = await db
      .insert(s.sandboxes)
      .values({
        projectId: run.environmentKey,
        name: 'sb',
        scope: 'single_org',
        owningOrganisationId: organisationId,
        createdByParticipantId: participantId,
      })
      .returning();
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId: run.environmentKey,
        organisationId,
        sandboxId: sandbox!.id,
        title: 't008 doc',
        createdByParticipantId: participantId,
      })
      .returning();
    const [suggestion] = await db
      .insert(s.suggestions)
      .values({ runId: run.id, sandboxDocumentId: doc!.id, kind: 'insert', content: 'x', rationale: 'y' })
      .returning();
    const [signal] = await db
      .insert(s.signals)
      .values({ suggestionId: suggestion!.id, resolution: 'accepted', resolvedByParticipantId: participantId })
      .returning();
    await expectDbError(db.update(s.signals).set({ resolution: 'rejected' }).where(eq(s.signals.id, signal!.id)), /append-only/);
    await expectDbError(db.delete(s.signals).where(eq(s.signals.id, signal!.id)), /append-only/);

  });

  it('review drawer (T-115): comments live while the round is open, frozen once issued; transmittals and snapshots strictly append-only; grants are intervals', async () => {
    const [cycle] = await db.insert(s.reviewCycles).values({ containerId }).returning();
    const [round] = await db
      .insert(s.rounds)
      .values({ cycleId: cycle!.id, number: 1, versionId })
      .returning();
    const [comment] = await db
      .insert(s.reviewComments)
      .values({ roundId: round!.id, versionId, authorParticipantId: participantId, body: 'b' })
      .returning();

    // open round: moderation edits are allowed (ADR-0007), identity is not
    await db.update(s.reviewComments).set({ body: 'moderated' }).where(eq(s.reviewComments.id, comment!.id));
    await expectDbError(
      db.update(s.reviewComments).set({ authorParticipantId: participantId, roundId: round!.id, versionId: crypto.randomUUID() }).where(eq(s.reviewComments.id, comment!.id)),
      /identity is immutable/,
    );
    await expectDbError(db.delete(s.reviewComments).where(eq(s.reviewComments.id, comment!.id)), /append-only/);

    // transmittal + snapshot: strictly append-only records (ADR-0009/0010)
    const [transmittal] = await db
      .insert(s.transmittals)
      .values({ roundId: round!.id, direction: 'issue', senderParticipantId: participantId })
      .returning();
    const [snapshot] = await db
      .insert(s.reviewSnapshots)
      .values({ transmittalId: transmittal!.id, content: { comments: [] } })
      .returning();
    await expectDbError(db.update(s.transmittals).set({ purposeCode: 'x' }).where(eq(s.transmittals.id, transmittal!.id)), /append-only/);
    await expectDbError(db.delete(s.transmittals).where(eq(s.transmittals.id, transmittal!.id)), /append-only/);
    await expectDbError(db.update(s.reviewSnapshots).set({ content: {} }).where(eq(s.reviewSnapshots.id, snapshot!.id)), /append-only/);
    await expectDbError(db.delete(s.reviewSnapshots).where(eq(s.reviewSnapshots.id, snapshot!.id)), /append-only/);

    // issued round: the comment freezes (ADR-0014)
    await db.update(s.rounds).set({ state: 'issued' }).where(eq(s.rounds.id, round!.id));
    await expectDbError(db.update(s.reviewComments).set({ body: 'rewritten after issue' }).where(eq(s.reviewComments.id, comment!.id)), /frozen/);

    // grants: interval rows — revocation closes, identity never changes,
    // nothing is deleted (ADR-0033)
    const [grant] = await db
      .insert(s.deliverableAuthors)
      .values({ containerId, participantId, isLead: true, grantedByParticipantId: participantId })
      .returning();
    await db.update(s.deliverableAuthors).set({ revokedAt: new Date() }).where(eq(s.deliverableAuthors.id, grant!.id));
    await expectDbError(
      db.update(s.deliverableAuthors).set({ participantId: crypto.randomUUID() }).where(eq(s.deliverableAuthors.id, grant!.id)),
      /interval/,
    );
    await expectDbError(db.delete(s.deliverableAuthors).where(eq(s.deliverableAuthors.id, grant!.id)), /append-only/);
  });
});

describe('runs and steps: immutable once finished', () => {
  it('allows the lifecycle transition, then freezes the run', async () => {
    const run = await makeRun();
    await db
      .update(s.runs)
      .set({ state: 'completed', endedAt: new Date() })
      .where(eq(s.runs.id, run.id));
    await expectDbError(db.update(s.runs).set({ state: 'failed' }).where(eq(s.runs.id, run.id)), /immutable/);
    await expectDbError(db.delete(s.runs).where(eq(s.runs.id, run.id)), /append-only/);
  });

  it('rejects content changes even while running', async () => {
    const run = await makeRun();
    await expectDbError(db.update(s.runs).set({ request: 'rewritten prompt' }).where(eq(s.runs.id, run.id)), /only state and ended_at/);
  });

  it('applies the same shape to steps', async () => {
    const run = await makeRun();
    const [step] = await db.insert(s.steps).values({ runId: run.id, type: 'retrieve' }).returning();
    await db
      .update(s.steps)
      .set({ status: 'completed', endedAt: new Date(), sourceSet: [{ versionId }] })
      .where(eq(s.steps.id, step!.id));
    await expectDbError(db.update(s.steps).set({ status: 'failed' }).where(eq(s.steps.id, step!.id)), /immutable/);
    await expectDbError(db.delete(s.steps).where(eq(s.steps.id, step!.id)), /append-only/);
  });
});

describe('drawer-1 constraints', () => {
  it('enforces one owner membership per project', async () => {
    const [org2] = await db.insert(s.organisations).values({ name: 't008 org2' }).returning();
    const [project] = await db.select().from(s.projects).limit(1);
    await expectDbError(db.insert(s.memberships).values({ organisationId: org2!.id, projectId: project!.id, role: 'owner' }), /memberships_one_owner_per_project|duplicate key/);
  });

  it('requires a citation to carry a source', async () => {
    const run = await makeRun();
    const [step] = await db.insert(s.steps).values({ runId: run.id, type: 'cite' }).returning();
    await expectDbError(db.insert(s.citations).values({ stepId: step!.id }), /citations_source_present/);
  });
});
