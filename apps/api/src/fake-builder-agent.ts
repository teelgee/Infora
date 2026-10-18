// T-449 — test support: a deterministic stand-in for the builder's agent, so
// the agent-led conversation can be driven end to end — in the API tests and in
// a browser on the e2e substrate — with no provider behind it.
//
// *In plain terms: a scripted agent that reads what the person said and the
// state of the app off the prompt it is handed, and answers the way the real
// agent is asked to — in the closed list of acts — so every guard the server
// applies to a real answer is exercised by this one.*
//
// It is deliberately a GOOD agent: it drafts, asks the two wall questions in
// its own turn, records an answer only after the person has given one, and
// proposes rather than performs a removal. The suites that prove the server
// refuses a BAD agent use routers of their own.
//
// Never deployed: imported by `e2e-server.ts` and by tests only.
import { CONVERSATION_SYSTEM } from './app-builder-agent';

type State = {
  tables: Array<{ id: string; name: string; kind: string; columns: Array<{ key: string }> }>;
  screens: Array<{ id: string; label: string; table: string | null }>;
  organisationsTheAppIsOpenTo: Array<{ id: string; name: string; projectOwner: boolean }>;
  questionsStillOpen: Array<{ kind: string; subject: string; subjectId: string; alreadyAsked: boolean }>;
  youProposedLastTurn: Array<{ kind: string; subject: string | null }>;
};

