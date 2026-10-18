// T-442 — the builder's agent: the pane beside the seven steps (ADR-0056's
// 2026-09-06 addendum, ruling 5), and the thing that writes an app's screens.
//
// *In plain terms: while somebody builds an app, an agent sits beside the steps.
// It answers questions about what they are building, and when they describe a
// screen in their own words it draws one. What it draws is not program code —
// it is a short list of parts from a fixed menu, which Infora then renders.*
//
// This is the FOURTH embedded assistive agent, on the pattern T-337, T-364 and
// T-409 established, and it keeps that pattern's properties:
//
//   1. **It PROPOSES and never applies.** A screen comes back to the surface,
//      which saves it through the SAME `PATCH /apps/:appId/definition` a
//      hand-made change takes. Two ways to write a screen would be two chances
//      for them to disagree about what a screen may contain.
//   2. **It reads no project material.** Its whole context is the app being
//      built — its name, its declared tables' columns, and what the builder
//      said. Not a row, not a document, not the library. A builder who cannot
//      see a contractor's figures must not gain them by asking the agent that
//      is helping them build the form those figures go into.
//   3. **Anything it cannot shape becomes a question, not an error** (T-364's
//      rule): a surface somebody is standing on should be asked, not failed.
//
// 🔒 **THE AGENT DOES NOT DECIDE WHAT TO ASK.** ADR-0056's addendum declined a
// chat that fills the steps in, because *"a chat can skip a question, a form
// cannot"*. A pane beside the steps is still a chat, so the two required
// questions — whether each table holds contractual data, and who may open each
// interface — are computed in code by `pendingBuilderQuestions`
// (packages/contracts) from the state of the definition, and rendered on the
// step rail and in the pane. A model that forgets to ask cannot suppress them,
// because it is not what asks.
//
// 🔒 **THE AGENT CANNOT EMIT A SCREEN THAT REACHES OUTWARD.** Not because its
// output is inspected — because a screen is a closed grammar with no field for
// a URL, an endpoint or a key (packages/contracts/src/app-builder.ts), and this
// file's only route from a model's words to a stored screen is `parseAppScreen`,
// which refuses anything outside it. The pinning tests are
// `packages/contracts/src/app-screen.test.ts` and rule 4 of
// `scripts/source-rules.mjs`.
import { asc, eq } from 'drizzle-orm';
import type {
  AppBuildTurn,
  AppColumn,
  AppDefinition,
  AppInterface,
  AppScreen,
  BuilderActReceipt,
  BuilderAgentAct,
  BuilderAgentAnswer,
  BuilderProposal,
  BuilderQuestion,
  WriteAppScreenResponse,
} from '@infora/contracts';
import { builderAgentAnswerSchema, parseAppScreen, pendingBuilderQuestions } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
// T-449 — the ONLY acts the conversation can perform, shared with a person's
// own routes. Nothing that publishes, grants, shares, reassigns or closes is
// imported here, and the agent's test reads this file to keep it that way.
import {
  declareTableAct,
  liveTables,
  setTableAcceptanceAct,
  writeDefinitionAct,
} from './app-builder-acts';

/** Long enough for a real answer, short enough to refuse an essay. */
const MAX_REPLY = 1200;

/**
 * The screen grammar, described to the model as a menu rather than as a
 * language. It is spelled out in full here because the model has to choose
 * from it, and a model shown a partial menu invents the rest.
 */
const SCREEN_SYSTEM = [
  'You lay out ONE screen of an app that a person is building inside Infora, a platform engineering consultancies use on infrastructure projects.',
  'A screen is a short list of parts. You choose the parts and their order. You do not write program code, and there is no program code in your answer.',
  'Answer with JSON only, no prose around it:',
  '{"screen":{"version":1,"blocks":[…]},"followUp":null}',
  'The parts you may use, and nothing else:',
  '  {"kind":"heading","text":"…"}',
  '  {"kind":"paragraph","text":"…"}',
  '  {"kind":"rowForm","columnKeys":["…"],"submitLabel":"…"} — the form somebody fills in, one row at a time',
  '  {"kind":"rowTable","columnKeys":["…"],"showOrganisation":true|false,"showState":true|false} — the rows, in these columns',
  '  {"kind":"total","columnKey":"…","label":"…"} — the sum of one number column',
  '  {"kind":"count","label":"…"} — how many rows there are',
  '  {"kind":"barChart","label":"…","categoryColumn":"…","valueColumn":"…"} — a bar per category, each bar the sum of the value column',
  '  {"kind":"lineChart","label":"…","categoryColumn":"…","valueColumn":"…","showTrend":true|false} — the same points joined in order, with the straight-line trend through them when showTrend is true',
  '  {"kind":"pieChart","label":"…","categoryColumn":"…","valueColumn":"…"} — the same totals as shares of the whole',
  'Rules:',
  '- Every columnKey, categoryColumn and valueColumn is one of the column keys you are given. Invent none.',
  '- A chart groups by the categoryColumn and adds up the valueColumn, so the valueColumn is always a number column. A pie chart needs a handful of categories, not thirty.',
  '- Between one and twenty parts. A form screen usually opens with a heading, then the form, then the rows already entered. A dashboard screen usually opens with a heading, then totals and a count, then a chart or two, then the rows.',
  '- showOrganisation belongs on a screen whose reader sees more than one organisation’s rows; it is noise on a screen whose reader sees only their own.',
  '- showState belongs on a table whose rows are submitted and then accepted or rejected.',
  '- Which rows appear is settled by Infora before your screen is drawn. Write the layout, and make no claim about who sees what.',
  '- If what you were told is too vague to lay out, answer {"screen":null,"followUp":"<one short question>"}.',
].join('\n');

