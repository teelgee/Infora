-- 0043 — T-365 (S7, ADR-0040 addendum 2026-08-09): the third folder mode.
-- A plan-locked sandbox's tree is DERIVED from the owning organisation's own
-- plan rows — a discipline folder over a working folder per deliverable —
-- system-owned, appearing as rows are created, renaming as the row retitles,
-- kept (badged off-plan) when the row is withdrawn. Folders therefore carry a
-- kind, and a deliverable folder carries its container: the sync's join and
-- the bind pre-select's anchor (ADR-0038 addendum). One derived working folder
-- per (sandbox, container), unique so the sync is idempotent.
CREATE TYPE "sandbox_folder_kind" AS ENUM ('manual', 'discipline', 'deliverable');
ALTER TABLE "sandboxes" ADD COLUMN "plan_locked" boolean NOT NULL DEFAULT false;
ALTER TABLE "sandbox_folders" ADD COLUMN "kind" "sandbox_folder_kind" NOT NULL DEFAULT 'manual';
ALTER TABLE "sandbox_folders" ADD COLUMN "container_id" uuid REFERENCES "containers"("id");
CREATE UNIQUE INDEX "sandbox_folders_deliverable_unique" ON "sandbox_folders" ("sandbox_id", "container_id") WHERE "container_id" IS NOT NULL;
