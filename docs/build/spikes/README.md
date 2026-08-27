# Spikes

Research records — a spike answers a question with findings, not code. A spike
closes when the ticket built on its recommendation lands; it is kept where the
reasoning outlives the recommendation. Indexed here under the same two-way
guard as the build layer's own README (`scripts/docs-rules.mjs`).

| Doc | Lifecycle | Purpose | Maturity |
|-----|-----------|---------|----------|
| `spike-locators.md` | ✅ **Closed** — built by T-271 | **T-270's findings** — what locator is reliably extractable per format, where the verbatim-passage fallback applies, and the cross-chunk-quote case. Three findings against the running code: a chunk is not a substring of its version, heading numbers are read as sentence terminators, and a cross-boundary quote is in no chunk *and* no version. Kept as the record of **why offsets are stored rather than recovered** — the reasoning outlives the recommendation. Two of its five items are elsewhere by design: the heading split is T-307, PDF input is T-305. | 🟢 Findings complete 2026-08-01; **closed 2026-08-04 by T-271** |
| `spike-authority-corpus.md` | ♻ **Open** — recommendation not yet built (T-277 is ⛅ beyond V1) | **T-276's findings** — the v1 standard-tier instrument list with a licence basis for each, the in-force interval model, and org-tier ingest. Four findings: the standard tier rests on **one** licence basis (Crown copyright / OGL) with three carve-outs that matter more than the list; **"in force" is two time axes**, and the useful one — which cohort of applications an instrument governs — cannot be computed and must be carried as text; the org tier's real problem is **what counts as authority**, enforced by requiring an issuing body, a version and an in-force date at ingest; and the corpus **must not live in `version_chunks`**, whose wall predicate is built for project material. | 🟢 Findings complete 2026-08-27; stays open until T-277 lands |