/**
 * The pane's conversational half. It answers about the app being built and
 * writes nothing — every choice lands in the form, which is what makes closing
 * the pane lose nothing (the addendum's ruling 5).
 */
const ASK_SYSTEM = [
  'You are the agent beside the steps while somebody builds an app inside Infora, a platform engineering consultancies use on infrastructure projects.',
  'The seven steps, in order: what the app is and who it is open to; the tables; data connections; the interface; how often it runs; analysis and prompts; check and open.',
  'Answer in plain English, in at most four sentences. No JSON, no code, no lists longer than three items.',
  'What is true of every app here, and worth saying when it is relevant:',
  '- Every row somebody types remembers which organisation and which person entered it. A row is read by that organisation and by the project owner, and by nobody else unless the project owner shares the whole table.',
  '- A screen shows each person what that person could already see. A builder’s choices narrow what a screen shows; they never widen what anyone can reach.',
  '- A table that holds contractual data needs an acceptance step: a row is submitted, and the project owner accepts or rejects it. An accepted row becomes the owner’s record and is never edited in place; a correction arrives as a new row.',
  '- A schedule is stored today and starts working when there is a server that stays on. Say so rather than implying it runs.',
  '- A data connection is described here and filled in after Infora is deployed. There is nowhere to type a password, on purpose.',
  'You have not seen any of the project’s documents or any row of any table, and you do not pretend to have.',
  'If you are asked for something the steps do not offer, say what the steps do offer instead.',
].join('\n');

/** Strip a fenced code block if the model wrapped its JSON in one. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

/**
 * Turn the model's answer into a screen, or into a question.
 *
 * **This is the only route from a model's words to a stored screen, and it
 * refuses rather than repairs.** A block the grammar does not have, a field the
 * grammar does not have, a column the table did not declare — any of them fails
 * the whole screen and the builder is asked to say it again. Keeping the good
 * parts and dropping the bad one would be filtering the generator's output,
 * which is the posture ADR-0056 §11 and T-430 both rule out; and a builder shown
 * a screen quietly missing a part cannot tell that anything went wrong.
 */
export function parseScreenAnswer(
  text: string,
  declaredColumnKeys: readonly string[],
): WriteAppScreenResponse {
  const asked: WriteAppScreenResponse = {
    source: null,
    followUp: 'I could not tell what this screen should show — who opens it, and what do they do on it?',
  };
  let raw: unknown;
  try {
    raw = JSON.parse(unfence(text));
  } catch {
    return asked;
  }
  if (typeof raw !== 'object' || raw === null) return asked;
  const candidate = raw as { screen?: unknown; followUp?: unknown };
  const followUp =
    typeof candidate.followUp === 'string' && candidate.followUp.trim() !== ''
      ? candidate.followUp.trim().slice(0, MAX_REPLY)
      : null;
  if (candidate.screen === null || candidate.screen === undefined) {
    return { source: null, followUp: followUp ?? asked.followUp };
  }
  // through the grammar, or not at all
  const screen = parseAppScreen(JSON.stringify(candidate.screen), declaredColumnKeys);
  if (screen === null) {
    return {
      source: null,
      followUp:
        'That came back as something a screen here cannot be — a screen is a heading, a paragraph, a form, a table of rows, a total, a count and a bar, line or pie chart, over this table’s own columns. What should it show?',
    };
  }
  // a screen and a question are not both answers: the screen wins, because the
  // builder asked for one and got one
  return { source: JSON.stringify(screen satisfies AppScreen), followUp: null };
}

/** What the agent is told about the table a screen sits over. Columns only — a
 * screen is a layout, and no row of any table is in this agent's context. */
export type ScreenTableContext = {
  tableName: string;
  columns: AppColumn[];
  hasAcceptance: boolean;
};

export async function writeAppScreen(
  router: Router,
  input: {
    appName: string;
    purpose: string;
    /** the screen being revised, when this is a change rather than a first draft */
    current: string | null;
    table: ScreenTableContext;
  },
): Promise<WriteAppScreenResponse> {
  const columns = input.table.columns
    .map((column) => `  ${column.key} — ${column.label} (${column.type}${column.required ? ', required' : ''})`)
    .join('\n');
  const result = await router.chat('draft', {
    system: SCREEN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          `The app is called: ${input.appName}`,
          `The screen is over the table “${input.table.tableName}”, whose columns are:`,
          columns,
          input.table.hasAcceptance
            ? 'Rows in this table are submitted and then accepted or rejected.'
            : 'Rows in this table are just entered; nothing accepts them.',
          '',
          input.current === null
            ? 'There is no screen yet.'
            : `The screen currently reads: ${input.current}`,
          '',
          `The person building the app says: ${input.purpose}`,
        ].join('\n'),
      },
    ],
    maxTokens: 1200,
  });
  return parseScreenAnswer(result.text, input.table.columns.map((column) => column.key));
}

