-- 0041 — per-reviewer completion (ADR-0052, T-353): a round-scoped signal
-- that a reviewer's pass is done. One row per (round, participant);
-- deletable while the round is open (a changed mind, not an audit event);
-- frozen in effect at issue because the act is legal only on an open round.
-- Hand-written per the standing rule; drawn in data-model.md drawer 5.
CREATE TABLE "review_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "review_completions" ADD CONSTRAINT "review_completions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_completions" ADD CONSTRAINT "review_completions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_completions_round_participant_unique" ON "review_completions" ("round_id","participant_id");
