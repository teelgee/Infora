-- 0044 — T-365 (review finding): one discipline folder per (sandbox, name).
-- The derivation deduped discipline folders by an in-memory lookup only, and
-- two concurrent syncs (simultaneous row creates, or a create racing an
-- import's reconcile) each created one — permanent, because system folders
-- have no move, rename or delete. The partial unique index makes the database
-- the referee, exactly as (sandbox_id, container_id) already referees the
-- deliverable folders.
CREATE UNIQUE INDEX "sandbox_folders_discipline_unique" ON "sandbox_folders" ("sandbox_id", "name") WHERE "kind" = 'discipline';
