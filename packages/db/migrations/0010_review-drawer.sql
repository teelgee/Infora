CREATE TYPE "public"."acceptance_code_level" AS ENUM('comment', 'deliverable', 'both');--> statement-breakpoint
CREATE TYPE "public"."edit_lock_side" AS ENUM('authoring', 'reviewing');--> statement-breakpoint
CREATE TYPE "public"."review_cycle_state" AS ENUM('active', 'accepted', 'closed_rejected');--> statement-breakpoint
CREATE TYPE "public"."round_state" AS ENUM('open', 'issued', 'responded');--> statement-breakpoint
CREATE TYPE "public"."transmittal_direction" AS ENUM('issue', 'return');--> statement-breakpoint
CREATE TABLE "acceptance_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"level" "acceptance_code_level" DEFAULT 'both' NOT NULL,
	"is_accepting" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deliverable_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"granted_by_participant_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deliverable_reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"granted_by_participant_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"confirmed_by_participant_id" uuid,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"author_participant_id" uuid NOT NULL,
	"body" text NOT NULL,
	"next_version_id" uuid,
	"next_version_anchor" jsonb,
	"no_change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"author_participant_id" uuid NOT NULL,
	"body" text NOT NULL,
	"acceptance_code_id" uuid,
	"anchor" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"state" "review_cycle_state" DEFAULT 'active' NOT NULL,
	"edit_lock_holder" "edit_lock_side" DEFAULT 'reviewing' NOT NULL,
	"launched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by_participant_id" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transmittal_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"version_id" uuid NOT NULL,
	"state" "round_state" DEFAULT 'open' NOT NULL,
	"review_period_target" timestamp with time zone,
	"deliverable_code_id" uuid
);
--> statement-breakpoint
CREATE TABLE "transmittals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"direction" "transmittal_direction" NOT NULL,
	"sender_participant_id" uuid NOT NULL,
	"recipients" uuid[] DEFAULT '{}' NOT NULL,
	"purpose_code" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drrs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "comments" CASCADE;--> statement-breakpoint
