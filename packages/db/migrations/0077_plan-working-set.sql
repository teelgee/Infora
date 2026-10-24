-- T-471 — the working set a run was handed. One nullable column, no backfill:
-- null means the run was handed none (every run that finished before this
-- existed, and every run that pinned nothing). Written once by openPlan with
-- the scope, before retrieval. Names no person; the pinner is on
-- attached_sources, already registered.
ALTER TABLE "plans" ADD COLUMN "working_set" jsonb;
