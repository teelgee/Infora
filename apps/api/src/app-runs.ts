// T-443 — **runs, and the insight a run writes** (ADR-0056 §3, §5).
//
// *In plain terms: somebody presses Run. Infora reads the rows that person is
// allowed to read, works out the numbers itself, asks the model for one
// sentence about them, and keeps that sentence as a row in the app's insight
// table — stamped with the running person's organisation, with what it covered
// and which version of the app it ran against.*
//
// **Why this is its own file rather than more of `apps.ts`.** A run reads rows,
// and rows are reached through `app-rows.ts`, which already imports from
// `apps.ts`. Putting the run beside the app routes would make those two files
// import each other; `app-exports.ts` sits in exactly this position for exactly
// this reason and is the precedent followed here. The routes are unchanged —
// `POST /apps/:appId/runs` and `GET /apps/:appId/runs`, mounted in `app.ts`.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { runAppBody } from '@infora/contracts';
import type {
  ApiError,
  AppColumn,
  AppDefinition,
  AppRunRecord,
  ListAppRunsResponse,
} from '@infora/contracts';
import { appRunnable } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { buildFacts, reachApp } from './apps';
import { listRows, reachTable } from './app-rows';
import { figuresFor, writeInsightSentence } from './app-insight';
import type { CoveredTable } from './app-insight';
import type { AppEnv } from './requester';
import { refuseIfOff } from './ai-features';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);

