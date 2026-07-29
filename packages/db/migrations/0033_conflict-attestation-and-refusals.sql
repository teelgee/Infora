-- T-246 — the attestation and the refusal audit (ADR-0046 §6, §8;
-- data-model.md Drawer 1). The owner's assurance without the register, and the
-- record of every grant the register refused.
ALTER TABLE "projects" ADD COLUMN "conflict_attestation_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "conflict_attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"attested_by_user_id" uuid NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conflict_refusals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exclusion_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"attempted_by_user_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"refused_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conflict_attestations" ADD CONSTRAINT "conflict_attestations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_attestations" ADD CONSTRAINT "conflict_attestations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_attestations" ADD CONSTRAINT "conflict_attestations_attested_by_user_id_users_id_fk" FOREIGN KEY ("attested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_refusals" ADD CONSTRAINT "conflict_refusals_exclusion_id_conflict_exclusions_id_fk" FOREIGN KEY ("exclusion_id") REFERENCES "public"."conflict_exclusions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_refusals" ADD CONSTRAINT "conflict_refusals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_refusals" ADD CONSTRAINT "conflict_refusals_attempted_by_user_id_users_id_fk" FOREIGN KEY ("attempted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_refusals" ADD CONSTRAINT "conflict_refusals_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- One live attestation per (project, organisation); re-attesting supersedes the
-- prior one rather than overwriting it, so the history survives.
CREATE UNIQUE INDEX "conflict_attestations_live_unique" ON "conflict_attestations" USING btree ("project_id","organisation_id") WHERE "conflict_attestations"."superseded_at" IS NULL;
