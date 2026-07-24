-- T-171 (ADR-0036): every document lives in a sandbox. Backfill any document
-- with no sandbox into its organisation's single-org sandbox before enforcing
-- NOT NULL. The sandbox's creator is the document's own creator (always set),
-- so the backfill is always resolvable.
INSERT INTO "sandboxes" (project_id, name, scope, owning_organisation_id, created_by_participant_id)
SELECT DISTINCT ON (sd.project_id, sd.organisation_id)
  sd.project_id, 'Sandbox', 'single_org', sd.organisation_id, sd.created_by_participant_id
FROM sandbox_documents sd
WHERE sd.sandbox_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sandboxes sb
    WHERE sb.project_id = sd.project_id
      AND sb.owning_organisation_id = sd.organisation_id
      AND sb.scope = 'single_org'
  )
ORDER BY sd.project_id, sd.organisation_id, sd.created_by_participant_id;--> statement-breakpoint
INSERT INTO sandbox_scope_grants (sandbox_id, grantee_type, organisation_id, granted_by_participant_id)
SELECT sb.id, 'organisation', sb.owning_organisation_id, sb.created_by_participant_id
FROM sandboxes sb
WHERE NOT EXISTS (SELECT 1 FROM sandbox_scope_grants g WHERE g.sandbox_id = sb.id);--> statement-breakpoint
UPDATE sandbox_documents sd
SET sandbox_id = sb.id
FROM sandboxes sb
WHERE sb.project_id = sd.project_id
  AND sb.owning_organisation_id = sd.organisation_id
  AND sb.scope = 'single_org'
  AND sd.sandbox_id IS NULL;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ALTER COLUMN "sandbox_id" SET NOT NULL;