/** What the agent knows about the app while it answers a question in the pane. */
export type BuilderContext = {
  appName: string;
  step: number;
  tables: Array<{ name: string; hasAcceptance: boolean; columnLabels: string[] }>;
  interfaces: Array<{ label: string; narrowed: boolean }>;
  schedule: string;
  connectionCount: number;
  hasAnalysisPrompt: boolean;
};

const STEP_NAMES = [
  'what the app is and who it is open to',
  'the tables',
  'data connections',
  'the interface',
  'how often it runs',
  'analysis and prompts',
  'check and open',
];

export async function askBuilderAgent(
  router: Router,
  input: { ask: string; context: BuilderContext },
): Promise<string> {
  const { context } = input;
  const state = [
    `The app is called: ${context.appName}`,
    `They are on step ${context.step} of 7 — ${STEP_NAMES[context.step - 1] ?? 'the steps'}.`,
    context.tables.length === 0
      ? 'No tables are declared yet.'
      : `Tables declared: ${context.tables
          .map(
            (table) =>
              `“${table.name}” (${table.columnLabels.join(', ')}) — ${table.hasAcceptance ? 'has an acceptance step' : 'no acceptance step'}`,
          )
          .join('; ')}`,
    context.interfaces.length === 0
      ? 'No screens yet.'
      : `Screens: ${context.interfaces
          .map((screen) => `“${screen.label}” — ${screen.narrowed ? 'opens to named organisations only' : 'opens to everyone the app is open to'}`)
          .join('; ')}`,
    `Schedule: ${context.schedule} (stored; it starts working when there is a server that stays on).`,
    `Data connections described: ${context.connectionCount}.`,
    context.hasAnalysisPrompt ? 'An analysis prompt is written.' : 'No analysis prompt yet.',
  ].join('\n');
  const result = await router.chat('draft', {
    system: ASK_SYSTEM,
    messages: [{ role: 'user', content: `${state}\n\nThey say: ${input.ask}` }],
    maxTokens: 500,
  });
  const reply = result.text.trim();
  if (reply === '') return 'I did not follow that — what would you like the app to do?';
  return reply.slice(0, MAX_REPLY);
}

// ════════════════════════════════════════════════════════════════════════════
// T-449 — THE AGENT-LED BUILD CONVERSATION (ADR-0056's third addendum, rulings
// 2, 3 and 5).
//
// *In plain terms: a builder tells the agent what app they want, and the agent
// builds the working copy in front of them — declaring tables, writing screens,
// setting the schedule and the analysis prompt — and asks what it must. The
// conversation is kept against the app, so tomorrow it carries on where it
// left off.*
//
// Four properties this half of the file exists to keep:
//
//   1. 🔒 **ITS TOOL SET IS CLOSED AND CANNOT WIDEN ACCESS.** What the model may
//      do is a choice from `BUILDER_AGENT_ACT_KINDS` (packages/contracts), parsed
//      strictly: one act outside the list, or one extra field, fails the whole
//      answer and nothing of it is performed. Every act is one of the typed acts
//      in `app-builder-acts.ts` that a person's own routes call. This file
//      imports nothing that publishes, grants scope, shares a table, reassigns
//      or closes an app — `app-builder-agent.test.ts` reads this file's source
//      and fails if it ever does. Those five are a person's acts; the agent
//      PROPOSES them in words and never performs them (§4, §6, §7).
//   2. 🔒 **THE TWO WALL QUESTIONS ARE ASKED, NEVER DEFAULTED.** A table the
//      agent declares has no acceptance answer (its act has no such field). The
//      agent records a person's answer only for a question an EARLIER stored
//      turn asked — so asking and answering in one breath, which is what
//      defaulting would look like, is refused here. And any required question
//      still open after the agent's acts that no turn has yet asked is added to
//      the agent's own turn in code: a model that forgets to ask cannot leave a
//      question unasked. The publish gate (T-448) stands behind all of it.
//   3. **DRAFT, THEN CONFIRM.** It drafts freely on the working copy, which only
//      the app's builders can see; removing a screen or a connection is
//      proposed first and performed only after the person has said yes in a
//      later turn. (There is no act for retiring a table — a person has none
//      either.)
//   4. **IT READS BEFORE IT WRITES, AND NEVER CLOBBERS A HUMAN EDIT.** The app
//      is re-read at the start of the turn and shown to the model, edits by
//      hand included. Each act then re-reads the working copy and changes only
//      the one thing it names; if that thing was changed by somebody else while
//      the model was answering, the act is skipped and the turn says so.
//
// It acts AS THE REQUESTING BUILDER and nobody else: the route checks
// `canBuildApp` for that person before a turn starts, and every act is stamped
// with their participant. It reads no row of any app table and no document.

/** The menu of screen parts, for the conversation's own prompt — the same list
 * `SCREEN_SYSTEM` above gives the single-screen writer. */
const SCREEN_PARTS = SCREEN_SYSTEM.split('\n')
  .filter((line) => line.startsWith('  {"kind"'))
  .join('\n');

