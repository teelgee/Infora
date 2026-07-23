// Drawer 3 — work & execution, the heart of the skeleton (ADR-0028).
// Runs and Steps are append-only, immutable once finished (trigger, T-008).
import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { participants, projects } from './drawer1-parties.js';
import { containers } from './drawer2-documents.js';

export const surface = pgEnum('surface', ['web', 'word_addin', 'copilot']);
export const runState = pgEnum('run_state', ['running', 'completed', 'failed']);
export const stepType = pgEnum('step_type', ['retrieve', 'draft', 'ground_check', 'cite', 'delegate']);
export const stepStatus = pgEnum('step_status', ['running', 'completed', 'failed']);
export const agentProvenance = pgEnum('agent_provenance', ['infora', 'custom']);

export const workItems = pgTable('work_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  // the deliverable's work half ↔ record half join (ADR-0032 addendum,
  // T-115): required for document_production, null for future non-document
  // types; status is event-driven off the cycle, never hand-set
  containerId: uuid('container_id').references(() => containers.id),
  assigneeParticipantId: uuid('assignee_participant_id').references(() => participants.id),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  // the bound environment (ADR-0025); for Copilot the one project bound for life (ADR-0031)
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  workItemId: uuid('work_item_id').references(() => workItems.id),
  surface: surface('surface').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  parentRunId: uuid('parent_run_id').references((): AnyPgColumn => runs.id),
  agentId: text('agent_id').notNull(),
  agentProvenance: agentProvenance('agent_provenance').notNull(),
  state: runState('state').notNull().default('running'),
  request: text('request').notNull(), // the prompt/task text — part of the record (ruled 2026-07-06)
  // the produced answer — part of the record too (added 2026-07-08, T-052):
  // ADR-0031 §6 returns it with citations for Copilot to render; set once at
  // completion (the T-008 trigger freezes it with the rest once finished)
  response: text('response'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  environmentKey: text('environment_key').notNull(),
  requesterParticipantId: uuid('requester_participant_id')
    .notNull()
    .references(() => participants.id),
});

export const steps = pgTable('steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  parentStepId: uuid('parent_step_id').references((): AnyPgColumn => steps.id),
  type: stepType('type').notNull(),
  status: stepStatus('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  modelId: text('model_id'),
  modelVersion: text('model_version'),
  tokensPrompt: integer('tokens_prompt'),
  tokensCompletion: integer('tokens_completion'),
  cost: numeric('cost'),
  // the egress facts the model call used (ADR-0037 §6): the guarantee is
  // provable per call, not merely asserted. Null on steps that made no model
  // call (retrieve/cite in v1).
  egressEndpoint: text('egress_endpoint'),
  egressRegion: text('egress_region'),
  egressRetention: text('egress_retention'),
  egressClassification: text('egress_classification'),
  // the two defensibility fields (ADR-0028 §7)
  sourceSet: jsonb('source_set').notNull().default([]),
  railOutcomes: jsonb('rail_outcomes').notNull().default([]),
  childRunId: uuid('child_run_id').references(() => runs.id),
});
