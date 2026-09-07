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
import type {
  AppColumn,
  AppScreen,
  WriteAppScreenResponse,
} from '@infora/contracts';
import { parseAppScreen } from '@infora/contracts';
import type { Router } from '@infora/model';

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
  'Rules:',
  '- Every columnKey is one of the column keys you are given. Invent none.',
  '- Between one and twenty parts. A form screen usually opens with a heading, then the form, then the rows already entered. A dashboard screen usually opens with a heading, then totals and a count, then the rows.',
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
        'That came back as something a screen here cannot be — a screen is a heading, a form, a table of rows, a total and a count, over this table’s own columns. What should it show?',
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
