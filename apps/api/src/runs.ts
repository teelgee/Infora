// T-046 — conversations, runs and work items live over HTTP; the full chain
// callable. Read scope per the 2026-07-12 ruling (supersedes 2026-07-06's
// project-record read): every Run is readable by its producing organisation
// only. The record is retained background data — the consultant carries the
// professional liability for the work product, and the client reviews the
// *document* through the review cycle, never the agent's internals.
// Everything else is the same not_found as nonexistence.
import { Hono } from 'hono';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { createConversationBody, createRunBody } from '@infora/contracts';
import type { ApiError, Id, Run, WorkItem } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { createConversation, readRun, runChain } from '@infora/orchestration';
import type { ChainLeaves, RunRow } from '@infora/orchestration';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

const notFound = { error: 'not_found' } satisfies ApiError;
const invalid = (detail: string) => ({ error: 'invalid', detail }) satisfies ApiError;

export function runRoutes(deps: { db: Db; leaves: ChainLeaves }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.post('/projects/:projectId/conversations', project, async (c) => {
    const body = createConversationBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(invalid('surface required'), 400);
    const slice = c.get('slice');

    if (body.data.workItemId !== undefined) {
      const home = await resourceHomes.workItem(deps.db, body.data.workItemId);
      if (home?.projectId !== slice.projectId) return c.json(notFound, 404); // principle 4
    }

    const conversation = await createConversation(deps.db, {
      projectId: slice.projectId,
      surface: body.data.surface,
      workItemId: body.data.workItemId ?? null,
    });
    return c.json({ conversationId: conversation.id }, 201);
  });

  app.post(
    '/conversations/:conversationId/runs',
    resourceScope(deps, 'conversationId', resourceHomes.conversation),
    async (c) => {
      const body = createRunBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json(invalid('request text required'), 400);
      const slice = c.get('slice');

      if (body.data.sandboxDocumentId !== undefined) {
        const home = await resourceHomes.sandboxDocument(deps.db, body.data.sandboxDocumentId);
        if (home?.projectId !== slice.projectId || home.organisationId !== slice.organisationId) {
          return c.json(notFound, 404); // another org's sandbox "does not exist"
        }
      }

      const { run } = await runChain(deps.db, deps.leaves, {
        conversationId: c.req.param('conversationId'),
        request: body.data.request,
        environmentKey: slice.projectId,
        requesterParticipantId: slice.participantId,
        sandboxDocumentId: body.data.sandboxDocumentId ?? null,
      });
      return c.json((await readRun(deps.db, run.id)) satisfies Run | null, 201);
    },
  );

  app.get('/runs/:runId', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!run || !(await runVisibleTo(deps.db, run, c.get('slice')))) return c.json(notFound, 404);
    return c.json(await readRun(deps.db, runId));
  });

  app.get(
    '/conversations/:conversationId',
    resourceScope(deps, 'conversationId', resourceHomes.conversation),
    async (c) => {
      const rows = await deps.db
        .select()
        .from(s.runs)
        .where(
          and(
            eq(s.runs.conversationId, c.req.param('conversationId')),
            isNull(s.runs.parentRunId), // sub-agent runs read via their childRunId
          ),
        )
        .orderBy(asc(s.runs.startedAt));
      return c.json({ runs: await visibleRuns(deps.db, rows, c.get('slice')) });
    },
  );

  app.get('/projects/:projectId/work-items', project, async (c) => {
    const rows = await deps.db
      .select()
      .from(s.workItems)
      .where(eq(s.workItems.projectId, c.get('slice').projectId));
    return c.json({ items: rows.map(toWorkItem) });
  });

  app.get(
    '/work-items/:workItemId',
    resourceScope(deps, 'workItemId', resourceHomes.workItem),
    async (c) => {
      const workItemId = c.req.param('workItemId');
      const [item] = await deps.db
        .select()
        .from(s.workItems)
        .where(eq(s.workItems.id, workItemId))
        .limit(1);
      const rows = await deps.db
        .select({ run: s.runs })
        .from(s.runs)
        .innerJoin(s.conversations, eq(s.runs.conversationId, s.conversations.id))
        .where(and(eq(s.conversations.workItemId, workItemId), isNull(s.runs.parentRunId)))
        .orderBy(asc(s.runs.startedAt));
      return c.json({
        ...toWorkItem(item!),
        runs: await visibleRuns(deps.db, rows.map((r) => r.run), c.get('slice')),
      });
    },
  );

  return app;
}

function toWorkItem(row: typeof s.workItems.$inferSelect): WorkItem {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    status: row.status,
    assigneeParticipantId: row.assigneeParticipantId,
  };
}

// The 2026-07-12 read-scope ruling (supersedes 2026-07-06): the record turns
// inward — a Run is readable by its producing organisation only, work-item
// bound or not. The producing organisation is the run's requester
// participant's organisation — derived from the record, never the caller.
async function runVisibleTo(db: Db, run: RunRow, slice: EntitledSlice): Promise<boolean> {
  const [producer] = await db
    .select({ organisationId: s.users.organisationId })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.participants.id, run.requesterParticipantId))
    .limit(1);
  return producer?.organisationId === slice.organisationId;
}

async function visibleRuns(db: Db, rows: RunRow[], slice: EntitledSlice): Promise<Run[]> {
  const runs: Run[] = [];
  for (const row of rows) {
    if (!(await runVisibleTo(db, row, slice))) continue;
    const run = await readRun(db, row.id as Id);
    if (run) runs.push(run);
  }
  return runs;
}
