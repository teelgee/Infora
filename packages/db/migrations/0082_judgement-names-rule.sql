-- T-476 — a judgement finding names its rule, and the store refuses one with
-- neither rule nor second passage (drawn in data-model.md, drawer 4, on
-- 2026-10-24 before this file was written).
--
-- *In plain terms: a finding the AI raised by reading must say which writing
-- rule it applied or which other passage it contradicts; the database itself
-- now refuses one that does neither.*
--
-- WHAT THIS DOES TO OLD ROWS, in order:
--   1. a finding raised from a typed or Infora-proposed rule quoted that rule's
--      sentence in its `basis`. Where the sentence matches a rule of the same
--      project's writing standard, the finding gets that rule's id (the newest
--      version of the rule set that holds the sentence);
--   2. a finding that still names no rule (its rule is gone, or it never had
--      one) is stamped `ruleRecorded: false` — "written before the rule was
--      kept" — which the constraint accepts. Nothing is deleted;
--   3. the constraint is then added fully validated. It is NOT added `NOT VALID`
--      as the drawing proposed, because Postgres still checks such a constraint
--      against the new version of any row that is updated, so closing an old
--      finding would have been refused.
-- No code path writes `ruleRecorded`, so only this migration's own stamp can
-- use that arm.
-- The ALTER TABLE line is drizzle-kit's; everything above it is hand-written.
UPDATE "findings" AS f
SET "evidence" = f."evidence" || jsonb_build_object('ruleId', m.rule_id)
FROM (
  SELECT DISTINCT ON (f2."id") f2."id" AS finding_id, r."id"::text AS rule_id
  FROM "findings" f2
  JOIN "sandbox_documents" d ON d."id" = f2."sandbox_document_id"
  JOIN "project_style_guides" g ON g."project_id" = d."project_id"
  JOIN "project_style_guide_rule_sets" rs ON rs."style_guide_id" = g."id"
  JOIN "project_style_guide_rules" r ON r."rule_set_version_id" = rs."id"
  WHERE f2."check_family" IN ('style', 'self_contradiction')
    AND f2."evidence"->>'input' = 'draft'
    AND coalesce(f2."evidence"->>'ruleId', '') = ''
    AND f2."evidence"->'otherAnchor' IS NULL
    AND position(('“' || r."statement" || '”') IN (f2."evidence"->>'basis')) > 0
  ORDER BY f2."id", rs."version" DESC
) m
WHERE f."id" = m.finding_id;--> statement-breakpoint
UPDATE "findings"
SET "evidence" = "evidence" || '{"ruleRecorded": false}'::jsonb
WHERE "check_family" IN ('style', 'self_contradiction')
  AND "evidence"->>'input' = 'draft'
  AND coalesce("evidence"->>'ruleId', '') = ''
  AND "evidence"->'otherAnchor' IS NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_judgement_names_rule_or_passage" CHECK (input <> 'draft' OR check_family NOT IN ('style', 'self_contradiction') OR coalesce(evidence->>'ruleId', '') <> '' OR evidence->'otherAnchor' IS NOT NULL OR coalesce(evidence->>'ruleRecorded', '') = 'false');