DROP TABLE "drrs" CASCADE;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "container_id" uuid;--> statement-breakpoint
ALTER TABLE "acceptance_codes" ADD CONSTRAINT "acceptance_codes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_authors" ADD CONSTRAINT "deliverable_authors_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_authors" ADD CONSTRAINT "deliverable_authors_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_authors" ADD CONSTRAINT "deliverable_authors_granted_by_participant_id_participants_id_fk" FOREIGN KEY ("granted_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviewers" ADD CONSTRAINT "deliverable_reviewers_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviewers" ADD CONSTRAINT "deliverable_reviewers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviewers" ADD CONSTRAINT "deliverable_reviewers_granted_by_participant_id_participants_id_fk" FOREIGN KEY ("granted_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviewers" ADD CONSTRAINT "deliverable_reviewers_confirmed_by_participant_id_participants_id_fk" FOREIGN KEY ("confirmed_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_comment_id_review_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."review_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_author_participant_id_participants_id_fk" FOREIGN KEY ("author_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_next_version_id_versions_id_fk" FOREIGN KEY ("next_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_author_participant_id_participants_id_fk" FOREIGN KEY ("author_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_acceptance_code_id_acceptance_codes_id_fk" FOREIGN KEY ("acceptance_code_id") REFERENCES "public"."acceptance_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_closed_by_participant_id_participants_id_fk" FOREIGN KEY ("closed_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_transmittal_id_transmittals_id_fk" FOREIGN KEY ("transmittal_id") REFERENCES "public"."transmittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_deliverable_code_id_acceptance_codes_id_fk" FOREIGN KEY ("deliverable_code_id") REFERENCES "public"."acceptance_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_sender_participant_id_participants_id_fk" FOREIGN KEY ("sender_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_codes_project_code_live_unique" ON "acceptance_codes" USING btree ("project_id","code") WHERE "acceptance_codes"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "deliverable_authors_container_idx" ON "deliverable_authors" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_authors_one_live_lead" ON "deliverable_authors" USING btree ("container_id") WHERE "deliverable_authors"."is_lead" = true AND "deliverable_authors"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "deliverable_reviewers_container_idx" ON "deliverable_reviewers" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_reviewers_one_live_lead" ON "deliverable_reviewers" USING btree ("container_id") WHERE "deliverable_reviewers"."is_lead" = true AND "deliverable_reviewers"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "responses_comment_unique" ON "responses" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "review_comments_round_idx" ON "review_comments" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_cycles_one_active_per_container" ON "review_cycles" USING btree ("container_id") WHERE "review_cycles"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "review_snapshots_transmittal_unique" ON "review_snapshots" USING btree ("transmittal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_cycle_number_unique" ON "rounds" USING btree ("cycle_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_one_open_per_cycle" ON "rounds" USING btree ("cycle_id") WHERE "rounds"."state" = 'open';--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- T-115 enforcement (ADR-0009/0010/0014/0017/0033), on the T-008 pattern.
-- Transmittals and snapshots: strictly append-only records.
CREATE TRIGGER transmittals_append_only
  BEFORE UPDATE OR DELETE ON transmittals
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
CREATE TRIGGER review_snapshots_append_only
  BEFORE UPDATE OR DELETE ON review_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- Review comments: live and moderatable while their round is open
-- (ADR-0007), frozen once the round is issued (ADR-0014); identity columns
-- immutable always; DELETE never.
CREATE OR REPLACE FUNCTION review_comments_frozen_once_issued() RETURNS trigger AS $$
DECLARE r_state round_state;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review_comments are append-only: DELETE rejected';
  END IF;
  SELECT state INTO r_state FROM rounds WHERE id = OLD.round_id;
  IF r_state <> 'open' THEN
    RAISE EXCEPTION 'comment % is frozen: its round is %', OLD.id, r_state;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.author_participant_id IS DISTINCT FROM OLD.author_participant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'comment % identity is immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER review_comments_frozen
  BEFORE UPDATE OR DELETE ON review_comments
  FOR EACH ROW EXECUTE FUNCTION review_comments_frozen_once_issued();--> statement-breakpoint

-- Responses: editable during the respond phase (round issued), frozen once
-- the round has responded; identity immutable; DELETE never.
CREATE OR REPLACE FUNCTION responses_frozen_once_responded() RETURNS trigger AS $$
DECLARE r_state round_state;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'responses are append-only: DELETE rejected';
  END IF;
  SELECT r.state INTO r_state
    FROM rounds r JOIN review_comments c ON c.round_id = r.id
    WHERE c.id = OLD.comment_id;
  IF r_state <> 'issued' THEN
    RAISE EXCEPTION 'response % is frozen: its round is %', OLD.id, r_state;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.comment_id IS DISTINCT FROM OLD.comment_id
     OR NEW.author_participant_id IS DISTINCT FROM OLD.author_participant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'response % identity is immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER responses_frozen
  BEFORE UPDATE OR DELETE ON responses
  FOR EACH ROW EXECUTE FUNCTION responses_frozen_once_responded();--> statement-breakpoint

-- Appointment grants: append-only interval rows (ADR-0033) — an amendment is
-- a new row or a closed interval; identity and lead flag never change;
-- DELETE never. Reviewer rows may additionally gain their confirmation.
CREATE OR REPLACE FUNCTION grant_interval_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% are append-only: DELETE rejected', TG_TABLE_NAME;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.is_lead IS DISTINCT FROM OLD.is_lead
     OR NEW.granted_by_participant_id IS DISTINCT FROM OLD.granted_by_participant_id
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
  THEN
    RAISE EXCEPTION '% row % is an interval: only revocation (and confirmation) may change', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER deliverable_authors_interval
  BEFORE UPDATE OR DELETE ON deliverable_authors
  FOR EACH ROW EXECUTE FUNCTION grant_interval_only();--> statement-breakpoint
CREATE TRIGGER deliverable_reviewers_interval
  BEFORE UPDATE OR DELETE ON deliverable_reviewers
  FOR EACH ROW EXECUTE FUNCTION grant_interval_only();
