-- T-247 — row-level security on the grounding index (Phase 0 finding F6).
--
-- The application already applies project, in-library, live-state,
-- current-version, pinned-model and deliverable-visibility as SQL pre-filters
-- in one query (packages/knowledge/src/retrieval.ts). That is correct today and
-- one careless future query away from wrong: nothing at the DATABASE level
-- stopped a new `select … from version_chunks` returning the whole corpus.
-- This closes that, and it FAILS CLOSED — without the session setting, a
-- protected read returns no rows rather than all of them.
--
-- THE APPLICATION ROLE. This is the part that makes the rest real, and the part
-- that is easy to get wrong: a SUPERUSER bypasses row-level security entirely,
-- FORCE or not. The dev substrate's `infora` role is the database superuser, so
-- policies alone would have been theatre — present, and bypassed by everything.
--
-- So migrations keep running as the owner, and the APPLICATION connects as a
-- separate, unprivileged `infora_app`. The default privileges line matters as
-- much as the grants: without it every future migration would silently create a
-- table the application cannot read.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infora_app') THEN
		CREATE ROLE "infora_app" LOGIN PASSWORD 'infora_app';
	END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA "public" TO "infora_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "infora_app";--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "infora_app";--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "infora_app";--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT USAGE, SELECT ON SEQUENCES TO "infora_app";--> statement-breakpoint

-- FORCE is load-bearing too: plain ENABLE exempts the table OWNER, so if the
-- application ever runs as the owner again this keeps the policy applying.
ALTER TABLE "version_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "version_chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Reads are scoped to the project the transaction declared (db/client.ts
-- withProjectScope). nullif(...,'') turns the unset setting into NULL, and
-- `c.project_id = NULL` is NULL — never true — so an unscoped read matches
-- nothing. That is the fail-closed property, and it is why the comparison is
-- written this way rather than with a coalesce to some sentinel.
CREATE POLICY "version_chunks_project_read" ON "version_chunks"
	FOR SELECT
	USING (
		EXISTS (
			SELECT 1
			FROM "versions" v
			JOIN "containers" c ON c."id" = v."container_id"
			WHERE v."id" = "version_chunks"."version_id"
			  AND c."project_id" = nullif(current_setting('infora.project_id', true), '')::uuid
		)
	);--> statement-breakpoint

-- Writes stay open at the DB layer. The finding this ticket closes is about
-- READS leaking a corpus; ingestion and seeding are app-layer concerns already
-- constrained by the foreign keys, and scoping them here would force every
-- fixture and seed to carry the setting for no security gain.
CREATE POLICY "version_chunks_write" ON "version_chunks" FOR INSERT WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "version_chunks_update" ON "version_chunks" FOR UPDATE USING (true);--> statement-breakpoint
CREATE POLICY "version_chunks_delete" ON "version_chunks" FOR DELETE USING (true);
