-- 0040 — the submission acknowledgement gate (ADR-0051, T-346).
-- A project-scope round is created 'submitted' and opens for review only when
-- a Participant of the owner organisation acknowledges the submission.
-- The acknowledgement is recorded on the ROUND, not the transmittal: the
-- transmittals table is append-only by trigger (forbid_mutation, the
-- ADR-0009/0010 record discipline), and the round is the thing the act
-- transitions — one submission acknowledgement per round.
-- Hand-written per the standing rule (drizzle-kit's snapshot has drifted);
-- drawn in data-model.md drawer 5.
ALTER TYPE "public"."round_state" ADD VALUE 'submitted' BEFORE 'open';--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "acknowledged_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_acknowledged_by_participant_id_participants_id_fk" FOREIGN KEY ("acknowledged_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- the pair is set together or not at all
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_acknowledgement_pair" CHECK (("acknowledged_by_participant_id" IS NULL) = ("acknowledged_at" IS NULL));
