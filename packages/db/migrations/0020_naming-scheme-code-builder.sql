CREATE TYPE "public"."naming_proposal_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "naming_scheme_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"proposing_organisation_id" uuid NOT NULL,
	"proposed_by_participant_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" "naming_proposal_status" DEFAULT 'pending' NOT NULL,
	"resolved_by_participant_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naming_serials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"series_key" text NOT NULL,
	"next_serial" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_naming_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"separator" text DEFAULT '-' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "naming_scheme_proposals" ADD CONSTRAINT "naming_scheme_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naming_scheme_proposals" ADD CONSTRAINT "naming_scheme_proposals_proposing_organisation_id_organisations_id_fk" FOREIGN KEY ("proposing_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naming_scheme_proposals" ADD CONSTRAINT "naming_scheme_proposals_proposed_by_participant_id_participants_id_fk" FOREIGN KEY ("proposed_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naming_scheme_proposals" ADD CONSTRAINT "naming_scheme_proposals_resolved_by_participant_id_participants_id_fk" FOREIGN KEY ("resolved_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naming_serials" ADD CONSTRAINT "naming_serials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naming_serials" ADD CONSTRAINT "naming_serials_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_naming_schemes" ADD CONSTRAINT "project_naming_schemes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "naming_serials_unique" ON "naming_serials" USING btree ("project_id","organisation_id","series_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_naming_schemes_project_unique" ON "project_naming_schemes" USING btree ("project_id");