-- T-120: promotion flips currency. ADR-0002 freezes the *revision* — its
-- content and identity — while is_current is a pointer to the live head of
-- the series and moves when vN+1 is promoted. The strict insert-only trigger
-- (T-008) gains the same lifecycle carve-out runs and steps have: UPDATE may
-- touch is_current and nothing else; DELETE never.
DROP TRIGGER versions_append_only ON versions;--> statement-breakpoint
CREATE OR REPLACE FUNCTION versions_immutable_content() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'versions are append-only: DELETE rejected';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.version_reference IS DISTINCT FROM OLD.version_reference
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'version % is append-only: only is_current may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER versions_immutable_content
  BEFORE UPDATE OR DELETE ON versions
  FOR EACH ROW EXECUTE FUNCTION versions_immutable_content();
