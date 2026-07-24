# Grill prompt — classes of user (super-user tiers) and where they act

Paste to the repo grill agent (Claude Code, read/write on the Infora repo). It
invokes the **grill-with-docs** skill. The subject is the **class-of-user model**
that governs who may edit the plan (TIDP/MIDP) and the coding scheme.

---

Run a **grill-with-docs** session. The subject is **classes of user** on a
project — specifically the *super-user* tiers and the capabilities that separate
them from ordinary participants, on the producing-side surfaces (the plan and
the coding scheme).

Interview one question at a time, recommended answer each, waiting for feedback.
Where a question is already answered by the docs or code, explore and tell me.
Challenge terms against `CONTEXT.md`; update it inline as terms resolve. Offer an
ADR only where the decision is hard to reverse, surprising, and a real trade-off.

## Read first

`CONTEXT.md` (Participant, Member, Org admin, Project role, Rail); ADR-0015
(two-level access), ADR-0016 (owner/member collapse), ADR-0033 (org admin,
appointments); the elevated-tier work (T-174 — `participants.elevated`,
`packages/governance/src/access.ts`); the plan and naming APIs
(`apps/api/src/plan.ts`, `apps/api/src/naming.ts`); the grill tracker's T-133
"admin / super-user access tier" item.

## The tension to resolve

T-174 added a single `participants.elevated` boolean gating destructive lifecycle
actions (close-as-rejected). Owner feedback (2026-07-24) asks for a richer,
**named class model**, because who-may-do-what now differs by *both* the
organisation's project role (owner vs member/"guest") *and* the elevated flag:

- **Owner super-user** (owner org + elevated): full control — edits the
  project-wide coding scheme, edits/consolidates the plan (MIDP), holds the
  destructive lifecycle actions.
- **Guest super-user** (member/"guest" org + elevated): edits **its own** org's
  TIDP; may **propose** coding-scheme additions but not edit the scheme directly.
- **Ordinary participant** (not elevated): does normal work — drafts, reviews —
  but may **not** edit the TIDP or touch the scheme.

## Resolve, in order

1. **Is "class of user" a derived combination or a new first-class concept?**
   Recommend: derive it from `(membershipRole × elevated)` — owner-super /
   guest-super / ordinary — rather than a new stored role, so it reuses T-174 and
   does not reopen ADR-0016's owner/member collapse. Name the classes in the
   glossary. Stress test: does any capability need a *third* axis the pair can't
   express (e.g. per-deliverable elevation)? If not, the pair suffices.

2. **The capability matrix.** Fix, per class: *edit own-org TIDP rows*
   (create/patch plan containers), *edit the project-wide scheme*, *propose a
   scheme addition*, *destructive lifecycle actions*. Confirm: TIDP editing now
   requires super-user (today any member may create a plan row — a tightening);
   schema edit = owner-super only; schema propose = guest-super; destructive =
   any super-user (T-174 unchanged).

3. **Reconciliation.** Confirm this does not reopen ADR-0016 (still owner/member
   at the org level) and is distinct from the org admin (ADR-0033, an intra-org
   *enrolment* power, not a project-lifecycle one). Decide whether the classes
   warrant an ADR (they refine T-174's capability into a matrix — likely a short
   ADR or a T-174 addendum).

4. **Who grants elevation, and how is it seen?** Today the seed sets it. Decide
   the grant path (owner grants elevation to a guest participant?) and how the
   class surfaces to the UI (the /me participant already carries `elevated`).

## Likely ADR candidate

The class-of-user capability matrix (owner-super / guest-super / ordinary; TIDP
edit and scheme edit/propose gated by class) — refines T-174; offer only if the
bar is met.
