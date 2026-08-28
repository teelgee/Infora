// T-390 — the project's acceptance-code scheme: read, and for the first time
// WRITE (ADR-0003, as amended 2026-08-27).
//
// **There was no write path at all.** The scheme was seeded at project creation
// and then frozen, which meant a pilot firm could not represent its own coding
// scheme — a thing every firm has, and a gap that has nothing to do with AI. The
// grounding column is what made building this urgent; it is not what makes it
// necessary.
//
// Three rules shape every write here.
//
// 1. **Retire and replace, never redefine** (ADR-0003, and it predates this
//    ticket). Once a code has been used on a round, the properties that decide
//    what it MEANT are frozen: `is_accepting` said the cycle ended, and
//    `is_contractual` said a C revision was issued. Changing either would
//    rewrite what happened on rounds already closed under it.
//
// 2. **`grounds` is the exception, and deliberately so.** It is not a claim
//    about what the code meant; it is a live policy about what the AI may rely
//    on from here — retrieval reads it on the very next query (T-387), and
//    ADR-0003's own words are that the owner "may change it". Retire-and-replace
//    could not deliver that anyway: retiring `A3` and adding `A3-new` would
//    leave every deliverable already admitted under `A3` exactly where it was.
//    What makes the in-place edit safe is the blast radius beside it and the
//    audit behind it, not immutability.
//
// 3. **Every write is audited like a rails change** (ADR-0030), with a reason.
//    The change alters what the AI may rely on across a whole project, silently
//    — every citation that already exists still resolves — so a preference-style
//    save would leave "when did we stop relying on A3, and who decided"
//    unanswerable. `acceptance_code_changes` is append-only by trigger.
//
// The scheme is the OWNER ORGANISATION's, per project (ADR-0003), so writes are
// the owner organisation's super user and nobody else's.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createAcceptanceCodeBody, updateAcceptanceCodeBody } from '@infora/contracts';
import type {
  AcceptanceCodeRow,
  ApiError,
  ListAcceptanceCodesResponse,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canEditPlan } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { admittingCodes } from './context-state';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const conflict = (c: Context, detail: string) =>
  c.json({ error: 'conflict', detail } satisfies ApiError, 409);
const forbidden = (c: Context, detail: string) =>
  c.json({ error: 'forbidden', detail } satisfies ApiError, 403);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

type CodeRow = typeof s.acceptanceCodes.$inferSelect;

/**
 * THE BLAST RADIUS: how many **live library deliverables** each code admitted,
 * and whether the code has ever been used at all.
 *
 * Read through the same `admittingCodes` derivation retrieval's clause and the
 * context-state badge read, so the number on the screen and the set the AI
 * actually reaches cannot say different things. Counting rounds instead would
 * be cheaper and wrong: a code used on a round that was later re-accepted under
 * a different one admitted nothing, and the sentence the surface prints —
 * *"this will exclude forty-one deliverables from AI answers"* — would be
 * about a set that is not the one the query returns.
 *
 * `everUsed` is separately counted **over every round**, retired and current
 * alike, because that question is about history rather than about the live
 * corpus: a code used once, five years ago, on a deliverable since withdrawn,
 * still cannot be redefined.
 */
async function impactOf(
  db: Db,
  projectId: string,
  codeIds: string[],
): Promise<Map<string, { liveDeliverables: number; everUsed: boolean }>> {
  const impact = new Map(codeIds.map((id) => [id, { liveDeliverables: 0, everUsed: false }]));
  if (codeIds.length === 0) return impact;

  const live = await db
    .select({ id: s.containers.id })
    .from(s.containers)
    .where(
      and(
        eq(s.containers.projectId, projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.inLibrary, true),
        eq(s.containers.state, 'live'),
      ),
    );
  const admitted = await admittingCodes(db, live.map((r) => r.id));
  const byCode = new Map(
    (
      await db
        .select({ id: s.acceptanceCodes.id, code: s.acceptanceCodes.code })
        .from(s.acceptanceCodes)
        .where(inArray(s.acceptanceCodes.id, codeIds))
    ).map((r) => [r.code, r.id]),
  );
  for (const entry of admitted.values()) {
    const id = byCode.get(entry.code);
    const row = id ? impact.get(id) : undefined;
    if (row) row.liveDeliverables += 1;
  }

  const used = await db
    .selectDistinct({ codeId: s.rounds.deliverableCodeId })
    .from(s.rounds)
    .where(and(inArray(s.rounds.deliverableCodeId, codeIds), isNotNull(s.rounds.deliverableCodeId)));
  for (const row of used) {
    const entry = row.codeId ? impact.get(row.codeId) : undefined;
    if (entry) entry.everUsed = true;
  }
  return impact;
}

const toRow = (
  row: CodeRow,
  impact: { liveDeliverables: number; everUsed: boolean } | undefined,
): AcceptanceCodeRow => ({
  id: row.id,
  code: row.code,
  description: row.description,
  level: row.level,
  isAccepting: row.isAccepting,
  isContractual: row.isContractual,
  grounds: row.grounds,
  sortOrder: row.sortOrder,
  retiredAt: row.retiredAt?.toISOString() ?? null,
  liveDeliverables: impact?.liveDeliverables ?? 0,
  everUsed: impact?.everUsed ?? false,
});

