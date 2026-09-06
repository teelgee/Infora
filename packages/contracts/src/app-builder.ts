// T-439/T-440/T-441 — the app substrate's typed half (ADR-0056), Drawer 9's
// companion in `packages/contracts`.
//
// *In plain terms: an app is a thing a team has built for it inside a project —
// a form contractors fill in that the client sees as a dashboard. These are the
// shapes the screens and the API both build against, so neither can invent a
// field the other has never heard of.*
//
// **THE DEFINITION IS VALIDATED HERE AND THE TABLE DECLARATIONS ARE NOT IN IT**,
// and that is drawer 9's ruling rather than a filing choice: `apps.definition`
// is jsonb, and if the declared tables lived inside it the read path would have
// to parse a JSON document to decide who may see a row. They live in
// `app_tables` instead, and this file types both halves so a definition that
// does not conform is refused at the boundary rather than at the first read.
//
// **NOTHING HERE CAN WIDEN ACCESS.** A builder's choices — which interface a
// person may open, which columns a screen shows — can only NARROW what a viewer
// could already see (ADR-0056 §4). There is deliberately no field in any shape
// below by which an interface could name an organisation whose rows it wants;
// the read predicate is computed from the stamp on the row and the app's scope,
// in one place, and a definition is never an input to it.
//
// **CONNECTIONS ARE DECLARED AS REQUIREMENTS AND NEVER FILLED IN.** ADR-0057's
// build waits for the deployment's secrets store, so `AppConnectionRequirement`
// says what an app WOULD need and carries no credential, no endpoint and no
// key — there is no shape here that could hold one.

import type { Id } from './shared';

// ── The declared table's shape ─────────────────────────────────────────────

/**
 * The column types a declared table may use. Deliberately small: every one of
 * these is a value a person can type into a form and a run can compute over
 * without interpreting it. A file column is what a document-input step would
 * need (T-437's Nomic finding) and is NOT here — the returns app does not need
 * one, and a type nothing can write is a claim the schema would be making
 * falsely (T-301's rule).
 */
export const APP_COLUMN_TYPES = ['text', 'number', 'date', 'boolean', 'choice'] as const;
export type AppColumnType = (typeof APP_COLUMN_TYPES)[number];

export type AppColumn = {
  /** the stored key inside `app_rows.values` */
  key: string;
  /** what the person filling the form reads */
  label: string;
  type: AppColumnType;
  required: boolean;
  /** the permitted values when `type` is `choice`; ignored otherwise */
  choices?: string[];
};

/** What a declared table is for (ADR-0056 §3, §10) — mirrors `app_table_kind`. */
export const APP_TABLE_KINDS = ['data', 'insight', 'reference'] as const;
export type AppTableKind = (typeof APP_TABLE_KINDS)[number];

/**
 * The submission flow's states, and `null` for a table whose builder chose no
 * acceptance step. Mirrors `app_row_state`; the database keeps the two honest
 * (a trigger refuses a state on a table with no acceptance step, and refuses a
 * stateless row on a table that has one).
 */
export const APP_ROW_STATES = [
  'draft',
  'submitted',
  'accepted',
  'rejected',
  'superseded',
] as const;
export type AppRowState = (typeof APP_ROW_STATES)[number];

// ── The stepped definition ─────────────────────────────────────────────────

/**
 * An interface the app offers, and **who may open it** — the question the
 * builder's agent asks at step 4 (ADR-0056 §2b), stored as an answer rather
 * than left to a settings page nobody visits.
 *
 * `openTo` NARROWS. An empty list means everyone in the app's participant
 * scope; a non-empty one means those organisations only, INTERSECTED with the
 * scope and then with what each viewer could already see. It can never admit an
 * organisation the app's scope excludes.
 */
export type AppInterface = {
  id: string;
  label: string;
  /** which declared table this screen is over */
  appTableId: Id | null;
  /** organisations that may open it; empty = everyone in the app's scope */
  openToOrganisationIds: Id[];
  /** the generated screen, written by the builder's agent (T-442). Null until
   * the builder has drawn one — the substrate stores it, T-442 writes it. */
  source: string | null;
};

/**
 * How often the app runs (ADR-0056 §13d). **Stored from the first ticket and
 * honoured only when a clock exists** — Infora runs on one machine with no
 * always-on scheduler, so `manual` is the only trigger anything acts on today
 * and a stored `monthly` is a statement of intent the surface labels as such.
 */
export const APP_SCHEDULES = ['manual', 'daily', 'weekly', 'monthly'] as const;
export type AppSchedule = (typeof APP_SCHEDULES)[number];

/**
 * What an app would need from an outside system — **a requirement, never a
 * connection** (ADR-0057, build deferred to deployment). It names the system
 * and what the app wants to reach, and there is deliberately no field here for
 * a key, a token, an endpoint or a credential reference: a shape that could
 * hold one on a machine with no secrets store is the leak ADR-0057 exists to
 * prevent.
 */
export type AppConnectionRequirement = {
  id: string;
  /** e.g. `arcgis` — what kind of system, in the app's own words */
  system: string;
  /** what the app would want to read, described for the person who will later
   * satisfy it; never a URL the platform would call */
  needs: string;
};

/**
 * The stepped definition, in the owner's confirmed step order (ADR-0056's
 * 2026-09-06 addendum, ruling 1): what the app is and who it is open to → the
 * tables → data connections → the interface → how often it runs → analysis and
 * prompts → check and open.
 *
 * The tables are NOT in here (they are `app_tables` rows) and neither is the
 * scope (those are `app_scope_grants`): steps 1 and 2 write to stores the read
 * path can query, and only the steps that hold no access fact live in this JSON.
 */
