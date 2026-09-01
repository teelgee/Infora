-- T-423 — THE RULE SET: a project style guide's typed rules, and its versions
-- (ADR-0054 decisions 2–5).
--
-- In plain terms: a style guide stops being only a document and gains a list of
-- rules — what somebody accepted, stored one by one with what each applies to
-- and where it does not, so most of them can be checked by ordinary code
-- instead of by asking the AI.
--
-- THE CLAUSE STORE IS NOT REPLACED, and that is the whole design. An extracted
-- rule POINTS AT the clause it came from, because ADR-0048 §5's verbatim
-- quotation resolves through it: a finding quotes the words the client's guide
-- really carries, never Infora's restructuring of them. The pointer is non-null
-- EXACTLY WHEN the origin is `extracted`, which is the first CHECK at the foot.
--
-- A VERSION IS IMMUTABLE ONCE SAVED — T-397's retire-never-edit precedent one
-- store along. The stored rule text is what past findings quoted, so an
-- amendment is a new version and never an edit, and the run's version stamp
-- (decision 7) means nothing unless that is true by construction. Two triggers
-- at the foot enforce it: a saved set never changes, and a rule of a saved set
-- never changes. The ONE mutation this store permits is a PENDING PROPOSAL
-- being decided — and only its decision columns, and only once.
--
-- PROPOSALS RIDE THE SAME TABLE (T-426), carrying a state, the proposer and the
-- decider. A proposal IS a rule that has not been accepted; two tables would be
-- two answers to what binds. Accepting one copies it into a NEW version rather
-- than flipping something in place, which is the same rule as everywhere else
-- in this store.
--
-- Drawn in docs/build/data-model.md drawer 7 before it was written; generated
-- by drizzle-kit against the current snapshot and read before being applied.
-- Every CHECK, trigger and GRANT below is hand-added, as every one in this repo
-- is.
CREATE TABLE "project_style_guide_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"style_guide_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"accepted_by_user_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drafting_brief" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_style_guide_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_set_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"origin" text NOT NULL,
	"clause_id" uuid,
	"statement" text NOT NULL,
	"scope" text NOT NULL,
	"excepted_contexts" text[] DEFAULT '{}' NOT NULL,
	"excepted_terms" text[] DEFAULT '{}' NOT NULL,
	"register" text NOT NULL,
	"enforcement" text NOT NULL,
	"severity" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposal_state" text,
	"supersedes_rule_id" uuid,
	"proposed_by_user_id" uuid,
	"proposed_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "project_style_guide_rule_sets" ADD CONSTRAINT "project_style_guide_rule_sets_style_guide_id_project_style_guides_id_fk" FOREIGN KEY ("style_guide_id") REFERENCES "public"."project_style_guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_style_guide_rule_sets" ADD CONSTRAINT "project_style_guide_rule_sets_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_rule_set_version_id_project_style_guide_rule_sets_id_fk" FOREIGN KEY ("rule_set_version_id") REFERENCES "public"."project_style_guide_rule_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_clause_id_project_style_guide_clauses_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."project_style_guide_clauses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_supersedes_rule_id_project_style_guide_rules_id_fk" FOREIGN KEY ("supersedes_rule_id") REFERENCES "public"."project_style_guide_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_style_guide_rule_sets_version_unique" ON "project_style_guide_rule_sets" USING btree ("style_guide_id","version");--> statement-breakpoint
