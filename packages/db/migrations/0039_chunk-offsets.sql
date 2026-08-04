-- T-271 — locators through the ingest pipeline (spike: docs/build/spike-locators.md;
-- data-model.md Drawer 2).
--
-- Citations resolve at VERSION grain today, and a version-level citation on a
-- 200-page chapter is one nobody opens. Non-negotiable 1 asks for a document, a
-- version, and either a locator or the verbatim passage — the property that
-- matters being that a reader can CHECK it.
--
-- The spike's rule: store the position, compute the view. A character span is
-- the only exact locator (paragraph, section and page are all views of a
-- position), it needs no per-format branch, and it is available only at chunk
-- time — the splitter consumes the whitespace run after a sentence terminator
-- and the packer rejoins with one space, so a chunk whose interior crossed a
-- paragraph break is NOT a substring of its own version and indexOf returns -1.
--
-- Nullable on purpose. Every chunk written before this migration carries no
-- span, and re-ingesting the whole corpus to backfill would change nothing a
-- reader sees until each is re-ingested anyway. A passage without a span
-- degrades to version grain, which is the honest answer rather than a guess.
ALTER TABLE "version_chunks" ADD COLUMN "start_offset" integer;--> statement-breakpoint
ALTER TABLE "version_chunks" ADD COLUMN "end_offset" integer;--> statement-breakpoint

-- A span is a range or it is nothing: both ends present, or neither.
ALTER TABLE "version_chunks" ADD CONSTRAINT "version_chunks_span_paired"
  CHECK (("start_offset" IS NULL) = ("end_offset" IS NULL));--> statement-breakpoint
ALTER TABLE "version_chunks" ADD CONSTRAINT "version_chunks_span_ordered"
  CHECK ("start_offset" IS NULL OR ("start_offset" >= 0 AND "end_offset" > "start_offset"));