export function appRunRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();

  // ── Runs, and the insight the run writes (ADR-0056 §3, §5) ────────────────
  //
  // An app run is an ADR-0028 Run: a Conversation, a Run, and a Step of the one
  // type drawer 9 added. `definitions_version` records the PUBLISHED version,
  // and the two actor stamps are checked against each other by the database.
  //
  // 🔒 **THE RUN ACTS AS THE PERSON WHO PRESSED RUN, THROUGH THE ORDINARY ROWS
  // PATH.** It reaches every declared table with `reachTable` and lists with
  // `listRows` — the same two functions the rows screen and the export use, so
  // the predicate is `canReadAppRow` once and not a second copy here. That is
  // what makes the ticket's negative true by construction: a person who cannot
  // see a shared table's rows covers only their own, because those are the only
  // rows this route was ever handed.
  //
  // 🔒 **THE FIGURES ARE COMPUTED IN CODE; THE MODEL WRITES ONLY THE SENTENCE**
  // (`app-insight.ts`). No row's values reach a model from here.
  //
  // 🔒 **THE INSIGHT IS STAMPED WITH THE RUNNING PERSON'S ORGANISATION**, which
  // is what decides who may read it — the entering organisation and the project
  // owner, and nobody else (§3). It is written as an ordinary `app_rows` row, so
  // it is read back through the same predicate as every other row.
  //
  // **`scheduled` remains a stored intention.** There is no clock (§13d); the
  // only trigger a caller may ask for is `manual`, and the schedule on the
  // published definition is what a clock would one day read.
  app.post('/apps/:appId/runs', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    const parsed = runAppBody.safeParse((await c.req.json().catch(() => null)) ?? {});
    if (!parsed.success) return invalid(c);
    // T-463 — the project's switch
    const off = await refuseIfOff(c, deps.db, loaded.row.projectId, 'app_insights');
    if (off) return off;
    const facts = buildFacts(loaded, slice);
    const verdict = appRunnable(facts);
    if (!verdict.runnable) {
      return c.json({ error: 'conflict', detail: verdict.because } satisfies ApiError, 409);
    }
    const [conversation] = await deps.db
      .insert(s.conversations)
      .values({ projectId: loaded.row.projectId, surface: 'web' })
      .returning();
    const [run] = await deps.db
      .insert(s.runs)
      .values({
        conversationId: conversation!.id,
        agentId: `app:${loaded.row.id}`,
        agentProvenance: 'infora',
        request: `Run ${loaded.row.name}`,
        environmentKey: `project:${loaded.row.projectId}`,
        requesterParticipantId: slice.participantId,
      })
      .returning();
    await deps.db.insert(s.steps).values({ runId: run!.id, type: 'app_step', status: 'completed' });
    const [actor] = await deps.db
      .select({ name: s.users.name })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.participants.id, slice.participantId))
      .limit(1);
    const actorName = actor!.name;

    // the tables the app DECLARED — the narrowing §5 requires, and the only
    // tables a run may touch. An insight table is not read over; it is written
    // into, and a run summarising its own past summaries would compound.
    const declared = await deps.db
      .select()
      .from(s.appTables)
      .where(and(eq(s.appTables.appId, loaded.row.id), isNull(s.appTables.retiredAt)))
      .orderBy(asc(s.appTables.name));
    const insightTable = declared.find((table) => table.kind === 'insight') ?? null;

    const covered: CoveredTable[] = [];
    const tablesCovered: string[] = [];
    let rowsCovered = 0;
    for (const table of declared) {
      if (table.kind === 'insight') continue;
      const context = await reachTable(deps.db, user, table.id);
      if (!context) continue;
      const rows = await listRows(deps.db, context);
      covered.push({
        name: table.name,
        columns: table.columns as AppColumn[],
        hasAcceptance: table.hasAcceptance,
        rows,
      });
      tablesCovered.push(table.id);
      rowsCovered += rows.length;
    }

    // what the run found, and where it landed. `outcome` is a fixed phrase
    // Infora writes — never the model's words, because the run list is read by
    // everyone who may open the app and the insight is not.
    const figures = covered.map(figuresFor);
    let insightRowId: string | null = null;
    let outcome: string;
    if (insightTable === null) {
      outcome = 'no insight table is declared, so there was nowhere to write one';
    } else {
      const definition = (loaded.row.publishedDefinition as AppDefinition | null) ?? null;
      let sentence: string | null;
      try {
        sentence = await writeInsightSentence(deps.router, {
          appName: loaded.row.name,
          analysisPrompt: definition?.analysisPrompt ?? null,
          figures,
        });
      } catch {
        // a run that reached the rows and could not reach the model is a run
        // that happened and produced nothing; it is recorded as such rather
        // than failing, so the record does not lose the read that did occur
        sentence = null;
      }
      if (sentence === null) {
        outcome = 'the analysis could not be written';
      } else {
        const [insightRow] = await deps.db
          .insert(s.appRows)
          .values({
            appTableId: insightTable.id,
            values: {
              as_at: new Date().toISOString(),
              insight: sentence,
              rows_covered: rowsCovered,
              definitions_version: loaded.row.publishedVersion!,
            },
            // the stamp is the running person's own, exactly as it is when a
            // person types a row: it is what decides who reads the insight
            organisationId: slice.organisationId,
            enteredByParticipantId: slice.participantId,
            // an insight table has no acceptance step (an insight is not
            // submitted to anybody), so its rows are stateless
            state: null,
          })
          .returning();
        insightRowId = insightRow!.id;
        outcome = 'an insight was written';
      }
    }

    const [appRun] = await deps.db
      .insert(s.appRuns)
      .values({
        appId: loaded.row.id,
        runId: run!.id,
        trigger: parsed.data.trigger,
        asParticipantId: slice.participantId,
        definitionsVersion: loaded.row.publishedVersion!,
        tablesCovered,
        rowsCovered,
        insightRowId,
        finishedAt: sql`now()`,
        outcome,
      })
      .returning();
    return c.json(
      {
        run: {
          id: appRun!.id,
          appId: loaded.row.id,
          runId: run!.id,
          trigger: appRun!.trigger,
          asName: actorName, // (review 2026-09-07) the ACTOR, not the owner — POST previously named the owner while GET named the actor
          definitionsVersion: appRun!.definitionsVersion,
          rowsCovered: appRun!.rowsCovered,
          tablesCovered: appRun!.tablesCovered,
          insightRowId: appRun!.insightRowId,
          startedAt: appRun!.startedAt.toISOString(),
          finishedAt: appRun!.finishedAt?.toISOString() ?? null,
          outcome: appRun!.outcome,
        } satisfies AppRunRecord,
      },
      201,
    );
  });

  /**
   * The runs that have happened — **your own organisation's, and the project
   * owner's organisation sees them all** (narrowed in review 2026-09-07, to
   * the export list's own rule one file along: T-443 made `rows_covered` and
   * `tables_covered` real numbers, and a rival firm reading that another firm's
   * run covered two rows last Tuesday learns about a submission it was never
   * given).
   */
  app.get('/apps/:appId/runs', async (c) => {
    const reached = await reachApp(deps.db, c.get('user'), c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    const rows = await deps.db
      .select({ run: s.appRuns, name: s.users.name, organisationId: s.users.organisationId })
      .from(s.appRuns)
      .innerJoin(s.participants, eq(s.appRuns.asParticipantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.appRuns.appId, loaded.row.id))
      .orderBy(desc(s.appRuns.startedAt));
    const isProjectOwner = slice.organisationId === loaded.projectOwnerOrganisationId;
    const items: AppRunRecord[] = rows
      .filter((row) => isProjectOwner || row.organisationId === slice.organisationId)
      .map(({ run, name }) => ({
      id: run.id,
      appId: run.appId,
      runId: run.runId,
      trigger: run.trigger,
      asName: name,
      definitionsVersion: run.definitionsVersion,
      rowsCovered: run.rowsCovered,
      tablesCovered: run.tablesCovered,
      insightRowId: run.insightRowId,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      outcome: run.outcome,
    }));
    return c.json({ items } satisfies ListAppRunsResponse);
  });


  return app;
}
