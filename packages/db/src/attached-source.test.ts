// T-149 acceptance (ADR-0022 refined): an attached-source working set is
// scoped to a Conversation and persists across its Runs as an interval — pin
// adds, unpin closes removed_at. It lives beside the run record and is never a
// version_chunk, so it can never enter the grounding query (retrieval.ts reads
// only version_chunks). Requires the dev database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

let conversationId: string;
let participantId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't149 org' }).returning();
  const [user] = await db
    .insert(s.users)
    .values({ name: 't149', email: `t149-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't149 project', ownerOrganisationId: org!.id })
    .returning();
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [p] = await db.insert(s.participants).values({ userId: user!.id, projectId: project!.id }).returning();
  participantId = p!.id;
  const [conv] = await db
    .insert(s.conversations)
    .values({ projectId: project!.id, surface: 'web' })
    .returning();
  conversationId = conv!.id;
});

afterAll(async () => {
  await pool.end();
});

const liveSet = () =>
  db
    .select()
    .from(s.attachedSources)
    .where(and(eq(s.attachedSources.conversationId, conversationId), isNull(s.attachedSources.removedAt)));

describe('attached-source working set (T-149, ADR-0022)', () => {
  it('pins one or several sources of different kinds to a Conversation', async () => {
    await db.insert(s.attachedSources).values([
      { conversationId, kind: 'sandbox', ref: 'sandbox-doc-1', label: 'Draft', pinnedByParticipantId: participantId },
      { conversationId, kind: 'upload', ref: 'file-ref-2', label: 'Spec.pdf', pinnedByParticipantId: participantId },
      { conversationId, kind: 'web', ref: 'https://example.test/standard', pinnedByParticipantId: participantId },
    ]);
    const live = await liveSet();
    expect(live.map((r) => r.kind).sort()).toEqual(['sandbox', 'upload', 'web']);
  });

  it('persists across a Conversation Run — the working set is not per-turn', async () => {
    await db.insert(s.runs).values({
      conversationId,
      agentId: 'chat',
      agentProvenance: 'infora',
      request: 'draft using the pinned files',
      environmentKey: `project:${conversationId}`,
      requesterParticipantId: participantId,
    });
    const live = await liveSet();
    expect(live.length).toBe(3); // unchanged by a run
  });

  it('unpins by closing the interval — the row survives for the audit of who vouched', async () => {
    const live = await liveSet();
    const web = live.find((r) => r.kind === 'web')!;
    await db.update(s.attachedSources).set({ removedAt: new Date() }).where(eq(s.attachedSources.id, web.id));
    const after = await liveSet();
    expect(after.length).toBe(2);
    const all = await db.select().from(s.attachedSources).where(eq(s.attachedSources.conversationId, conversationId));
    expect(all.length).toBe(3); // nothing deleted
  });
});
