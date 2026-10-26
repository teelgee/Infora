-- T-487 — what the app builder's agent actually sent, kept when Infora refuses
-- its answer whole (drawn in data-model.md, Drawer 9, on 2026-10-25 before this
-- file was written; walk defect 2).
--
-- *In plain terms: when the agent's reply cannot be used, the builder can open
-- "What the agent sent" and see it. Until now the reply was dropped the moment
-- it was refused, so a thrown-away answer could not be traced from inside the
-- product.*
--
-- ONE NULLABLE COLUMN. It is set only on an `agent` turn whose reply was
-- refused whole, and capped at 20,000 characters. It is free text from the
-- model that can echo what named people typed, so it takes the turn's own
-- standing (personal-data.md, "The app builder's conversation"): read by the
-- app's builders alone — the route's `canBuildApp` — and deleted with the app by
-- the table's existing ON DELETE CASCADE. The existing append-only trigger
-- already refuses UPDATE, so the column is written once, on insert, and the
-- table-level grant to the application role already covers it.
--
-- WHAT IS HAND-WRITTEN BELOW THE GENERATED LINE, AND WHY: one CHECK, in the
-- shape of this table's other two. A person's turn is what they said and nothing
-- else, so it can never carry a reply; and the cap is a property of the data,
-- not only of the code that happens to write it today.
ALTER TABLE "app_build_turns" ADD COLUMN "raw_reply" text;--> statement-breakpoint

ALTER TABLE "app_build_turns" ADD CONSTRAINT "app_build_turns_raw_reply_agent_only_and_bounded"
  CHECK ("raw_reply" IS NULL OR ("role" = 'agent' AND char_length("raw_reply") <= 20000));