export const CONVERSATION_SYSTEM = [
  'You are the agent that builds an app with a person, inside Infora — a platform engineering consultancies use on infrastructure projects. The person describes what they want; you build the WORKING COPY of the app in front of them, and ask what you must.',
  'Answer with JSON only, no prose around it, in exactly this shape:',
  '{"say":"…","acts":[…],"asks":[…],"proposals":[…]}',
  '"say" is what you tell the person, in plain English, at most six sentences. Say what you did and what you need from them.',
  'The acts you may perform, and NOTHING else (anything else makes your whole answer void and nothing happens):',
  '  {"kind":"describeApp","name":"…","description":"…"} — either field may be left out',
  '  {"kind":"declareTable","name":"…","tableKind":"data"|"insight","columns":[{"key":"lower_case_key","label":"…","type":"text"|"number"|"date"|"boolean"|"choice","required":true|false}]} — an insight table is where a run writes what it found; Infora fixes its columns',
  '  {"kind":"writeScreen","label":"…","table":"<table name or id>","layout":{"version":1,"blocks":[…]},"screen":"<id of an existing screen, only when rewriting one>"}',
  '  {"kind":"removeScreen","screen":"<id>"} — ONLY after you proposed it and the person agreed in a later message',
  '  {"kind":"setSchedule","schedule":"manual"|"daily"|"weekly"|"monthly"}',
  '  {"kind":"setAnalysisPrompt","prompt":"…"} — what the run should write about the rows it covers',
  '  {"kind":"addConnection","system":"…","needs":"…"} — a described requirement only; it cannot be connected yet',
  '  {"kind":"removeConnection","connection":"<id>"} — ONLY after you proposed it and the person agreed in a later message',
  '  {"kind":"answerContractualData","table":"<table>","holdsContractualData":true|false} — ONLY to record what the person answered to a question you asked in an earlier turn',
  '  {"kind":"answerWhoMayOpen","screen":"<screen id>","organisationIds":[…]} — ONLY to record the person’s answer to a question you asked in an earlier turn; an empty list means everyone the app is open to',
  'A screen layout is a list of these parts, over the columns of its one table:',
  SCREEN_PARTS,
  '"asks" lists the required questions you are putting to the person THIS turn: {"kind":"contractual-data","table":"<table>"} or {"kind":"who-may-open","screen":"<screen id or label>"}. Ask them in "say" too, in your own words.',
  '"proposals" lists things you suggest the PERSON does, or that you will do once they agree: {"kind":"removeScreen"|"removeConnection"|"openTo"|"shareTable"|"publish"|"reassign"|"close","subject":"<what it is about, or null>","summary":"…"}.',
  'Rules:',
  '- Draft freely: declare tables, write screens, set the schedule and the prompt as soon as you can tell what is wanted. The working copy is seen only by the people building the app, and they will correct you.',
  '- NEVER decide whether a table holds contractual data, and NEVER decide who may open a screen. Those are the two questions you must ASK, every time, however obvious the answer looks — and record the answer only after the person has given it.',
  '- A table holds contractual data when a payment hangs on it, it discharges a condition, or the project owner will rely on it as its record; such a table gets an acceptance step.',
  '- You cannot open the app to anyone, share a table, publish the app, hand it to somebody else or close it. Those are the person’s to do on the app’s page. You may propose them.',
  '- The state of the app is shown to you fresh each time, including any change the person made by hand. Never undo a change the person made unless they ask you to.',
  '- A schedule is stored and starts working when there is a server that stays on. A connection is described here and connected after Infora is deployed. Say so rather than implying either works today.',
  '- You have not seen any row of any table or any project document, and you do not pretend to have.',
].join('\n');

const REFUSED_SAY =
  'I tried to answer with something I am not able to do here, so I changed nothing. I can declare tables, write screens, set the schedule, the analysis prompt and connection requirements, and record your answers to the questions I must ask you. Opening the app to people, sharing a table, handing the app over and closing it are yours to do, on the app’s own page.';

const UNREACHABLE_SAY =
  'I could not be reached just now, so nothing was changed. What you said is kept, and you can say it again.';

/** How many earlier turns the model is shown. The whole conversation stays
 * stored and readable; this bounds one call. */
const HISTORY_TURNS = 40;

export type BuilderTurnContext = {
  appId: string;
  /** the requesting builder — the only person the agent acts as */
  participantId: string;
  /** what they said */
  say: string;
  /** the organisations the app is open to, from its live scope — the only
   * organisations a screen may be narrowed to */
  organisations: Array<{ id: string; name: string; isProjectOwner: boolean }>;
};

type TurnRow = typeof s.appBuildTurns.$inferSelect;

/** The stored conversation, oldest first, with each speaker's name. Read only
 * after the route has checked `canBuildApp` — this function checks nothing. */
export async function readConversation(db: Db, appId: string): Promise<AppBuildTurn[]> {
  const rows = await db
    .select({ turn: s.appBuildTurns, speakerName: s.users.name })
    .from(s.appBuildTurns)
    .innerJoin(s.participants, eq(s.appBuildTurns.spokenByParticipantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.appBuildTurns.appId, appId))
    .orderBy(asc(s.appBuildTurns.seq));
  return rows.map(({ turn, speakerName }) => turnDto(turn, speakerName));
}

function turnDto(turn: TurnRow, speakerName: string): AppBuildTurn {
  return {
    id: turn.id,
    seq: turn.seq,
    role: turn.role,
    speakerName,
    text: turn.text,
    asked: turn.asked,
    acts: turn.acts as BuilderActReceipt[],
    proposals: turn.proposals as BuilderProposal[],
    createdAt: turn.createdAt.toISOString(),
  };
}

/** Turn a model's answer into what to do. Not JSON → it only talked, and talk
 * does nothing. JSON that is not a valid answer → refused WHOLE. */
