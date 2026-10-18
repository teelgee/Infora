-- T-451 — the file source: an app table fed from a spreadsheet the project
-- already holds (ADR-0059; drawn in data-model.md, Drawer 9, on 2026-10-18
-- before this file was written).
--
-- *In plain terms: an app table can point at one spreadsheet in the project — a
-- sandbox document or a library record — name the block of cells and what each
-- column means, and every new version of that file refills the table, its rows
-- named as the person who put that version there.*
--
-- ONE TABLE. The register row for its one named person — the builder who
-- configured it — is in personal-data.md ("The file source's configuration").
--
-- TWO COLUMNS BEYOND THE DRAWING, added at build and recorded on the drawing:
--   * `last_import_succeeded` — the receipt is a sentence, and whether that
--     sentence reports a success or a failure must not be parsed out of it;
--   * `last_import_row_ids` — "each import supersedes the previous import's
--     rows" needs to know WHICH rows those were, and a person may type rows
--     into the same table; superseding by anything looser (a timestamp, the
--     enterer) would sweep up a typed row.
--
-- BOTH POINTERS CASCADE ON DELETE. A purge (ADR-0050 §6) deletes the document,
-- and this row quotes its header texts, so the configuration goes with it; the
-- rows already imported stay, with their ordinary lives, as on a detach.
--
-- WHAT IS HAND-WRITTEN BELOW THE GENERATED HALF: one CHECK, the drawing's only
-- one — the source points at EXACTLY one document. No trigger: the import
-- discipline lives in one act function (apps/api/src/app-table-source.ts) that
-- the version-landing hook and the refresh-now route both call.
CREATE TABLE "app_table_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_table_id" uuid NOT NULL,
	"sandbox_document_id" uuid,
	"container_id" uuid,
	"sheet" text NOT NULL,
	"header_row" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configured_by_participant_id" uuid NOT NULL,
	"configured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_import_version" text,
	"last_import_at" timestamp with time zone,
	"last_import_outcome" text,
	"last_import_succeeded" boolean,
	"last_import_row_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"detached_at" timestamp with time zone,
	CONSTRAINT "app_table_sources_app_table_id_unique" UNIQUE("app_table_id")
);
--> statement-breakpoint
ALTER TABLE "app_table_sources" ADD CONSTRAINT "app_table_sources_app_table_id_app_tables_id_fk" FOREIGN KEY ("app_table_id") REFERENCES "public"."app_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_table_sources" ADD CONSTRAINT "app_table_sources_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_table_sources" ADD CONSTRAINT "app_table_sources_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_table_sources" ADD CONSTRAINT "app_table_sources_configured_by_participant_id_participants_id_fk" FOREIGN KEY ("configured_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- EXACTLY ONE DOCUMENT. A source naming both would have two answers to "which
-- file's versions refill this table"; one naming neither is a pointer at
-- nothing. The pointer follows the DOCUMENT rather than a file, because a
-- document's versions are the refresh events (the Power BI item-identity
-- lesson, ADR-0059 decision 1).
ALTER TABLE "app_table_sources" ADD CONSTRAINT "app_table_sources_exactly_one_document"
  CHECK (num_nonnulls("sandbox_document_id", "container_id") = 1);
--> statement-breakpoint
-- the house-style grant (review 2026-10-18; 0034's default privileges already
-- cover it, but a reader checking grants should find them stated)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app_table_sources" TO "infora_app";
