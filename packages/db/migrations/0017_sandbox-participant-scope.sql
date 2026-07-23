CREATE TYPE "public"."sandbox_grantee_type" AS ENUM('organisation', 'participant');--> statement-breakpoint
CREATE TYPE "public"."sandbox_scope" AS ENUM('multi_org', 'single_org', 'team', 'named_user');--> statement-breakpoint
CREATE TABLE "sandbox_scope_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_id" uuid NOT NULL,
	"grantee_type" "sandbox_grantee_type" NOT NULL,
	"organisation_id" uuid,
	"participant_id" uuid,
	"granted_by_participant_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sandboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" "sandbox_scope" NOT NULL,
	"owning_organisation_id" uuid NOT NULL,
	"created_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "sandbox_id" uuid;--> statement-breakpoint
ALTER TABLE "sandbox_scope_grants" ADD CONSTRAINT "sandbox_scope_grants_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_scope_grants" ADD CONSTRAINT "sandbox_scope_grants_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_scope_grants" ADD CONSTRAINT "sandbox_scope_grants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_scope_grants" ADD CONSTRAINT "sandbox_scope_grants_granted_by_participant_id_participants_id_fk" FOREIGN KEY ("granted_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandboxes" ADD CONSTRAINT "sandboxes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandboxes" ADD CONSTRAINT "sandboxes_owning_organisation_id_organisations_id_fk" FOREIGN KEY ("owning_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandboxes" ADD CONSTRAINT "sandboxes_created_by_participant_id_participants_id_fk" FOREIGN KEY ("created_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_scope_grants_sandbox_idx" ON "sandbox_scope_grants" USING btree ("sandbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_scope_grants_live_org_unique" ON "sandbox_scope_grants" USING btree ("sandbox_id","organisation_id") WHERE "sandbox_scope_grants"."removed_at" IS NULL AND "sandbox_scope_grants"."organisation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_scope_grants_live_participant_unique" ON "sandbox_scope_grants" USING btree ("sandbox_id","participant_id") WHERE "sandbox_scope_grants"."removed_at" IS NULL AND "sandbox_scope_grants"."participant_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD CONSTRAINT "sandbox_documents_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- T-145 (ADR-0036): a scope grant admits exactly one of an organisation or a
-- participant, matched to grantee_type — kept in SQL like the append-only
-- triggers, not in the drizzle snapshot.
ALTER TABLE "sandbox_scope_grants" ADD CONSTRAINT "sandbox_scope_grants_grantee_shape" CHECK (
  (grantee_type = 'organisation' AND organisation_id IS NOT NULL AND participant_id IS NULL)
  OR (grantee_type = 'participant' AND participant_id IS NOT NULL AND organisation_id IS NULL)
);--> statement-breakpoint
-- Backfill: turn each organisation's implicit single-org sandbox into a real
-- one (ADR-0036). A no-op on a fresh seed (no sandbox documents yet); correct
-- for any existing data. created_by is any live participant of that org on the
-- project — the implicit sandbox had no explicit creator.
INSERT INTO "sandboxes" (project_id, name, scope, owning_organisation_id, created_by_participant_id)
SELECT DISTINCT ON (sd.project_id, sd.organisation_id)
  sd.project_id, 'Sandbox', 'single_org', sd.organisation_id, p.id
FROM sandbox_documents sd
JOIN participants p ON p.project_id = sd.project_id AND p.removed_at IS NULL
JOIN users u ON u.id = p.user_id AND u.organisation_id = sd.organisation_id
WHERE sd.sandbox_id IS NULL
ORDER BY sd.project_id, sd.organisation_id, p.created_at;--> statement-breakpoint
UPDATE sandbox_documents sd
SET sandbox_id = sb.id
FROM sandboxes sb
WHERE sb.project_id = sd.project_id
  AND sb.owning_organisation_id = sd.organisation_id
  AND sb.scope = 'single_org'
  AND sd.sandbox_id IS NULL;--> statement-breakpoint
INSERT INTO sandbox_scope_grants (sandbox_id, grantee_type, organisation_id, granted_by_participant_id)
SELECT sb.id, 'organisation', sb.owning_organisation_id, sb.created_by_participant_id
FROM sandboxes sb
WHERE NOT EXISTS (SELECT 1 FROM sandbox_scope_grants g WHERE g.sandbox_id = sb.id);