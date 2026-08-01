-- T-251 — revocable server-side sessions (finding F4, half one).
--
-- THE PROBLEM IN ONE SENTENCE: a signed cookie cannot be revoked. It is valid
-- because it verifies. Removing a user, or signing out on a lost laptop,
-- changed nothing — and the skeleton's cookie carried no expiry at all, so a
-- cookie captured once was good for ever.
--
-- The cookie now carries an opaque token rather than the user id, so it stops
-- being a bearer assertion of identity and becomes a pointer to a row the
-- server controls. Existing cookies therefore stop working at deploy, which is
-- the correct behaviour for this change and not a migration defect: every live
-- session is one nobody can revoke.
--
-- TWO CLOCKS, deliberately, because they are different controls. `expires_at`
-- is the ABSOLUTE lifetime, fixed at creation and never extended by activity —
-- it bounds how long a stolen cookie is useful at all. `last_seen_at` drives
-- the IDLE timeout, which ends a session someone walked away from. Both
-- thresholds are deployment configuration (env.ts), not values baked here.
CREATE TYPE "public"."session_end_reason" AS ENUM('signed_out', 'expired_idle', 'revoked');--> statement-breakpoint

CREATE TABLE "sessions" (
	-- the opaque token the cookie carries. Text, not uuid: the token is 256
	-- bits of randomness rendered as hex, and a uuid would be 122 bits with a
	-- structure an attacker can reason about.
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	-- WHY a session ended is the audit fact, and a deleted row carries none of
	-- it. Currency by state, like every other interval in drawer 1.
	"revoked_reason" "session_end_reason"
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- a session that ended without saying why is a row that answers the easy
-- question and not the useful one
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_reason_with_revocation"
	CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL));--> statement-breakpoint

-- the revocation read: "end every live session of this user", which is what an
-- org admin removing someone actually needs
CREATE INDEX "sessions_user_live_idx" ON "sessions" ("user_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint

-- Deliberately NOT append-only, unlike the audit tables. A session row is
-- mutable by design — `last_seen_at` is touched on every request and
-- `revoked_at` is set when it ends — and the T-008 trigger would forbid both.
-- What makes it trustworthy is that it is only ever narrowed: nothing in the
-- application extends `expires_at`, and `revoked_at` is never cleared.
GRANT SELECT, INSERT, UPDATE ON "sessions" TO "infora_app";
