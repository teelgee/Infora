-- T-460 — the register's saved views (drawn in data-model.md, Drawer 2, on
-- 2026-10-23 before this file was written).
--
-- *In plain terms: a person can save the way they have set up a list — what
-- they searched, which filters and sort, which columns they hid — under a name,
-- keep it to themselves or share it with their own firm on the project, and
-- come back to it. A saved view is a named filter, never an access object:
-- applying one changes what a list shows a person, never what they may see.*
--
-- ONE TABLE. Its ceiling is the organisation, in the read's own WHERE; the
-- maker is a named person, registered in personal-data.md ("Saved views").
-- WHAT IS HAND-WRITTEN BELOW THE GENERATED HALF: the house-style grant.
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"register" text NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_maker_name_unique" ON "saved_views" USING btree ("project_id","participant_id","register","name");--> statement-breakpoint
CREATE INDEX "saved_views_project_org_idx" ON "saved_views" USING btree ("project_id","organisation_id","register");
--> statement-breakpoint
-- the house-style grant (0034's default privileges already cover it, but a
-- reader checking grants should find them stated)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saved_views" TO "infora_app";
