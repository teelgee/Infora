-- T-462 (2026-10-23) — a title for reference material: a container with no
-- work item has nowhere else to carry its name. Null on every deliverable;
-- the reads coalesce with the work item's title and store nothing twice.
-- Drawn in docs/build/data-model.md, drawer 2.
ALTER TABLE "containers" ADD COLUMN "title" text;