// T-030 — the assembly gateway (ADR-0029, contracts §1): one call,
// assemble(request, environment, requester) → the access-resolved working
// input. Access resolution (T-020) runs INSIDE the call, before any pipeline
// touches a store; the signature carries no parameter that could widen scope,
// so the wall is enforced by the contract's shape. Deny returns nothing — an
// unentitled requester and an empty corpus read identically.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Assemble, AssembledItem, AssemblyRequest } from '@infora/contracts';
import { attenuate, resolveAccess } from '@infora/governance';
import type { Attenuation, EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { guidingRules } from './guiding';
import { mergeChannels } from './merge';
import { groundedLibrary } from './retrieval';

// v1 budget: fixed and naive (ADR-0029 §5); Session 6 tunes it behind the
// same signature.
export const TOKEN_LIMIT = 12000;

export type GatewayDeps = { db: Db; router: Router };

// Per-channel pipelines (ADR-0022): a separate pipeline per channel — and per
// corpus within grounded — behind the one signature. The grounded library is
// real (T-031); the authority corpus arrives with its slice.
//
// T-308 — GUIDING IS REAL NOW: the requester's own organisation's rulebook
// (drawer 7, ADR-0048 §4). Informing is still empty; its store is a later
// drawer. Note what the guiding pipeline does NOT take — the request text.
// A rulebook rides the channel in its entirety and is not retrieved against
// the question, so the parameter is unused here on purpose rather than by
// oversight.
type Pipeline = (
  deps: GatewayDeps,
  slice: EntitledSlice,
  request: AssemblyRequest['request'],
) => Promise<AssembledItem[]>;

const guiding: Pipeline = async (deps, slice) => guidingRules(deps.db, slice.organisationId);
const informing: Pipeline = async () => [];

// An unentitled requester gets an empty input AND an empty coverage: zero
// candidates is the honest number, and it reads identically to an empty corpus
// — which is the point (denial and nonexistence read the same).
const emptyInput = () => ({
  items: [],
  budget: { tokenLimit: TOKEN_LIMIT, tokensUsed: 0 },
  coverage: { candidates: 0, requestedReferences: [], unmatchedReferences: [] },
});

/**
 * T-248 — an optionally NARROWED assembler (finding F8).
 *
 * The narrowing rides the construction, never the call: `AssemblyRequest` has
 * no attenuation field and gains none, so a caller still cannot ask this
 * gateway for a scope. What an orchestrator can do is hand a worker an
 * assembler already narrower than its own — three named documents rather than
 * the whole entitled library — and, because `attenuate` is monotonic, a worker
 * handed a narrowed assembler has no route back to the wider one.
 */
export function createAssembler(deps: GatewayDeps, narrowing?: Attenuation): Assemble {
  return async (req) => {
    const resolved = await resolveRequester(deps.db, req);
    if (!resolved) return emptyInput();
    const slice = narrowing === undefined ? resolved : attenuate(resolved, narrowing);

    const [grounded, guidingItems, informingItems] = await Promise.all([
      groundedLibrary(deps, slice, req.request),
      guiding(deps, slice, req.request),
      informing(deps, slice, req.request),
    ]);

    // v1 merge (T-032): grounded-first within the budget, lowest-priority
    // channel dropped first (ADR-0029 §5)
    const merged = mergeChannels(
      { grounded: grounded.items, guiding: guidingItems, informing: informingItems },
      TOKEN_LIMIT,
    );
    // T-313/T-272 — the embedding call and the coverage facts ride out with the
    // input they produced. Both survive the merge dropping every item: the call
    // was made and was paid for whether or not anything it found fitted the
    // budget, and what was SEARCHED is precisely the thing an empty result
    // needs said about it.
    return {
      ...merged,
      ...(grounded.embedding !== undefined && { embedding: grounded.embedding }),
      coverage: grounded.coverage,
    };
  };
}

const uuid = z.uuid();
const isUuid = (value: string) => uuid.safeParse(value).success;

/**
 * (requester, environment) → EntitledSlice through the T-020 predicate. The
 * requester's claimed organisation must be the resolved user's own — a
 * Participant id can never be paired with someone else's organisation
 * (ADR-0015's subset invariant, re-checked at this boundary).
 */
async function resolveRequester(db: Db, req: AssemblyRequest): Promise<EntitledSlice | null> {
  // the workspace environment reaches org context only (ADR-0025), which has
  // no store in the skeleton — nothing is reachable there yet
  if (req.environment.kind !== 'project') return null;
  const { projectId } = req.environment;
  const { organisationId, participantId } = req.requester;
  if (![projectId, organisationId, participantId].every(isUuid)) return null;

  const [participant] = await db
    .select()
    .from(s.participants)
    .where(eq(s.participants.id, participantId))
    .limit(1);
  if (!participant) return null;

  const [user] = await db.select().from(s.users).where(eq(s.users.id, participant.userId)).limit(1);
  if (!user || user.organisationId !== organisationId) return null;

  const [project] = await db.select().from(s.projects).where(eq(s.projects.id, projectId)).limit(1);
  const [membership] = await db
    .select()
    .from(s.memberships)
    .where(and(eq(s.memberships.organisationId, organisationId), eq(s.memberships.projectId, projectId)))
    .limit(1);

  return resolveAccess({
    user: { id: user.id, organisationId: user.organisationId },
    project: project ? { id: project.id } : null,
    membership: membership ?? null,
    participant,
  });
}
