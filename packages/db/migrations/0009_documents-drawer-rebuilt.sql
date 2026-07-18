CREATE TYPE "public"."container_scope" AS ENUM('library', 'sandbox');--> statement-breakpoint
CREATE TYPE "public"."document_format" AS ENUM('infora_text', 'docx', 'xlsx', 'pptx');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('text', 'slides');--> statement-breakpoint
CREATE TYPE "public"."document_origin" AS ENUM('authored', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."rendition_format" AS ENUM('docx', 'xlsx', 'pptx', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."rendition_kind" AS ENUM('native', 'pdf');--> statement-breakpoint
ALTER TYPE "public"."container_state" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" "rendition_kind" NOT NULL,
	"format" "rendition_format" NOT NULL,
	"content_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_document_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "containers" ALTER COLUMN "document_reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "scope" "container_scope" DEFAULT 'library' NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "producing_organisation_id" uuid;--> statement-breakpoint
-- backfill: existing containers are owner-added reference material (ADR-0011),
-- so their producing organisation is the project owner (ADR-0033)
UPDATE "containers" SET "producing_organisation_id" = p."owner_organisation_id"
  FROM "projects" p WHERE p."id" = "containers"."project_id";--> statement-breakpoint
ALTER TABLE "containers" ALTER COLUMN "producing_organisation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "sandbox_document_id" uuid;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "origin" "document_origin" DEFAULT 'authored' NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "kind" "document_kind" DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "format" "document_format" DEFAULT 'infora_text' NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "file_ref" text;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "container_id" uuid;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "head_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_document_versions" ADD CONSTRAINT "sandbox_document_versions_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_document_versions" ADD CONSTRAINT "sandbox_document_versions_created_by_participant_id_participants_id_fk" FOREIGN KEY ("created_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "renditions_version_kind_unique" ON "renditions" USING btree ("version_id","kind");--> statement-breakpoint
CREATE INDEX "sandbox_document_versions_document_idx" ON "sandbox_document_versions" USING btree ("sandbox_document_id");--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_producing_organisation_id_organisations_id_fk" FOREIGN KEY ("producing_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD CONSTRAINT "sandbox_documents_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "containers_sandbox_document_unique" ON "containers" USING btree ("sandbox_document_id") WHERE "containers"."sandbox_document_id" IS NOT NULL;--> statement-breakpoint
-- renditions are a stored, immutable snapshot of the record (ADR-0034):
-- append-only by trigger, like the Version they bind to (T-008 pattern)
CREATE TRIGGER renditions_append_only
  BEFORE UPDATE OR DELETE ON renditions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();