-- T-249 — label propagation on write-back (docs/build/ask/09 R2, finding F2).
--
-- Written output takes the writer's own organisation, not the most restrictive
-- label among the sources that produced it — so an answer grounded on a
-- deliverable narrowed to named Participants (ADR-0035 §3) can be carried into
-- a document in a multi-organisation sandbox (ADR-0036). The computation and
-- the refusal are code (packages/governance/src/label.ts). This migration adds
-- the one thing that must be STORED: the record of a person overriding the
-- refusal on purpose.
--
-- There is no allowBroadening setting, no config key and no environment
-- variable. The only route past the refusal is a row in this table, and a row
-- has an author, a reason, and the two labels as they stood.
CREATE TYPE "public"."label_destination_kind" AS ENUM('sandbox_document');--> statement-breakpoint

CREATE TABLE "label_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"destination_kind" "label_destination_kind" NOT NULL,
	"destination_id" uuid NOT NULL,
	"source_label" text NOT NULL,
	"destination_label" text NOT NULL,
	"reason" text NOT NULL,
	"overridden_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "label_overrides" ADD CONSTRAINT "label_overrides_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_overrides" ADD CONSTRAINT "label_overrides_overridden_by_participant_id_participants_id_fk" FOREIGN KEY ("overridden_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- an override with no stated reason is indistinguishable from a mis-click
ALTER TABLE "label_overrides" ADD CONSTRAINT "label_overrides_reason_stated" CHECK (length(btrim("reason")) > 0);--> statement-breakpoint
CREATE INDEX "label_overrides_run_idx" ON "label_overrides" ("run_id");--> statement-breakpoint
CREATE INDEX "label_overrides_destination_idx" ON "label_overrides" ("destination_kind","destination_id");--> statement-breakpoint

-- Append-only, on the T-008 pattern: an override is evidence of a decision,
-- and a decision that can be edited afterwards is not evidence.
CREATE TRIGGER "label_overrides_append_only"
	BEFORE UPDATE OR DELETE ON "label_overrides"
	FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

GRANT SELECT, INSERT ON "label_overrides" TO "infora_app";
