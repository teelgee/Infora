CREATE TABLE "sandbox_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"created_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "sandbox_folders" ADD CONSTRAINT "sandbox_folders_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_folders" ADD CONSTRAINT "sandbox_folders_parent_folder_id_sandbox_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."sandbox_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_folders" ADD CONSTRAINT "sandbox_folders_created_by_participant_id_participants_id_fk" FOREIGN KEY ("created_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_folders_sandbox_idx" ON "sandbox_folders" USING btree ("sandbox_id");--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD CONSTRAINT "sandbox_documents_folder_id_sandbox_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."sandbox_folders"("id") ON DELETE no action ON UPDATE no action;