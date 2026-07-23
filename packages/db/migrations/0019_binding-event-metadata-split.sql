CREATE TABLE "binding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_document_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"bound_by_participant_id" uuid NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_documents" ADD COLUMN "authoring_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "binding_events" ADD CONSTRAINT "binding_events_sandbox_document_id_sandbox_documents_id_fk" FOREIGN KEY ("sandbox_document_id") REFERENCES "public"."sandbox_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binding_events" ADD CONSTRAINT "binding_events_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binding_events" ADD CONSTRAINT "binding_events_bound_by_participant_id_participants_id_fk" FOREIGN KEY ("bound_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "binding_events_document_idx" ON "binding_events" USING btree ("sandbox_document_id");--> statement-breakpoint
-- T-147 (ADR-0038): binding_events is append-only, reusing the shared trigger.
CREATE TRIGGER binding_events_append_only
  BEFORE UPDATE OR DELETE ON binding_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
-- Binding is one-way: once container_id is set, it may never change or clear.
-- Setting it from NULL (binding) is allowed; anything else is rejected. A
-- binding mistake is unwound through the records lifecycle (withdraw/reject the
-- container), never by unbinding.
CREATE OR REPLACE FUNCTION sandbox_document_binding_one_way() RETURNS trigger AS $$
BEGIN
  IF OLD.container_id IS NOT NULL AND NEW.container_id IS DISTINCT FROM OLD.container_id THEN
    RAISE EXCEPTION 'sandbox document % is bound to container %; binding is one-way (ADR-0038)', OLD.id, OLD.container_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER sandbox_documents_binding_one_way
  BEFORE UPDATE ON sandbox_documents
  FOR EACH ROW EXECUTE FUNCTION sandbox_document_binding_one_way();