CREATE INDEX "project_style_guide_rule_sets_guide_idx" ON "project_style_guide_rule_sets" USING btree ("style_guide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_style_guide_rules_ordinal_unique" ON "project_style_guide_rules" USING btree ("rule_set_version_id","ordinal") WHERE "project_style_guide_rules"."proposal_state" IS NULL;--> statement-breakpoint
CREATE INDEX "project_style_guide_rules_version_idx" ON "project_style_guide_rules" USING btree ("rule_set_version_id");--> statement-breakpoint
CREATE INDEX "project_style_guide_rules_proposal_idx" ON "project_style_guide_rules" USING btree ("proposal_state") WHERE "project_style_guide_rules"."proposal_state" IS NOT NULL;
--> statement-breakpoint

-- ── THE POINTER, AS AN INVARIANT ────────────────────────────────────────────
-- ADR-0054 decision 3, and the drawing's own CHECK. An extracted rule keeps a
-- pointer to the exact wording it came from; a typed or Infora-proposed rule
-- has none and its findings SAY so rather than quoting anything. A rule that
-- carried a pointer it did not earn would let an invented quotation render as
-- the client's own words — which is precisely what §5's guarantee rests on not
-- happening.
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_clause_pointer"
	CHECK (("origin" = 'extracted') = ("clause_id" IS NOT NULL));--> statement-breakpoint

-- The ruled vocabularies (ADR-0054 decisions 3, 4 and 5). Stated in the store
-- as well as in the types because a value the schema accepts and no code can
-- set — or the reverse — is a claim one of the two makes falsely (T-301's rule).
-- The register list is `DOCUMENT_LANGUAGES` plus `all` and is deliberately NOT
-- a new vocabulary: a rule tagged with a word the creator's launcher does not
-- use can never match a document, so the gap-filling would fail silently.
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_kind"
	CHECK ("kind" IN ('term', 'pattern', 'structure', 'measured', 'judgement'));--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_origin"
	CHECK ("origin" IN ('extracted', 'typed', 'infora_proposed'));--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_scope"
	CHECK ("scope" IN ('document', 'section', 'paragraph', 'sentence', 'heading', 'list', 'caption', 'table'));--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_register"
	CHECK ("register" IN ('technical', 'non-technical', 'simple-english', 'all'));--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_enforcement"
	CHECK ("enforcement" IN ('raises_findings', 'steers_only'));--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_severity"
	CHECK ("severity" IN ('required', 'advisory'));--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_excepted_contexts"
	CHECK ("excepted_contexts" <@ ARRAY['quotations', 'references', 'code', 'headings']::text[]);--> statement-breakpoint

-- A proposal's own shape (T-426). A row is EITHER part of a saved set (no
-- state, no proposer) OR a proposal (both), and a decided one names its
-- decider. There is deliberately no reason column anywhere here: a declined
-- proposal records none, on the finding-dismissal precedent.
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_proposal_shape"
	CHECK (
		("proposal_state" IS NULL AND "proposed_by_user_id" IS NULL AND "proposed_at" IS NULL)
		OR ("proposal_state" IN ('pending', 'accepted', 'declined')
		    AND "proposed_by_user_id" IS NOT NULL AND "proposed_at" IS NOT NULL)
	);--> statement-breakpoint
ALTER TABLE "project_style_guide_rules" ADD CONSTRAINT "project_style_guide_rules_decision_shape"
	CHECK (
		("proposal_state" IN ('accepted', 'declined')) = ("decided_by_user_id" IS NOT NULL)
		AND ("decided_by_user_id" IS NOT NULL) = ("decided_at" IS NOT NULL)
	);--> statement-breakpoint

-- ── IMMUTABILITY, ON THE T-008 PATTERN ──────────────────────────────────────
-- A saved rule-set version never changes and is never deleted. Retiring the
-- GUIDE is what stops a set being applied (the `retired_at` currency-by-state
-- two tables up); the version itself stays, because a finding written against
-- it still has to resolve to the words it quoted.
CREATE TRIGGER project_style_guide_rule_sets_append_only
	BEFORE UPDATE OR DELETE ON project_style_guide_rule_sets
	FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- A rule of a SAVED SET is immutable. The one mutation this store permits is a
-- PENDING PROPOSAL being decided, and only its two decision columns move —
-- everything a finding could ever quote is frozen from the moment the row is
-- written. Without this, "an amendment is a new version" would be a habit
-- rather than a guarantee, and the run's stored version stamp would point at
-- something that could have changed underneath it.
CREATE OR REPLACE FUNCTION style_rule_immutable() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'project_style_guide_rules is append-only: DELETE rejected';
	END IF;
	IF OLD.proposal_state IS DISTINCT FROM 'pending' THEN
		RAISE EXCEPTION 'rule % belongs to a saved set (or a decided proposal) and is immutable: an amendment is a new version', OLD.id;
	END IF;
	IF NEW.rule_set_version_id IS DISTINCT FROM OLD.rule_set_version_id
		 OR NEW.kind IS DISTINCT FROM OLD.kind
		 OR NEW.origin IS DISTINCT FROM OLD.origin
		 OR NEW.clause_id IS DISTINCT FROM OLD.clause_id
		 OR NEW.statement IS DISTINCT FROM OLD.statement
		 OR NEW.scope IS DISTINCT FROM OLD.scope
		 OR NEW.excepted_contexts IS DISTINCT FROM OLD.excepted_contexts
		 OR NEW.excepted_terms IS DISTINCT FROM OLD.excepted_terms
		 OR NEW.register IS DISTINCT FROM OLD.register
		 OR NEW.enforcement IS DISTINCT FROM OLD.enforcement
		 OR NEW.severity IS DISTINCT FROM OLD.severity
		 OR NEW.payload IS DISTINCT FROM OLD.payload
		 OR NEW.supersedes_rule_id IS DISTINCT FROM OLD.supersedes_rule_id
		 OR NEW.proposed_by_user_id IS DISTINCT FROM OLD.proposed_by_user_id
		 OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at
	THEN
		RAISE EXCEPTION 'rule % is immutable: only a pending proposal''s decision may be recorded', OLD.id;
	END IF;
	IF NEW.proposal_state NOT IN ('accepted', 'declined') THEN
		RAISE EXCEPTION 'a pending proposal may only become accepted or declined';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER project_style_guide_rules_immutable
	BEFORE UPDATE OR DELETE ON project_style_guide_rules
	FOR EACH ROW EXECUTE FUNCTION style_rule_immutable();--> statement-breakpoint

-- T-247's discipline: 0034's default privileges cover tables created after it,
-- but the grant is stated rather than relied on being remembered.
GRANT SELECT, INSERT, UPDATE, DELETE ON "project_style_guide_rule_sets" TO "infora_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "project_style_guide_rules" TO "infora_app";
