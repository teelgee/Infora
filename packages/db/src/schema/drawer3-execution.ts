// Drawer 3 — work & execution, the heart of the skeleton (ADR-0028).
// Runs and Steps are append-only, immutable once finished (trigger, T-008).
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { participants, projects } from './drawer1-parties.js';
import { containers, sandboxDocuments } from './drawer2-documents.js';

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
  // a document-bound conversation is the multiplayer thread (ADR-0039, T-150):
  // its prompts and responses are visible to the document's sandbox participant
  // scope, not just the creator's organisation. Null = an ad-hoc conversation,
  // org-private (T-104). Run internals stay producing-org-private either way;
  // informing resolves per-invoker (requesterParticipantId on each run).
  sandboxDocumentId: uuid('sandbox_document_id').references(() => sandboxDocuments.id),
  surface: surface('surface').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Attached sources (ADR-0022 refined, T-149): one or several documents/data a
// user pins as direct input to an agent session — a sandbox file, an uploaded
// PDF, or a web search. Scoped to the Conversation and persisting across its
// turns as a working set (an interval: pin adds, unpin closes removed_at), never
// joining a corpus, never grounding, never emitting a citation. `ref` is a free
// reference by kind: a sandbox_document id, an uploaded file ref, or a URL/query.
export const attachedSourceKind = pgEnum('attached_source_kind', ['sandbox', 'upload', 'web']);
export const attachedSources = pgTable(
  'attached_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    kind: attachedSourceKind('kind').notNull(),
    ref: text('ref').notNull(),
    label: text('label'),
    pinnedByParticipantId: uuid('pinned_by_participant_id')
      .notNull()
      .references(() => participants.id),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('attached_sources_conversation_idx').on(t.conversationId)],
);

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

// T-260 — the plan artefact (docs/ask/03 §3): the analysis, persisted. One
// plan per Run, its steps corresponding 1:1 to the append-only Step rows they
// became. Immutable from `ready` rather than from insertion (trigger, 0035) —
// a draft plan is mutable while it is being clarified, and what it SAYS
// freezes when it becomes ready, leaving only what it DID to be written.
export const planMode = pgEnum('plan_mode', ['declared', 'model_chosen']);
export const planState = pgEnum('plan_state', [
  'draft',
  'awaiting_clarification',
  'ready',
  'running',
  'complete',
  'failed',
  'superseded',
]);
// the named stages the progress rail shows (docs/ask/03 §2, 08 §4)
export const planStage = pgEnum('plan_stage', [
  'understand',
  'load_context',
  'clarify',
  'plan',
  'search_corpus',
  'check_authority',
  'research_web',
  'analyse',
  'verify',
  'present',
]);
export const planStepState = pgEnum('plan_step_state', [
  'pending',
  'running',
  'complete',
  'failed',
  'skipped',
]);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    // the assembly environment (ADR-0025) — a run executes in exactly one
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    requesterParticipantId: uuid('requester_participant_id')
      .notNull()
      .references(() => participants.id),
    // stored, never derived: the labelling requirement is hard (docs/ask/03
    // §1.2) — a user must never be unable to tell which kind of answer they
    // are holding, and a derived label drifts from what actually ran
    mode: planMode('mode').notNull(),
    workflowId: text('workflow_id'),
    workflowVersion: integer('workflow_version'),
    lensId: text('lens_id'),
    lensVersion: integer('lens_version'),
    state: planState('state').notNull().default('draft'),
    question: text('question').notNull(), // as asked
    restatement: text('restatement'), // as understood — shown to the user
    // named at the top of the answer when clarification was skipped (05 §4)
    assumptions: jsonb('assumptions').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // an edit-and-rerun creates a NEW plan on a NEW run and points the old one
    // here: supersession, never mutation, because a plan is evidence
    supersededByPlanId: uuid('superseded_by_plan_id').references((): AnyPgColumn => plans.id),
  },
  (t) => [
    uniqueIndex('plans_run_unique').on(t.runId),
    index('plans_conversation_idx').on(t.conversationId),
  ],
);

export const planSteps = pgTable(
  'plan_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    ordinal: integer('ordinal').notNull(),
    stage: planStage('stage').notNull(),
    // the worker registry lands at T-269; a step of the coded chain names none
    worker: text('worker'),
    inputs: jsonb('inputs').notNull().default({}),
    // parallelism is EXPRESSED here, never inferred at run time (03 §2)
    dependsOn: jsonb('depends_on').notNull().default([]),
    state: planStepState('state').notNull().default('pending'),
    // the append-only Step this intention became — the 1:1 link between the
    // plan and the record
    stepRowId: uuid('step_row_id').references((): AnyPgColumn => steps.id),
    outputRef: uuid('output_ref'),
    editedByParticipantId: uuid('edited_by_participant_id').references(() => participants.id),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('plan_steps_plan_ordinal_unique').on(t.planId, t.ordinal),
    uniqueIndex('plan_steps_step_row_unique')
      .on(t.stepRowId)
      .where(sql`${t.stepRowId} IS NOT NULL`),
  ],
);

// A plan step declares no scope, deliberately (03 §3.4, 09 R8): scope derives
// from the run's EntitledSlice and is not expressible here, so no plan edit
// can widen reach. If a `scope` column ever appears above, that guarantee has
// been lost.

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
