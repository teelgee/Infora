# Mockups - archive

Mockups the build has overtaken. Each did its job: it tested a design before
the screen was built. The real screen has since moved on, so **none of these
is a spec**. For what the product does, see
[the user-story walkthrough](../../../architecture/user-stories-walkthrough.html);
for what was decided, see the ADR named in each row. Why mockups are archived
rather than deleted (owner ruling, 2026-10-18) is in
[the design README](../../README.md#mockups-what-they-are-for).

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions): every file here has a row, and every row names a file here.

| Doc | Archived | Tested | Decisions now live in |
|-----|----------|--------|-----------------------|
| `app-builder-stepped-flow.html` | 2026-10-26 (T-447) | The app builder's stepped flow: the steps in the owner's words, the table step with its "does this hold contractual data?" question, and where the agent prompts the builder. Approved 2026-09-06 (T-438, *"these are perfect"*). Built as T-442, then replaced by the agent-led conversation; the walkthrough's "The app builder" section photographs what exists. Its notes record how each fork was ruled. | [ADR-0056](../../../architecture/adr/0056-the-app-model.md) - the 2026-09-06 addendum (the six forks) and the third addendum (the conversation that replaced the steps) |
| `returns-app-two-seats.html` | 2026-10-26 (T-447) | The returns app seen twice: as a contractor (the form and own-rows-only history) and as the client (every organisation's rows, the totals, the latest insight, the accept-or-reject act). Approved 2026-09-06 (T-438). Built as T-442 and T-443 and photographed in the walkthrough's "The app builder" section. Redrawn to the rulings before the build: the client sees no draft, and a rejection shows its reason. | [ADR-0056](../../../architecture/adr/0056-the-app-model.md) - the 2026-09-06 addendum |
