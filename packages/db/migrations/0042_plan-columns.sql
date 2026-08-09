-- 0042 — T-360 (S3, 2026-08-09 DMS walkthrough session): the org-standard plan column
-- set. Per (organisation, project) — the Membership grain, beside ack_mode —
-- because the producing organisation's super user sets the columns every member
-- of that organisation sees, locked, with no personal overrides. Null keeps the
-- default column set.
ALTER TABLE "memberships" ADD COLUMN "plan_columns" jsonb;