export function parseBuilderAnswer(
  text: string,
): { kind: 'answer'; answer: BuilderAgentAnswer } | { kind: 'refused' } {
  let raw: unknown;
  try {
    raw = JSON.parse(unfence(text));
  } catch {
    const said = text.trim().slice(0, 4000);
    return {
      kind: 'answer',
      answer: {
        say: said === '' ? 'I did not follow that — what would you like the app to do?' : said,
        acts: [],
        asks: [],
        proposals: [],
      },
    };
  }
  const parsed = builderAgentAnswerSchema.safeParse(raw);
  return parsed.success ? { kind: 'answer', answer: parsed.data } : { kind: 'refused' };
}

/** A hyphenated id for a new screen or connection, unique among `taken`, and
 * shaped as the definition's own schema requires. */
function slugFor(label: string, prefix: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || prefix;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

type Snapshot = {
  name: string;
  description: string | null;
  definition: AppDefinition;
};

async function readSnapshot(db: Db, appId: string): Promise<Snapshot> {
  const [row] = await db
    .select({ name: s.apps.name, description: s.apps.description, definition: s.apps.definition })
    .from(s.apps)
    .where(eq(s.apps.id, appId))
    .limit(1);
  return { name: row!.name, description: row!.description, definition: row!.definition as AppDefinition };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What the model is shown of the app — its SHAPE and nothing in it. */
function stateBlock(
  snapshot: Snapshot,
  tables: Awaited<ReturnType<typeof liveTables>>,
  ctx: BuilderTurnContext,
  questions: BuilderQuestion[],
  askedBefore: ReadonlySet<string>,
  proposedLastTurn: BuilderProposal[],
): string {
  const answered = new Set(snapshot.definition.answeredQuestions);
  const tableName = new Map(tables.map((t) => [t.id, t.name]));
  const orgName = new Map(ctx.organisations.map((o) => [o.id, o.name]));
  return JSON.stringify({
    name: snapshot.name,
    description: snapshot.description,
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      acceptanceStep: t.hasAcceptance,
      contractualDataAnswered: t.kind === 'insight' || answered.has(`contractual-data:${t.id}`),
      columns: t.columns.map((c) => ({ key: c.key, label: c.label, type: c.type })),
    })),
    screens: snapshot.definition.interfaces.map((screen) => ({
      id: screen.id,
      label: screen.label,
      table: screen.appTableId === null ? null : (tableName.get(screen.appTableId) ?? null),
      opensTo:
        screen.openToOrganisationIds.length === 0
          ? 'everyone the app is open to'
          : screen.openToOrganisationIds.map((id) => orgName.get(id) ?? 'an organisation'),
      whoMayOpenAnswered: answered.has(`who-may-open:${screen.id}`),
      drawn: screen.source !== null,
    })),
    schedule: snapshot.definition.schedule,
    analysisPrompt: snapshot.definition.analysisPrompt,
    connections: snapshot.definition.connections,
    organisationsTheAppIsOpenTo: ctx.organisations.map((o) => ({
      id: o.id,
      name: o.name,
      projectOwner: o.isProjectOwner,
    })),
    questionsStillOpen: questions.map((q) => ({
      key: `${q.kind}:${q.subjectId}`,
      kind: q.kind,
      subject: q.subjectName,
      subjectId: q.subjectId,
      alreadyAsked: askedBefore.has(`${q.kind}:${q.subjectId}`),
    })),
    youProposedLastTurn: proposedLastTurn,
  });
}

/**
 * One turn of the build conversation: store what the person said, let the
 * agent answer and act, store the agent's turn. Returns both turns as stored.
 *
 * The caller (the route in `apps.ts`) has already checked that this person may
 * build this app; everything here is done as them.
 */
