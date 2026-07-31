// T-046 — conversations, runs and work items live over HTTP; the full chain
// callable. Read scope per the 2026-07-12 ruling (supersedes 2026-07-06's
// project-record read): every Run is readable by its producing organisation
// only. The record is retained background data — the consultant carries the
// professional liability for the work product, and the client reviews the
// *document* through the review cycle, never the agent's internals.
// Everything else is the same not_found as nonexistence.
import { Hono } from 'hono';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { createConversationBody, createRunBody, openRunInEditorBody } from '@infora/contracts';
import type { ApiError, GetHistoryResponse, HistoryEntry, Id, Run, WorkItem } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canAccessSandbox, checkPropagation } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { runSourceAudience, sandboxAudience } from '@infora/knowledge';
import { createConversation, readRun, readRunContext, runChain } from '@infora/orchestration';
import type { ChainLeaves, RunRow } from '@infora/orchestration';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';
import { ensureDefaultSandbox, toSandboxDocument } from './sandbox';

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

    // a document-bound conversation is the multiplayer thread (ADR-0039); the
    // targeted document must be visible to the requester (org-private in the
    // skeleton) — another org's sandbox document "does not exist"
    if (body.data.sandboxDocumentId !== undefined) {
      const home = await resourceHomes.sandboxDocument(deps.db, body.data.sandboxDocumentId);
      if (home?.projectId !== slice.projectId || home.organisationId !== slice.organisationId) {
        return c.json(notFound, 404);
      }
    }

    const conversation = await createConversation(deps.db, {
      projectId: slice.projectId,
      surface: body.data.surface,
      workItemId: body.data.workItemId ?? null,
      sandboxDocumentId: body.data.sandboxDocumentId ?? null,
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

  // T-249 — carrying an answer into the editor, with the label enforced
  // (docs/build/ask/09 R2, finding F2). This exists as a server-side path precisely
  // BECAUSE the old client flow — create a document, then PATCH the answer in —
  // told the server nothing about where the content came from. Provenance the
  // server cannot see is provenance it cannot enforce.
  app.post(
    '/runs/:runId/sandbox-document',
    resourceScope(deps, 'runId', resourceHomes.run),
    async (c) => {
      const body = openRunInEditorBody.safeParse(await c.req.json().catch(() => ({})));
      if (!body.success) return c.json(invalid('title, sandboxId, folderId, override'), 400);
      const slice = c.get('slice');
      const runId = c.req.param('runId');

      const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
      if (!run || !(await runVisibleTo(deps.db, run, slice))) return c.json(notFound, 404);
      // your own answer, into your own document: a colleague reading the run
      // may not carry it anywhere, because the resulting document would be
      // attributed to them while resting on someone else's request
      if (run.requesterParticipantId !== slice.participantId) return c.json(notFound, 404);

      const sandboxId =
        body.data.sandboxId ??
        (await ensureDefaultSandbox(deps.db, slice.projectId, slice.organisationId, slice.participantId));
      const [sandbox] = await deps.db
        .select()
        .from(s.sandboxes)
        .where(eq(s.sandboxes.id, sandboxId))
        .limit(1);
      const grants = sandbox
        ? await deps.db
            .select()
            .from(s.sandboxScopeGrants)
            .where(
              and(
                eq(s.sandboxScopeGrants.sandboxId, sandbox.id),
                isNull(s.sandboxScopeGrants.removedAt),
              ),
            )
        : [];
      if (!sandbox || sandbox.projectId !== slice.projectId || !canAccessSandbox(slice, grants)) {
        return c.json(notFound, 404);
      }

      // the label, computed from the access facts as they stand — never a
      // stored value that could have gone stale behind a revoked share
      const source = await runSourceAudience(deps.db, runId);
      const destination = await sandboxAudience(deps.db, sandboxId);
      const verdict = checkPropagation(source, destination);

      if (!verdict.allowed && body.data.override === undefined) {
        // named in full: a refusal a user cannot act on reads as a broken
        // system rather than a careful one
        return c.json(
          { error: 'forbidden', detail: verdict.reason } satisfies ApiError,
          403,
        );
      }

      const title =
        body.data.title ?? (run.request.length > 60 ? `${run.request.slice(0, 57)}…` : run.request);
      const document = await deps.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(s.sandboxDocuments)
          .values({
            projectId: slice.projectId,
            organisationId: slice.organisationId,
            sandboxId,
            folderId: body.data.folderId ?? null,
            title,
            content: run.response ?? '',
            createdByParticipantId: slice.participantId,
          })
          .returning();
        if (!verdict.allowed) {
          // the override and the write land together: an override recorded
          // separately could be lost while the widened content stood
          await tx.insert(s.labelOverrides).values({
            runId,
            destinationKind: 'sandbox_document',
            destinationId: row!.id,
            sourceLabel: verdict.source,
            destinationLabel: verdict.destination,
            reason: body.data.override!.reason,
            overriddenByParticipantId: slice.participantId,
          });
        }
        await tx.insert(s.sandboxDocumentVersions).values({
          sandboxDocumentId: row!.id,
          content: row!.content,
          createdByParticipantId: slice.participantId,
        });
        return row!;
      });

      return c.json(toSandboxDocument(document), 201);
    },
  );

  app.get('/runs/:runId', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!run || !(await runVisibleTo(deps.db, run, c.get('slice')))) return c.json(notFound, 404);
    return c.json(await readRun(deps.db, runId));
  });

  // T-253 — the assembled context this run saw, at passage grain
  // (docs/build/ask/09 R5). Producer-private on exactly the run's own scope: the
  // passages are the client's documents, and this read is the producer's
  // evidence of what its agent was shown, never a second route into the corpus.
  app.get('/runs/:runId/context', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!run || !(await runVisibleTo(deps.db, run, c.get('slice')))) return c.json(notFound, 404);
    return c.json(await readRunContext(deps.db, runId));
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

  // T-108 — the requester's own history on the project: their prompted
  // turns, newest first, Ask chats and document runs alike. Self-scoped by
  // construction (only runs the caller requested), so the producer-private
  // read (T-104) holds without a visibility walk. The document a turn
  // targeted is read off its suggestions (the run row carries no document;
  // a document run that produced none reads as a chat turn — tracker).
  app.get('/projects/:projectId/history', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select({
        run: s.runs,
        documentId: s.sandboxDocuments.id,
        documentTitle: s.sandboxDocuments.title,
      })
      .from(s.runs)
      .innerJoin(s.conversations, eq(s.runs.conversationId, s.conversations.id))
      .leftJoin(s.suggestions, eq(s.suggestions.runId, s.runs.id))
      .leftJoin(s.sandboxDocuments, eq(s.suggestions.sandboxDocumentId, s.sandboxDocuments.id))
      .where(
        and(
          eq(s.conversations.projectId, slice.projectId),
          eq(s.runs.requesterParticipantId, slice.participantId),
          isNull(s.runs.parentRunId),
        ),
      )
      .orderBy(desc(s.runs.startedAt));

    const items: HistoryEntry[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.run.id)) continue; // one entry per run — its suggestions share a document
      seen.add(row.run.id);
      items.push({
        runId: row.run.id,
        conversationId: row.run.conversationId,
        request: row.run.request,
        state: row.run.state,
        startedAt: row.run.startedAt.toISOString(),
        sandboxDocument:
          row.documentId !== null && row.documentTitle !== null
            ? { id: row.documentId, title: row.documentTitle }
            : null,
      });
    }
    return c.json({ items } satisfies GetHistoryResponse);
  });

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
    containerId: row.containerId,
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
