// T-449 — **the typed acts that build an app's working copy, shared by a
// person and the builder's agent** (ADR-0056's third addendum, ruling 2).
//
// *In plain terms: declaring a table, writing the app's definition and setting
// whether a table holds contractual data are each done in exactly one place.
// The building screen reaches them through the API's routes; the agent reaches
// the SAME functions. So a table the agent declares and a table a person
// declares meet the same checks, get the same stamps, and are recorded the same
// way.*
//
// 🔒 **WHAT IS NOT IN THIS FILE IS THE POINT.** There is no act here that
// publishes, grants scope, shares a table, reassigns an app or closes one —
// those stay in `apps.ts`'s routes, gated as they always were, and the agent
// has no import that reaches them (pinned by `app-builder-agent.test.ts`). An
// act here changes the WORKING copy, which only the app's builders can see
// (the first addendum's ruling 2), so the worst a wrong one can do is give a
// builder something of their own to fix.
//
// Every act takes the acting participant explicitly and stamps it: whoever
// performed the act — a person, or the agent acting for that person — is the
// person named on the working copy's "last changed by".
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  INSIGHT_TABLE_COLUMNS,
  appDefinitionSchema,
  parseAppScreen,
  pendingBuilderQuestions,
  publishGateOf,
} from '@infora/contracts';
import type {
  AppColumn,
  AppDefinition,
  AppTableKind,
  PublishGate,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

/**
 * T-448 — **the publish gate, computed from the store** (ADR-0056's third
 * addendum, ruling 1).
 *
 * *In plain terms: before an app can be opened to its people, every table must
 * have been answered "does this hold contractual data?" and every screen "who
 * may open it?". This is where that is worked out, from what is actually saved
 * — not from what any screen or agent says.*
 *
 * The facts are the stored working copy (`apps.definition`, whose
 * `answeredQuestions` records each answer) and the LIVE declared tables in
 * `app_tables` — the same two things `pendingBuilderQuestions` has always read,
 * moved where no surface can route around them. A retired table is not asked
 * about: it holds nothing new and appears on no published screen.
 */
export async function publishGateFor(
  db: Db,
  row: Pick<typeof s.apps.$inferSelect, 'id' | 'definition'>,
): Promise<PublishGate> {
  const tables = await liveTables(db, row.id);
  return publishGateOf(pendingBuilderQuestions(row.definition as AppDefinition, tables));
}

/** The app's live (unretired) declared tables, by name. */
export async function liveTables(db: Db, appId: string) {
  const rows = await db
    .select({
      id: s.appTables.id,
      name: s.appTables.name,
      kind: s.appTables.kind,
      hasAcceptance: s.appTables.hasAcceptance,
      columns: s.appTables.columns,
    })
    .from(s.appTables)
    .where(and(eq(s.appTables.appId, appId), isNull(s.appTables.retiredAt)))
    .orderBy(asc(s.appTables.name));
  return rows.map((row) => ({ ...row, columns: row.columns as AppColumn[] }));
}

/**
 * T-448 — record that a required question was answered, on the working copy.
 *
 * Used by the ordinary acts that ARE answers — declaring a table with an
 * explicit acceptance choice, setting that choice on an empty table, and the
 * agent recording a person's answer — so the answer is on the record however
 * the act arrived. It is an edit of the working copy, so it bumps the counter
 * and says who and when, exactly as a definition write does.
 */
export async function recordAnsweredQuestion(
  db: Db,
  appId: string,
  participantId: string,
  key: string,
): Promise<void> {
  // one statement, so an edit landing between a read and a write cannot be
  // overwritten by a stale copy of the definition: only the list grows
  await db
    .update(s.apps)
    .set({
      definition: sql`jsonb_set(${s.apps.definition}, '{answeredQuestions}', coalesce(${s.apps.definition}->'answeredQuestions', '[]'::jsonb) || jsonb_build_array(${key}::text))`,
      definitionVersion: sql`${s.apps.definitionVersion} + 1`,
      definitionUpdatedByParticipantId: participantId,
      definitionUpdatedAt: sql`now()`,
    })
    .where(
      and(
        eq(s.apps.id, appId),
        sql`not (coalesce(${s.apps.definition}->'answeredQuestions', '[]'::jsonb) ? ${key})`,
      ),
    );
}

/**
 * Declare a table (ADR-0056 §2) — `POST /apps/:appId/tables`, and the agent's
 * `declareTable`.
 *
 * `hasAcceptance` is `undefined` when nobody SAID: the table is then declared
 * without an acceptance step and its contractual-data question stays open at
 * the gate. A person's form or a direct API caller may send the choice; the
 * agent never can (its act has no such field).
 */
export async function declareTableAct(
  db: Db,
  input: {
    appId: string;
    participantId: string;
    name: string;
    columns: AppColumn[];
    kind: AppTableKind;
    hasAcceptance: boolean | undefined;
  },
): Promise<typeof s.appTables.$inferSelect> {
  // T-443 — 🔒 an insight table's shape is Infora's, not the builder's: a run
  // has to know where to write the sentence, so its four columns are fixed here
  // whatever the caller sent, and acceptance is forced off — an insight is
  // written by a run and submitted to nobody.
  const isInsight = input.kind === 'insight';
  const [created] = await db
    .insert(s.appTables)
    .values({
      appId: input.appId,
      name: input.name,
      columns: isInsight ? INSIGHT_TABLE_COLUMNS : input.columns,
      kind: input.kind,
      hasAcceptance: isInsight ? false : (input.hasAcceptance ?? false),
    })
    .returning();
  // an explicit choice is an answer; a default is not (T-448). An insight
  // table is never asked.
  if (input.hasAcceptance !== undefined && !isInsight) {
    await recordAnsweredQuestion(db, input.appId, input.participantId, `contractual-data:${created!.id}`);
  }
  return created!;
}

/**
 * Write the working copy — `PATCH /apps/:appId/definition`, and every agent act
 * that changes the definition.
 *
 * The definition is checked against the strict shape AND against the store:
 * a screen naming a column its table never declared is refused here (the
 * 2026-09-07 review's boundary), so a screen the agent wrote and a screen a
 * person typed are refused for exactly the same reasons.
 */
export async function writeDefinitionAct(
  db: Db,
  input: {
    appId: string;
    participantId: string;
    name?: string;
    description?: string | null;
    definition?: AppDefinition;
  },
): Promise<'ok' | 'invalid'> {
  if (input.definition !== undefined) {
    if (!appDefinitionSchema.safeParse(input.definition).success) return 'invalid';
    const tables = await liveTables(db, input.appId);
    const keysByTable = new Map(
      tables.map((table) => [table.id, table.columns.map((column) => column.key)]),
    );
    for (const screen of input.definition.interfaces) {
      if (screen.source === null) continue;
      const keys = screen.appTableId === null ? [] : keysByTable.get(screen.appTableId);
      if (keys === undefined || parseAppScreen(screen.source, keys) === null) return 'invalid';
    }
    // (review 2026-10-18) **an answer key has to name a real question.** The
    // gate reads `answeredQuestions`, so a key naming no live table and no
    // screen in this very definition — a typo, or a question pre-answered for
    // a screen that does not exist yet — would hold the gate open or shut on
    // nothing. Refused, never trimmed (the parser's own discipline).
    const validKeys = new Set<string>([
      ...tables.filter((t) => t.kind !== 'insight').map((t) => `contractual-data:${t.id}`),
      ...input.definition.interfaces.map((screen) => `who-may-open:${screen.id}`),
    ]);
    if (input.definition.answeredQuestions.some((key) => !validKeys.has(key))) return 'invalid';
    // (review 2026-10-18) **a stale copy cannot un-answer a question.** The
    // panel saves the whole definition, and an answer recorded between its
    // read and its save (by `recordAnsweredQuestion`, or another builder)
    // must survive — so the stored answers are folded in, kept only where
    // they still name something this definition has. Removing a screen drops
    // its key here, exactly as the remove act intends.
    const [stored] = await db
      .select({ definition: s.apps.definition })
      .from(s.apps)
      .where(eq(s.apps.id, input.appId))
      .limit(1);
    const storedKeys = ((stored?.definition as AppDefinition | null)?.answeredQuestions ?? []).filter(
      (key) => validKeys.has(key),
    );
    input.definition = {
      ...input.definition,
      answeredQuestions: [...new Set([...input.definition.answeredQuestions, ...storedKeys])],
    };
  }
  await db
    .update(s.apps)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.definition !== undefined && { definition: input.definition }),
      // every edit bumps the working copy's counter and says who and when
      definitionVersion: sql`${s.apps.definitionVersion} + 1`,
      definitionUpdatedByParticipantId: input.participantId,
      definitionUpdatedAt: sql`now()`,
    })
    .where(eq(s.apps.id, input.appId));
  return 'ok';
}

