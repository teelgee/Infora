-- T-431/T-432 — EXTERNAL ISSUE: a finished document reaches somebody with no
-- Infora account (ADR-0055, owner-ruled 2026-09-01).
--
-- In plain terms: a scheme has to send finished documents to people who will
-- never have a login — a landowner whose field the route crosses, a
-- consultation respondent, a supplier engaged for one job. Until now there was
-- no path at all, so the consultant attached the file to an email and the
-- record of what went to whom lived in somebody's sent items. This migration
-- stores that act: a third kind of transmittal, a recipient record that is a
-- name and an email address, and two settings the project owner controls.
--
-- THE RECIPIENT IS NOT A PARTY, which is why the table sits in drawer 5 beside
-- the issue event rather than in drawer 1 beside organisations and people. It
-- is never an Organisation, never a Participant and never a Membership: there
-- is no access grant to resolve, because the LINK is the access (ADR-0055 §3).
-- No clause of the wall changes and none needs to.
--
-- THE THIRD KIND, AND ITS CHECK. `transmittals.kind` gains 'external'. The
-- existing constraint was a CASE over the two known kinds with no ELSE, so a
-- row carrying the new value would have evaluated to NULL — and a CHECK that
-- evaluates to NULL PASSES. Adding the enum value without rewriting the
-- constraint would therefore have quietly unbound round_id and direction for
-- exactly the kind ADR-0055 §1 promises can never touch a review cycle. The
-- rewritten constraint reads `"kind"::text` deliberately: Postgres refuses to
-- USE a new enum label in the same transaction that added it, and comparing
-- the column as text needs no such label (migrations 0054/0055/0061 avoided
-- this by never using their new values at all).
--
-- ONE TABLE FOR THE REQUEST AND THE ISSUE. ADR-0055 §7 lets anyone below the
-- project's who-may-issue line submit a request carrying every fact the issue
-- needs — the same four fields about the same named person. Two tables would
-- put a person with no account in two places, and the register's promise that
-- this material is deletable on request (ADR-0050 §6) would have two paths to
-- keep true instead of one. So the lifecycle is a state on one row.
--
-- A NAMED PERSON WITH NO ACCOUNT RIDES THIS TABLE, and it is the platform's
-- first. `name`, `email`, `reason` and `message` were registered in
-- docs/architecture/personal-data.md when ADR-0055 was accepted; this migration
-- keeps that row true rather than adding it. Two consequences are structural
-- rather than documentary: there is NO append-only trigger forbidding DELETE,
-- because the register promises this material is erasable and a trigger would
-- make the promise unkeepable; and the immutability trigger below freezes the
-- identity of a request so that what was approved is what was asked for.
--
-- NOTHING RECORDS THAT THE LINK WAS OPENED. ADR-0055 §5 calls the download the
-- receipt, but an open timestamp is behavioural data about a named person — the
-- shape the notifications table's `read_at` was registered for — and it is
-- outside the four fields the register carries. It is deliberately left out and
-- reported rather than added quietly; adding it is one column and one write.
--
-- TWO WHOLE-PROJECT SETTINGS join the owner-super-user tier, applying
-- `conflict_attestation_required` (ADR-0046 §8, migration 0033) and
-- `review_period_default_days` (T-371, migration 0046) rather than inventing a
-- tier. `external_issue_permission` defaults to the STRICTEST level: a project
-- that has not chosen should not discover the choice by finding a document
-- already gone.
--
-- Drawn in docs/build/data-model.md drawer 5 before it was written, and
-- HAND-WRITTEN rather than generated: migration 0064 belongs to a session
-- running in parallel and is absent from this tree, so `drizzle-kit generate`
-- would have emitted a snapshot missing that session's tables. The snapshot is
-- resynced at merge. The GRANT at the foot is hand-added, as every one here is.
ALTER TYPE "public"."transmittal_kind" ADD VALUE 'external';--> statement-breakpoint
CREATE TYPE "public"."external_issue_state" AS ENUM('requested', 'issued', 'declined');--> statement-breakpoint
CREATE TYPE "public"."external_issue_permission" AS ENUM('any_member', 'any_super_user', 'owner_super_user');--> statement-breakpoint

