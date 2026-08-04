-- T-301 — the elevated tier's refusal record (the 2026-07-31 ruling;
-- data-model.md Drawer 2).
--
-- The gate is not new. T-174 and T-176 built it: close-as-rejected checks
-- Participant.elevated, withdraw and restore check canEditPlan, and both
-- surfaces already hide the affordance rather than disabling it. What was
-- missing is that a REFUSAL left no trace at all, so "did anyone try to end
-- this deliverable and get stopped" had no answer. conflict_refusals (T-246) is
-- the precedent: a control nobody can see operating is a control nobody can
-- audit.
--
-- Participant grain rather than User: the tier is a PROJECT capability, and the
-- same person may hold it on one project and not another.
--
-- required_tier carries one value today and is stored anyway. A row reading
-- "refused, tier elevated" still means what it meant once a second tier exists;
-- a bare "refused" would change meaning that day, and every historic row would
-- change with it, silently.
--
-- 'supersede' is absent from the enum ON PURPOSE. Nothing in the build sets a
-- container superseded, and whether the owner organisation may do it at all is
-- Q-036 — the first cross-organisation container write. Adding the value ahead
-- of that ruling would put a claim in the schema no code can make true.
CREATE TYPE "public"."elevated_action" AS ENUM('close_rejected', 'container_withdraw', 'container_restore');--> statement-breakpoint

CREATE TABLE "elevated_refusals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"attempted_by_participant_id" uuid NOT NULL,
	"action" "elevated_action" NOT NULL,
	"required_tier" text DEFAULT 'elevated' NOT NULL,
	"refused_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "elevated_refusals" ADD CONSTRAINT "elevated_refusals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elevated_refusals" ADD CONSTRAINT "elevated_refusals_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elevated_refusals" ADD CONSTRAINT "elevated_refusals_attempted_by_participant_id_participants_id_fk" FOREIGN KEY ("attempted_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- "what was attempted on this deliverable, most recent first" is the only read
-- this table is for
CREATE INDEX "elevated_refusals_container_idx" ON "elevated_refusals" USING btree ("container_id","refused_at");--> statement-breakpoint

-- Append-only (T-008's trigger, ADR-0028 §3): a refusal record a super-user
-- could quietly delete is worth nothing, and the people who hold this tier are
-- exactly the people who would want to.
CREATE TRIGGER elevated_refusals_append_only
  BEFORE UPDATE OR DELETE ON elevated_refusals
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
