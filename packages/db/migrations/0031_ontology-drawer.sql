CREATE TYPE "public"."classification_facet_source" AS ENUM('uniclass_2015', 'iso_19650', 'custom');--> statement-breakpoint
CREATE TYPE "public"."document_relationship_type" AS ENUM('supersedes', 'references', 'responds_to', 'is_part_of', 'derived_from');--> statement-breakpoint
CREATE TABLE "classification_facets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"source" "classification_facet_source" DEFAULT 'custom' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facet_id" uuid NOT NULL,
	"parent_term_id" uuid,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "container_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"facet_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"proposed_by_run_id" uuid,
	"set_by_participant_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_container_id" uuid NOT NULL,
	"to_container_id" uuid NOT NULL,
	"type" "document_relationship_type" NOT NULL,
	"proposed_by_run_id" uuid,
	"created_by_participant_id" uuid NOT NULL,
	"confirmed_by_participant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "classification_facets" ADD CONSTRAINT "classification_facets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_terms" ADD CONSTRAINT "classification_terms_facet_id_classification_facets_id_fk" FOREIGN KEY ("facet_id") REFERENCES "public"."classification_facets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_terms" ADD CONSTRAINT "classification_terms_parent_term_id_classification_terms_id_fk" FOREIGN KEY ("parent_term_id") REFERENCES "public"."classification_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_classifications" ADD CONSTRAINT "container_classifications_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_classifications" ADD CONSTRAINT "container_classifications_facet_id_classification_facets_id_fk" FOREIGN KEY ("facet_id") REFERENCES "public"."classification_facets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_classifications" ADD CONSTRAINT "container_classifications_term_id_classification_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."classification_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_classifications" ADD CONSTRAINT "container_classifications_proposed_by_run_id_runs_id_fk" FOREIGN KEY ("proposed_by_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_classifications" ADD CONSTRAINT "container_classifications_set_by_participant_id_participants_id_fk" FOREIGN KEY ("set_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_from_container_id_containers_id_fk" FOREIGN KEY ("from_container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_to_container_id_containers_id_fk" FOREIGN KEY ("to_container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_proposed_by_run_id_runs_id_fk" FOREIGN KEY ("proposed_by_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_created_by_participant_id_participants_id_fk" FOREIGN KEY ("created_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_confirmed_by_participant_id_participants_id_fk" FOREIGN KEY ("confirmed_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classification_facets_project_key_unique" ON "classification_facets" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "classification_terms_facet_idx" ON "classification_terms" USING btree ("facet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classification_terms_facet_code_live_unique" ON "classification_terms" USING btree ("facet_id","code") WHERE "classification_terms"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "container_classifications_container_idx" ON "container_classifications" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "container_classifications_container_facet_unique" ON "container_classifications" USING btree ("container_id","facet_id");--> statement-breakpoint
CREATE INDEX "document_relationships_from_idx" ON "document_relationships" USING btree ("from_container_id");--> statement-breakpoint
CREATE INDEX "document_relationships_to_idx" ON "document_relationships" USING btree ("to_container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_relationships_live_unique" ON "document_relationships" USING btree ("from_container_id","to_container_id","type") WHERE "document_relationships"."retired_at" IS NULL;