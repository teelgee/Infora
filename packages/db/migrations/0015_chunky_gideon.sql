CREATE TYPE "public"."acknowledgement_mode" AS ENUM('controller', 'open');--> statement-breakpoint
CREATE TYPE "public"."transmittal_kind" AS ENUM('review', 'non_review');--> statement-breakpoint
CREATE TABLE "deliverable_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"acknowledged_by_participant_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_grant_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code_pattern" text NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deliverable_participant_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"granted_by_participant_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "transmittals" ALTER COLUMN "round_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transmittals" ALTER COLUMN "direction" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "ack_mode" "acknowledgement_mode" DEFAULT 'controller' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "ack_controller_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "transmittals" ADD COLUMN "kind" "transmittal_kind" DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "transmittals" ADD COLUMN "container_id" uuid;--> statement-breakpoint
ALTER TABLE "transmittals" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "transmittals" ADD COLUMN "recipient_organisation_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverable_acknowledgements" ADD CONSTRAINT "deliverable_acknowledgements_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_acknowledgements" ADD CONSTRAINT "deliverable_acknowledgements_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_acknowledgements" ADD CONSTRAINT "deliverable_acknowledgements_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_acknowledgements" ADD CONSTRAINT "deliverable_acknowledgements_acknowledged_by_participant_id_participants_id_fk" FOREIGN KEY ("acknowledged_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_grant_rules" ADD CONSTRAINT "deliverable_grant_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_grant_rules" ADD CONSTRAINT "deliverable_grant_rules_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_grant_rules" ADD CONSTRAINT "deliverable_grant_rules_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_grant_rules" ADD CONSTRAINT "deliverable_grant_rules_created_by_participant_id_participants_id_fk" FOREIGN KEY ("created_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_participant_grants" ADD CONSTRAINT "deliverable_participant_grants_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_participant_grants" ADD CONSTRAINT "deliverable_participant_grants_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_participant_grants" ADD CONSTRAINT "deliverable_participant_grants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_participant_grants" ADD CONSTRAINT "deliverable_participant_grants_granted_by_participant_id_participants_id_fk" FOREIGN KEY ("granted_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliverable_acknowledgements_container_idx" ON "deliverable_acknowledgements" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_acknowledgements_version_org_unique" ON "deliverable_acknowledgements" USING btree ("version_id","organisation_id");--> statement-breakpoint
CREATE INDEX "deliverable_grant_rules_project_org_idx" ON "deliverable_grant_rules" USING btree ("project_id","organisation_id");--> statement-breakpoint
CREATE INDEX "deliverable_participant_grants_container_org_idx" ON "deliverable_participant_grants" USING btree ("container_id","organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_participant_grants_live_unique" ON "deliverable_participant_grants" USING btree ("container_id","participant_id") WHERE "deliverable_participant_grants"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ack_controller_participant_id_participants_id_fk" FOREIGN KEY ("ack_controller_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ADR-0035 §1: the two kinds are one table, kept structurally separate. A
-- review transmittal carries a round and a direction and no container/version;
-- a non_review transmittal carries a container and version and NO round or
-- direction — so no edit-lock / DRR-snapshot path can ever attach to it.
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_kind_shape" CHECK (
  CASE "kind"
    WHEN 'review' THEN
      "round_id" IS NOT NULL AND "direction" IS NOT NULL
      AND "container_id" IS NULL AND "version_id" IS NULL
    WHEN 'non_review' THEN
      "round_id" IS NULL AND "direction" IS NULL
      AND "container_id" IS NOT NULL AND "version_id" IS NOT NULL
  END
);--> statement-breakpoint
-- The acknowledgement is a receipt (ADR-0035 §4): strictly append-only, never
-- un-received — the shared forbid_mutation() (no UPDATE, no DELETE).
CREATE TRIGGER deliverable_acknowledgements_append_only
  BEFORE UPDATE OR DELETE ON deliverable_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
-- Intra-org narrowing grants: append-only interval rows (ADR-0035 §3, the
-- deliverable_shares pattern) — identity immutable, only revocation may
-- change, DELETE never.
CREATE OR REPLACE FUNCTION participant_grant_interval_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deliverable_participant_grants are append-only: DELETE rejected';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
     OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.granted_by_participant_id IS DISTINCT FROM OLD.granted_by_participant_id
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
  THEN
    RAISE EXCEPTION 'deliverable_participant_grants row % is an interval: only revocation may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER deliverable_participant_grants_interval
  BEFORE UPDATE OR DELETE ON deliverable_participant_grants
  FOR EACH ROW EXECUTE FUNCTION participant_grant_interval_only();--> statement-breakpoint
-- Standing routing rules: append-only interval rows — the definition never
-- changes, only revocation closes it, DELETE never.
CREATE OR REPLACE FUNCTION grant_rule_interval_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deliverable_grant_rules are append-only: DELETE rejected';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
     OR NEW.code_pattern IS DISTINCT FROM OLD.code_pattern
     OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.created_by_participant_id IS DISTINCT FROM OLD.created_by_participant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'deliverable_grant_rules row % is an interval: only revocation may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER deliverable_grant_rules_interval
  BEFORE UPDATE OR DELETE ON deliverable_grant_rules
  FOR EACH ROW EXECUTE FUNCTION grant_rule_interval_only();