export async function runBuilderTurn(
  deps: { db: Db; router: Router },
  ctx: BuilderTurnContext,
): Promise<{ person: AppBuildTurn; agent: AppBuildTurn }> {
  const { db } = deps;

  // ── what came before ──────────────────────────────────────────────────────
  const earlier = await db
    .select()
    .from(s.appBuildTurns)
    .where(eq(s.appBuildTurns.appId, ctx.appId))
    .orderBy(asc(s.appBuildTurns.seq));
  const askedBefore = new Set(earlier.filter((t) => t.role === 'agent').flatMap((t) => t.asked));
  const lastAgent = [...earlier].reverse().find((t) => t.role === 'agent');
  const proposedLastTurn = (lastAgent?.proposals ?? []) as BuilderProposal[];

  const [personRow] = await db
    .insert(s.appBuildTurns)
    .values({ appId: ctx.appId, role: 'person', spokenByParticipantId: ctx.participantId, text: ctx.say })
    .returning();

  // ── read before writing: the app as it stands, hand edits included ────────
  const snapshot = await readSnapshot(db, ctx.appId);
  const tablesAtStart = await liveTables(db, ctx.appId);
  const questionsAtStart = pendingBuilderQuestions(snapshot.definition, tablesAtStart);

  const history = earlier.slice(-HISTORY_TURNS).map((turn) => ({
    role: turn.role === 'person' ? ('user' as const) : ('assistant' as const),
    content: turn.text,
  }));
  const omitted = earlier.length - history.length;
  const current = [
    omitted > 0 ? `(${omitted} earlier turns of this conversation are stored and not shown.)` : '',
    `THE PERSON SAYS: ${ctx.say}`,
    '',
    'THE APP AS IT STANDS NOW — read just before you answer, including anything the person changed by hand:',
    `STATE: ${stateBlock(snapshot, tablesAtStart, ctx, questionsAtStart, askedBefore, proposedLastTurn)}`,
  ]
    .filter((line, index) => index > 0 || line !== '')
    .join('\n');

  let parsed: ReturnType<typeof parseBuilderAnswer> | 'unreachable';
  try {
    const result = await deps.router.chat('draft', {
      system: CONVERSATION_SYSTEM,
      messages: [...history, { role: 'user', content: current }],
      maxTokens: 4000,
    });
    parsed = parseBuilderAnswer(result.text);
  } catch {
    parsed = 'unreachable';
  }

  const receipts: BuilderActReceipt[] = [];
  const notes: string[] = [];
  const proposals: BuilderProposal[] = [];
  const askedNow = new Set<string>();
  let say: string;

  if (parsed === 'unreachable') {
    say = UNREACHABLE_SAY;
  } else if (parsed.kind === 'refused') {
    say = REFUSED_SAY;
  } else {
    say = parsed.answer.say;
    proposals.push(...parsed.answer.proposals);
    for (const act of parsed.answer.acts) {
      try {
        await perform(db, ctx, act, {
          snapshot,
          askedBefore,
          proposedLastTurn,
          receipts,
          notes,
          proposals,
          askedNow,
        });
      } catch {
        notes.push('One of the changes I tried could not be made, so I left it.');
      }
    }
    // the model's own asks, resolved against the app as it now stands
    const tablesNow = await liveTables(db, ctx.appId);
    const definitionNow = (await readSnapshot(db, ctx.appId)).definition;
    for (const ask of parsed.answer.asks) {
      const key =
        ask.kind === 'contractual-data'
          ? keyForTable(tablesNow, ask.table)
          : keyForScreen(definitionNow, ask.screen);
      if (key !== null) askedNow.add(key);
    }
  }

  // ── the agent ALWAYS asks what is still open and nobody has asked ─────────
  const finalSnapshot = await readSnapshot(db, ctx.appId);
  const open = pendingBuilderQuestions(finalSnapshot.definition, await liveTables(db, ctx.appId));
  const openKeys = new Set(open.map((q) => `${q.kind}:${q.subjectId}`));
  for (const key of [...askedNow]) if (!openKeys.has(key)) askedNow.delete(key);
  const unasked = open.filter((q) => {
    const key = `${q.kind}:${q.subjectId}`;
    return !askedBefore.has(key) && !askedNow.has(key);
  });
  for (const q of unasked) askedNow.add(`${q.kind}:${q.subjectId}`);

  const text = [
    say,
    notes.length > 0 ? notes.join(' ') : '',
    unasked.length > 0
      ? ['Before this app can be opened, I need you to answer:', ...unasked.map((q) => `— ${q.question}`)].join('\n')
      : '',
  ]
    .filter((part) => part !== '')
    .join('\n\n')
    .slice(0, 8000);

  const [agentRow] = await db
    .insert(s.appBuildTurns)
    .values({
      appId: ctx.appId,
      role: 'agent',
      spokenByParticipantId: ctx.participantId,
      text,
      asked: [...askedNow],
      acts: receipts,
      proposals,
    })
    .returning();

  const [speaker] = await db
    .select({ name: s.users.name })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.participants.id, ctx.participantId))
    .limit(1);
  const name = speaker?.name ?? 'Unknown';
  return { person: turnDto(personRow!, name), agent: turnDto(agentRow!, name) };
}

function keyForTable(
  tables: Awaited<ReturnType<typeof liveTables>>,
  ref: string,
): string | null {
  const table = resolveTable(tables, ref);
  return table === null || table.kind === 'insight' ? null : `contractual-data:${table.id}`;
}

function keyForScreen(definition: AppDefinition, ref: string): string | null {
  const screen = resolveScreen(definition, ref);
  return screen === null ? null : `who-may-open:${screen.id}`;
}

/** A table by id, else by a name only one live table has. */
function resolveTable<T extends { id: string; name: string }>(tables: T[], ref: string): T | null {
  const byId = tables.find((t) => t.id === ref);
  if (byId) return byId;
  const byName = tables.filter((t) => t.name.toLowerCase() === ref.toLowerCase());
  return byName.length === 1 ? byName[0]! : null;
}

/** A screen by id, else by a label only one screen has. */
function resolveScreen(definition: AppDefinition, ref: string): AppInterface | null {
  const byId = definition.interfaces.find((screen) => screen.id === ref);
  if (byId) return byId;
  const byLabel = definition.interfaces.filter((screen) => screen.label.toLowerCase() === ref.toLowerCase());
  return byLabel.length === 1 ? byLabel[0]! : null;
}

type PerformState = {
  /** the app as the model was shown it — what "changed since" is judged against */
  snapshot: Snapshot;
  askedBefore: ReadonlySet<string>;
  proposedLastTurn: BuilderProposal[];
  receipts: BuilderActReceipt[];
  notes: string[];
  proposals: BuilderProposal[];
  askedNow: Set<string>;
};

/** Was this proposal made in the agent's previous turn — so that the person's
 * message since is their answer to it? */
