-- T-315 — the account-level removal interval on `users`.
--
-- The twin of `participants.removed_at`, and deliberately not the same act.
-- Closing a Participant ends one project engagement and touches no session;
-- closing a User is the person leaving the organisation, which is what ends
-- every live session (T-251's `revokeUserSessions`, called from nothing until
-- now because the wiring was a decision and not a mechanism).
--
-- Currency by state, like everything else in drawer 1: the row survives, so
-- every past attribution still resolves to a name.
--
-- FIRST MIGRATION GENERATED RATHER THAN HAND-WRITTEN since 0037 (T-344
-- re-synced the snapshot the same day). The three statements below are
-- `drizzle-kit generate`'s output unedited; the CHECK beneath them is
-- hand-added, because drizzle models no check constraint — which is the
-- standing convention the re-sync did not change.
ALTER TABLE "users" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_org_live_idx" ON "users" USING btree ("organisation_id") WHERE "users"."removed_at" IS NULL;--> statement-breakpoint

-- a removal with nobody's name on it is not an audit record. The same shape as
-- `sessions_end_reason_with_revocation`: the pair is present or absent
-- together, never half of it.
ALTER TABLE "users" ADD CONSTRAINT "users_removal_pair"
	CHECK (("removed_at" IS NULL) = ("removed_by_user_id" IS NULL));
