-- T-436 — THE OPENING OF AN EXTERNAL LINK BECOMES PART OF THE ISSUE RECORD
-- (owner ruling 2026-09-02, completing ADR-0055 decision 5).
--
-- In plain terms: when the landowner or the consultee opens the link they were
-- sent, the deliverable's record now says so — "opened on the 4th" — beside the
-- send itself, in the same library log that lists every other transmittal.
-- Migration 0065 deliberately left this out and reported it rather than adding
-- it quietly, because it is a fifth stored fact about a person with no account
-- and no consent. The owner has now ruled it in, and its own comment there said
-- what it would cost: one column and one write.
--
-- NOTHING ABOUT THE PERSON IS INFERRED. ADR-0055 §5 is unchanged: whoever holds
-- the link is the recipient, and there is no identity standing behind the name.
-- So this records that THE DOCUMENT WAS READ, as a fact of the issue history —
-- not that a named individual was at their desk. It is registered in
-- docs/architecture/personal-data.md as the recipient row's fifth fact, added
-- to that row at the ruling; this migration keeps it true rather than adding it.
--
-- THE FIRST OPEN, AND ONLY THE FIRST. The receipt is that it was read, not how
-- often — a column that counted, or that moved on every open, would be an
-- attendance log on somebody who never signed up for one. The trigger below
-- makes "written once and never cleared" a property of the database rather than
-- of the one route that writes it.
--
-- 🔒 AND THE WRITE MUST NOT MAKE AN EXPIRED LINK DISTINGUISHABLE FROM AN
-- INVENTED ONE. That identical-response rule (ADR-0055 §4) is a deliberate
-- protection: telling a guesser that a token once existed is telling them the
-- guess was close. The write is therefore reachable only on the SUCCESS path —
-- `liveRecipient` has already resolved a live token before anything is written
-- — so a refusal takes exactly the code it took before this migration. The
-- existing test that pins the two refusals identical was extended to make the
-- point after a real open has been recorded.
--
-- Drawn in docs/build/data-model.md drawer 5 before it was written; the drawing
-- reduces to narrative in the same commit. The column itself was generated
-- (`drizzle-kit generate` emitted the one ALTER and nothing else); the trigger
-- rewrite below is hand-written, as every unmodelled half here is. No GRANT is
-- needed: 0065 already granted the application role SELECT/INSERT/UPDATE on
-- this table, and a column inherits the table's privileges.
--
-- ⚠ ITS JOURNAL TIMESTAMP WAS EDITED BY HAND, AND HERE IS THE TRAP IT AVOIDS.
-- Migration 0065 carries a hand-set `when` of 1788460000000 in
-- `migrations/meta/_journal.json` — about 35 hours ahead of the clock the
-- session that wrote it ran on. Drizzle's migrator applies only entries whose
-- `when` is LATER than the newest one already recorded in the database, so the
-- honestly-generated timestamp on this migration sat BEFORE 0065's, this file
-- was skipped in silence, and `migrate` still printed "migrations applied
-- clean". Found by a test failing on a column that should have existed, not by
-- reading the log. `when` is therefore set to 1788460000001 — one tick after
-- 0065 — and the next migration after this one must be later again.
ALTER TABLE "external_recipients" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint

-- The immutability trigger, rewritten to admit exactly one new write.
--
-- 0065's version refused every update to a row that was no longer `requested`,
-- which is what froze the decision — and which would have made this column
-- unwritable. The frozen identity is UNTOUCHED: the deliverable, the version
-- and the four personal fields still cannot change, so an approver still cannot
-- redirect somebody else's request to another address or another document.
--
-- What is added is one narrow door: on an ISSUED row whose `opened_at` is still
-- null, `opened_at` may be set, and NOTHING ELSE about the row may move in the
-- same statement. Three refusals fall out of that and each is deliberate —
-- an open cannot be recorded twice, an open cannot be cleared, and an open
-- cannot be recorded against a request nobody has approved or a link that was
-- declined.
CREATE OR REPLACE FUNCTION external_recipient_decision_only() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.requested_by_participant_id IS DISTINCT FROM OLD.requested_by_participant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'external_recipients: what was asked for is immutable — only the decision may be written';
  END IF;

  -- T-436 — the first-open receipt: the one write an ISSUED row admits.
  IF NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    IF OLD.opened_at IS NOT NULL OR NEW.opened_at IS NULL THEN
      RAISE EXCEPTION 'external_recipients: the first open is recorded once and is never changed or cleared';
    END IF;
    IF OLD.state::text <> 'issued' THEN
      RAISE EXCEPTION 'external_recipients: only an issued link can be opened (state was %)', OLD.state;
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state
       OR NEW.transmittal_id IS DISTINCT FROM OLD.transmittal_id
       OR NEW.link_token IS DISTINCT FROM OLD.link_token
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.requested_expires_days IS DISTINCT FROM OLD.requested_expires_days
       OR NEW.issued_by_participant_id IS DISTINCT FROM OLD.issued_by_participant_id
       OR NEW.declined_by_participant_id IS DISTINCT FROM OLD.declined_by_participant_id
       OR NEW.decline_reason IS DISTINCT FROM OLD.decline_reason
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
      RAISE EXCEPTION 'external_recipients: recording an open changes nothing else about the issue';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state::text <> 'requested' THEN
    RAISE EXCEPTION 'external_recipients: the decision is written once (state was %)', OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