export type AppDefinition = {
  /** step 3 — declared requirements only, unfillable until deployment */
  connections: AppConnectionRequirement[];
  /** step 4 */
  interfaces: AppInterface[];
  /** step 5 — stored, not yet honoured */
  schedule: AppSchedule;
  /** step 6 — what the run's agent is told to write about the rows it covers.
   * Empty until T-443 gives a run something to do with it. */
  analysisPrompt: string | null;
};

/** A definition with nothing in it — what a freshly created app carries before
 * its builder has walked a single step. */
export const EMPTY_APP_DEFINITION: AppDefinition = {
  connections: [],
  interfaces: [],
  schedule: 'manual',
  analysisPrompt: null,
};

// ── What the API returns ───────────────────────────────────────────────────

/**
 * Why an app is not working, rendered on its card and on its interfaces.
 *
 * `defunct` is the owner's 2026-09-06 ruling in a field: when the app's owner
 * loses the project or the right to build, the app is **marked defunct in the
 * project — visibly not working — with no notification** (ADR-0056 §5's dated
 * note; ADR-0049 untouched). A broken thing that says so on its face, rather
 * than a message in a tray.
 *
 * It is DERIVED on every read from the owner's Participant interval, never
 * stored: a stored flag would be a cache of an access fact, and it would go
 * stale the moment somebody was removed by a path that forgot to update it.
 */
export const APP_STATES = ['open', 'unpublished', 'defunct', 'closed'] as const;
export type AppState = (typeof APP_STATES)[number];

export type AppScopeGrant = {
  id: Id;
  granteeType: 'organisation' | 'participant';
  organisationId: Id | null;
  organisationName: string | null;
  participantId: Id | null;
  participantName: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

export type AppTableShare = {
  id: Id;
  appTableId: Id;
  organisationId: Id;
  organisationName: string;
  grantedAt: string;
  revokedAt: string | null;
};

export type AppTableRecord = {
  id: Id;
  appId: Id;
  name: string;
  columns: AppColumn[];
  kind: AppTableKind;
  /** the builder's per-table choice (ADR-0056 §2a): does this hold contractual
   * data, and therefore change hands on acceptance? */
  hasAcceptance: boolean;
  retiredAt: string | null;
  /** live shares of this table, visible to the project owner and to the
   * organisation shared with — the audit trail of a deliberate widening */
  shares: AppTableShare[];
};

export type AppSummary = {
  id: Id;
  projectId: Id;
  name: string;
  description: string | null;
  state: AppState;
  /** who a scheduled run would act as. Null when the owner has left — which is
   * exactly the case `state: 'defunct'` names. */
  ownerName: string | null;
  ownerParticipantId: Id;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedByName: string | null;
  createdAt: string;
};

export type AppRecord = AppSummary & {
  /** the builder's working copy — returned only to a person who may build this
   * app; everyone else gets the published copy in `published` */
  definition: AppDefinition | null;
  definitionVersion: number;
  /** the copy the app's people open and a run acts against; null until first
   * published, and an app with nothing published is open to its builders alone */
  published: AppDefinition | null;
  scope: AppScopeGrant[];
  /** may THIS requester edit and publish the app's definition */
  mayBuild: boolean;
  /** is this requester's organisation the project's owner organisation */
  isProjectOwner: boolean;
};

export type ListAppsResponse = {
  items: AppSummary[];
  /** may this requester create an app in this project — the per-user toggle
   * their own organisation's admin sets (ADR-0056 §12) */
  mayCreate: boolean;
};

export type GetAppResponse = {
  app: AppRecord;
  tables: AppTableRecord[];
};

/**
 * One row of an app table (ADR-0056 §2) — the third kind of project record.
 *
 * `organisationName` is on every row because the project owner's dashboard is
 * a view across organisations and a row that does not say whose it is would be
 * unreadable; a member organisation only ever sees its own, so the field costs
 * it nothing.
 */
export type AppRowRecord = {
  id: Id;
  appTableId: Id;
  values: Record<string, unknown>;
  organisationId: Id;
  organisationName: string;
  enteredByName: string;
  enteredAt: string;
  state: AppRowState | null;
  decidedByName: string | null;
  decidedAt: string | null;
  /** required exactly when the state is `rejected`, and read by the submitting
   * organisation on the row (the 2026-09-06 addendum, ruling 4) */
  rejectionReason: string | null;
  supersedesRowId: Id | null;
  /** the correction that replaced this row, when one has arrived. Derived, so
   * a rejected row can show "· superseded" while keeping its reason — which the
   * approved mockup draws and the `rejection_reason` CHECK requires. */
  supersededByRowId: Id | null;
  previousVersionId: Id | null;
  retiredAt: string | null;
  /** what this requester may do to this row, resolved server-side. A surface
   * that worked it out for itself would be a second access decision. */
  mayEdit: boolean;
  maySubmit: boolean;
  mayDecide: boolean;
  mayCorrect: boolean;
  mayRetire: boolean;
};

export type ListAppRowsResponse = {
  table: AppTableRecord;
  items: AppRowRecord[];
};

export type AppRowResponse = { row: AppRowRecord };

/**
 * One app execution's record (ADR-0056 §3, §5). The insight itself is T-443;
 * what T-440 records is that a run happened, as whom, against which PUBLISHED
 * version, and over what.
 */
export type AppRunRecord = {
  id: Id;
  appId: Id;
  runId: Id;
  trigger: 'manual' | 'scheduled';
  asName: string;
  /** the PUBLISHED version the run acted against — never the working copy */
  definitionsVersion: number;
  rowsCovered: number;
  tablesCovered: Id[];
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
};

export type ListAppRunsResponse = { items: AppRunRecord[] };
export type AppRunResponse = { run: AppRunRecord };
