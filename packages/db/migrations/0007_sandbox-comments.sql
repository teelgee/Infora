CREATE TYPE "public"."sandbox_comment_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "sandbox_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_document_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_participant_id" uuid NOT NULL,
	"body" text NOT NULL,
	"anchor" text,
	"status" "sandbox_comment_status" DEFAULT 'open' NOT NULL,
	"closed_by_participant_id" uuid,
	"closed_at" timestamp with time zone,
	"mentions" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_comments" ADD CONSTRAINT "sandbox_comments_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_comments" ADD CONSTRAINT "sandbox_comments_parent_comment_id_sandbox_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."sandbox_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_comments" ADD CONSTRAINT "sandbox_comments_author_participant_id_participants_id_fk" FOREIGN KEY ("author_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_comments" ADD CONSTRAINT "sandbox_comments_closed_by_participant_id_participants_id_fk" FOREIGN KEY ("closed_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_comments_document_idx" ON "sandbox_comments" USING btree ("sandbox_document_id");