function wasProposed(state: PerformState, kind: BuilderProposal['kind'], ids: string[]): boolean {
  return state.proposedLastTurn.some(
    (p) => p.kind === kind && p.subject !== null && ids.some((id) => id.toLowerCase() === p.subject!.toLowerCase()),
  );
}

/**
 * Perform ONE act, through the shared acts, as the requesting builder.
 *
 * Each definition change re-reads the working copy first and changes only the
 * one thing the act names; if that thing differs from what the model was shown,
 * somebody changed it by hand while the model was answering, and the act is
 * skipped rather than written over them.
 */
async function perform(
  db: Db,
  ctx: BuilderTurnContext,
  act: BuilderAgentAct,
  state: PerformState,
): Promise<void> {
  // the same write a person's PATCH makes, with the same checks; a refusal
  // there is reported by the caller as a change that could not be made
  const write = async (definition: AppDefinition) => {
    const result = await writeDefinitionAct(db, {
      appId: ctx.appId,
      participantId: ctx.participantId,
      definition,
    });
    if (result === 'invalid') throw new Error('refused by the definition boundary');
  };
  const done = (summary: string) => state.receipts.push({ kind: act.kind, summary });
  const fresh = await readSnapshot(db, ctx.appId);
  const tables = await liveTables(db, ctx.appId);

  switch (act.kind) {
    case 'describeApp': {
      const nameChangedByHand = fresh.name !== state.snapshot.name;
      const descriptionChangedByHand = fresh.description !== state.snapshot.description;
      const name = act.name !== undefined && !nameChangedByHand ? act.name : undefined;
      const description =
        act.description !== undefined && !descriptionChangedByHand ? act.description : undefined;
      if ((act.name !== undefined && nameChangedByHand) || (act.description !== undefined && descriptionChangedByHand)) {
        state.notes.push('You changed the app’s name or description while I was answering, so I kept yours.');
      }
      if (name === undefined && description === undefined) return;
      await writeDefinitionAct(db, {
        appId: ctx.appId,
        participantId: ctx.participantId,
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description === '' ? null : description }),
      });
      done(name !== undefined ? `Named the app “${name}”.` : 'Wrote what the app is for.');
      return;
    }
    case 'declareTable': {
      if (tables.some((t) => t.name.toLowerCase() === act.name.toLowerCase())) {
        state.notes.push(`There is already a table called “${act.name}”, so I did not declare another.`);
        return;
      }
      const created = await declareTableAct(db, {
        appId: ctx.appId,
        participantId: ctx.participantId,
        name: act.name,
        columns: act.columns.map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type,
          required: c.required ?? false,
          ...(c.choices !== undefined && { choices: c.choices }),
        })),
        kind: act.tableKind,
        // 🔒 never answered by the agent: the person is asked
        hasAcceptance: undefined,
      });
      done(
        act.tableKind === 'insight'
          ? `Declared “${created.name}”, where each run writes what it found.`
          : `Declared the table “${created.name}” (${act.columns.map((c) => c.label).join(', ')}).`,
      );
      return;
    }
    case 'writeScreen': {
      const table = resolveTable(tables, act.table);
      if (table === null) {
        state.notes.push(`I could not find the table “${act.table}”, so I did not write “${act.label}”.`);
        return;
      }
      const source = JSON.stringify(act.layout);
      if (parseAppScreen(source, table.columns.map((c) => c.key)) === null) {
        state.notes.push(`“${act.label}” named a column “${table.name}” does not have, so I did not write it.`);
        return;
      }
      const existing =
        act.screen !== undefined
          ? resolveScreen(fresh.definition, act.screen)
          : resolveScreen(fresh.definition, act.label);
      if (act.screen !== undefined && existing === null) {
        state.notes.push(`I could not find the screen “${act.screen}” to rewrite.`);
        return;
      }
      if (existing !== null) {
        const before = state.snapshot.definition.interfaces.find((screen) => screen.id === existing.id);
        if (before === undefined || !same(before, existing)) {
          state.notes.push(`You changed “${existing.label}” while I was answering, so I left your version.`);
          return;
        }
        await write({
          ...fresh.definition,
          interfaces: fresh.definition.interfaces.map((screen) =>
            screen.id === existing.id
              ? { ...screen, label: act.label, appTableId: table.id, source }
              : screen,
          ),
        });
        done(`Rewrote the screen “${act.label}”.`);
        return;
      }
      const id = slugFor(act.label, 'screen', new Set(fresh.definition.interfaces.map((screen) => screen.id)));
      await write({
        ...fresh.definition,
        interfaces: [
          ...fresh.definition.interfaces,
          // who may open it is EMPTY and UNANSWERED: the person is asked
          { id, label: act.label, appTableId: table.id, openToOrganisationIds: [], source },
        ],
      });
      done(`Wrote the screen “${act.label}” over “${table.name}”.`);
      return;
    }
    case 'removeScreen': {
      const screen = resolveScreen(fresh.definition, act.screen);
      if (screen === null) {
        state.notes.push(`I could not find the screen “${act.screen}”.`);
        return;
      }
      if (!wasProposed(state, 'removeScreen', [screen.id, screen.label])) {
        // draft-then-confirm: a removal is proposed first, never performed cold
        state.proposals.push({
          kind: 'removeScreen',
          subject: screen.id,
          summary: `Remove the screen “${screen.label}”.`,
        });
        state.notes.push(`I have not removed “${screen.label}” — say yes and I will.`);
        return;
      }
      await write({
        ...fresh.definition,
        interfaces: fresh.definition.interfaces.filter((s2) => s2.id !== screen.id),
        answeredQuestions: fresh.definition.answeredQuestions.filter((k) => k !== `who-may-open:${screen.id}`),
      });
      done(`Removed the screen “${screen.label}”, as you agreed.`);
      return;
    }
    case 'setSchedule': {
      if (fresh.definition.schedule !== state.snapshot.definition.schedule) {
        state.notes.push('You changed the schedule while I was answering, so I kept yours.');
        return;
      }
      await write({ ...fresh.definition, schedule: act.schedule });
      done(`Set it to run: ${act.schedule} (stored; it starts working when there is a server that stays on).`);
      return;
    }
    case 'setAnalysisPrompt': {
      if (fresh.definition.analysisPrompt !== state.snapshot.definition.analysisPrompt) {
        state.notes.push('You changed the analysis prompt while I was answering, so I kept yours.');
        return;
      }
      await write({ ...fresh.definition, analysisPrompt: act.prompt });
      done('Wrote what each run’s analysis should say.');
      return;
    }
    case 'addConnection': {
      const id = slugFor(act.system, 'connection', new Set(fresh.definition.connections.map((c) => c.id)));
      await write({
        ...fresh.definition,
        connections: [...fresh.definition.connections, { id, system: act.system, needs: act.needs }],
      });
      done(`Described a connection to ${act.system} (it cannot be connected until Infora is deployed).`);
      return;
    }
    case 'removeConnection': {
      const connection = fresh.definition.connections.find((c) => c.id === act.connection);
      if (connection === undefined) {
        state.notes.push(`I could not find the connection “${act.connection}”.`);
        return;
      }
      if (!wasProposed(state, 'removeConnection', [connection.id])) {
        state.proposals.push({
          kind: 'removeConnection',
          subject: connection.id,
          summary: `Remove the connection to ${connection.system}.`,
        });
        state.notes.push(`I have not removed the connection to ${connection.system} — say yes and I will.`);
        return;
      }
      await write({
        ...fresh.definition,
        connections: fresh.definition.connections.filter((c) => c.id !== connection.id),
      });
      done(`Removed the connection to ${connection.system}, as you agreed.`);
      return;
    }
    case 'answerContractualData': {
      const table = resolveTable(tables, act.table);
      if (table === null || table.kind === 'insight') {
        state.notes.push(`I could not find a table “${act.table}” to record that against.`);
        return;
      }
      const key = `contractual-data:${table.id}`;
      // 🔒 only an answer to a question an EARLIER turn asked
      if (!state.askedBefore.has(key)) {
        state.askedNow.add(key);
        state.notes.push(
          `I have not recorded whether “${table.name}” holds contractual data — that is yours to answer, so I am asking you now.`,
        );
        return;
      }
      const result = await setTableAcceptanceAct(db, {
        appId: ctx.appId,
        participantId: ctx.participantId,
        appTableId: table.id,
        hasAcceptance: act.holdsContractualData,
      });
      if (result === 'conflict') {
        state.notes.push(`“${table.name}” already holds rows, so whether it holds contractual data cannot change now.`);
        return;
      }
      if (result !== 'ok') return;
      done(
        act.holdsContractualData
          ? `Recorded your answer: “${table.name}” holds contractual data, so each row is submitted and then accepted or rejected.`
          : `Recorded your answer: “${table.name}” is working data, so its rows never change hands.`,
      );
      return;
    }
    case 'answerWhoMayOpen': {
      const screen = resolveScreen(fresh.definition, act.screen);
      if (screen === null) {
        state.notes.push(`I could not find the screen “${act.screen}” to record that against.`);
        return;
      }
      const key = `who-may-open:${screen.id}`;
      if (!state.askedBefore.has(key)) {
        state.askedNow.add(key);
        state.notes.push(`I have not recorded who may open “${screen.label}” — that is yours to answer, so I am asking you now.`);
        return;
      }
      // narrow-only, and only to organisations the app is already open to
      const allowed = new Set(ctx.organisations.map((o) => o.id));
      if (act.organisationIds.some((id) => !allowed.has(id))) {
        state.notes.push(`A screen can only be narrowed to organisations the app is already open to, so I did not record that for “${screen.label}”.`);
        return;
      }
      const before = state.snapshot.definition.interfaces.find((s2) => s2.id === screen.id);
      if (before === undefined || !same(before, screen)) {
        state.notes.push(`You changed “${screen.label}” while I was answering, so I left your version.`);
        return;
      }
      await write({
        ...fresh.definition,
        interfaces: fresh.definition.interfaces.map((s2) =>
          s2.id === screen.id ? { ...s2, openToOrganisationIds: act.organisationIds } : s2,
        ),
        answeredQuestions: [...new Set([...fresh.definition.answeredQuestions, key])],
      });
      const names = ctx.organisations.filter((o) => act.organisationIds.includes(o.id)).map((o) => o.name);
      done(
        names.length === 0
          ? `Recorded your answer: everyone the app is open to may open “${screen.label}”.`
          : `Recorded your answer: only ${names.join(' and ')} may open “${screen.label}”.`,
      );
      return;
    }
  }
}
