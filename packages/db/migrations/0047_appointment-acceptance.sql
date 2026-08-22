-- 0047 — T-372 (ADR-0033 addendum §2, 2026-08-22): the appointee accepts the
-- appointment themselves, or declines it with a reason.
--
-- Appointment was until now something two organisations did ABOUT a person —
-- proposed by one side, confirmed by the other — with no act anywhere in which
-- the named person said yes. A lead reviewer holds the deliverable's
-- contractual verdict, and nobody can give that undertaking on someone else's
-- behalf. So the grant gains the appointee's own answer.
--
-- NOT BACKFILLED, deliberately. Setting accepted_at on the confirmed lead
-- grants that already exist would fabricate an undertaking nobody gave — the
-- exact thing this ADR forbids, performed in SQL. Existing submissions
-- therefore wait, visibly, until their lead reviewer accepts; that is the
-- recoverable failure, and a manufactured signature is not.
--
-- Hand-written per the standing rule; drawn in data-model.md drawer 5.
ALTER TABLE "deliverable_reviewers" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliverable_reviewers" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
-- a named person's stated refusal, in free text — personal-data.md; the
-- producing side never reads it, only that a lead reviewer is awaited
ALTER TABLE "deliverable_reviewers" ADD COLUMN "decline_reason" text;--> statement-breakpoint
-- an appointment is answered once, one way
ALTER TABLE "deliverable_reviewers" ADD CONSTRAINT "deliverable_reviewers_answer_exclusive"
  CHECK (NOT ("accepted_at" IS NOT NULL AND "declined_at" IS NOT NULL));--> statement-breakpoint
-- a refusal always states why: the reason is the whole reason a decline is
-- recorded rather than simply revoked
ALTER TABLE "deliverable_reviewers" ADD CONSTRAINT "deliverable_reviewers_decline_pair"
  CHECK (("declined_at" IS NULL) = ("decline_reason" IS NULL));--> statement-breakpoint
-- ADR-0017's one-live-lead invariant, restated: a DECLINED appointment is not a
-- live lead. Without this a refusal would block the replacement it exists to
-- ask for — the way out of a decline is re-appointment, and the refused grant
-- stays on the record because nothing here is ever deleted (ADR-0033).
DROP INDEX "deliverable_reviewers_one_live_lead";--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_reviewers_one_live_lead" ON "deliverable_reviewers" ("container_id")
  WHERE "is_lead" = true AND "revoked_at" IS NULL AND "declined_at" IS NULL;
