// T-254 — cost attribution, at organisation and user grain (finding F7).
//
// WHAT THIS READ IS, AND WHAT IT DELIBERATELY IS NOT. It reports the requester's
// OWN organisation's spend on its OWN runs, aggregated per user. It is not a
// project report and takes no project parameter, because a project's total
// would sum two organisations' private work into one number and hand it to
// whichever of them asked. Run records are producer-private (the 2026-07-12
// ruling) and so is what they cost.
//
// THE UNPRICED COUNT IS NOT A FOOTNOTE. Finding F7 was that every step recorded
// a cost of exactly zero; the way to repeat that mistake is to sum priced
// steps, omit the rest, and present the result as "the cost". So every row
// carries `unpricedSteps` beside its total, and a caller reading a total
// without it is reading a lower bound.
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import type { ApiError, OrganisationCostsResponse } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { AppEnv } from './requester';

export function costRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  // GET /organisation/costs — org-scoped by construction. No parameter widens
  // it: the organisation comes off the resolved requester, never the request
  // (contracts principle 3).
  app.get('/organisation/costs', async (c) => {
    const user = c.get('user');
    if (user.orgRole !== 'admin') {
      // spend across an organisation's people is an org-admin fact. A member
      // reading it would be reading colleagues' activity, which is a different
      // thing from reading their own runs.
      return c.json({ error: 'not_found' } satisfies ApiError, 404);
    }

    // Every step of every run requested by a Participant of a user in this
    // organisation. Joined through the run's requester rather than through the
    // project, because the producing organisation is derived from the record
    // (the same derivation `runVisibleTo` uses) and never from the caller.
    const rows = await deps.db
      .select({
        userId: s.users.id,
        userName: s.users.name,
        cost: s.steps.cost,
        tokensPrompt: s.steps.tokensPrompt,
        tokensCompletion: s.steps.tokensCompletion,
        modelId: s.steps.modelId,
      })
      .from(s.steps)
      .innerJoin(s.runs, eq(s.steps.runId, s.runs.id))
      .innerJoin(s.participants, eq(s.runs.requesterParticipantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(and(eq(s.users.organisationId, user.organisationId), isNull(s.runs.parentRunId)));

    const byUser = new Map<string, OrganisationCostsResponse['users'][number]>();
    const unpricedModels = new Set<string>();
    for (const row of rows) {
      const entry = byUser.get(row.userId) ?? {
        userId: row.userId,
        userName: row.userName,
        cost: 0,
        tokensPrompt: 0,
        tokensCompletion: 0,
        pricedSteps: 0,
        unpricedSteps: 0,
      };
      entry.tokensPrompt += row.tokensPrompt ?? 0;
      entry.tokensCompletion += row.tokensCompletion ?? 0;
      // A step with no model did no model work — retrieve, ground-check, cite.
      // It is neither priced nor unpriced; counting it as unpriced would report
      // three quarters of every run as a pricing gap.
      if (row.modelId !== null) {
        if (row.cost === null) {
          entry.unpricedSteps += 1;
          unpricedModels.add(row.modelId);
        } else {
          entry.cost += Number(row.cost);
          entry.pricedSteps += 1;
        }
      }
      byUser.set(row.userId, entry);
    }

    const users = [...byUser.values()].sort((a, b) => b.cost - a.cost);
    return c.json({
      organisationId: user.organisationId,
      cost: users.reduce((total, entry) => total + entry.cost, 0),
      pricedSteps: users.reduce((total, entry) => total + entry.pricedSteps, 0),
      // the number that keeps the total honest: a total read without this is a
      // lower bound, and the models named are the configuration gap to close
      unpricedSteps: users.reduce((total, entry) => total + entry.unpricedSteps, 0),
      unpricedModels: [...unpricedModels].sort(),
      users,
    } satisfies OrganisationCostsResponse);
  });

  return app;
}
