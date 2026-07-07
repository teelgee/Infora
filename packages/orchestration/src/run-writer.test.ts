// T-040 acceptance, against the live dev database: the lifecycle writes,
// the tree links, and the append-only triggers hold through the writer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema as s } from '@infora/db';
import {
  createConversation,
  finishRun,
  finishStep,
  openRun,
  openStep,
} from './run-writer';

const { db, pool } = createDb();

let projectId: string;
let participantId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't040 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't040 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db
    .insert(s.memberships)
    .values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't040', email: `t040-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;
});

afterAll(async () => {
  await pool.end();
});

function newRun() {
  return createConversation(db, { projectId, surface: 'web' }).then((conversation) =>
    openRun(db, {
      conversationId: conversation.id,
      agentId: 'infora.document_production',
      agentProvenance: 'infora',
      request: 'draft the land quality section',
      environmentKey: projectId,
      requesterParticipantId: participantId,
    }),
  );
}

describe('the Run/Step writer (T-040)', () => {
  it('opens running, finishes completed with the audit payload, exactly once', async () => {
    const run = await newRun();
    expect(run.state).toBe('running');

    const step = await openStep(db, { runId: run.id, type: 'retrieve' });
    const finishedStep = await finishStep(db, step.id, 'completed', {
      model: { id: 'voyage-3.5', version: 'voyage-3.5' },
      usage: { tokensPrompt: 12, tokensCompletion: 0, cost: 0.0001 },
      sourceSet: [{ versionId: run.id }],
      railOutcomes: [{ rail: 'grounding', outcome: 'passed' }],
    });
    expect(finishedStep.status).toBe('completed');
    expect(finishedStep.endedAt).not.toBeNull();
    expect(finishedStep.sourceSet).toEqual([{ versionId: run.id }]);

    const finishedRun = await finishRun(db, run.id, 'completed');
    expect(finishedRun.state).toBe('completed');

    // immutable once finished — the trigger, surfaced through the writer
    await expect(finishRun(db, run.id, 'failed')).rejects.toThrow();
    await expect(finishStep(db, step.id, 'failed')).rejects.toThrow();
  });

  it('records the sub-agent tree: delegate step → child run, parent links intact', async () => {
    const run = await newRun();
    const delegate = await openStep(db, { runId: run.id, type: 'delegate' });

    const [conversation] = await db
      .select()
      .from(s.conversations)
      .where(eq(s.conversations.id, run.conversationId));
    const child = await openRun(db, {
      conversationId: conversation!.id,
      agentId: 'infora.retrieval',
      agentProvenance: 'infora',
      request: 'targeted retrieval',
      environmentKey: projectId,
      requesterParticipantId: participantId,
      parentRunId: run.id,
    });
    expect(child.parentRunId).toBe(run.id);

    const childStep = await openStep(db, { runId: child.id, type: 'retrieve' });
    const nested = await openStep(db, { runId: child.id, type: 'retrieve', parentStepId: childStep.id });
    expect(nested.parentStepId).toBe(childStep.id);

    await finishStep(db, nested.id, 'completed');
    await finishStep(db, childStep.id, 'completed');
    await finishRun(db, child.id, 'completed');
    const done = await finishStep(db, delegate.id, 'completed', { childRunId: child.id });
    expect(done.childRunId).toBe(child.id);
    await finishRun(db, run.id, 'completed');
  });

  it('a failed run stays failed and its record intact', async () => {
    const run = await newRun();
    const step = await openStep(db, { runId: run.id, type: 'draft' });
    await finishStep(db, step.id, 'failed', {
      railOutcomes: [{ rail: 'grounding', outcome: 'withheld', detail: 'model unavailable' }],
    });
    const failed = await finishRun(db, run.id, 'failed');
    expect(failed.state).toBe('failed');
    expect(failed.request).toBe('draft the land quality section'); // the record survives
    await expect(finishRun(db, run.id, 'completed')).rejects.toThrow();
  });
});