export function acceptanceCodeRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  /** The scheme is the owner organisation's, per project (ADR-0003). */
  const mayWrite = (slice: EntitledSlice) => slice.membershipRole === 'owner' && canEditPlan(slice);

  async function list(projectId: string): Promise<ListAcceptanceCodesResponse> {
    const rows = await deps.db
      .select()
      .from(s.acceptanceCodes)
      .where(eq(s.acceptanceCodes.projectId, projectId))
      .orderBy(asc(s.acceptanceCodes.sortOrder));
    const impact = await impactOf(deps.db, projectId, rows.map((r) => r.id));
    return { items: rows.map((row) => toRow(row, impact.get(row.id))) };
  }

  app.get('/projects/:projectId/acceptance-codes', project, async (c) => {
    return c.json(await list(c.get('slice').projectId));
  });

  app.post('/projects/:projectId/acceptance-codes', project, async (c) => {
    const slice = c.get('slice');
    if (!mayWrite(slice)) return forbidden(c, 'owner_super_user_required');
    const body = createAcceptanceCodeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // unique among the LIVE set only — a retired code's letter may be reused,
    // which is the other half of retire-and-replace (the schema's own index)
    const [clash] = await deps.db
      .select({ id: s.acceptanceCodes.id })
      .from(s.acceptanceCodes)
      .where(
        and(
          eq(s.acceptanceCodes.projectId, slice.projectId),
          eq(s.acceptanceCodes.code, body.data.code),
          isNull(s.acceptanceCodes.retiredAt),
        ),
      )
      .limit(1);
    if (clash) return conflict(c, 'code_exists');
    const [highest] = await deps.db
      .select({ sortOrder: s.acceptanceCodes.sortOrder })
      .from(s.acceptanceCodes)
      .where(eq(s.acceptanceCodes.projectId, slice.projectId))
      .orderBy(sql`${s.acceptanceCodes.sortOrder} desc`)
      .limit(1);
    const [created] = await deps.db
      .insert(s.acceptanceCodes)
      .values({
        projectId: slice.projectId,
        code: body.data.code,
        description: body.data.description,
        level: body.data.level,
        isAccepting: body.data.isAccepting,
        isContractual: body.data.isContractual,
        grounds: body.data.grounds,
        sortOrder: (highest?.sortOrder ?? 0) + 1,
      })
      .returning();
    await deps.db.insert(s.acceptanceCodeChanges).values({
      acceptanceCodeId: created!.id,
      projectId: slice.projectId,
      changedByParticipantId: slice.participantId,
      field: 'created',
      previousValue: null,
      newValue: created!.code,
      reason: body.data.reason,
    });
    return c.json(await list(slice.projectId), 201);
  });

  app.patch('/acceptance-codes/:codeId', async (c) => {
    const codeId = c.req.param('codeId');
    if (!isUuid(codeId)) return notFound(c);
    const [code] = await deps.db
      .select()
      .from(s.acceptanceCodes)
      .where(eq(s.acceptanceCodes.id, codeId))
      .limit(1);
    if (!code) return notFound(c);
    // the code names its own project, so the slice is resolved from the record
    // rather than from a path parameter the caller supplies (contracts §3)
    const slice = await resolveSlice(deps.db, c.get('user'), code.projectId);
    if (!slice) return notFound(c);
    if (!mayWrite(slice)) return forbidden(c, 'owner_super_user_required');
    const body = updateAcceptanceCodeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);

    const { reason, ...requested } = body.data;
    const [usage] = await deps.db
      .select({ used: sql<number>`count(*)::int` })
      .from(s.rounds)
      .where(eq(s.rounds.deliverableCodeId, code.id));
    const everUsed = (usage?.used ?? 0) > 0;

    // What a used code may no longer say about itself. `is_accepting` and
    // `is_contractual` are claims about what ALREADY HAPPENED under this code —
    // that a cycle ended, that a C revision was issued — and flipping either
    // would rewrite closed rounds. `grounds` is not that: it is a policy about
    // the next query, and ADR-0003 gives it to the owner explicitly.
    if (everUsed && (requested.isAccepting !== undefined || requested.isContractual !== undefined)) {
      return conflict(c, 'code_in_use_retire_and_replace');
    }

    const changes: Array<{ field: 'description' | 'is_accepting' | 'is_contractual' | 'grounds' | 'retired'; from: string; to: string }> = [];
    const update: Partial<typeof s.acceptanceCodes.$inferInsert> = {};
    if (requested.description !== undefined && requested.description !== code.description) {
      update.description = requested.description;
      changes.push({ field: 'description', from: code.description, to: requested.description });
    }
    for (const [key, field] of [
      ['isAccepting', 'is_accepting'],
      ['isContractual', 'is_contractual'],
      ['grounds', 'grounds'],
    ] as const) {
      const next = requested[key];
      if (next !== undefined && next !== code[key]) {
        update[key] = next;
        changes.push({ field, from: String(code[key]), to: String(next) });
      }
    }
    if (requested.retired !== undefined && requested.retired !== (code.retiredAt !== null)) {
      update.retiredAt = requested.retired ? new Date() : null;
      changes.push({ field: 'retired', from: String(code.retiredAt !== null), to: String(requested.retired) });
    }
    // Nothing moved: no row, and no audit entry either. An audit trail padded
    // with no-ops is one nobody reads.
    if (changes.length === 0) return c.json(await list(code.projectId));

    await deps.db.update(s.acceptanceCodes).set(update).where(eq(s.acceptanceCodes.id, code.id));
    await deps.db.insert(s.acceptanceCodeChanges).values(
      changes.map((change) => ({
        acceptanceCodeId: code.id,
        projectId: code.projectId,
        changedByParticipantId: slice.participantId,
        field: change.field,
        previousValue: change.from,
        newValue: change.to,
        reason,
      })),
    );
    return c.json(await list(code.projectId));
  });

  return app;
}
