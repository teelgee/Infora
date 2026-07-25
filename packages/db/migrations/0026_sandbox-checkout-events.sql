CREATE TYPE "public"."sandbox_checkout_action" AS ENUM('checked_out', 'released');--> statement-breakpoint
CREATE TABLE "sandbox_checkout_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_document_id" uuid NOT NULL,
	"action" "sandbox_checkout_action" NOT NULL,
	"by_participant_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_checkout_events" ADD CONSTRAINT "sandbox_checkout_events_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_checkout_events" ADD CONSTRAINT "sandbox_checkout_events_by_participant_id_participants_id_fk" FOREIGN KEY ("by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_checkout_events_document_idx" ON "sandbox_checkout_events" USING btree ("sandbox_document_id");