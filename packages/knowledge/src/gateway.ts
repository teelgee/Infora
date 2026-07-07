// T-030 — the assembly gateway (ADR-0029, contracts §1): one call,
// assemble(request, environment, requester) → the access-resolved working
// input. Access resolution (T-020) runs INSIDE the call, before any pipeline
// touches a store; the signature carries no parameter that could widen scope,
// so the wall is enforced by the contract's shape. Deny returns nothing — an
// unentitled requester and an empty corpus read identically.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Assemble, AssembledItem, AssemblyRequest } from '@infora/contracts';
import { resolveAccess } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { groundedLibrary } from './retrieval';

// v1 budget: fixed and naive (ADR-0029 §5); Session 6 tunes it behind the
// same signature.
export const TOKEN_LIMIT = 12000;

export type GatewayDeps = { db: Db; router: Router };

// Per-channel pipelines (ADR-0022): a separate pipeline per channel — and per
// corpus within grounded — behind the one signature. The grounded library is
// real (T-031); guiding and informing are present but empty in the skeleton
// (their stores are post-MVP drawers), and the authority corpus arrives with
// its slice.
type Pipeline = (
  deps: GatewayDeps,
  slice: EntitledSlice,
  request: AssemblyRequest['request'],
) => Promise<AssembledItem[]>;

const guiding: Pipeline = async () => [];
const informing: Pipeline = async () => [];

const emptyInput = () => ({ items: [], budget: { tokenLimit: TOKEN_LIMIT, tokensUsed: 0 } });

export function createAssembler(deps: GatewayDeps): Assemble {
  return async (req) => {
    const slice = await resolveRequester(deps.db, req);
    if (!slice) return emptyInput();

    const [groundedItems, guidingItems, informingItems] = await Promise.all([
      groundedLibrary(deps, slice, req.request),
      guiding(deps, slice, req.request),
      informing(deps, slice, req.request),
    ]);

    // v1 merge order is grounded → guiding → informing (ADR-0029 §5); the
    // budgeted drop-lowest-first merge lands at T-032 — every channel is
    // empty until T-031 fills grounded.
    const items = [...groundedItems, ...guidingItems, ...informingItems];
    return { items, budget: { tokenLimit: TOKEN_LIMIT, tokensUsed: 0 } };
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
