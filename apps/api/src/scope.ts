// T-469 — the person's scope, at the API door.
//
// *In plain terms: before a run starts, this turns "read just these documents /
// this discipline / my saved choice" into something the search can use, counts
// what that leaves, and says no — in words, before anything is spent — if it
// leaves nothing to read.*
//
// 🔒 NOTHING HERE WIDENS. A saved scope is the requester's OWN (or one shared
// within their organisation on this project), resolved to term and container
// ids; the gateway then intersects those with what the requester may see. A
// scope that names a document the requester cannot see is not an error and not
// a leak — it simply admits nothing from it, and nothing of it is counted.
import { and, eq, or } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { reachStatement, nothingToReadRefusal, scopeSchema } from '@infora/contracts';
import type { ReachCounts, Scope } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { reachCounts } from '@infora/knowledge';
import type { Router } from '@infora/model';

export { reachStatement };

/**
 * A body that failed to parse, said in words. A scope that names nothing gets
 * its own sentence — "an empty scope is a 400 in words" — instead of the
 * route's generic "fields required".
 */
export function scopeProblem(error: ZodError): string | null {
  for (const issue of error.issues) {
    if (issue.path[0] === 'scope') {
      return issue.path.length === 1 && issue.code === 'custom'
        ? `${issue.message}.`
        : 'the scope is malformed: it may name termIds, containerIds or a savedScopeId, each a valid id.';
    }
  }
  return null;
}

export type ResolvedScope =
  | { ok: true; scope: Scope | undefined }
  | { ok: false; status: 400 | 404; detail?: string };

/**
 * The scope the gateway will see. A `savedScopeId` stands ALONE (a saved scope
 * plus loose ids would be two statements of one choice, and the second could
 * quietly widen the first), is looked up under the requester's own ceiling, and
 * is replaced by the term and container ids it holds. The id of the saved scope
 * stays on the result: it is the record of where the choice came from.
 */
export async function resolveScope(
  db: Db,
  slice: EntitledSlice,
  scope: Scope | undefined,
): Promise<ResolvedScope> {
  if (scope === undefined) return { ok: true, scope: undefined };
  if (scope.savedScopeId === undefined) return { ok: true, scope };
  if ((scope.termIds?.length ?? 0) > 0 || (scope.containerIds?.length ?? 0) > 0) {
    return {
      ok: false,
      status: 400,
      detail:
        'a saved scope stands on its own: name either the saved scope or the disciplines, document types and documents — not both.',
    };
  }
  const [view] = await db
    .select()
    .from(s.savedViews)
    .where(
      and(
        eq(s.savedViews.id, scope.savedScopeId),
        eq(s.savedViews.projectId, slice.projectId),
        eq(s.savedViews.register, 'scope'),
        // the ceiling: this organisation's views, and within it the requester's
        // own or ones shared — a view can never travel across the wall
        eq(s.savedViews.organisationId, slice.organisationId),
        or(eq(s.savedViews.participantId, slice.participantId), eq(s.savedViews.shared, true)),
      ),
    )
    .limit(1);
  // "not yours" and "not there" look the same from outside (principle 4)
  if (view === undefined) return { ok: false, status: 404 };
  const stored = savedScopeOf(view.filter);
  if (!stored.ok) {
    return {
      ok: false,
      status: 400,
      detail: `that saved scope can no longer be read: ${stored.detail}`,
    };
  }
  return { ok: true, scope: { ...stored.scope, savedScopeId: view.id } };
}

/** A saved scope's filter, as the typed scope — or why it is not one. */
export function savedScopeOf(
  filter: unknown,
): { ok: true; scope: Scope } | { ok: false; detail: string } {
  const parsed = scopeSchema.safeParse(filter);
  if (!parsed.success) {
    return {
      ok: false,
      detail:
        parsed.error.issues[0]?.code === 'custom'
          ? 'it names no discipline, document type or document.'
          : 'its filter is not a scope (termIds, containerIds, each a valid id).',
    };
  }
  if (parsed.data.savedScopeId !== undefined) {
    return { ok: false, detail: 'a saved scope cannot point at another saved scope.' };
  }
  return { ok: true, scope: parsed.data };
}

/** The reach counts, and the refusal if a declared scope leaves nothing to read. */
export async function reachOrRefusal(
  deps: { db: Db; router: Router },
  slice: EntitledSlice,
  scope: Scope | undefined,
  options: { refuseWhenEmpty: 'scoped' | 'always' } = { refuseWhenEmpty: 'scoped' },
): Promise<{ reach: ReachCounts; refusal: string | null }> {
  const reach = await reachCounts(deps, slice, scope);
  const scoped = scope !== undefined;
  const refuse = reach.inScope === 0 && (scoped || options.refuseWhenEmpty === 'always');
  return { reach, refusal: refuse ? nothingToReadRefusal(reach, scoped) : null };
}
