-- T-449 — the app builder's build conversation (ADR-0056's third addendum,
-- ruling 5; drawn in data-model.md, Drawer 9, on 2026-10-18 before this file
-- was written).
--
-- *In plain terms: what a builder says to the agent while building an app, and
-- what the agent says and does in reply, kept against the app so the
-- conversation can be picked up again tomorrow — readable by the people who may
-- build that app and nobody else, and deleted with the app.*
--
-- ONE TABLE AND ONE ENUM. The register row for this data (personal-data.md,
-- "The app builder's conversation") was written at ruling, before this
-- migration; this file is what makes the row true.
--
-- WHAT IS HAND-WRITTEN BELOW THE GENERATED HALF, AND WHY:
--   1. a CHECK that only the agent asks, acts or proposes — a person's turn is
--      what they said and nothing else, so a later reader can never mistake a
--      receipt for something a person claimed;
--   2. a CHECK bounding the text, so a turn is a turn and not a document;
--   3. an append-only trigger against UPDATE — what was said is not rewritten.
--      DELETE is deliberately NOT refused: it is the deletion path itself (the
--      cascade from `apps`, and an erasure request under ADR-0050 §6), and a
--      trigger refusing it would make the register's "deleted with the app"
--      false the first time an app was deleted.
CREATE TYPE "public"."app_build_turn_role" AS ENUM('person', 'agent');--> statement-breakpoint
CREATE TABLE "app_build_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "app_build_turns_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role" "app_build_turn_role" NOT NULL,
	"spoken_by_participant_id" uuid NOT NULL,
	"text" text NOT NULL,
	"asked" text[] DEFAULT '{}'::text[] NOT NULL,
	"acts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_build_turns" ADD CONSTRAINT "app_build_turns_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_build_turns" ADD CONSTRAINT "app_build_turns_spoken_by_participant_id_participants_id_fk" FOREIGN KEY ("spoken_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_build_turns_app_idx" ON "app_build_turns" USING btree ("app_id","seq");
--> statement-breakpoint

ALTER TABLE "app_build_turns" ADD CONSTRAINT "app_build_turns_only_the_agent_acts"
  CHECK ("role" = 'agent' OR ("asked" = '{}'::text[] AND "acts" = '[]'::jsonb AND "proposals" = '[]'::jsonb));--> statement-breakpoint

ALTER TABLE "app_build_turns" ADD CONSTRAINT "app_build_turns_text_bounded"
  CHECK (char_length("text") BETWEEN 1 AND 8000);--> statement-breakpoint

CREATE TRIGGER app_build_turns_append_only
  BEFORE UPDATE ON app_build_turns
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