/**
 * Set whether a table holds contractual data — `PATCH /app-tables/:id`, and the
 * agent recording a person's answer.
 *
 * 🔒 **ONLY WHILE THE TABLE IS EMPTY.** Whether a table holds contractual data
 * decides whether its rows change hands on acceptance (§2a); flipping it under
 * rows that already exist would retrospectively turn a contractor's figures
 * into the owner's record, or take a record back. Setting the choice IS
 * answering the question, so the gate hears it from the act itself.
 */
export async function setTableAcceptanceAct(
  db: Db,
  input: { appId: string; participantId: string; appTableId: string; hasAcceptance: boolean },
): Promise<'ok' | 'not_found' | 'conflict'> {
  const [table] = await db
    .select()
    .from(s.appTables)
    .where(and(eq(s.appTables.id, input.appTableId), eq(s.appTables.appId, input.appId)))
    .limit(1);
  // a retired table is not edited, and an insight table has no acceptance
  // step to set — the same answer as absence
  if (!table || table.retiredAt !== null || table.kind === 'insight') return 'not_found';
  const [existing] = await db
    .select({ id: s.appRows.id })
    .from(s.appRows)
    .where(eq(s.appRows.appTableId, input.appTableId))
    .limit(1);
  if (existing) return 'conflict';
  await db
    .update(s.appTables)
    .set({ hasAcceptance: input.hasAcceptance })
    .where(eq(s.appTables.id, input.appTableId));
  await recordAnsweredQuestion(
    db,
    input.appId,
    input.participantId,
    `contractual-data:${input.appTableId}`,
  );
  return 'ok';
}
