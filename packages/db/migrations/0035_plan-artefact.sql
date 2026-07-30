-- T-260 — the plan artefact (docs/ask/03 §3, data-model.md Drawer 3).
--
-- The plan is the analysis: a persisted, inspectable object recording what the
-- system understood and what it intends to do, whose steps correspond 1:1 to
-- the append-only Step rows they became. This migration adds the tables and
-- their integrity; it changes no behaviour on its own.
CREATE TYPE "public"."plan_mode" AS ENUM('declared', 'model_chosen');--> statement-breakpoint
CREATE TYPE "public"."plan_state" AS ENUM('draft', 'awaiting_clarification', 'ready', 'running', 'complete', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."plan_stage" AS ENUM('understand', 'load_context', 'clarify', 'plan', 'search_corpus', 'check_authority', 'research_web', 'analyse', 'verify', 'present');--> statement-breakpoint
CREATE TYPE "public"."plan_step_state" AS ENUM('pending', 'running', 'complete', 'failed', 'skipped');--> statement-breakpoint

CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"requester_participant_id" uuid NOT NULL,
	"mode" "plan_mode" NOT NULL,
	"workflow_id" text,
	"workflow_version" integer,
	"lens_id" text,
	"lens_version" integer,
	"state" "plan_state" DEFAULT 'draft' NOT NULL,
	"question" text NOT NULL,
	"restatement" text,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by_plan_id" uuid
);
--> statement-breakpoint
CREATE TABLE "plan_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"stage" "plan_stage" NOT NULL,
	"worker" text,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "plan_step_state" DEFAULT 'pending' NOT NULL,
	"step_row_id" uuid,
	"output_ref" uuid,
	"edited_by_participant_id" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_requester_participant_id_participants_id_fk" FOREIGN KEY ("requester_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_superseded_by_plan_id_plans_id_fk" FOREIGN KEY ("superseded_by_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_step_row_id_steps_id_fk" FOREIGN KEY ("step_row_id") REFERENCES "public"."steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_edited_by_participant_id_participants_id_fk" FOREIGN KEY ("edited_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- One plan per Run. A re-run is a NEW Run with a new plan (docs/ask/03 §3.4);
-- supersession is a chain between plans, never a second plan on one run.
CREATE UNIQUE INDEX "plans_run_unique" ON "plans" ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_steps_plan_ordinal_unique" ON "plan_steps" ("plan_id","ordinal");--> statement-breakpoint
CREATE INDEX "plans_conversation_idx" ON "plans" ("conversation_id");--> statement-breakpoint
-- the 1:1 link from intention to record: at most one plan step per Step row
CREATE UNIQUE INDEX "plan_steps_step_row_unique" ON "plan_steps" ("step_row_id") WHERE "step_row_id" IS NOT NULL;--> statement-breakpoint

-- A model-chosen plan may never name a workflow: a hand-edited plan is no
-- longer the declared workflow, and labelling it as one would be a lie
-- (docs/ask/03 §3.4). The converse is deliberately NOT enforced — a `declared`
-- plan with no workflow_id is what the coded chain writes until T-265 declares
-- it as a DAG.
ALTER TABLE "plans" ADD CONSTRAINT "plans_model_chosen_names_no_workflow" CHECK ("mode" <> 'model_chosen' OR ("workflow_id" IS NULL AND "workflow_version" IS NULL));--> statement-breakpoint
-- a superseded plan names its successor, and only a superseded plan does
ALTER TABLE "plans" ADD CONSTRAINT "plans_superseded_names_successor" CHECK (("state" = 'superseded') = ("superseded_by_plan_id" IS NOT NULL));--> statement-breakpoint

