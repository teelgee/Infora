CREATE TABLE "deliverable_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"granted_by_participant_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deliverable_shares" ADD CONSTRAINT "deliverable_shares_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_shares" ADD CONSTRAINT "deliverable_shares_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_shares" ADD CONSTRAINT "deliverable_shares_granted_by_participant_id_participants_id_fk" FOREIGN KEY ("granted_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliverable_shares_container_idx" ON "deliverable_shares" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_shares_live_unique" ON "deliverable_shares" USING btree ("container_id","organisation_id") WHERE "deliverable_shares"."revoked_at" IS NULL;--> statement-breakpoint
-- shares are interval records (ADR-0016/0033 pattern): identity immutable,
-- only revocation may change, DELETE never
CREATE OR REPLACE FUNCTION share_interval_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deliverable_shares are append-only: DELETE rejected';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
     OR NEW.granted_by_participant_id IS DISTINCT FROM OLD.granted_by_participant_id
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
  THEN
    RAISE EXCEPTION 'deliverable_shares row % is an interval: only revocation may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER deliverable_shares_interval
  BEFORE UPDATE OR DELETE ON deliverable_shares
  FOR EACH ROW EXECUTE FUNCTION share_interval_only();