CREATE TABLE "external_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"transmittal_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"message" text NOT NULL,
	"state" "public"."external_issue_state" DEFAULT 'requested' NOT NULL,
	"link_token" text,
	"expires_at" timestamp with time zone,
	"requested_by_participant_id" uuid NOT NULL,
	"issued_by_participant_id" uuid,
	"declined_by_participant_id" uuid,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_transmittal_id_transmittals_id_fk" FOREIGN KEY ("transmittal_id") REFERENCES "public"."transmittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_requested_by_participant_id_participants_id_fk" FOREIGN KEY ("requested_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_issued_by_participant_id_participants_id_fk" FOREIGN KEY ("issued_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_declined_by_participant_id_participants_id_fk" FOREIGN KEY ("declined_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_recipients_link_token_unique" ON "external_recipients" USING btree ("link_token");--> statement-breakpoint
CREATE INDEX "external_recipients_container_idx" ON "external_recipients" USING btree ("container_id");--> statement-breakpoint

-- The state IS the shape, held by the database rather than by the two routes
-- that write it. A pending request is not a link: it has no token, no expiry
-- and no transmittal, so there is no state in which a row can serve a document
-- without an issue event standing behind it. A declined request names who
-- declined it and why — "records the decision" is a stored fact, not a log line.
ALTER TABLE "external_recipients" ADD CONSTRAINT "external_recipients_state_shape" CHECK (
  CASE "state"::text
    WHEN 'requested' THEN
      "transmittal_id" IS NULL AND "link_token" IS NULL AND "expires_at" IS NULL
      AND "issued_by_participant_id" IS NULL
      AND "declined_by_participant_id" IS NULL AND "decline_reason" IS NULL
      AND "decided_at" IS NULL
    WHEN 'issued' THEN
      "transmittal_id" IS NOT NULL AND "link_token" IS NOT NULL AND "expires_at" IS NOT NULL
      AND "issued_by_participant_id" IS NOT NULL
      AND "declined_by_participant_id" IS NULL AND "decline_reason" IS NULL
      AND "decided_at" IS NOT NULL
    WHEN 'declined' THEN
      "transmittal_id" IS NULL AND "link_token" IS NULL AND "expires_at" IS NULL
      AND "issued_by_participant_id" IS NULL
      AND "declined_by_participant_id" IS NOT NULL AND "decline_reason" IS NOT NULL
      AND "decided_at" IS NOT NULL
  END
);--> statement-breakpoint

-- What was approved is what was asked for. The four personal fields, the
-- deliverable and the version are frozen once the row exists, so an approver
-- cannot quietly redirect somebody else's request to another address or another
-- document; only the decision may be written, and only once. DELETE is
-- deliberately NOT forbidden — the register promises this material is erasable
-- on request (ADR-0050 §6), and an append-only trigger would make that
-- undeliverable.
CREATE OR REPLACE FUNCTION external_recipient_decision_only() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.requested_by_participant_id IS DISTINCT FROM OLD.requested_by_participant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'external_recipients: what was asked for is immutable — only the decision may be written';
  END IF;
  IF OLD.state::text <> 'requested' THEN
    RAISE EXCEPTION 'external_recipients: the decision is written once (state was %)', OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER external_recipients_decision_only
  BEFORE UPDATE ON external_recipients
  FOR EACH ROW EXECUTE FUNCTION external_recipient_decision_only();--> statement-breakpoint

-- The third transmittal kind. The rewritten constraint restates the two
-- existing branches unchanged and adds the third: an external issue carries a
-- container and a version and NO round and NO direction, so no edit lock, no
-- DRR snapshot and no path into a review cycle can ever attach to one — which
-- is ADR-0055 §1's promise, held here rather than in the routes.
ALTER TABLE "transmittals" DROP CONSTRAINT "transmittals_kind_shape";--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_kind_shape" CHECK (
  CASE "kind"::text
    WHEN 'review' THEN
      "round_id" IS NOT NULL AND "direction" IS NOT NULL
      AND "container_id" IS NULL AND "version_id" IS NULL
    WHEN 'non_review' THEN
      "round_id" IS NULL AND "direction" IS NULL
      AND "container_id" IS NOT NULL AND "version_id" IS NOT NULL
    WHEN 'external' THEN
      "round_id" IS NULL AND "direction" IS NULL
      AND "container_id" IS NOT NULL AND "version_id" IS NOT NULL
  END
);--> statement-breakpoint

-- The two whole-project settings (ADR-0055 §6–§7), on the owner super user's
-- tier beside conflict attestation and the review-period default.
ALTER TABLE "projects" ADD COLUMN "external_standard_message" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_issue_permission" "public"."external_issue_permission" DEFAULT 'owner_super_user' NOT NULL;--> statement-breakpoint

-- T-247's discipline: the application role reads and writes this like any other
-- table. 0034's default privileges cover tables created after it, but state the
-- grant rather than rely on it being remembered.
GRANT SELECT, INSERT, UPDATE, DELETE ON "external_recipients" TO "infora_app";