-- IMMUTABLE FROM `ready`, not from insertion (docs/ask/03 §3.2). A draft plan
-- is mutable while it is being clarified; the transition to ready is one-way
-- and freezes what the plan SAYS, leaving only what it DID to change. This is
-- the T-008 append-only pattern applied to a two-phase row: same intent
-- (evidence must survive later editing), different lifecycle.
CREATE OR REPLACE FUNCTION plans_immutable_from_ready() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'plans are evidence: DELETE rejected';
	END IF;
	IF OLD.state = 'draft' THEN
		RETURN NEW; -- still being clarified
	END IF;
	-- one-way: nothing returns to draft
	IF NEW.state = 'draft' THEN
		RAISE EXCEPTION 'plan % has left draft: the transition is one-way', OLD.id;
	END IF;
	IF NEW.id IS DISTINCT FROM OLD.id
		 OR NEW.run_id IS DISTINCT FROM OLD.run_id
		 OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
		 OR NEW.project_id IS DISTINCT FROM OLD.project_id
		 OR NEW.requester_participant_id IS DISTINCT FROM OLD.requester_participant_id
		 OR NEW.mode IS DISTINCT FROM OLD.mode
		 OR NEW.workflow_id IS DISTINCT FROM OLD.workflow_id
		 OR NEW.workflow_version IS DISTINCT FROM OLD.workflow_version
		 OR NEW.lens_id IS DISTINCT FROM OLD.lens_id
		 OR NEW.lens_version IS DISTINCT FROM OLD.lens_version
		 OR NEW.question IS DISTINCT FROM OLD.question
		 OR NEW.restatement IS DISTINCT FROM OLD.restatement
		 OR NEW.assumptions IS DISTINCT FROM OLD.assumptions
		 OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'plan % is immutable from ready: only state and supersession may change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER plans_immutable_from_ready
	BEFORE UPDATE OR DELETE ON plans
	FOR EACH ROW EXECUTE FUNCTION plans_immutable_from_ready();--> statement-breakpoint

-- A plan step freezes with its plan. What the step SAYS (stage, worker,
-- inputs, dependencies, ordinal) is frozen once the plan leaves draft; what it
-- DID (state, the Step row it became, its output) is written as it executes.
-- Without this, "the plan is what ran" would be an assertion rather than a
-- property: a step could be rewritten after the fact to match its outcome.
CREATE OR REPLACE FUNCTION plan_steps_immutable_from_ready() RETURNS trigger AS $$
DECLARE
	plan_state_now plan_state;
BEGIN
	IF TG_OP = 'DELETE' THEN
		SELECT state INTO plan_state_now FROM plans WHERE id = OLD.plan_id;
		IF plan_state_now <> 'draft' THEN
			RAISE EXCEPTION 'plan step % belongs to a plan past draft: DELETE rejected', OLD.id;
		END IF;
		RETURN OLD;
	END IF;
	SELECT state INTO plan_state_now FROM plans WHERE id = OLD.plan_id;
	IF plan_state_now = 'draft' THEN
		RETURN NEW;
	END IF;
	IF NEW.id IS DISTINCT FROM OLD.id
		 OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
		 OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
		 OR NEW.stage IS DISTINCT FROM OLD.stage
		 OR NEW.worker IS DISTINCT FROM OLD.worker
		 OR NEW.inputs IS DISTINCT FROM OLD.inputs
		 OR NEW.depends_on IS DISTINCT FROM OLD.depends_on
		 OR NEW.edited_by_participant_id IS DISTINCT FROM OLD.edited_by_participant_id
		 OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
	THEN
		RAISE EXCEPTION 'plan step % is immutable from ready: only its execution may change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER plan_steps_immutable_from_ready
	BEFORE UPDATE OR DELETE ON plan_steps
	FOR EACH ROW EXECUTE FUNCTION plan_steps_immutable_from_ready();--> statement-breakpoint

-- T-247's discipline: the application role reads and writes these like any
-- other table. The default privileges from 0034 cover tables created after it,
-- but state the grant rather than rely on it being remembered.
GRANT SELECT, INSERT, UPDATE, DELETE ON "plans", "plan_steps" TO "infora_app";
