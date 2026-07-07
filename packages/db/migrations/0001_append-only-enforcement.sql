-- T-008: append-only enforcement at the DB layer (ADR-0002, ADR-0028 §3).
-- versions, signals, comments: strictly insert-only.
-- runs, steps: immutable once finished — UPDATE may touch only the lifecycle
-- columns (state/status, ended_at) and only while the row is still 'running';
-- DELETE never.

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER versions_append_only
  BEFORE UPDATE OR DELETE ON versions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

CREATE TRIGGER signals_append_only
  BEFORE UPDATE OR DELETE ON signals
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

CREATE TRIGGER comments_append_only
  BEFORE UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION runs_immutable_once_finished() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'runs are append-only: DELETE rejected';
  END IF;
  IF OLD.state <> 'running' THEN
    RAISE EXCEPTION 'run % is % and immutable', OLD.id, OLD.state;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.parent_run_id IS DISTINCT FROM OLD.parent_run_id
     OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
     OR NEW.agent_provenance IS DISTINCT FROM OLD.agent_provenance
     OR NEW.request IS DISTINCT FROM OLD.request
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.environment_key IS DISTINCT FROM OLD.environment_key
     OR NEW.requester_participant_id IS DISTINCT FROM OLD.requester_participant_id
  THEN
    RAISE EXCEPTION 'run % content is immutable: only state and ended_at may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER runs_append_only
  BEFORE UPDATE OR DELETE ON runs
  FOR EACH ROW EXECUTE FUNCTION runs_immutable_once_finished();--> statement-breakpoint

CREATE OR REPLACE FUNCTION steps_immutable_once_finished() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'steps are append-only: DELETE rejected';
  END IF;
  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'step % is % and immutable', OLD.id, OLD.status;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.parent_step_id IS DISTINCT FROM OLD.parent_step_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
  THEN
    RAISE EXCEPTION 'step % identity is immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER steps_append_only
  BEFORE UPDATE OR DELETE ON steps
  FOR EACH ROW EXECUTE FUNCTION steps_immutable_once_finished();
