-- T-414 — SAVED STARTING OUTLINES: a composed outline kept for the firm
-- (ADR-0053 addendum A5, owner-ruled 2026-09-01).
--
-- In plain terms: having built an outline you like in the document creator, you
-- can keep it. Next time it appears beside the outlines Infora ships, marked as
-- your firm's own, for your firm only. Anyone in the firm may save one, and a
-- firm administrator may retire one that should not be offered any more.
--
-- ORG CONTEXT, AND THE RULEBOOK'S SCOPING EXACTLY. `organisation_id` is the
-- ONLY scope key: there is deliberately no `project_id` and no wall predicate.
-- How a firm structures its documents is firm know-how that travels to every
-- project it touches and must never reach another organisation working on the
-- same project — which is ADR-0020's argument, and the same one `rulebooks`
-- rests on one table up.
--
-- `sections` IS jsonb RATHER THAN ROWS, and the reason is what the store is
-- FOR. A starting outline is a seed for a form, not an audited record: nothing
-- is ever quoted from it and nothing cites it, and the moment it is chosen it
-- becomes a copy the author edits freely (ADR-0053 addendum A1 — "seeds but
-- never locks"). That is the opposite of `rulebook_clauses`, which is rows
-- precisely because a finding quotes a clause verbatim and has to resolve to
-- the words it quoted. Rows here would buy an addressability nobody needs and
-- cost a join on every read of a menu.
--
-- CURRENCY BY STATE, never a delete. A curator retires an outline and it stops
-- being offered; documents already made from it are untouched — which is true
-- by construction rather than by care, because a chosen outline is copied into
-- the request and no document has ever held a reference to this row.
--
-- A NAMED PERSON RIDES THIS TABLE. `saved_by_user_id` is registered in
-- docs/architecture/personal-data.md in this ticket's own commit, the
-- `loaded_by_user_id` precedent one table up. USER grain, not Participant:
-- keeping an outline for the firm is an account-level act with no project to
-- hold a Participant of.
--
-- Drawn in docs/build/data-model.md drawer 7 before it was written; generated
-- by drizzle-kit against the current snapshot and read before being applied.
-- The GRANT at the foot is hand-added, as every one in this repo is.
CREATE TABLE "starting_outlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sections" jsonb NOT NULL,
	"saved_by_user_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "starting_outlines" ADD CONSTRAINT "starting_outlines_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starting_outlines" ADD CONSTRAINT "starting_outlines_saved_by_user_id_users_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "starting_outlines_organisation_idx" ON "starting_outlines" USING btree ("organisation_id");--> statement-breakpoint

-- T-247's discipline: the application role reads and writes this like any other
-- table. 0034's default privileges cover tables created after it, but state the
-- grant rather than rely on it being remembered.
GRANT SELECT, INSERT, UPDATE, DELETE ON "starting_outlines" TO "infora_app";
