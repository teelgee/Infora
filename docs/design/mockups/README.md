# Mockups — the pending register

Screens **drawn before they exist**, awaiting a ruling or a build. The lifecycle
that governs them is in [the design README](../README.md#the-lifecycle-and-how-a-mockup-dies);
the one line worth repeating here is its corollary:

> **This folder should only ever hold pending work. A mockup of something
> already built is a bug in the process, not an archive.**

This index exists because that rule was written down and still failed.
`deliverable-status-page.html` — the mockup ADR-0051 came out of — sat here for
three weeks after its screen shipped and was photographed into the walkthrough,
which is precisely the "stale drawing beside a real screenshot" the lifecycle
calls a trap. Nothing caught it: `docs/design/` was outside the docs-index guard
until 2026-08-28. It is now inside it, and this file is the register.

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions). A mockup added without a row fails; a row naming a mockup that
> has been captured-and-deleted fails. **Deleting a mockup means deleting its
> row in the same commit** — which is the point at which somebody has to
> confirm the ruling reached its ADR, because that is all that survives.

| Doc | State | What it proposes |
|-----|-------|------------------|
| `workspace-redesign.dc.html` | 🔴 **Status unresolved — needs a decision** | The workspace screen. **Do not treat it as a spec until this row is settled.** Three things about it are unexplained by anything in the repo: the `.dc.html` extension is a convention documented nowhere; it loads `./support.js`, which is not in this folder, so it does not render; and it was last touched at **T-145**, long before the design-system re-skin (`slice-ui-redesign`, ✅ closed 2026-08-06) shipped [workspace.tsx](../../../apps/web/src/screens/workspace.tsx), which is captured in the walkthrough as `01-workspace.png`. By the lifecycle's corollary a mockup of a built screen goes — but "redesign" may mean a proposal the re-skin never executed, and that is an owner call, not an inference from a filename. |

**Empty is the healthy state.** A register with no rows means every drawing has
become a screen and a capture, which is the lifecycle working. Do not keep a
mockup here for reference — the reference is the ADR and the walkthrough.
