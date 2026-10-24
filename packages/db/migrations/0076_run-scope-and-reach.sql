-- T-469 — the run's scope, and its reach. Two nullable columns, no backfill:
-- null means the whole visible library (plans.scope) and a run finished before
-- the counts existed (runs.reach). `runs.reach` is written in the same UPDATE
-- that finishes the run; the T-008 immutability trigger does not list it, so it
-- lands before the freeze exactly as `response` does.
ALTER TABLE "plans" ADD COLUMN "scope" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "reach" jsonb;