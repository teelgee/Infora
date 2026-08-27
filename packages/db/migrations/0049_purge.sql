-- T-340 — Purge, the deletion act the product has never had (ADR-0050 §5–§6;
-- data-model.md Drawer 2).
--
-- Delete stays exactly as T-128 built it: the bin, restorable, self-service,
-- because recovery-without-a-helpdesk-ticket is a product virtue being kept.
-- Purge is the SECOND act — it genuinely erases, including the derived stores,
-- which is the half that makes it real. Before this, a firm saying "this must
-- not exist" had no button that meant it, and "raise a ticket with the vendor"
-- is the incumbent behaviour Infora exists to displace.
--
-- Two things land here, and the ticket's weight is in reach rather than shape.

-- 1. The act, recorded with a name against it.
--
-- The counts are STORED rather than recomputed, for the obvious reason: after a
-- purge there is nothing left to count. They are what makes this row answer
-- "was this actually erased, and how much of it" rather than merely "somebody
-- pressed the button".
CREATE TABLE "purge_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "organisation_id" uuid NOT NULL REFERENCES "organisations"("id"),
  -- identity from the record, never from the caller (contracts principle 3).
  -- User grain rather than Participant: purge is an ORG ADMIN act (ADR-0050
  -- §5), and org administration is an account capability, not a project one.
  "purged_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  -- the document is gone, so its identity is kept as text rather than as a
  -- foreign key: a dangling reference would be a record that cannot be read
  "subject_kind" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "subject_title" text NOT NULL,
  -- what it reached: { sandboxVersions: n, chunks: n, blobs: n, ... }
  "reached" jsonb NOT NULL DEFAULT '{}',
  "purged_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "purge_events_org_idx" ON "purge_events" ("organisation_id", "purged_at");--> statement-breakpoint

-- Append-only (T-008's trigger): a purge record a super-user could quietly
-- delete is worth nothing, and the whole value of this row is that it survives
-- the act it describes.
CREATE TRIGGER purge_events_append_only
  BEFORE UPDATE OR DELETE ON purge_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- 2. The one carve-out in append-only enforcement.
--
-- `versions`, `signals` and `comments` are append-only by trigger (T-008), and
-- purge must genuinely erase — a purge that deletes the row and leaves the
-- derived copies has erased nothing, since the text survives in them. So the
-- trigger admits DELETE when the transaction-local setting `infora.purge` is
-- on, the same shape as `withProjectScope` declaring `infora.project_id`.
--
-- UPDATE stays forbidden UNCONDITIONALLY. Append-only exists to stop the record
-- being rewritten, and nothing about erasure needs the ability to edit; a
-- carve-out that admitted both would trade a real guarantee for convenience.
--
-- The exception lives in the trigger body rather than behind a privileged role
-- on purpose: the place a reader looks to learn that a table is append-only
-- should be the place they learn what the exception is.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('infora.purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- ...and the same carve-out on `versions`, which does NOT use forbid_mutation.
--
-- Migration 0013 gave versions their own trigger so that `is_current` could
-- move while content stayed immutable (the currency carve-out). Amending only
-- `forbid_mutation` above would therefore have left the ONE table whose text
-- purge most needs to reach still refusing — and it would have failed loudly
-- rather than silently, which is the only reason it was cheap to find.
--
-- Same shape, same narrowness: DELETE while `infora.purge` is on, and the
-- content-immutability rule untouched for every UPDATE.
CREATE OR REPLACE FUNCTION versions_immutable_content() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('infora.purge', true), '') = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'versions are append-only: DELETE rejected';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.version_reference IS DISTINCT FROM OLD.version_reference
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'version % is append-only: only is_current may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
