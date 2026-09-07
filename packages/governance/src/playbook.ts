// T-445 — who may read a playbook, and who may deploy one (ADR-0056 §10, §11,
// §12). Pure functions of the data, like `app.ts` beside it: the caller loads
// the rows, this decides, and deny is false — which the API renders as the same
// 404 as nonexistence (contracts principle 4).
//
// **A PLAYBOOK IS A DIFFERENT SUBJECT FROM AN APP ROW, WHICH IS WHY IT IS ITS
// OWN FILE.** The row predicate in `app.ts` answers *may this person read this
// row of this project's third kind of record*, and it must stay the only answer
// to that question. A playbook holds no rows at all — it is org-private
// material on a firm's own shelf, like the rulebook and the starting outlines
// — so its question is a different one, and folding it into the row predicate
// would blur the file whose whole value is that it answers one thing.
//
// **NOTHING HERE IS A PROJECT DECISION.** A playbook has no project by
// construction (drawer 9: org context is portable). Whether the deployer has a
// seat on the project they are deploying INTO is the ordinary entitlement
// question `resolveSlice` already answers, and it is answered there rather than
// restated here.

/** A playbook as the shelf stores it, so far as access is concerned. */
export type PlaybookFacts = {
  /** the firm whose shelf it sits on */
  organisationId: string;
  /** Infora's own pre-built apps sit on the same shelf as a firm's own (§11) */
  suppliedByInfora: boolean;
  /** a retired template is off the shelf: still named by instances that came
   * from it, never deployed again */
  retiredAt: Date | null;
};

/**
 * Is this playbook on this person's shelf?
 *
 * **Org-private, and the wall is the whole of it** (ADR-0056 §10): a firm sees
 * its own templates and the ones Infora supplies, and never another firm's.
 * Being on the same project as the firm that saved one admits nobody: a
 * playbook is not a project thing, and the client whose project an app was
 * built in has no claim on the consultancy's template of it.
 */
export function canReadPlaybook(
  slice: { organisationId: string },
  playbook: PlaybookFacts,
): boolean {
  if (playbook.suppliedByInfora) return true;
  return slice.organisationId === playbook.organisationId;
}

/**
 * May this person deploy this playbook into a project?
 *
 * Two conditions and no more. **Their own firm lets them build** (§12's
 * per-person toggle, the same gate that decides who may create an app from
 * nothing — a deployed instance is an ordinary app, so deploying one cannot be
 * an easier way to get one than making one). And **the playbook is on their
 * shelf**, live rather than retired.
 *
 * The third condition — a seat on the target project — is deliberately absent:
 * it is `resolveSlice`'s answer at the route, and a copy of it here would be a
 * second place deciding who is on a project.
 */
export function canDeployPlaybook(
  slice: { organisationId: string },
  mayBuildApps: boolean,
  playbook: PlaybookFacts,
): boolean {
  if (!mayBuildApps) return false;
  if (playbook.retiredAt !== null) return false;
  return canReadPlaybook(slice, playbook);
}
