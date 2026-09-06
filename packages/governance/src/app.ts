// T-440 — the app's access predicates (ADR-0056), pure functions of the data,
// exactly like `canReadDeliverable` (access.ts) and `canAccessSandbox`
// (sandbox.ts): the caller loads the rows, this decides, and resolution runs
// before any store is touched. Deny is false; the API renders it as the same
// 404 as nonexistence (contracts principle 4).
//
// **THE ROW PREDICATE LIVES HERE AND NOWHERE ELSE.** ADR-0056's consequences
// say the access gateway gains a new subject kind whose predicate is *entering
// organisation or owner, within scope, or shared, and nothing else* — one
// predicate, in one place. The research behind the ADR found that every
// app-builder incident of the last five years came from access rules written
// into the app rather than enforced by the platform, so the single most
// important property of this file is that it is the ONLY file that answers the
// question. A second copy — in a route, in a screen, in a generated app — is
// the failure mode, not a convenience.
//
// **A BUILDER'S CHOICES CAN ONLY NARROW.** Nothing a definition contains is an
// input to any function below. An interface may show fewer columns or fewer
// rows than a viewer could reach; it can never show more, because what it can
// reach is decided here, from the stamp on the row and the app's scope, before
// the definition is read at all.

import type { EntitledSlice } from './access';

/** One scope grant as stored, live or closed. The caller may pass the whole
 * set — closed intervals admit nothing, so a revocation drops access in the
 * same read (ADR-0036). */
export type AppScopeGrant = {
  granteeType: 'organisation' | 'participant';
  organisationId: string | null;
  participantId: string | null;
  revokedAt: Date | null;
};

/**
 * Is this person inside the app's participant scope (ADR-0056 §1, ADR-0036)?
 *
 * The ladder — multi-org ⊃ single-org ⊃ team ⊃ named-user — is not a field to
 * branch on: it is emergent from the grant set, exactly as it is for a sandbox.
 * Widening adds a grant; revoking closes one. Being the project owner does NOT
 * implicitly admit you: an app the owner is not in scope for is an app the
 * owner cannot open, which is what makes a narrower scope a real subset of a
 * wider one rather than a suggestion.
 */
export function withinAppScope(
  slice: Pick<EntitledSlice, 'organisationId' | 'participantId'>,
  grants: readonly AppScopeGrant[],
): boolean {
  for (const grant of grants) {
    if (grant.revokedAt !== null) continue;
    if (
      grant.granteeType === 'organisation' &&
      grant.organisationId !== null &&
      grant.organisationId === slice.organisationId
    ) {
      return true;
    }
    if (
      grant.granteeType === 'participant' &&
      grant.participantId !== null &&
      grant.participantId === slice.participantId
    ) {
      return true;
    }
  }
  return false;
}

/** The facts the row predicate judges. `withinScope` is passed in rather than
 * recomputed so the caller resolves the app's scope ONCE for a page of rows
 * — it is one request's work, not a cached access decision (the T-249
 * distinction). */
export type AppRowVisibilityFacts = {
  /** the project's owner organisation — the second branch of the predicate */
  projectOwnerOrganisationId: string;
  /** the organisation whose person entered the row — the stamp the wall keys on */
  enteringOrganisationId: string;
  /** null on a table with no acceptance step, in which case there is no draft
   * to hide and the row reads from the moment it exists */
  state: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'superseded' | null;
  /** organisations the project owner has an OPEN share with for this table */
  sharedWithOrganisationIds: readonly string[];
  /** is the reader inside the app's participant scope */
  withinScope: boolean;
};

/**
 * **The predicate, in full: entering organisation, or the project owner, or an
 * open share — all within the app's scope — and nothing else.**
 *
 * With one narrowing that is the whole of ruling 3 (ADR-0056's 2026-09-06
 * addendum): **a row in `draft` state is read by its entering organisation
 * alone.** The project owner reads it from `submitted` onward, and so does a
 * shared-with organisation. A draft is an unfinished number with the same
 * standing as unfinished work in a sandbox before promotion; the owner's
 * dashboard showing "no return yet" for that month is the honest state, and a
 * client watching a contractor type is not.
 *
 * Note what is NOT a branch here: being elevated, being an org admin, being the
 * app's owner or its builder. None of those widens a read of a row. A builder
 * who cannot see a contractor's figures does not gain them by building the app
 * that holds them — which is the sentence ADR-0056 §4 exists to make true.
 */
