# Grill sessions

The interrogation lane's records: open questions, the completed-session
archive, and the parked proposals. The numbering conventions live with their
guards — `Q-###` (`pnpm run check:questions -- --next`) and `P-###`
(`pnpm run check:parking -- --next`); derive numbers, never read a counter
line by eye.

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions, from 2026-08-28 — a loose session-notes file dropped here
> previously had nothing watching for it; session records belong in
> `grill-history.md`, not in new files). **Add a file here, add its row in the
> same commit.**

| Doc | What it is |
|---|---|
| `grill-questions.md` | The open-questions index (`Q-###`), each carrying what it blocks. The authority on what is still undecided. |
| `grill-history.md` | Completed sessions and closed rulings. **Don't load by default** — precedent and record, not backlog (CLAUDE.md). |
| `parking-lot.md` | Parked proposals (`P-###`) — ideas the owner has **heard and not adopted** (criterion re-cut 2026-08-30; entries that also contradict an accepted ADR are flagged with it). ⚠ **Never load unless the owner names it** — nothing inside has standing, so reading an entry mid-session risks building toward something nobody agreed to; the ADR-contradicting entries are actively poisonous. CLAUDE.md carries the full warning and the parked-vs-deferred boundary. This row exists so the file is indexed, not so it is read. |
