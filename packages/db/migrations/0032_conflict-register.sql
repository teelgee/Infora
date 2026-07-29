-- T-245 — the conflict register (ADR-0046, data-model.md Drawer 1).
-- The ethical wall's first POSITIVE-EXCLUSION form: every other access table
-- grants, this one alone denies. Org-private (ADR-0018 private floor).
CREATE TYPE "public"."conflict_grain" AS ENUM('organisation', 'individual');--> statement-breakpoint
CREATE TABLE "conflict_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaring_organisation_id" uuid NOT NULL,
	"declared_by_user_id" uuid NOT NULL,
	"grain" "conflict_grain" DEFAULT 'individual' NOT NULL,
	"subject_user_id" uuid,
	"project_a_id" uuid NOT NULL,
	"project_b_id" uuid NOT NULL,
	"reason" text,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_declaring_organisation_id_organisations_id_fk" FOREIGN KEY ("declaring_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_declared_by_user_id_users_id_fk" FOREIGN KEY ("declared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_project_a_id_projects_id_fk" FOREIGN KEY ("project_a_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_project_b_id_projects_id_fk" FOREIGN KEY ("project_b_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Symmetry by construction (ADR-0046 §9): the relation is unordered, so the
-- pair is stored canonically. Without this, X↔Y and Y↔X would be two rows and
-- the unique index below would not collapse them.
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_canonical_pair" CHECK ("project_a_id" < "project_b_id");--> statement-breakpoint
-- An exclusion pairs two DIFFERENT projects; the canonical CHECK already
-- excludes A = B, but state it so the intent survives a future edit.
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_distinct_projects" CHECK ("project_a_id" <> "project_b_id");--> statement-breakpoint
-- Individual grain names a person; organisation grain must not.
ALTER TABLE "conflict_exclusions" ADD CONSTRAINT "conflict_exclusions_grain_subject" CHECK (
	("grain" = 'individual' AND "subject_user_id" IS NOT NULL)
	OR ("grain" = 'organisation' AND "subject_user_id" IS NULL)
);--> statement-breakpoint
-- The two grains have different natural keys, so they get an index each rather
-- than one index over a nullable column: individual is keyed by (org, person,
-- pair), organisation by (org, pair). One combined index would need NULLS NOT
-- DISTINCT, since Postgres treats two null subjects as distinct and duplicate
-- organisation-grain rows would slip through.
CREATE UNIQUE INDEX "conflict_exclusions_individual_live_unique" ON "conflict_exclusions" USING btree ("declaring_organisation_id","subject_user_id","project_a_id","project_b_id") WHERE "conflict_exclusions"."withdrawn_at" IS NULL AND "conflict_exclusions"."grain" = 'individual';--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_exclusions_organisation_live_unique" ON "conflict_exclusions" USING btree ("declaring_organisation_id","project_a_id","project_b_id") WHERE "conflict_exclusions"."withdrawn_at" IS NULL AND "conflict_exclusions"."grain" = 'organisation';--> statement-breakpoint
CREATE INDEX "conflict_exclusions_org_live_idx" ON "conflict_exclusions" USING btree ("declaring_organisation_id") WHERE "conflict_exclusions"."withdrawn_at" IS NULL;
