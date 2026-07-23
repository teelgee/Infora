CREATE TYPE "public"."attached_source_kind" AS ENUM('sandbox', 'upload', 'web');--> statement-breakpoint
CREATE TABLE "attached_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" "attached_source_kind" NOT NULL,
	"ref" text NOT NULL,
	"label" text,
	"pinned_by_participant_id" uuid NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attached_sources" ADD CONSTRAINT "attached_sources_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attached_sources" ADD CONSTRAINT "attached_sources_pinned_by_participant_id_participants_id_fk" FOREIGN KEY ("pinned_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attached_sources_conversation_idx" ON "attached_sources" USING btree ("conversation_id");