const RETURNS_COLUMNS = [
  { key: 'month', label: 'Month', type: 'text', required: true },
  { key: 'energy_kwh', label: 'Energy used (kWh)', type: 'number', required: true },
  { key: 'waste_tonnes', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
  { key: 'water_m3', label: 'Water used (m³)', type: 'number', required: false },
];

const SUBMIT_LAYOUT = {
  version: 1,
  blocks: [
    { kind: 'heading', text: 'Your monthly return' },
    { kind: 'rowForm', columnKeys: ['month', 'energy_kwh', 'waste_tonnes', 'water_m3'], submitLabel: 'Submit this month' },
    { kind: 'rowTable', columnKeys: ['month', 'energy_kwh', 'waste_tonnes'], showOrganisation: false, showState: true },
  ],
};

const DASHBOARD_LAYOUT = {
  version: 1,
  blocks: [
    { kind: 'heading', text: 'Returns across the scheme' },
    { kind: 'total', columnKey: 'waste_tonnes', label: 'Waste to landfill so far (tonnes)' },
    { kind: 'count', label: 'Returns in' },
    { kind: 'barChart', label: 'Waste to landfill by month', categoryColumn: 'month', valueColumn: 'waste_tonnes' },
    { kind: 'rowTable', columnKeys: ['month', 'energy_kwh', 'waste_tonnes'], showOrganisation: true, showState: true },
  ],
};

/** The scripted agent's answer, or null when the prompt is not the build
 * conversation's (so the caller's other branches answer it). */
export function fakeBuilderAgent(system: string, prompt: string): string | null {
  if (system !== CONVERSATION_SYSTEM) return null;
  const saidMatch = /THE PERSON SAYS: ([\s\S]*?)\n\nTHE APP AS IT STANDS NOW/.exec(prompt);
  const stateMatch = /^STATE: (.*)$/m.exec(prompt);
  if (saidMatch === null || stateMatch === null) {
    return JSON.stringify({ say: 'What would you like the app to do?', acts: [], asks: [], proposals: [] });
  }
  const said = saidMatch[1]!.toLowerCase();
  const state = JSON.parse(stateMatch[1]!) as State;
  const acts: unknown[] = [];
  const asks: unknown[] = [];
  const proposals: unknown[] = [];
  const says: string[] = [];

  // ── the first description: draft the whole app, and ask ──────────────────
  if (state.tables.length === 0 && /returns?/.test(said)) {
    acts.push(
      { kind: 'describeApp', description: 'Monthly sustainability returns from each contractor, accepted by the client.' },
      { kind: 'declareTable', name: 'Monthly returns', tableKind: 'data', columns: RETURNS_COLUMNS },
      { kind: 'declareTable', name: 'Run insights', tableKind: 'insight', columns: [{ key: 'insight', label: 'Insight', type: 'text' }] },
      { kind: 'writeScreen', label: 'Submit a return', table: 'Monthly returns', layout: SUBMIT_LAYOUT },
      { kind: 'writeScreen', label: 'Client dashboard', table: 'Monthly returns', layout: DASHBOARD_LAYOUT },
      { kind: 'setSchedule', schedule: 'monthly' },
      {
        kind: 'setAnalysisPrompt',
        prompt: 'Say which contractors have returned this month and which have not, and note any figure that moved by more than a fifth against last month.',
      },
    );
    asks.push(
      { kind: 'contractual-data', table: 'Monthly returns' },
      { kind: 'who-may-open', screen: 'Submit a return' },
      { kind: 'who-may-open', screen: 'Client dashboard' },
    );
    says.push(
      'I have drafted a monthly returns app: a “Monthly returns” table, a form each contractor fills in, a dashboard over every return, a monthly schedule and an analysis prompt.',
      'Before it can be opened I need three answers from you. Does “Monthly returns” hold contractual data — will the client accept or reject each return? Who may open “Submit a return”? And who may open “Client dashboard”?',
    );
    return JSON.stringify({ say: says.join(' '), acts, asks, proposals });
  }

  // ── answers to questions asked in an EARLIER turn ─────────────────────────
  const sentences = said.split(/[.;!?]\s*/);
  for (const question of state.questionsStillOpen.filter((q) => q.alreadyAsked)) {
    if (question.kind === 'contractual-data') {
      // only a message that is ABOUT the question answers it — a "yes" to
      // something else is not a yes to this
      if (/\b(not contractual|working data)\b/.test(said)) {
        acts.push({ kind: 'answerContractualData', table: question.subjectId, holdsContractualData: false });
        says.push(`Recorded: “${question.subject}” is working data.`);
      } else if (/\bcontractual\b/.test(said)) {
        acts.push({ kind: 'answerContractualData', table: question.subjectId, holdsContractualData: true });
        says.push(`Recorded: “${question.subject}” holds contractual data.`);
      }
    }
    if (question.kind === 'who-may-open') {
      const sentence = sentences.find((line) => line.includes(question.subject.toLowerCase()));
      if (sentence === undefined) continue;
      if (/\bonly\b/.test(sentence)) {
        const named = state.organisationsTheAppIsOpenTo.filter((org) =>
          sentence.includes(org.name.toLowerCase()) || (org.projectOwner && /\bclient\b/.test(sentence)),
        );
        if (named.length > 0) {
          acts.push({ kind: 'answerWhoMayOpen', screen: question.subjectId, organisationIds: named.map((org) => org.id) });
          says.push(`Recorded: only ${named.map((org) => org.name).join(' and ')} may open “${question.subject}”.`);
        }
      } else if (/\b(everyone|all of them|every contractor)\b/.test(sentence)) {
        acts.push({ kind: 'answerWhoMayOpen', screen: question.subjectId, organisationIds: [] });
        says.push(`Recorded: everyone the app is open to may open “${question.subject}”.`);
      }
    }
  }

  // ── a change to the dashboard ─────────────────────────────────────────────
  const dashboard = state.screens.find((screen) => screen.label.toLowerCase().includes('dashboard'));
  if (/\bpie\b/.test(said) && dashboard !== undefined) {
    acts.push({
      kind: 'writeScreen',
      screen: dashboard.id,
      label: dashboard.label,
      table: dashboard.table ?? 'Monthly returns',
      layout: {
        ...DASHBOARD_LAYOUT,
        blocks: [
          ...DASHBOARD_LAYOUT.blocks.slice(0, 4),
          { kind: 'pieChart', label: 'Share of waste by month', categoryColumn: 'month', valueColumn: 'waste_tonnes' },
          DASHBOARD_LAYOUT.blocks[4],
        ],
      },
    });
    says.push(`I added a pie chart to “${dashboard.label}”.`);
  }

  // ── a removal is proposed first, and performed only once agreed ───────────
  const removal = /\bremove (?:the )?(.+?)(?: screen)?$/.exec(sentences.find((line) => /\bremove\b/.test(line)) ?? '');
  if (removal !== null) {
    const target = state.screens.find((screen) => screen.label.toLowerCase() === removal[1]!.trim());
    if (target !== undefined) {
      proposals.push({ kind: 'removeScreen', subject: target.id, summary: `Remove the screen “${target.label}”.` });
      says.push(`Shall I remove “${target.label}”? Say yes and I will.`);
    }
  }
  if (/^\s*yes\b/.test(said)) {
    for (const proposed of state.youProposedLastTurn.filter((p) => p.kind === 'removeScreen')) {
      acts.push({ kind: 'removeScreen', screen: proposed.subject });
      says.push('Removed, as you agreed.');
    }
  }

  // ── what the agent never does, and says so ────────────────────────────────
  if (/\b(publish|open it|share)\b/.test(said)) {
    proposals.push({ kind: 'publish', subject: null, summary: 'Open the app to its people, from the panel.' });
    says.push('Opening the app to people is yours to do — the button is beside this conversation, once every question has an answer.');
  }

  if (says.length === 0) says.push('Tell me what the app should do, and I will draft it.');
  return JSON.stringify({ say: says.join(' '), acts, asks, proposals });
}
