-- 0044 — T-365 (review finding): one discipline folder per (sandbox, name).
-- The derivation deduped discipline folders by an in-memory lookup only, and
-- two concurrent syncs (simultaneous row creates, or a create racing an
-- import's reconcile) each created one — permanent, because system folders
-- have no move, rename or delete. The partial unique index makes the database
-- the referee, exactly as (sandbox_id, container_id) already referees the
-- deliverable folders.
--
-- A database that ran the unguarded sync may already hold duplicates, so the
-- index is preceded by a fold: children and documents re-parent to the oldest
-- twin, then the empty twins go. On a fresh database the fold is a no-op.
UPDATE "sandbox_folders" f SET "parent_folder_id" = r.keeper
FROM (
  SELECT id, first_value(id) OVER (PARTITION BY sandbox_id, name ORDER BY created_at, id) AS keeper
  FROM "sandbox_folders" WHERE kind = 'discipline'
) r
WHERE f."parent_folder_id" = r.id AND r.id <> r.keeper;
UPDATE "sandbox_documents" d SET "folder_id" = r.keeper
FROM (
  SELECT id, first_value(id) OVER (PARTITION BY sandbox_id, name ORDER BY created_at, id) AS keeper
  FROM "sandbox_folders" WHERE kind = 'discipline'
) r
WHERE d."folder_id" = r.id AND r.id <> r.keeper;
DELETE FROM "sandbox_folders" f
USING (
  SELECT id, first_value(id) OVER (PARTITION BY sandbox_id, name ORDER BY created_at, id) AS keeper
  FROM "sandbox_folders" WHERE kind = 'discipline'
) r
WHERE f.id = r.id AND r.id <> r.keeper;
CREATE UNIQUE INDEX "sandbox_folders_discipline_unique" ON "sandbox_folders" ("sandbox_id", "name") WHERE "kind" = 'discipline';