export function canReadAppRow(
  slice: Pick<EntitledSlice, 'organisationId'>,
  row: AppRowVisibilityFacts,
): boolean {
  if (!row.withinScope) return false;
  // the entering organisation, always — including its own drafts
  if (slice.organisationId === row.enteringOrganisationId) return true;
  // ruling 3: nobody else reads a draft, not even the project owner
  if (row.state === 'draft') return false;
  if (slice.organisationId === row.projectOwnerOrganisationId) return true;
  return row.sharedWithOrganisationIds.includes(slice.organisationId);
}

/** The facts the build predicates judge. */
export type AppBuildFacts = {
  /** the organisation of the app's owner participant — the firm whose app it is */
  ownerOrganisationId: string;
  /** is the app's owner participant still live on the project (ADR-0056 §5) */
  ownerIsLive: boolean;
  closed: boolean;
  /** has anything been published yet (§11's working/published split) */
  published: boolean;
  withinScope: boolean;
};

/**
 * May this person edit and publish this app's definition?
 *
 * Two conditions, and the first is ADR-0056 §12: their own organisation lets
 * them build (`users.may_build_apps`, the org admin's per-person toggle). The
 * second is that the app is theirs to build — the firm whose person owns it.
 * A closed app is built by nobody; an app whose owner has gone is defunct and
 * is reassigned before it is edited, which is what stops work continuing on an
 * instance nothing may run.
 */
export function canBuildApp(
  slice: Pick<EntitledSlice, 'organisationId'>,
  mayBuildApps: boolean,
  app: AppBuildFacts,
): boolean {
  if (!mayBuildApps) return false;
  if (app.closed) return false;
  if (slice.organisationId !== app.ownerOrganisationId) return false;
  return app.withinScope;
}

/**
 * May this person open the app at all?
 *
 * Inside the scope, yes — **unless nothing has been published**, in which case
 * the app is open to its builders alone (ADR-0056's addendum, ruling 2). That
 * is not a nicety: without it, a builder's half-finished form would be sitting
 * in front of the contractors it is meant for from the first save.
 */
export function canOpenApp(
  slice: Pick<EntitledSlice, 'organisationId'>,
  mayBuildApps: boolean,
  app: AppBuildFacts,
): boolean {
  if (!app.withinScope) return false;
  if (app.published) return true;
  return canBuildApp(slice, mayBuildApps, app);
}

/**
 * May this person share one of the app's tables with a named organisation?
 *
 * **The project owner's act and nobody else's** (ADR-0056 §6, on ADR-0016 and
 * ADR-0035's shape): sharing is what opens one organisation's rows to another,
 * and cross-organisation visibility has been the owner's decision since
 * ADR-0018. It is a super-user act for the reason every deliberate widening is:
 * the consequence is other firms' data, and an ordinary participant clicking it
 * by accident is exactly the incident the audit trail would then have to
 * explain.
 */
export function canShareAppTable(
  slice: Pick<EntitledSlice, 'membershipRole' | 'elevated'>,
): boolean {
  return slice.membershipRole === 'owner' && slice.elevated;
}

/**
 * May this person reassign or close the app?
 *
 * ADR-0056 §7 puts reassign-or-close on the **project owner** — the app needs a
 * living owner and the project owner is who decides. The app's OWN organisation
 * is admitted too, and that is a reading rather than a quotation: a consultancy
 * whose builder leaves must be able to hand its own app to a colleague without
 * asking the client, and §12's *"an app whose builder loses the right is
 * reassigned or dies"* is addressed to the organisation that lost the builder.
 * Both are super-user acts, on the destructive-lifecycle tier (T-174).
 */
export function canReassignApp(
  slice: Pick<EntitledSlice, 'organisationId' | 'membershipRole' | 'elevated'>,
  app: Pick<AppBuildFacts, 'ownerOrganisationId'>,
): boolean {
  if (!slice.elevated) return false;
  if (slice.membershipRole === 'owner') return true;
  return slice.organisationId === app.ownerOrganisationId;
}

/**
 * May the app run at all right now (ADR-0056 §5)?
 *
 * A run acts as somebody, and a run with nobody to act as must not start. An
 * app whose owner has left the project is **defunct** — visibly not working,
 * with no notification (owner-ruled 2026-09-06) — and it cannot run until
 * someone reassigns or closes it. An app with nothing published has nothing for
 * a run to act against, so only its builders may run it, against the working
 * copy they are looking at.
 */
export function appRunnable(app: AppBuildFacts): { runnable: boolean; because: string } {
  if (app.closed) return { runnable: false, because: 'the app is closed' };
  if (!app.ownerIsLive) {
    return { runnable: false, because: 'the app has no owner and is defunct until it is reassigned' };
  }
  if (!app.published) return { runnable: false, because: 'the app has never been published' };
  return { runnable: true, because: '' };
}
