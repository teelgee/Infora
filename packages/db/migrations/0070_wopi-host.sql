-- T-453 — the WOPI host's refs (ADR-0043 §2/§4, P2; drawn in data-model.md,
-- Drawer 2, "The editing engine's refs", on 2026-10-18 before this file was
-- written).
--
-- *In plain terms: when an editing engine opens an uploaded Word or Excel file
-- from Infora, three things are written down — which engine lock holds the
-- file, the file each saved version had, and the short-lived pass the engine
-- carries for one person and one file.*
--
-- NUMBERED 0070 WITH NO 0069 ON THIS BRANCH, deliberately: T-451 builds 0069 in
-- parallel. The journal entry sits at idx 69 (check:migrations refuses an idx
-- gap) and is dated after every entry on main; the co-captain re-indexes it
-- when 0069 lands (the 2026-09-02 pattern).
--
-- THE LOCK IS NOT A SECOND LOCK. The engine's lock string rides head_locked
-- and sandbox_checkout_events (ADR-0032's check-out); the two CHECKs below,
-- written from the drawing, hold that in the database: the lock and its expiry
-- are set together, and an engine lock never exists beside an unlocked head.
--
-- wopi_access_tokens keeps only a sha-256 of each pass, and cascades from both
-- the document and the session; sessions are revoked rather than deleted, so
-- the sign-out path deletes the pass itself (review 2026-10-18) - gone rather
-- than merely refused. Registered in personal-data.md (it names a sign-in).
CREATE TABLE "wopi_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"sandbox_document_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_checkout_events" ADD COLUMN "wopi_lock" text;--> statement-breakpoint
ALTER TABLE "sandbox_document_versions" ADD COLUMN "file_ref" text;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "wopi_lock" text;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "wopi_lock_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wopi_access_tokens" ADD CONSTRAINT "wopi_access_tokens_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wopi_access_tokens" ADD CONSTRAINT "wopi_access_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wopi_access_tokens_expires_idx" ON "wopi_access_tokens" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD CONSTRAINT "sandbox_documents_wopi_lock_pair" CHECK (("sandbox_documents"."wopi_lock" IS NULL) = ("sandbox_documents"."wopi_lock_expires_at" IS NULL));--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD CONSTRAINT "sandbox_documents_wopi_lock_holds_head" CHECK ("sandbox_documents"."wopi_lock" IS NULL OR "sandbox_documents"."head_locked");
--> statement-breakpoint
-- the house-style grant, as every hand-finished migration carries (a review
-- 2026-10-18 addition; default privileges from 0034 already covered it, but a
-- reader checking grants should find them stated)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "wopi_access_tokens" TO "infora_app";
