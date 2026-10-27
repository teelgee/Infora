/**
 * The invented Wrenfield world: every name, number and string that recurs
 * across clips (master-plan §5.5, plus the data tables in video-04 and
 * video-05). Clip engineers import from here instead of retyping values.
 * No real company, person or client appears anywhere.
 */

export const PROJECT = 'Wrenfield–Ashcombe 400kV Connection'; // en dash
export const DOC_REF = 'WA-EIA-MST-001'; // hyphens, everywhere
export const DOC_TITLE = 'EIA Scoping Method Statement — Land Quality';

export type OrgRole = 'client' | 'consultant' | 'supplier' | 'contractor';
export interface Org {
  name: string;
  short: string;
  role: OrgRole;
}

export const ORGS = {
  trentmoor: { name: 'Trentmoor Energy', short: 'Trentmoor', role: 'client' },
  calder: { name: 'Calder & Hale', short: 'Calder & Hale', role: 'consultant' },
  redgate: { name: 'Redgate Ecology', short: 'Redgate', role: 'consultant' },
  netherfold: { name: 'Netherfold Cabling', short: 'Netherfold', role: 'supplier' },
  ashcombe: { name: 'Ashcombe Civils', short: 'Ashcombe Civils', role: 'supplier' },
  plant: { name: 'Wrenfield Plant Hire', short: 'Wrenfield Plant Hire', role: 'supplier' },
  wrenbrook: { name: 'Wrenbrook Fencing & Reinstatement', short: 'Wrenbrook', role: 'supplier' },
} as const satisfies Record<string, Org>;

export const SUPPLIERS = [ORGS.netherfold, ORGS.ashcombe, ORGS.plant, ORGS.wrenbrook] as const;

export interface Person {
  name: string;
  first: string;
  initials: string;
  org: string;
  role: string;
  /** Role badge in the app's topbar. */
  seat: 'Owner' | 'Member';
  /** Shown under the name in the rail's user chip. */
  chipLine: string;
}

export const PEOPLE = {
  RACHEL: {
    name: 'Rachel Bowen',
    first: 'Rachel',
    initials: 'RB',
    org: 'Trentmoor Energy',
    role: 'lead reviewer',
    seat: 'Owner',
    chipLine: 'Trentmoor Energy — Owner',
  },
  ELEANOR: {
    name: 'Eleanor Price',
    first: 'Eleanor',
    initials: 'EP',
    org: 'Calder & Hale',
    role: 'lead author',
    seat: 'Member',
    chipLine: 'Calder & Hale — Consultant',
  },
  /**
   * Vision casting: cast here as package lead, Ashcombe Brook crossing.
   * The seed casts Owen as internal QA reviewer.
   */
  OWEN: {
    name: 'Owen Vance',
    first: 'Owen',
    initials: 'OV',
    org: 'Calder & Hale',
    role: 'package lead',
    seat: 'Member',
    chipLine: 'Calder & Hale — Consultant',
  },
  SAM: {
    name: 'Sam Kerridge',
    first: 'Sam',
    initials: 'SK',
    org: 'Netherfold Cabling',
    role: 'supplier',
    seat: 'Member',
    chipLine: 'Netherfold Cabling — Supplier',
  },
} as const satisfies Record<string, Person>;

// ---------------------------------------------------------------- library

export const LIB = {
  GIR: {
    ref: 'WA-GEO-GIR-004',
    title: 'Ground Investigation Interpretative Report',
    current: 'v2',
    superseded: { version: 'v1', on: '12 Aug 2026' },
  },
  BAS: {
    ref: 'WA-ENV-BAS-003',
    title: 'Environmental Baseline Compendium',
  },
} as const;

/**
 * Seed v2 excerpt (video-01). Only `hl` is ever sharp. Two hl spans: the
 * depth and the migration pathway, so both halves of DRAFT_SEGMENTS[2] are
 * visibly supported (review-final must-fix 3).
 */
export const GIR_PASSAGE: Array<{ text: string; hl?: boolean }> = [
  {
    text: 'Elevated concentrations of polycyclic aromatic hydrocarbons (PAHs) were recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg. A shallow ',
  },
  { text: 'perched water table was encountered at 1.6–2.1 m', hl: true },
  {
    text: ' within the made ground. Monitoring over three visits confirmed seasonal persistence. The perched horizon provides a plausible ',
  },
  { text: 'migration pathway toward the Ashcombe Brook', hl: true },
  { text: ' during construction dewatering.' },
];
export const GIR_LOCATOR = 'p. 14 · §4.3 Groundwater';
export const GIR_SUPERSEDED_LINE = 'v1 superseded 12 Aug — never used by the AI.';

// ---------------------------------------------------------------- clip 1

export const DRAFT_PROMPT = 'Draft section 2 from the accepted ground investigation and baseline reports.';

export const DRAFT_SEGMENTS: Array<{ text: string; source: string }> = [
  { text: 'Made ground reaches 2.4 m at Wrenfield Sidings.', source: LIB.GIR.ref },
  { text: 'PAHs were elevated in three of eleven trial pits.', source: LIB.GIR.ref },
  { text: 'Perched water at 1.6–2.1 m could migrate toward Ashcombe Brook.', source: LIB.GIR.ref },
  { text: 'Ashcombe Brook supports brown trout; its WFD status is Moderate.', source: LIB.BAS.ref },
  { text: 'Two residential receptors lie within 150 m, at Ashcombe Lane.', source: LIB.BAS.ref },
];
export const WITHHELD_LINE = '1 sentence withheld — no source supports it.';
export const SUGGESTION_TITLE = 'Suggestion ready · pending your decision';
export const ACCEPT_RECEIPT = 'Accepted · 5 sentences, each with its source';
export const DRAFT_TRACE = [
  { label: 'Retrieved sources', detail: '6 passages from WA-GEO-GIR-004 and WA-ENV-BAS-003' },
  { label: 'Ground-checked claims', detail: '5 supported · 1 withheld' },
  { label: 'Suggestion drafted', detail: 'Section 2 · 5 sentences' },
];

// ---------------------------------------------------------------- clip 2

export const QA = {
  requiredSpan: 'the PAH exceedances at three trial pits south of the Wrenfield substation',
  accuracyDefect: 'The record puts these PAH hotspots at Wrenfield Sidings.',
  accuracySuggested: 'the PAH exceedances in three trial pits at Wrenfield Sidings',
  styleDefect: 'This project says “the scheme”, not “the routewide works”.',
  styleFixLine: 'routewide works → scheme, 1 place',
  styleClause: '§2.1',
  fixButton: 'Fix 1 house-style wording',
  fixedButton: 'Fixed · 1 place',
  planRows: ['Read against 5 rules and the record', 'Check gaps and readability'],
} as const;

// ---------------------------------------------------------------- clip 3

/**
 * Shown in card order A, B, C, so the times run A < B < C (08:28, 08:34,
 * 08:41). UK date format, as everywhere else in the film.
 */
export const COMMENTS = {
  A: {
    author: 'Rachel Bowen',
    when: '2 Sep 2026, 08:28',
    quote: '“Asbestos in soils” — p.1',
    body: 'Confirm the screening frequency for parcels with made ground.',
  },
  C: {
    author: 'Rachel Bowen',
    when: '2 Sep 2026, 08:41',
    quote: '“Ground gas migration” — p.1',
    body: 'Say which parcels need ground gas monitoring, and for how long.',
  },
  B: {
    author: 'Rachel Bowen',
    when: '2 Sep 2026, 08:34',
    quote: '“Conceptual site model” — p.1',
    body: 'State the made ground depth for each parcel.',
  },
} as const;
export const REVIEW_STEPS = ['Submitted', 'In review', 'Responding', 'Complete'] as const;
export const WALL_NOTICE = 'Trentmoor is still reviewing. You’ll see every comment when they release them.';
export const RESPONSE_LINE = 'Done — section 3 now gives the depth for each parcel.';

// ---------------------------------------------------------------- builder

/** The seven plain step names (§4.9). */
export const STEPS = [
  'Who it’s for',
  'What gets collected',
  'Where the numbers come from',
  'What people see',
  'When it runs',
  'What it writes',
  'Check and open',
] as const;

export const BUILDER = {
  placeholder: 'Describe the app you want…',
  composer: 'Ask the agent, or tell it what to change…',
  panelTitle: 'The builder’s agent',
  draftBadge: 'Draft — not yet open to anyone',
} as const;

export const KPI_APP = {
  name: 'Supplier KPI returns',
  prompt: 'Monthly supplier KPI returns, with a dashboard and written summary.',
  phrases: [
    { id: 'p1', phrase: 'Monthly', step: 5 },
    { id: 'p2', phrase: 'supplier', step: 1 },
    { id: 'p3', phrase: 'KPI returns', step: 2 },
    { id: 'p4', phrase: 'a dashboard', step: 4 },
    { id: 'p5', phrase: 'written summary', step: 6 },
  ],
  summaries: [
    'Trentmoor Energy + 4 suppliers',
    'Monthly KPI returns, 8 columns, sign-off by Trentmoor',
    'None needed',
    'Dashboard: each organisation sees its own',
    'Every month, on the 1st',
    'Runs as Rachel Bowen, on 2 tables',
    'Open to 5 organisations',
  ],
  columns: ['Month', 'Deliveries due', 'Delivered on time', 'NCRs', 'Safety incidents', 'Carbon (tCO2e)', 'Local spend (£)', 'Notes'],
  q1: { text: 'Will payments depend on these numbers?', replies: ['Yes — Trentmoor signs off each return', 'No'], chosen: 0 },
  r1: '✓ Monthly return form, with sign-off',
  q2: { text: 'Who should see the dashboard?', replies: ['Trentmoor only', 'Everyone — each sees only their own'], chosen: 1 },
  r2: '✓ Dashboard: each organisation sees its own',
  u3: 'Flag any supplier under 90% on time.',
  a3: 'Done — added to the dashboard.',
  q3: { text: 'Run as you, Rachel, on these two tables only?', replies: ['Yes — only these', 'Change it'], chosen: 0 },
  r3: '✓ Runs as Rachel Bowen, on 2 tables',
  readBack: ['Open to Trentmoor and 4 suppliers', 'Suppliers submit; Trentmoor signs off', 'Runs monthly as Rachel, on these returns only'],
  publish: 'Open to 5 organisations',
  netherfoldNote: 'You see your own returns. Nothing else.',
} as const;

export const DECK_APP = {
  name: 'Monthly progress pack',
  prompt: 'Monthly deck from package leads’ commentary and our cost spreadsheet.',
  phrases: [
    { id: 'p1', phrase: 'Monthly', step: 5 },
    { id: 'p2', phrase: 'deck', step: 6 },
    { id: 'p3', phrase: 'package leads’', step: 1 },
    { id: 'p4', phrase: 'commentary', step: 2 },
    { id: 'p5', phrase: 'cost spreadsheet', step: 3 },
  ],
  summaries: [
    'Calder & Hale package leads',
    'Package commentary; Programme & cost figures; no sign-off',
    'Wrenfield–Ashcombe cost & programme.xlsx, read only',
    'Commentary screen: package leads',
    'Every month, on the 1st working day',
    'One slide per package, then a summary; runs as Eleanor Price on 2 tables',
    'Open to Calder & Hale',
  ],
  c1: 'Connect the spreadsheet so nobody retypes numbers.',
  file: {
    name: 'Wrenfield–Ashcombe cost & programme.xlsx',
    meta: 'In Calder & Hale — project sandbox · Sheet: Sep 2026 · 4 rows',
    button: 'Connect',
  },
  rm: '✓ 5 of 5 columns matched · read only',
  q1: { text: 'Will payments depend on this commentary?', replies: ['Yes', 'No — it’s working notes'], chosen: 1 },
  r2: '✓ Commentary screen: package leads only',
  q3: { text: 'Run as you, Eleanor, on these two tables only?', replies: ['Yes — only these', 'Change it'], chosen: 0 },
  r3: '✓ Runs as Eleanor Price, on 2 tables',
  readBack: ['Open to Calder & Hale package leads', 'Numbers from the cost spreadsheet, read only', 'Each deck lands as a draft for review'],
  publish: 'Open to Calder & Hale',
  homeTitle: 'Monthly progress pack',
  homeLabel: 'September 2026 · 4 of 4 packages written',
  generate: 'Generate September’s pack',
  savedStrip: 'Saved as a draft for review',
  download: 'Download PowerPoint',
  fileLabel: 'from cost & programme.xlsx',
  columnMap: [
    ['Package', 'Package'],
    ['Plan %', 'Planned % complete'],
    ['Act %', 'Actual % complete'],
    ['Budget (£k)', 'Budget £k'],
    ['Fcst (£k)', 'Forecast £k'],
  ],
} as const;

// ---------------------------------------------------------------- supplier KPIs (video-04)

export interface KpiRow {
  org: string;
  month: string;
  due: number;
  onTime: number;
  ncrs: number;
  safety: number;
  carbon: number;
  localSpend?: number;
}

export const SUPPLIER_KPI = {
  sep: [
    { org: 'Netherfold Cabling', month: 'Sep 2026', due: 28, onTime: 27, ncrs: 2, safety: 0, carbon: 61, localSpend: 84200 },
    { org: 'Ashcombe Civils', month: 'Sep 2026', due: 40, onTime: 34, ncrs: 3, safety: 1, carbon: 52, localSpend: 126500 },
    { org: 'Wrenfield Plant Hire', month: 'Sep 2026', due: 22, onTime: 21, ncrs: 1, safety: 0, carbon: 21, localSpend: 38900 },
    { org: 'Wrenbrook Fencing & Reinstatement', month: 'Sep 2026', due: 12, onTime: 11, ncrs: 0, safety: 0, carbon: 8, localSpend: 22400 },
  ] as KpiRow[],
  aug: [
    { org: 'Netherfold Cabling', month: 'Aug 2026', due: 26, onTime: 25, ncrs: 2, safety: 0, carbon: 64, localSpend: 79600 },
    { org: 'Ashcombe Civils', month: 'Aug 2026', due: 34, onTime: 31, ncrs: 3, safety: 0, carbon: 55, localSpend: 112300 },
    { org: 'Wrenfield Plant Hire', month: 'Aug 2026', due: 17, onTime: 16, ncrs: 1, safety: 0, carbon: 25, localSpend: 34600 },
    { org: 'Wrenbrook Fencing & Reinstatement', month: 'Aug 2026', due: 9, onTime: 9, ncrs: 0, safety: 0, carbon: 10, localSpend: 19500 },
  ] as KpiRow[],
  /** Walkthrough fill (walkthroughs master-plan §4.8): keeps every derived figure true. */
  jul: [
    { org: 'Netherfold Cabling', month: 'Jul 2026', due: 24, onTime: 24, ncrs: 1, safety: 0, carbon: 67, localSpend: 71300 },
    { org: 'Ashcombe Civils', month: 'Jul 2026', due: 32, onTime: 30, ncrs: 2, safety: 0, carbon: 56, localSpend: 104700 },
    { org: 'Wrenfield Plant Hire', month: 'Jul 2026', due: 16, onTime: 15, ncrs: 0, safety: 0, carbon: 29, localSpend: 31200 },
    { org: 'Wrenbrook Fencing & Reinstatement', month: 'Jul 2026', due: 8, onTime: 7, ncrs: 0, safety: 0, carbon: 11, localSpend: 16900 },
  ] as KpiRow[],
  jun: [
    { org: 'Netherfold Cabling', month: 'Jun 2026', due: 22, onTime: 21, ncrs: 1, safety: 0, carbon: 70, localSpend: 66800 },
    { org: 'Ashcombe Civils', month: 'Jun 2026', due: 30, onTime: 28, ncrs: 2, safety: 0, carbon: 58, localSpend: 98400 },
    { org: 'Wrenfield Plant Hire', month: 'Jun 2026', due: 15, onTime: 15, ncrs: 1, safety: 0, carbon: 31, localSpend: 29800 },
    { org: 'Wrenbrook Fencing & Reinstatement', month: 'Jun 2026', due: 6, onTime: 6, ncrs: 0, safety: 0, carbon: 12, localSpend: 14100 },
  ] as KpiRow[],
  /** All suppliers, Jun–Sep. */
  carbonByMonth: [
    { label: 'Jun', value: 171 },
    { label: 'Jul', value: 163 },
    { label: 'Aug', value: 154 },
    { label: 'Sep', value: 142 },
  ],
  carbonBySupplier: {
    'Netherfold Cabling': [70, 67, 64, 61],
    'Ashcombe Civils': [58, 56, 55, 52],
    'Wrenfield Plant Hire': [31, 29, 25, 21],
    'Wrenbrook Fencing & Reinstatement': [12, 11, 10, 8],
  } as Record<string, number[]>,
  netherfoldRows: [
    { org: 'Netherfold Cabling', month: 'Sep 2026', due: 28, onTime: 27, ncrs: 2, safety: 0, carbon: 61, localSpend: 84200 },
    { org: 'Netherfold Cabling', month: 'Aug 2026', due: 26, onTime: 25, ncrs: 2, safety: 0, carbon: 64, localSpend: 79600 },
    { org: 'Netherfold Cabling', month: 'Jul 2026', due: 24, onTime: 24, ncrs: 1, safety: 0, carbon: 67, localSpend: 71300 },
    { org: 'Netherfold Cabling', month: 'Jun 2026', due: 22, onTime: 21, ncrs: 1, safety: 0, carbon: 70, localSpend: 66800 },
  ] as KpiRow[],
} as const;

export const KPI_DERIVED = {
  sep: { onTime: 93, due: 102, pct: 91.2 },
  aug: { onTime: 81, due: 86, pct: 94.2 },
  carbon: { jun: 171, jul: 163, aug: 154, sep: 142, total: 630 },
  localSpendSep: 272000,
  netherfold: { onTime: 27, due: 28, carbon: 262, localSpend: 84200 },
  /** On time by supplier, Sep, rounded %. Ashcombe Civils is flagged. */
  onTimePctSep: [
    { label: 'Netherfold Cabling', short: 'Netherfold', value: 96 },
    { label: 'Ashcombe Civils', short: 'Ashcombe', value: 85 },
    { label: 'Wrenfield Plant Hire', short: 'Plant Hire', value: 95 },
    { label: 'Wrenbrook Fencing & Reinstatement', short: 'Wrenbrook', value: 92 },
  ],
  flagThreshold: 90,
} as const;

export const INSIGHT = {
  label: 'Written 1 Oct · from accepted returns only',
  meta: 'Run 1 Oct 2026, 02:00 · scheduled · acted as Rachel Bowen over 16 rows in Monthly KPI returns',
  sentences: [
    'September’s on-time delivery across four suppliers was 91%, down 3 points on August.',
    'Ashcombe Civils accounted for 6 of 9 late deliveries.',
    'Carbon fell 8% to 142 tCO2e.',
    'No supplier’s NCR count rose by more than 10%.',
  ],
  focal: 'Ashcombe Civils accounted for 6 of 9 late deliveries.',
} as const;

// ---------------------------------------------------------------- progress pack (video-05)

export type PackageStatus = 'On track' | 'At risk' | 'Behind';
export interface ProgrammeRow {
  pkg: string;
  short: string;
  planned: number;
  actual: number;
  budget: number;
  forecast: number;
  status: PackageStatus;
}

export const PROGRAMME = {
  rows: [
    { pkg: 'Cable route — Netherfold to Wrenfield', short: 'Cable route', planned: 46, actual: 44, budget: 18400, forecast: 18650, status: 'At risk' },
    { pkg: 'Wrenfield substation works', short: 'Substation', planned: 38, actual: 39, budget: 12200, forecast: 12050, status: 'On track' },
    { pkg: 'Ashcombe Brook crossing', short: 'Brook crossing', planned: 30, actual: 22, budget: 4800, forecast: 5260, status: 'Behind' },
    { pkg: 'Reinstatement', short: 'Reinstatement', planned: 5, actual: 4, budget: 2100, forecast: 2100, status: 'On track' },
  ] as ProgrammeRow[],
  totals: { budget: 37500, forecast: 38060, deltaPct: 1.5, line: '2 on track · 1 at risk · 1 behind' },
} as const;

export const COMMENTARY: Record<string, { progress: string; risk: string; decision: string }> = {
  'Cable route — Netherfold to Wrenfield': {
    progress: '4.2 km of 9.6 km of duct laid.',
    risk: 'Wet ground is slowing trenching near Netherfold.',
    decision: 'Agree the haul road crossing at Ashcombe Lane.',
  },
  'Wrenfield substation works': {
    progress: 'Bay foundations poured; steel erection started.',
    risk: 'Transformer delivery slot not yet confirmed.',
    decision: 'None this month.',
  },
  'Ashcombe Brook crossing': {
    progress: 'Launch pit complete. Drill rig mobilised.',
    risk: 'Perched water in the launch pit after heavy rain.',
    decision: 'Confirm night working for the pull-back.',
  },
  Reinstatement: {
    progress: 'Field drain survey complete on 3 of 11 parcels.',
    risk: 'Drain records are incomplete for the Netherfold parcels.',
    decision: 'None this month.',
  },
};

export const DECK_FOOTER = 'Data as at 30 Sep 2026 · Programme & cost figures, Package commentary';

export const DATES = {
  reviewTarget: '16 Sep 2026',
  accepted: '29 Sep 2026',
  insightRun: '1 Oct 2026, 02:00',
  dataAsAt: '30 Sep 2026',
} as const;

/** Every title-card line (§6), so copy is typed once. `*word*` marks the italic. */
export const CARDS = {
  hook: 'Generic AI *guesses*.',
  v01: { title: 'Drafts that show their *sources*.', mid: 'No source? It’s *withheld*.', end: 'Every claim, cited to the *page*.' },
  v02: { title: 'A second reader, *before* review.', mid: 'It shows *why*, then waits.', end: 'Catch it before your *client* does.' },
  v03: {
    title: 'One review. Each firm *walled*.',
    mid1: 'Comments arrive *together*.',
    mid2: 'Answered. Then *accepted*.',
    end: 'Only accepted work feeds the *AI*.',
  },
  v04: {
    title: 'Describe an app. Watch it *build*.',
    midA: 'Then just *ask* for changes.',
    midB: 'Open it from *either* side.',
    end: 'Same app. Different *seats*.',
  },
  v05: { title: 'Commentary in. A *deck* out.', mid: 'Their words. Your *numbers*.', end: 'Every month, a draft *deck*.' },
  close: ['Every answer from *your* record.', 'Every tool, built by *asking*.'],
  tagline: 'AI for infrastructure projects, behind the ethical wall',
} as const;

/** Montage chips (§3). */
export const MONTAGE_APPS = ['consent tracker', 'RFI log', 'carbon report'] as const;

// ---------------------------------------------------------------- dashboards (video-04)

export interface DashboardData {
  title: string;
  label: string;
  tiles: Array<{ label: string; value: string; sub?: string }>;
  bars: { title: string; data: Array<{ label: string; value: number; flagged?: boolean }>; max: number };
  line: { title: string; points: Array<{ label: string; value: number }> };
  donut: { title: string; data: Array<{ label: string; value: number }>; centre: string };
  /** Absent for a supplier seat: the insight names other suppliers. */
  insight?: { label: string; meta: string; sentences: readonly string[]; focal: string };
  table: { title: string; rows: Array<{ org: string; due: number; onTime: number; ncrs: number; safety: number; carbon: number; state: string }> };
}

const TILE_LABELS = ['On time · Sep 2026', 'Carbon · since June', 'Local spend · Sep 2026'] as const;
const CARBON_SUB = '4 months · accepted returns only';

export const DASHBOARD: Record<'client' | 'supplier', DashboardData> = {
  client: {
    title: 'Supplier KPI dashboard',
    label: 'October 2026 · accepted returns only',
    tiles: [
      { label: TILE_LABELS[0], value: '93 of 102' },
      { label: TILE_LABELS[1], value: '630 tCO2e', sub: CARBON_SUB },
      { label: TILE_LABELS[2], value: '£272,000' },
    ],
    bars: {
      title: 'On time by supplier · Sep 2026, %',
      max: 100,
      data: KPI_DERIVED.onTimePctSep.map((d) => ({ label: d.short, value: d.value, flagged: d.value < KPI_DERIVED.flagThreshold })),
    },
    line: { title: 'Carbon by month, tCO2e', points: [...SUPPLIER_KPI.carbonByMonth] },
    donut: {
      title: 'Local spend by supplier · Sep 2026',
      data: SUPPLIER_KPI.sep.map((r) => ({ label: r.org, value: r.localSpend ?? 0 })),
      centre: '£272k',
    },
    insight: INSIGHT,
    table: {
      title: 'All returns · September 2026',
      rows: SUPPLIER_KPI.sep.map((r) => ({ org: r.org, due: r.due, onTime: r.onTime, ncrs: r.ncrs, safety: r.safety, carbon: r.carbon, state: 'Accepted' })),
    },
  },
  supplier: {
    title: 'Supplier KPI dashboard',
    label: 'October 2026 · accepted returns only',
    tiles: [
      { label: TILE_LABELS[0], value: '27 of 28' },
      { label: TILE_LABELS[1], value: '262 tCO2e', sub: CARBON_SUB },
      { label: TILE_LABELS[2], value: '£84,200' },
    ],
    bars: { title: 'On time by supplier · Sep 2026, %', max: 100, data: [{ label: 'Netherfold', value: 96 }] },
    line: {
      title: 'Carbon by month, tCO2e',
      points: ['Jun', 'Jul', 'Aug', 'Sep'].map((m, i) => ({ label: m, value: SUPPLIER_KPI.carbonBySupplier['Netherfold Cabling'][i] })),
    },
    donut: { title: 'Local spend by supplier · Sep 2026', data: [{ label: 'Netherfold Cabling', value: 84200 }], centre: '£84k' },
    table: {
      title: 'Your returns',
      rows: SUPPLIER_KPI.netherfoldRows.map((r) => ({ org: r.month, due: r.due, onTime: r.onTime, ncrs: r.ncrs, safety: r.safety, carbon: r.carbon, state: 'Accepted' })),
    },
  },
};

// ================================================================ walkthroughs (v2)
//
// Everything below is for the four pillar walkthroughs
// (demo/plans/master-plan.md §4.9). The first set's exports above
// stay untouched; where they disagree with the built product (COMMENTS,
// WALL_NOTICE, RESPONSE_LINE, STEPS, KPI_APP.q1–q3, GIR_LOCATOR, DATES), use
// these instead (master plan §0, ruling 7).
//
// Punctuation: product UI keeps the built em dashes; the project name keeps its
// en dash; dates use the built US order (`Sep 02, 2026`). Captions, titles and
// narration use hyphens — those live in WT_TITLES and the per-video plans.

export interface WtPerson {
  name: string;
  first: string;
  initials: string;
  org: string;
  /** The role this person plays in the story (never shown in the UI). */
  role: string;
  /** Topbar role badge. */
  badge: 'Owner' | 'Member';
  /** Owner seats run the org line together: `Trentmoor Energy All projects ▸`. */
  owner: boolean;
  /** The rail user chip's second line. */
  chipLine: string;
  /** Overlay colour for caption seat tags (never inside recreated UI). */
  seatColour: string;
}

const SEAT = { trentmoor: '#159a74', calder: '#6d5dd3', qa: '#b8622f', redgate: '#3a6ea5', supplier: '#8a6d3b' } as const;

export const WT_PEOPLE = {
  RACHEL: {
    name: 'Rachel Bowen', first: 'Rachel', initials: 'RB', org: 'Trentmoor Energy', role: 'lead reviewer',
    badge: 'Owner', owner: true, chipLine: 'Trentmoor Energy — Owner', seatColour: SEAT.trentmoor,
  },
  ELEANOR: {
    name: 'Eleanor Price', first: 'Eleanor', initials: 'EP', org: 'Calder & Hale', role: 'lead author',
    badge: 'Member', owner: false, chipLine: 'Calder & Hale — Consultant', seatColour: SEAT.calder,
  },
  OWEN: {
    name: 'Owen Vance', first: 'Owen', initials: 'OV', org: 'Calder & Hale', role: 'internal QA reviewer',
    badge: 'Member', owner: false, chipLine: 'Calder & Hale — Consultant', seatColour: SEAT.qa,
  },
  NADIA: {
    name: 'Nadia Okonjo', first: 'Nadia', initials: 'NO', org: 'Redgate Ecology', role: 'ecologist, co-author',
    badge: 'Member', owner: false, chipLine: 'Redgate Ecology — Consultant', seatColour: SEAT.redgate,
  },
  SAM: {
    name: 'Sam Kerridge', first: 'Sam', initials: 'SK', org: 'Netherfold Cabling', role: 'supplier contact',
    badge: 'Member', owner: false, chipLine: 'Netherfold Cabling — Contractor', seatColour: SEAT.supplier,
  },
  DAN_FERRIS: {
    name: 'Dan Ferris', first: 'Dan', initials: 'DF', org: 'Ashcombe Civils', role: 'supplier contact',
    badge: 'Member', owner: false, chipLine: 'Ashcombe Civils — Contractor', seatColour: SEAT.supplier,
  },
  LEAH_MORROW: {
    name: 'Leah Morrow', first: 'Leah', initials: 'LM', org: 'Wrenfield Plant Hire', role: 'supplier contact',
    badge: 'Member', owner: false, chipLine: 'Wrenfield Plant Hire — Contractor', seatColour: SEAT.supplier,
  },
  JOE_PELLOW: {
    name: 'Joe Pellow', first: 'Joe', initials: 'JP', org: 'Wrenbrook Fencing & Reinstatement', role: 'supplier contact',
    badge: 'Member', owner: false, chipLine: 'Wrenbrook Fencing & Reinstatement — Contractor', seatColour: SEAT.supplier,
  },
} as const satisfies Record<string, WtPerson>;
export type WtPersonKey = keyof typeof WT_PEOPLE;

/** The six member organisations (sandbox wizard step 2, video 3). Halvern Associates is never a member. */
export const WT_MEMBER_ORGS = [
  'Calder & Hale',
  'Redgate Ecology',
  'Netherfold Cabling',
  'Ashcombe Civils',
  'Wrenfield Plant Hire',
  'Wrenbrook Fencing & Reinstatement',
] as const;

// ---------------------------------------------------------------- library (§4.3)

export interface WtLibDoc {
  ref: string;
  title: string;
  rev: string;
  kind: 'deliverable' | 'reference';
  state: 'live' | 'reference' | 'withdrawn';
  /** Held by (reference material) or producer (deliverables). */
  heldBy: string;
  /** Column label for `date`: deliverables are Issued, references Loaded. */
  dateLabel: 'Issued' | 'Loaded' | null;
  date: string | null;
  suitability?: string;
  discipline?: string;
  description: string;
  /** Verbatim seed passage (live revision). */
  passage: string;
  note?: string;
}

export const WT_LIB = {
  MST: {
    ref: 'WA-EIA-MST-001', title: 'EIA Scoping Method Statement — Land Quality', rev: 'C01', kind: 'deliverable', state: 'live',
    heldBy: 'Calder & Hale', dateLabel: 'Issued', date: 'Sep 29, 2026', suitability: 'S2', discipline: 'EEN',
    description: 'The accepted land quality scoping method statement for the corridor.',
    passage: '',
    note: 'Accepted A1 on Sep 29, 2026; C01 issued on acceptance. The library row keeps its built suitability pill ● S2 (master plan §0 ruling 1).',
  },
  PEA: {
    ref: 'WA-ECO-PEA-001', title: 'Preliminary Ecological Appraisal', rev: 'v1', kind: 'deliverable', state: 'live',
    heldBy: 'Redgate Ecology', dateLabel: 'Issued', date: 'Sep 08, 2026', suitability: '—', discipline: '—',
    description: 'Redgate’s preliminary ecological appraisal of the corridor — habitats, protected species and the survey work still outstanding.',
    passage:
      'Extended Phase 1 habitat survey of the order limits recorded species-poor semi-improved grassland, defunct hedgerow along Ashcombe Lane, and a small area of wet woodland adjoining the brook. Great crested newt eDNA returned negative at both ponds. Badger activity was recorded at two setts outside the working corridor.',
    note: 'Not shared with Calder & Hale: never on Eleanor’s screens. Never show the seed’s last sentence (a test marker).',
  },
  SCC: {
    ref: 'WA-CON-SCC-002', title: 'Statement of Community Consultation', rev: 'v1', kind: 'reference', state: 'reference',
    heldBy: 'Trentmoor Energy', dateLabel: 'Loaded', date: 'Sep 01, 2026',
    description: 'How the community was consulted, when, and what they said — the record the routeing refinement was justified against.',
    passage:
      'Two rounds of statutory consultation were held (October 2025, March 2026) with parish councils at Wrenfield, Ashcombe and Netherfold. Principal themes raised: construction traffic on Ashcombe Lane, protection of the brook corridor, and reinstatement of field drainage. Responses informed the routeing refinement adopted in the Preferred Corridor Report.',
  },
  SCP: {
    ref: 'WA-EIA-SCP-001', title: 'EIA Scoping Report', rev: 'v1', kind: 'reference', state: 'reference',
    heldBy: 'Trentmoor Energy', dateLabel: 'Loaded', date: 'Sep 01, 2026',
    description: 'Sets out what the Environmental Impact Assessment will and will not cover, and the register and structure every chapter is written to.',
    passage:
      'The Environmental Impact Assessment will address land quality, water environment, ecology, landscape and visual, noise, traffic and transport, and cultural heritage. For land quality, the assessment scope includes ground contamination associated with Wrenfield Sidings and the Ashcombe depot, and pollutant linkages to controlled waters. Scoping statements follow the project style: define the study area, summarise the baseline, identify receptors, state the assessment methodology, and set out mitigation principles. Chapters use formal register, cite project sources by document reference, and avoid cost or programme commitments.',
  },
  BAS: {
    ref: 'WA-ENV-BAS-003', title: 'Environmental Baseline Compendium', rev: 'v3', kind: 'reference', state: 'reference',
    heldBy: 'Trentmoor Energy', dateLabel: 'Loaded', date: 'Sep 01, 2026',
    description: 'The environmental baseline for the corridor — the existing conditions every assessment chapter measures its effects against.',
    passage:
      'The study area comprises predominantly arable agricultural land crossed by the Ashcombe Brook, with two former industrial sites: Wrenfield Sidings (railway land, ceased 1968) and the Ashcombe depot (plant maintenance, ceased 1994). Historical landfill (Wrenfield East, closed 1979, inert and commercial waste) is recorded east of the order limits within 250 m of the proposed cable corridor (Figure 4). The Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive (Table 9). Two residential receptors lie within 150 m of the corridor at Ashcombe Lane. Baseline dust deposition and groundwater quality monitoring commenced March 2026 and continues quarterly.',
  },
  GIR: {
    ref: 'WA-GEO-GIR-004', title: 'Ground Investigation Interpretative Report', rev: 'v2', kind: 'reference', state: 'reference',
    heldBy: 'Trentmoor Energy', dateLabel: 'Loaded', date: 'Sep 01, 2026',
    description: 'Interprets the ground investigation at Wrenfield Sidings: what the made ground is, what contamination was found in it, and what the perched water means for construction dewatering.',
    passage:
      'Intrusive investigation across the Wrenfield Sidings compound identified made ground to a depth of 2.4 m, comprising ash, clinker and demolition fill over glacial till. Elevated concentrations of polycyclic aromatic hydrocarbons (PAHs) were recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg. A shallow perched water table was encountered at 1.6–2.1 m within the made ground. Monitoring over three visits confirmed seasonal persistence. The perched horizon provides a plausible migration pathway toward the Ashcombe Brook during construction dewatering. Asbestos screening returned no detectable fibres. Recommendations: construction-phase watching brief, targeted remediation of the three PAH hotspots, and a dewatering management plan.',
    note: 'v1 superseded Sep 01, 2026 (WT_GIR_V1).',
  },
  FRA: {
    ref: 'WA-WAT-FRA-001', title: 'Flood Risk Assessment — Screening Note', rev: 'v1', kind: 'reference', state: 'reference',
    heldBy: 'Trentmoor Energy', dateLabel: 'Loaded', date: 'Sep 01, 2026',
    description: 'The flood risk assessment for the corridor, including the Ashcombe Brook crossing and how surface water leaving the compounds is managed.',
    passage:
      'The cable corridor crosses Flood Zone 2 for 380 m either side of the Ashcombe Brook. Trenchless crossing is proposed beneath the watercourse, with launch and reception pits located outside Flood Zone 3. Surface water flow paths follow field drains toward the brook; construction compounds are sited on ground above the 1 in 100 year plus climate change level. A drainage strategy will manage runoff from the Wrenfield Sidings compound, where made ground limits infiltration.',
  },
  HER: {
    ref: 'WA-HER-DBA-002', title: 'Heritage Desk-Based Assessment', rev: 'v1', kind: 'reference', state: 'withdrawn',
    heldBy: 'Trentmoor Energy', dateLabel: null, date: null,
    description: 'The original heritage desk-based assessment. Withdrawn: its methodology was superseded, and it must not be relied on.',
    passage: '',
    note: 'Withdrawn — never shown, and in no seat’s sources.',
  },
} as const satisfies Record<string, WtLibDoc>;
export type WtLibKey = keyof typeof WT_LIB;

/** Library page order as built (`26-library.png`). */
export const WT_LIB_ORDER = {
  deliverables: ['PEA', 'MST'] as WtLibKey[],
  references: ['SCC', 'SCP', 'BAS', 'GIR', 'FRA'] as WtLibKey[],
};

/** What each seat may draw on (Ask's `▤ N sources` chip). */
export const WT_REACH = {
  ELEANOR: ['MST', 'SCC', 'SCP', 'BAS', 'GIR', 'FRA'] as WtLibKey[], // ▤ 6 sources
  RACHEL: ['MST', 'PEA', 'SCC', 'SCP', 'BAS', 'GIR', 'FRA'] as WtLibKey[], // ▤ 7 sources
};

export const WT_GIR_V1 = {
  rev: 'v1',
  supersededOn: 'Sep 01, 2026',
  passage:
    'Preliminary trial pitting at Wrenfield Sidings identified made ground to 1.1 m. No contamination exceedances were recorded in the four pits completed at the time of issue. Groundwater was not encountered.',
  strip: [
    { rev: 'v2', label: 'v2 · Live · used for AI answers', live: true },
    { rev: 'v1', label: 'v1 · Superseded Sep 01, 2026 · not used for AI answers', live: false },
  ],
} as const;

/** The cited span of WT_LIB.GIR's passage (video 2, sources chapter), split for a highlight. */
export const WT_GIR_HL: Array<{ text: string; hl?: boolean }> = [
  { text: 'Intrusive investigation across the Wrenfield Sidings compound identified made ground to a depth of 2.4 m, comprising ash, clinker and demolition fill over glacial till. Elevated concentrations of polycyclic aromatic hydrocarbons (PAHs) were recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg. ' },
  { text: 'A shallow perched water table was encountered at 1.6–2.1 m within the made ground. Monitoring over three visits confirmed seasonal persistence. The perched horizon provides a plausible migration pathway toward the Ashcombe Brook during construction dewatering.', hl: true },
  { text: ' Asbestos screening returned no detectable fibres. Recommendations: construction-phase watching brief, targeted remediation of the three PAH hotspots, and a dewatering management plan.' },
];

/** Source panel locator: page only, never a section (sections are not built). */
export const WT_LOCATOR = 'Cited passage · page 14';

// ---------------------------------------------------------------- dates (§4.4)

/** Product-UI date strings (US order, as built). "Today" is Mon Oct 05, 2026. */
export const WT_DATES = {
  today: 'Oct 05, 2026',
  referencesLoaded: 'Sep 01, 2026',
  draftWritten: 'Sep 01, 2026',
  frozen: 'Sep 02, 2026, 08:10 AM',
  owenComment: 'Sep 02, 2026, 08:14 AM',
  owenResponse: 'Sep 02, 2026, 08:18 AM',
  owenAccepted: 'Sep 02, 2026, 08:20 AM',
  p01Promoted: 'Sep 02, 2026, 08:27 AM',
  round1Target: 'Sep 16, 2026',
  round1Opened: 'Sep 03, 2026, 09:05 AM',
  round1OpenMeta: 'Sep 16, 2026 — 13 days left',
  pea: 'Sep 08, 2026',
  comment1: 'Sep 10, 2026, 10:12 AM',
  comment2: 'Sep 10, 2026, 10:19 AM',
  comment3: 'Sep 10, 2026, 10:31 AM',
  commentsMeta: 'Sep 16, 2026 — 6 days left',
  round1Issued: 'Sep 10, 2026, 04:40 PM',
  response1: 'Sep 14, 2026, 09:30 AM',
  response2: 'Sep 14, 2026, 09:41 AM',
  response3: 'Sep 14, 2026, 09:52 AM',
  p02Accepted: 'Sep 17, 2026, 11:15 AM',
  round2Target: 'Oct 01, 2026',
  round2Acknowledged: 'Sep 18, 2026, 08:50 AM',
  accepted: 'Sep 29, 2026, 03:20 PM',
  acceptedDay: 'Sep 29, 2026',
  supplierAccepts: 'Oct 01, 2026',
  sandboxCreated: 'Oct 02, 2026, 10:15 AM',
  docCreated: 'Oct 02, 2026',
  nadiaComment: 'Oct 02, 2026, 10:58 AM',
  eleanorReply: 'Oct 02, 2026, 11:05 AM',
  resolved: 'Oct 02, 2026, 11:06 AM',
  qaCheck: 'Oct 05, 2026, 09:40 AM',
  creatorRun: 'Oct 05, 2026, 10:05 AM',
  askAt: 'Oct 05, 2026, 02:10 PM',
  samSubmits: 'Oct 05, 2026, 11:02 AM',
  rachelAccepts: 'Oct 05, 2026, 11:20 AM',
  analysisRun: 'Oct 05, 2026, 11:24 AM',
  samDraftSaved: '10:58 AM',
  // W1 day-only and countdown strings
  round1Days14: 'Sep 16, 2026 — 14 days left',
  round2Meta: 'Oct 01, 2026 — 2 days left',
  round1Acknowledged: 'Sep 03, 2026',
  round1IssuedDay: 'Sep 10, 2026',
  responsesDay: 'Sep 14, 2026',
  round2AckDay: 'Sep 18, 2026',
} as const;

// ---------------------------------------------------------------- plan (`02-plan.png`)

export interface WtPlanRow {
  ref: string;
  title: string;
  discipline: string;
  suitability: string;
  security: string;
  status: 'Planned' | 'In production';
  revision: string;
  verdict: string;
}

export const WT_PLAN_ROWS: WtPlanRow[] = [
  { ref: 'WA-DRN-SUR-001', title: 'Surface Water Drainage Strategy', discipline: 'EDR', suitability: 'S1', security: 'OFFICIAL', status: 'Planned', revision: '–', verdict: '—' },
  { ref: 'WA-EIA-MST-001', title: 'EIA Scoping Method Statement — Land Quality', discipline: 'EEN', suitability: 'S2', security: 'OFFICIAL', status: 'In production', revision: '–', verdict: '—' },
  { ref: 'WA-EIA-MST-002', title: 'EIA Scoping Method Statement — Ecology', discipline: 'EEN', suitability: 'S1', security: 'OFFICIAL', status: 'Planned', revision: '–', verdict: '—' },
  { ref: 'WA-GEO-GIR-005', title: 'Factual Ground Investigation Report — Phase 3', discipline: 'EGE', suitability: 'S2', security: 'OFFICIAL', status: 'Planned', revision: '–', verdict: '—' },
  { ref: 'WA-GEO-IRP-001', title: 'Interpretative Ground Investigation Report', discipline: 'EGE', suitability: 'S1', security: 'OFFICIAL', status: 'Planned', revision: '–', verdict: '—' },
];

export const WT_PLAN_PAGE = {
  title: 'Deliverable plan',
  pill: 'TIDP',
  sub: 'Your organisation’s planned deliverables. Add a deliverable to reserve a coded container; draft it in the sandbox, then bind and promote.',
  search: 'Search reference or title',
  actions: ['Coding scheme', 'Columns', 'Import from Excel'],
  primary: 'New deliverable',
  columns: ['Reference', 'Title', 'Role / Discipline', 'Suitability code', 'Security classification', 'Status', 'Revision', 'Verdict'],
} as const;

export const WT_LIB_PAGE = {
  title: 'Project library',
  sub: 'The governed corpus. Superseded and withdrawn documents leave this list and stand as records on the plan. What the AI grounds on is narrower still: a deliverable accepted under a code this project does not rely on stays here, badged, and out of reach.',
  liveLabel: 'Live deliverables',
  liveColumns: ['Reference', 'Title', 'Revision', 'Suitability', 'Discipline', 'Producer', 'Issued'],
  refLabel: 'Reference material',
  refSub: 'Received, not produced here — loaded into the library so the AI can ground and cite on it. These carry no plan row and no review history.',
  refColumns: ['Reference', 'Revision', 'Held by', 'Loaded'],
  ownerActions: ['Open', 'Transmit', 'Issue externally…', 'Supersede…', 'Withdraw'],
} as const;

// ---------------------------------------------------------------- W1 review (§4.5)

export const WT_DOC = {
  ref: 'WA-EIA-MST-001',
  title: 'EIA Scoping Method Statement — Land Quality',
  workingTitle: 'Land Quality scoping method statement — working draft',
  producer: 'Calder & Hale',
  discipline: 'EEN',
  suitability: 'S2',
  security: 'OFFICIAL',
  format: 'DOCX',
  revisions: ['v0.1', 'P01', 'P02', 'C01'],
  draftRow: 'Infora text · Sep 01, 2026',
  location: 'Calder & Hale — project sandbox',
  boundBanner: 'Bound to WA-EIA-MST-001.',
} as const;

/** The acceptance scheme (`packages/db/src/acceptance-code-seed.ts`). A1 is the only accepting code. */
export const WT_CODES = [
  { code: 'S0', label: 'Work in progress — not yet suitable to share outside the task team', isAccepting: false },
  { code: 'S1', label: 'Shared — suitable for coordination', isAccepting: false },
  { code: 'S2', label: 'Shared — suitable for information', isAccepting: false },
  { code: 'S3', label: 'Shared — suitable for review and comment', isAccepting: false },
  { code: 'S4', label: 'Shared — submitted for lead appointed party authorization', isAccepting: false },
  { code: 'S5', label: 'Shared — submitted for appointing party review and acceptance', isAccepting: false },
  { code: 'A1', label: 'Published — authorized and accepted', isAccepting: true },
] as const;

export const WT_REVIEW = {
  owenComment: {
    author: 'Owen Vance', when: WT_DATES.owenComment, code: 'S0' as const,
    quote: '“Phase 2 Ground Investigation” — p.1', anchor: 'Phase 2 Ground Investigation',
    body: 'Cite the GIR by its accepted revision, not just its number — the client checks it against the library, and this goes out under our name.',
    response: { by: 'Eleanor Price', when: WT_DATES.owenResponse, text: 'Now cites WA-GEO-GIR-004 v2, the accepted revision, throughout.', passage: '(WA-GEO-GIR-004 v2)' },
  },
  comments: [
    {
      author: 'Rachel Bowen', when: WT_DATES.comment1, code: 'S0' as const, quote: '“Conceptual site model” — p.1', anchor: 'Conceptual site model',
      // Typed on camera (83 characters, a typed hyphen as people type).
      body: 'State made-ground thickness per parcel - the perched water table makes it material.',
      typed: true,
    },
    {
      author: 'Rachel Bowen', when: WT_DATES.comment2, code: 'S0' as const, quote: '“Asbestos in soils” — p.1', anchor: 'Asbestos in soils',
      body: 'State the CAR-SOIL screening threshold you will apply; "in line with guidance" is not auditable.',
      typed: false,
    },
    {
      author: 'Rachel Bowen', when: WT_DATES.comment3, code: null, quote: '“route section” — p.1', anchor: 'route section',
      body: 'Consider reporting by parcel rather than by route section for the appendix tables.',
      typed: false,
    },
  ],
  responses: [
    {
      by: 'Eleanor Price', when: WT_DATES.response1, typed: true,
      text: 'Made-ground thickness is now tabulated per parcel in the CSM table, from the GIR.',
      passage: 'Made-ground thickness is tabulated per parcel in the CSM table',
    },
    {
      by: 'Eleanor Price', when: WT_DATES.response2, typed: false,
      text: 'The screening threshold is now stated per parcel in Appendix LQ-2.',
      passage: 'the screening threshold is stated per parcel in Appendix LQ-2',
    },
    {
      by: 'Eleanor Price', when: WT_DATES.response3, typed: false,
      text: 'Route-section reporting is retained: the CoCP and the DCO both reference route sections, and parcel tables sit in the appendix already.',
      noChange: 'reporting structure follows the DCO — parcel detail already in the appendix',
    },
  ],
  answeredLine: (n: number) => `${n} of 3 comments answered`,
  internalAnsweredLine: '1 of 1 comment answered',
  recordSubtitle: 'EIA Scoping Method Statement — Land Quality · 2 rounds · 3 comments · 3 answered',
  wallNotice:
    'The round is open. Its comments are withheld until the lead reviewer closes the round and issues it — reviewer-side positioning is never live to the authoring side.',
  verdicts: {
    S0: 'S0 — Work in progress — not yet suitable to share outside the task team',
    A1: 'A1 — Published — authorized and accepted',
  },
  buttons: { issue: 'Issue for revision', accept: 'Accept & publish', close: 'Close & issue the round', comment: 'Comment' },
  steps: ['Submitted', 'In review', 'Responding', 'Complete'] as const,
  composerPlaceholder: 'Add a review comment…',
  pageHint: 'Select text on the page to quote it, or click to drop a point — then write the comment alongside.',
  accepted: { status: 'Accepted', current: 'C01 — issued on acceptance' },
} as const;

/**
 * The method statement's text by version (W1 §4.12). The editor shows it in
 * Source Serif 4, the PDF rendition in the sans face. §2 reads "in three trial
 * pits at Wrenfield Sidings" in every version. W4's working copy is a different,
 * older document and must NOT read from here.
 */
const MST_COMMON = {
  title: 'EIA Scoping Method Statement - Land Quality',
  subtitle: 'Routewide, Wrenfield-Ashcombe 400kV Connection',
  s1: 'This method statement sets out the approach to scoping the Land Quality chapter of the Environmental Impact Assessment for the scheme. It draws on the accepted ground investigation and contamination records held in the project library and identifies the assessment framework for land contamination, soils and geology along the route corridor.',
  s2: (gir: string) =>
    `The desk study draws on the Phase 2 Ground Investigation Report (${gir}), the Environmental Baseline Report (WA-ENV-BAS-003) and the Flood Risk Assessment (WA-WAT-FRA-001). The GIR records PAH exceedances in three trial pits at Wrenfield Sidings and a perched water table within the made ground west of Ashcombe Lane.`,
  s3: 'A conceptual site model has been prepared for each land parcel crossed by the route. Sources considered include historic landfill, agricultural fuel storage and made ground associated with the former works. Pathways assessed are direct contact, leaching to controlled waters and ground gas migration. Receptors are construction workers, future maintenance staff, adjacent residents and the underlying secondary aquifer.',
  s4: 'Significance will be assessed following the Land Contamination Risk Management (LCRM) framework. Where the preliminary risk assessment identifies a potentially unacceptable risk, a remediation options appraisal will be scoped for the affected parcel. Asbestos in soils will be screened at every parcel with made ground, in line with CAR-SOIL guidance.',
  s5: 'The chapter will report by route section, with parcel-level findings tabulated in an appendix. Mitigation will be secured through the CoCP and parcel-specific remediation statements where the options appraisal requires them.',
};
type MstSection = { heading: string; text: string };
const mst = (gir: string, s3: string, s4: string): MstSection[] => [
  { heading: '', text: `${MST_COMMON.title}\n${MST_COMMON.subtitle}` },
  { heading: '1. Purpose and scope', text: MST_COMMON.s1 },
  { heading: '2. Baseline sources', text: MST_COMMON.s2(gir) },
  { heading: '3. Conceptual site model', text: s3 },
  { heading: '4. Assessment methodology', text: s4 },
  { heading: '5. Reporting', text: MST_COMMON.s5 },
];
export const WT_MST_TEXT = {
  v01: mst('WA-GEO-GIR-004', MST_COMMON.s3, MST_COMMON.s4),
  p01: mst('WA-GEO-GIR-004 v2', MST_COMMON.s3, MST_COMMON.s4),
  p02: mst(
    'WA-GEO-GIR-004 v2',
    `${MST_COMMON.s3} Made-ground thickness is tabulated per parcel in the CSM table, reaching 2.4 m at Wrenfield Sidings (WA-GEO-GIR-004 v2).`,
    'Significance will be assessed following the Land Contamination Risk Management (LCRM) framework, applying the tiered approach in LCRM Stage 1 before any intrusive scoping. Where the preliminary risk assessment identifies a potentially unacceptable risk, a remediation options appraisal will be scoped for the affected parcel and reported against BS 10175. Asbestos in soils will be screened at every parcel with made ground; the screening threshold is stated per parcel in Appendix LQ-2.',
  ),
  /** The PDF rendition's first line (DEV E-10). */
  pdfFirstLine: 'EIA Scoping Method Statement — Land Quality',
  /** PdfPage anchor spans. */
  anchors: ['Phase 2 Ground Investigation', 'Conceptual site model', 'Asbestos in soils', 'route section'],
};

// ---------------------------------------------------------------- W2 Ask (§4.6, W2 §4.10)

export interface WtClaim {
  text: string;
  refs: string[];
}

const SHARED_3_BAS = { text: 'Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive.', refs: ['WA-ENV-BAS-003'] };
const SHARED_3_GIR = { text: 'The brook is also a receptor for the made ground: the perched water is a plausible pathway toward it during construction dewatering.', refs: ['WA-GEO-GIR-004'] };

/**
 * The document creator's sources, grouped by the ontology (VISION). ONE value,
 * used by W2 (chapter 3) and W4 (Workflow): Eleanor's six-document scope, no PEA.
 */
export const WT_CREATOR_SOURCES = {
  relatedLabel: 'Related in the project ontology',
  otherLabel: 'Other library documents',
  related: [
    { ref: 'WA-GEO-GIR-004', why: 'A source of the accepted method statement' },
    { ref: 'WA-ENV-BAS-003', why: 'A source of the accepted method statement' },
    { ref: 'WA-EIA-MST-001', why: 'Same work package' },
    { ref: 'WA-EIA-SCP-001', why: 'Sets the land quality scope' },
  ],
  other: ['WA-CON-SCC-002', 'WA-WAT-FRA-001'],
  ticked: ['WA-GEO-GIR-004', 'WA-ENV-BAS-003'],
};

export const WT_ASK = {
  q1: 'What did the GI find at Wrenfield Sidings, and what does it mean for dewatering near the brook?',
  q3: 'What ecological receptors are recorded along Ashcombe Brook?',
  lens: 'Planning & Environmental',
  header: 'Conversation bound to Wrenfield–Ashcombe 400kV Connection',
  groundedPill: 'Grounded & cited',
  placeholder: 'Ask about the project',
  sourcesChip: { ELEANOR: '▤ 6 sources', RACHEL: '▤ 7 sources' },
  agentLabel: 'Infora agent',
  working: 'Working…',
  answer1: [
    { text: 'The land quality scope covers ground contamination at Wrenfield Sidings and the Ashcombe depot, and pollutant linkages to controlled waters.', refs: ['WA-EIA-SCP-001'] },
    { text: 'At Wrenfield Sidings, made ground reaches 2.4 m — ash, clinker and demolition fill over glacial till.', refs: ['WA-GEO-GIR-004'] },
    { text: 'PAHs were elevated in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg.', refs: ['WA-GEO-GIR-004'] },
    { text: 'A perched water table sits at 1.6–2.1 m within the made ground, persisted over three monitoring visits, and is a plausible migration pathway toward Ashcombe Brook during construction dewatering.', refs: ['WA-GEO-GIR-004'] },
    { text: 'The receptor is sensitive: the brook supports brown trout and is classified Moderate under the Water Framework Directive.', refs: ['WA-ENV-BAS-003'] },
    { text: 'The GIR recommends a watching brief, targeted remediation of the three PAH hotspots and a dewatering management plan, and the compound’s runoff is to be managed by a drainage strategy because the made ground limits infiltration.', refs: ['WA-GEO-GIR-004', 'WA-WAT-FRA-001'] },
  ] as WtClaim[],
  /** Rachel (▤ 7 sources). Claims 3–4 are word for word 3E's. */
  answer3R: [
    { text: 'Redgate Ecology’s Preliminary Ecological Appraisal records a small area of wet woodland adjoining the brook, in species-poor semi-improved grassland with a defunct hedgerow along Ashcombe Lane.', refs: ['WA-ECO-PEA-001'] },
    { text: 'Great crested newt eDNA returned negative at both ponds, and badger activity was recorded at two setts outside the working corridor.', refs: ['WA-ECO-PEA-001'] },
    SHARED_3_BAS,
    SHARED_3_GIR,
  ] as WtClaim[],
  /** Eleanor (▤ 6 sources). Never says what it could not find. */
  answer3E: [SHARED_3_BAS, SHARED_3_GIR] as WtClaim[],
  footer1: '6 cited claims · Composed for this question · Planning & Environmental Lens v1',
  footer3R: '4 cited claims · Composed for this question · Planning & Environmental Lens v1',
  footer3E: '2 cited claims · Composed for this question · Planning & Environmental Lens v1',
  honesty:
    'Every claim was checked against the sources this run actually admitted. That check is deterministic code, not a second model — no independent model verification was taken.',
  openInEditor: '✎ Open in editor',
  details: 'Details',
  runLine: 'Run 3f9c21a0 · Succeeded · every step in the audit trail',
  runLines: {
    RACHEL_Q3: 'Run 7b2e4d91 · Succeeded · every step in the audit trail',
    ELEANOR_Q3: 'Run c45a0f3e · Succeeded · every step in the audit trail',
  },
  railHead: 'What ran',
  railStages: ['Understanding your question', 'Loading context', 'Searching project documents', 'Verifying citations', 'Report'],
  lensIntro: 'A Lens changes how answers are written. It does not change what you can see.',
  lenses: [
    { label: 'Planning & Environmental', description: 'Consenting and EIA specialists. Leads with the statutory or policy test and whether the evidence before it meets that test. Full jargon, unexpanded acronyms, paragraph-level citation.' },
    { label: 'Engineer', description: 'Design and construction engineers. Leads with the physical or design implication and the constraint it creates. Figures with their source; planning concepts translated into design consequences.' },
    { label: 'Project Manager', description: 'Programme and delivery managers. Leads with what is due, who owns it, what is at risk and by when. Tabular by default, summary first, detail on request.' },
    { label: 'Communications', description: 'Communications and stakeholder leads. Plain English, no unexplained acronyms. Leads with what it means for people and what can and cannot be said publicly, with anything not yet public flagged prominently.' },
    { label: 'No Lens', description: 'Answer in Infora’s standard register.' },
  ],
  ontology: {
    title: 'How the library connects',
    sub: 'The project ontology, derived from the record and never drawn by hand. Every document is classified against Uniclass 2015 and ISO 19650, and every link between documents is confirmed by a person before it counts. It organises the library; it is never cited.',
    switchLabels: ['List', 'How it connects'],
    detailPlaceholder: 'Select a document to see how it is classified and linked.',
    workPackages: ['Land quality', 'Water environment', 'Ecology', 'Consultation'],
    /** ref → [discipline, system, document type, project stage, work package] */
    classifications: {
      'WA-GEO-GIR-004': ['G — Geotechnical', 'Ss_15 — Earthworks and remediation systems', 'RP — Report', '2 — Concept design', 'Land quality'],
      'WA-ENV-BAS-003': ['V — Environmental', '—', 'RP — Report', '2 — Concept design', 'Land quality'],
      'WA-WAT-FRA-001': ['D — Drainage', 'Ss_50 — Disposal and drainage systems', 'RP — Report', '2 — Concept design', 'Water environment'],
      'WA-CON-SCC-002': ['Z — General / Multidiscipline', '—', 'RP — Report', '2 — Concept design', 'Consultation'],
      'WA-EIA-SCP-001': ['V — Environmental', '—', 'RP — Report', '2 — Concept design', 'Land quality'],
      'WA-ECO-PEA-001': ['V — Environmental', '—', 'RP — Report', '2 — Concept design', 'Ecology'],
      'WA-EIA-MST-001': ['V — Environmental', 'Ss_15 — Earthworks and remediation systems', 'RP — Report', '2 — Concept design', 'Land quality'],
    } as Record<string, string[]>,
    facets: ['Discipline', 'System (Uniclass Ss)', 'Document type', 'Project stage', 'Work package'],
    /** Every edge in the data. W2 draws `w2Edges` only (the MST → SCP edge is not drawn). */
    edges: [
      { from: 'WA-EIA-MST-001', type: 'derived from', to: 'WA-GEO-GIR-004', onCamera: true },
      { from: 'WA-EIA-MST-001', type: 'derived from', to: 'WA-ENV-BAS-003', onCamera: true },
      { from: 'WA-EIA-MST-001', type: 'references', to: 'WA-WAT-FRA-001', onCamera: true },
      { from: 'WA-EIA-MST-001', type: 'references', to: 'WA-EIA-SCP-001', onCamera: false },
      { from: 'WA-WAT-FRA-001', type: 'references', to: 'WA-GEO-GIR-004', onCamera: false },
    ],
    /** W2 §4.4: one confirmed edge from the start, then the three suggested on camera (chip centres native). */
    w2Edges: [
      { from: 'WA-WAT-FRA-001', type: 'references', to: 'WA-GEO-GIR-004', suggested: false, chip: { x: 805, y: 290 } },
      { from: 'WA-EIA-MST-001', type: 'derived from', to: 'WA-GEO-GIR-004', suggested: true, chip: { x: 705, y: 350 } },
      { from: 'WA-EIA-MST-001', type: 'derived from', to: 'WA-ENV-BAS-003', suggested: true, chip: { x: 705, y: 470 } },
      { from: 'WA-EIA-MST-001', type: 'references', to: 'WA-WAT-FRA-001', suggested: true, chip: { x: 890, y: 350 } },
    ],
    /** Facet column rows, before → after the method statement arrives (W2 §4.4). */
    facetCounts: [
      { facet: 'Discipline', term: 'V Environmental', before: 3, after: 4 },
      { facet: 'Discipline', term: 'G Geotechnical', before: 1, after: 1 },
      { facet: 'Discipline', term: 'D Drainage', before: 1, after: 1 },
      { facet: 'Discipline', term: 'Z General / Multidiscipline', before: 1, after: 1 },
      { facet: 'System (Uniclass Ss)', term: 'Ss_15 Earthworks and remediation systems', before: 1, after: 2 },
      { facet: 'System (Uniclass Ss)', term: 'Ss_50 Disposal and drainage systems', before: 1, after: 1 },
      { facet: 'Document type', term: 'RP Report', before: 6, after: 7 },
      { facet: 'Project stage', term: '2 Concept design', before: 6, after: 7 },
      { facet: 'Work package', term: 'Land quality', before: 3, after: 4 },
      { facet: 'Work package', term: 'Water environment', before: 1, after: 1 },
      { facet: 'Work package', term: 'Ecology', before: 1, after: 1 },
      { facet: 'Work package', term: 'Consultation', before: 1, after: 1 },
    ],
    /** Work-package regions on the canvas (native rects, W2 §4.4). */
    regions: [
      { label: 'Land quality', x0: 504, x1: 890, y0: 222, y1: 640 },
      { label: 'Water environment', x0: 902, x1: 1080, y0: 222, y1: 420 },
      { label: 'Ecology', x0: 902, x1: 1080, y0: 436, y1: 640 },
      { label: 'Consultation', x0: 504, x1: 890, y0: 656, y1: 828 },
    ],
    edgeTypes: ['Derived from', 'References', 'Supersedes', 'Responds to', 'Is part of'],
    usedPill: 'Used for AI answers',
    notUsedPill: 'Not used for AI answers — superseded',
    suggestedTag: 'suggested',
  },
  /** Kept for W2's existing keys; the values are WT_CREATOR_SOURCES (one value, shared with W4). */
  creatorRelated: {
    ...WT_CREATOR_SOURCES,
    workPackageLabel: 'Which work package is it part of?',
    workPackageHint: "From the project's classification. Library documents in the same work package are suggested as sources below.",
    workPackageOptions: ['Land quality', 'Water environment', 'Ecology', 'Consultation'],
  },
} as const;

/** GIR page 1 in the document modal (W2 §4.3). */
export const WT_GIR_PDF_P1 = {
  runningHead: ['Trentmoor Energy', 'WA-GEO-GIR-004 · v2'],
  title: 'Ground Investigation Interpretative Report',
  subtitle: 'Wrenfield–Ashcombe 400kV Connection · Wrenfield Sidings',
  revision: 'Revision v2 · Sep 01, 2026',
  heading: '1. Summary',
  body: WT_LIB.GIR.description,
  footerLinks: ['⤓ Download native .pdf', '⤓ PDF in new tab'],
  close: 'Close',
} as const;

// ---------------------------------------------------------------- document creator (W2 §4.6 = W4 S4)

/**
 * The document creator's page copy, ONE value for W2 and W4 (both draw W2 §4.6).
 * Per-video state (what is picked, typed, ticked) lives with the video:
 * W2 starts empty; W4 uses WT_TOOLS.creator.startState.
 */
export const WT_CREATOR_PAGE = {
  title: 'Document creator',
  sub: 'Say what kind of document this is, what language it should be in, which style guides apply and whether it is a whole document, a chapter or a section — then pick the library documents it may draw on. The sources are chosen before anything is drafted, so the result can be checked against what you asked for.',
  characteristics: {
    card: 'What this document is',
    fields: [
      { label: 'What kind of document is this?', value: 'Technical note', hint: 'A short, self-contained answer to one technical question from the record.' },
      { label: 'What language should it be written in?', value: 'Technical', hint: 'Full technical vocabulary, for a reader in the discipline.' },
      { label: 'Which style guides apply?', value: 'Wrenfield–Ashcombe Project Style Guide', badge: '3 clauses', hint: '' },
      { label: 'Is this a whole document, a chapter or a section?', value: 'Whole document', hint: 'Stands alone, and introduces its own subject.' },
    ],
    /** VISION field. */
    workPackage: {
      label: WT_ASK.creatorRelated.workPackageLabel,
      hint: WT_ASK.creatorRelated.workPackageHint,
      options: WT_ASK.creatorRelated.workPackageOptions,
      empty: '—',
    },
  },
  outline: {
    card: 'The outline',
    intro: 'Build the document section by section: a heading, and what should go in it. Say what belongs there, not what you expect it to conclude — the draft rests on the sources, not on the outline. A section can carry sub-sections, and each one is written as a part of its own under its parent’s heading.',
    startFromLabel: 'Start from:',
    startFrom: ['Assessment chapter section', 'Technical note', { label: 'Land quality technical note', badge: 'Your firm' }] as Array<string | { label: string; badge: string }>,
    startFromTrailer: '— every section it adds stays yours to edit or remove.',
    empty: 'No sections yet. Add the first one, or start from an outline above.',
    addSection: '+ Add a section',
    addSub: '+ Add a sub-section',
    save: '⊕ Save this outline for your firm',
  },
  brief: {
    card: 'The brief, and where it goes',
    forLabel: 'What is this document for?',
    titleLabel: 'Title',
    whereLabel: 'Where it goes',
    whereValue: 'Calder & Hale — working area',
    whereHint: 'Set from the working area you started in. Change it here if the document belongs somewhere else.',
  },
  sources: { card: 'Sources this draft may use', ...WT_CREATOR_SOURCES },
  seePlan: 'See the plan',
} as const;

// ---------------------------------------------------------------- W3 collaboration (W3 §10.1, replaces master §4.7)

/** W3's block, as its plan writes it. Its title strings live in WT_TITLES[3] (one value). */
export const WT_COLLAB = {
  sandboxPage: {
    title: 'Sandbox',
    sub: 'Work in progress across your sandboxes. Separation is by a narrower sandbox, never a wall inside a shared one; the AI never grounds on anything here.',
    buttons: { newDoc: 'New document', createAi: 'Create with AI', upload: 'Upload file', sandbox: 'Sandbox' },
    sectionLabel: 'Sandboxes',
    allDocs: (org: string) => `${org} — all documents`,
    flatEmpty: 'Nothing here yet — create a document or accept a draft from Ask.',
    treeEmpty: 'No folders or documents yet — add a folder, or create a document.',
    toolbarOwner: ['Manage access', 'New folder', 'Folder structure', 'Settings'],
    toolbarMember: ['Manage access'],
    lockedStructure: 'Locked structure — folders are set by a super-user',
    inScope: '3 in scope',
  },
  cards: {
    rachel: [
      { name: 'Personal workspace', org: 'Trentmoor Energy', kind: 'Personal' },
      { name: 'Trentmoor Energy — working area', org: 'Trentmoor Energy', kind: 'Single organisation' },
    ],
    shared: { name: 'Ashcombe Brook crossing', org: 'Trentmoor Energy', kind: 'Shared' }, // no `with` line (built)
    calderHale: [
      { name: 'Personal workspace', org: 'Calder & Hale', kind: 'Personal' },
      { name: 'Calder & Hale — working area', org: 'Calder & Hale', kind: 'Single organisation' },
    ],
  },
  calderHaleRow: { title: 'EIA Scoping Method Statement — Land Quality', meta: 'Infora text · Sep 17, 2026', ref: 'WA-EIA-MST-001' },
  wizard: {
    title: 'New sandbox',
    step: (n: number, of: number) => `Step ${n} of ${of}`,
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Ecology working area',
    accessLabel: 'Access',
    access: { private: 'Private — my organisation', shared: 'Shared — across organisations' },
    accessHint: { private: 'Private to your organisation', shared: 'Shared across organisations — you choose which, then who' },
    orgsLabel: 'Organisations',
    orgsHint: 'Which organisations share this sandbox (yours is always included)',
    orgs: WT_MEMBER_ORGS,
    orgsTicked: ['Calder & Hale', 'Redgate Ecology'],
    whoLabel: 'Who has access',
    who: { everyone: 'Everyone in the chosen organisations', specific: 'Only specific people' },
    peopleLabel: 'People',
    peopleHint: 'Admit specific participants; you are always included',
    people: [
      ['Rachel Bowen', 'Trentmoor Energy'],
      ['Eleanor Price', 'Calder & Hale'],
      ['Owen Vance', 'Calder & Hale'],
      ['Nadia Okonjo', 'Redgate Ecology'],
    ],
    peopleTicked: ['Eleanor Price', 'Nadia Okonjo'],
    buttons: { cancel: 'Cancel', back: 'Back', next: 'Next', create: 'Create sandbox' },
  },
  sandboxName: 'Ashcombe Brook crossing',
  newDocModal: { title: 'New document', label: 'Title', placeholder: 'e.g. Ecology draft', cta: 'Create document', cancel: 'Cancel' },
  docTitle: 'Land quality and ecology interface',
  docRow: { rev: 'v0.1', meta: 'Infora text · Oct 02, 2026', state: 'Unbound' },
  rowMenu: ['Open in Editor', 'Move…', 'Metadata…', 'Rename…', 'Bind…'],
  editor: {
    location: 'Ashcombe Brook crossing',
    canvasPlaceholder: 'Write here — manual editing has no ceremony: no Suggestion, no Signal.',
    noControls: 'No document controls',
    freeze: 'Freeze',
    tabs: { chat: 'Chat', comments: 'Comments', checks: 'Checks' },
    pending: '1 pending in the document',
    composerPlaceholder: 'Ask for a draft into this document',
    chips: { library: '▤ From the library', disabled: ['＋ Attach a file', '≡ Prompts', '✒ Style', '◍ Web search', '▧ Sandbox search', '✳ Model'] },
    attachSource: 'Attach source',
  },
  nadiaText: "1. Ecological receptors\nRedgate's appraisal records the brook corridor as the principal ecological receptor.",
  eleanorHeading: '\n\n2. Dewatering and the brook',
  promptTyped: 'Draft this section on how dewatering could affect the brook,',
  promptAnd: ' and',
  promptFinal: 'Draft this section on how dewatering could affect the brook, per WA-GEO-GIR-004 and per WA-ENV-BAS-003',
  libraryEleanor: ['WA-CON-SCC-002', 'WA-EIA-MST-001', 'WA-EIA-SCP-001', 'WA-ENV-BAS-003', 'WA-GEO-GIR-004', 'WA-WAT-FRA-001'],
  thread: { you: 'You', other: 'Eleanor Price · Calder & Hale', agent: 'Infora agent', working: 'Working…', done: 'Done — 1 suggestion on the document.' },
  suggestion: {
    tag: 'Suggestion · insert · pending your decision', // rendered uppercase by CSS
    claims: [
      { text: 'Intrusive investigation at Wrenfield Sidings recorded a shallow perched water table at 1.6–2.1 m within made ground of ash, clinker and demolition fill.', refs: ['WA-GEO-GIR-004'] },
      { text: 'The investigation identifies this perched horizon as a plausible migration pathway toward the Ashcombe Brook during construction dewatering.', refs: ['WA-GEO-GIR-004'] },
      { text: 'The brook supports brown trout and is classified Moderate under the Water Framework Directive.', refs: ['WA-ENV-BAS-003'] },
      { text: 'The crossing is proposed as trenchless, with launch and reception pits outside Flood Zone 3.', refs: ['WA-WAT-FRA-001'] },
    ] as WtClaim[],
    actions: ['Accept', 'Edit', 'Refine', 'Reject'],
  },
  hoverCard: {
    ref: 'WA-ENV-BAS-003',
    rev: 'v3',
    state: 'Live',
    locator: 'Cited passage',
    title: 'Environmental Baseline Compendium',
    passage: [
      { text: 'The Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive (Table 9).', hl: true },
      { text: ' Two residential receptors lie within 150 m of the corridor at Ashcombe Lane.' },
    ] as Array<{ text: string; hl?: boolean }>,
  },
  comments: {
    selectBubble: 'Comment',
    anchor: 'dewatering',
    placeholderSel: 'Comment on the selected text — @ mentions a colleague',
    placeholderReply: 'Reply — @ mentions a colleague',
    newComment: 'New comment',
    buttons: { comment: 'Comment', cancel: 'Cancel', reply: 'Reply', close: 'Close', reopen: 'Reopen' },
    commentAt: '@El',
    mentionPick: '@Eleanor Price',
    commentRest: 'where does the dewatering water go? The brook has trout.',
    comment: { who: 'Nadia Okonjo', when: 'Oct 02, 2026, 10:58 AM', body: '@Eleanor Price where does the dewatering water go? The brook has trout.' },
    reply: { who: 'Eleanor Price', when: 'Oct 02, 2026, 11:05 AM', body: "The GI recommends a dewatering management plan - I'll cover the brook in it." },
    resolved: 'Resolved by Eleanor Price · Oct 02, 2026, 11:06 AM',
    emptyOpen: 'No open comments. Select text on the canvas and press Comment, or start one here — any project colleague can reply and close.',
    resolvedToggle: (n: number, open: boolean) => `${open ? '▾' : '▸'} Resolved (${n})`,
  },
} as const;

// ---------------------------------------------------------------- W4 tools (W4 §3, §8.2)

export const WT_TOOLS = {
  page: {
    title: 'Tools',
    sub: 'Infora’s standard tools. Each runs a codified workflow — the same inputs produce the same steps, in the same order, every time.',
    creator: 'Build a document’s structure, say what each section is for, and choose the library sources it draws on — before anything is drafted.',
    checker: 'Check a draft against the project style guide, your firm’s own rules and the project library, and get anchored findings you accept or reject one at a time.',
    appsLabel: 'Apps built for this project',
    appsSub: 'Apps a firm has had built inside this scheme — a form to fill in, a register, a dashboard. Every row somebody types in one remembers which organisation and which person entered it, and is read by that organisation and by the project owner, and by nobody else.',
    appsEmpty: 'No apps yet.',
    newAppLabel: 'New app',
    newAppPlaceholder: 'Describe the app you want…',
  },
  checker: {
    title: 'QA checker',
    sub: 'Read a draft against the writing rules that bind it and the project record it rests on. You see the plan, and what it will cover, before anything is spent.',
    draftPlaceholder: 'Choose a draft…',
    draft: 'Land Quality method statement — Ashcombe Lane working copy',
    draftOptions: ['Land Quality method statement — Ashcombe Lane working copy', 'Land Quality scoping method statement — working draft'],
    draftHint: 'A check covers one document. Its findings are marks in that draft, not a report about several.',
    preset: 'Full check',
    checks: ['House style', 'Accuracy', 'Internal consistency', 'Readability', 'Completeness'],
    seePlan: 'See the plan',
    planIntro: 'This is what will run, step by step, in the order it will happen. Change an answer above to change it — the steps are not editable, which is what makes the run repeatable.',
    planOnePass: 'One pass over the whole draft — one reader sees everything, so the consistency check comes free.',
    planSteps: [
      'Read the whole draft against 2 writing rules and the project record',
      'Score the draft for readability and check it for gaps and placeholders',
    ],
    covers: '6 sections · 5 checks · the whole library, searched once per section · 5 of 5 accepted rules applied (5 all) · style guide 3 of 3 clauses',
    run: 'Run the check',
    running: 'Running the check',
    runningSteps: ['0 of 2 steps finished.', '1 of 2 steps finished.'],
    checkedCard: 'What was checked',
    covered: '6 of 6 sections read · 5 checks · 5 passages of the record read · 5 of 5 accepted rules applied · style guide 3 of 3 clauses',
    result: '5 findings, anchored in the draft.',
    openDraft: 'Open the draft to work through them',
  },
  findings: {
    /** The working copy's own title (an older copy: it still says "south of the Wrenfield substation"). */
    docTitle: 'Land Quality method statement — Ashcombe Lane working copy',
    counters: [
      '5 open findings. Each one points into the draft — click it to go there.',
      '4 open findings, 1 resolved. Each one points into the draft — click it to go there.',
      '3 open findings, 2 resolved. Each one points into the draft — click it to go there.',
    ],
    checksTab: [5, 4, 3],
    pending: ['3 pending in the document', '2 pending in the document', '1 pending in the document'],
    bulk: 'Accept 1 mechanical correction',
    bulkNote: 'The same substitution, applied consistently — one decision, 1 place.',
    rewriteDivider: 'The rest are rewritten wording, so they are read one at a time.',
    resolvedNote: '2 findings have been resolved. Resolved is resolved either way — the promotion gate counts what is still open, not how it was cleared.',
    suggestedLead: 'Suggested wording — the same substitution applied everywhere does not produce this proposal:',
    groups: [
      {
        label: 'House style',
        count: 3,
        findings: [
          { tone: 'Advisory', text: 'This project’s rules use “the scheme”, not “the routewide works”.', clause: '§2.1', source: '(project style guide)', rule: '“Refer to the works as “the scheme”, in lower case, throughout. Do not capitalise it as a proper noun.”', fix: 'routewide works → scheme, 1 place' },
          { tone: 'Advisory', text: 'This sentence is passive, so the party who prepared the model is not named.', rule: 'Measured against a rule Infora proposed and this project accepted: “Write in the active voice where the meaning allows it.”.', suggested: 'Calder & Hale has prepared a conceptual site model for each land parcel the route crosses.' },
          { tone: 'Required', text: 'The exceedances are reported with no concentration and no unit, so the result cannot be checked.', clause: '§2.4', source: '(project style guide)', rule: '“State every quantitative result with its unit and its source. A figure without a unit is not a result.”' },
        ],
      },
      {
        label: 'Accuracy',
        count: 1,
        findings: [
          { tone: 'Required', text: 'The record puts these PAH hotspots at Wrenfield Sidings, not south of the Wrenfield substation.', ref: 'WA-GEO-GIR-004', span: 'at three trial pits south of the Wrenfield substation', suggested: 'in three trial pits at Wrenfield Sidings' },
        ],
      },
      {
        label: 'Readability',
        count: 1,
        findings: [
          { tone: 'Advisory', text: 'This section reads at about grade 15.5, against the project’s target of 14 and a median of 12.3 across the rest of the draft. It is denser than the …' },
        ],
      },
    ],
    canvasSpans: {
      routewide: 'routewide works',
      unit: 'PAH exceedances',
      accuracy: 'at three trial pits south of the Wrenfield substation',
      accuracyFixed: 'in three trial pits at Wrenfield Sidings',
      passive: 'A conceptual site model has been prepared for each land parcel crossed by the route.',
    },
    hover: {
      head: 'WA-GEO-GIR-004 · v2',
      state: 'Live',
      quote: '“Intrusive investigation across the Wrenfield Sidings compound … recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09)”',
      locator: WT_LOCATOR,
    },
  },
  creator: {
    /** Page copy is WT_CREATOR_PAGE; sources are WT_CREATOR_SOURCES (shared with W2). */
    startState: { styleGuide: true, workPackage: 'Land quality' },
    firmOutline: 'Land quality technical note',
    firmBadge: 'Your firm',
    sections: [
      { n: '1', heading: 'The test', purpose: 'The statutory test this section answers, in one paragraph, and where in the record it comes from.' },
      { n: '2', heading: 'Baseline', purpose: 'Describe the baseline as the record establishes it, with its survey dates and its limitations where they are stated.' },
      { n: '2.1', heading: 'Survey dates and limitations', purpose: 'When each survey was carried out, and what the record says it did not cover.' },
      { n: '3', heading: 'Effect', purpose: 'Describe the effect on the receptor, its magnitude and its duration, as the record describes them.' },
    ],
    brief: 'A technical note on land contamination at the Ashcombe Lane parcels: the test it answers, the baseline as the ground investigation records it, the effect on the parcels and the mitigation the record already commits to.',
    docTitle: 'Land contamination — Ashcombe Lane parcels',
    where: 'Calder & Hale — working area',
    sources: WT_CREATOR_SOURCES,
    ticked: WT_CREATOR_SOURCES.ticked,
    proposalCard: 'The document this will write',
    overview: 'A technical note on land contamination at the Ashcombe Lane parcels: … It will be written as a technical note, whole document, in Technical register, in 4 sections, drawing on 2 bound sources. It follows 1 project style guide.',
    sectionSuffix: 'Written in Technical register, from the 2 bound sources only — anything the record does not support is left out.',
    askAgent: 'Ask the agent',
    redraw: 'Correct any description above and the plan redraws. Every other answer stays as it is.',
    runIntro: 'And this is what will run. The steps are computed from the answers above and are not editable, which is what makes the run repeatable.',
    runStep: '· Draft 4 sections — The test, Baseline, Survey dates and limitations, Effect — from the 2 bound sources',
    coversPlan: '4 sections · 2 bound sources · 1 drafting pass',
    writtenAs: 'Written as a technical note, whole document, in Technical register.',
    styleNote: 'Written to 1 project style guide. Where a style guide and the language you chose disagree, the guide wins on terms and vocabulary and your language answer wins on register.',
    accept: 'Accept the plan and create the document',
    resultCard: 'What was made',
    covered: '4 of 4 sections written · 2 of 2 bound sources used · 1 drafting pass',
    open: 'Open the document',
  },
  builder: {
    appName: 'Supplier KPI returns',
    crumb: ['Tools', 'App builder', 'Supplier KPI returns'],
    draftBadge: 'Draft — not yet open to anyone',
    openBadge: 'Open as version 1',
    agentPane: 'The builder’s agent',
    stepCounter: (n: number) => `Step ${n} of 7`,
    composer: 'Ask the agent, or tell it what to change…',
    asksTag: 'The agent asks',
    waiting: 'Waiting for you',
    stepsLabel: 'The steps',
    previewLabel: 'Preview',
    previewAs: 'as Rachel Bowen, Trentmoor Energy',
    previewTabs: ['Supplier KPI dashboard', 'Submit this month’s KPIs'],
    previewEmpty: 'Nothing to show yet. The screens are written at step 4.',
    userLabel: 'Rachel Bowen',
    agentLabel: 'Agent',
    /** Rachel's prompt, typed in the Tools page composer (91 characters, a typed hyphen). */
    prompt: 'Monthly KPI returns from our four suppliers - deliveries, NCRs, safety, carbon, local spend',
    q1Replies: ['Yes — add an acceptance step', 'No — rows never change hands', 'What counts as contractual?'],
    openReplies: ['Everyone the app is open to', 'Trentmoor Energy', 'Netherfold Cabling', 'More…'],
    q3Replies: ['Yes — only these', 'Change it'],
    /** The conversation in order (W4 S6). `who`: agent | rachel | receipt | echo | card. */
    turns: [
      { id: 'A1', who: 'agent', text: 'Done — Supplier KPI returns, open to Trentmoor Energy and its four suppliers. I’ve drafted one table, Monthly KPI returns, with eight columns.' },
      { id: 'R1', who: 'receipt', step: 1, text: 'What the app is — open to 5 organisations' },
      { id: 'Q1', who: 'agent', asks: true, step: 2, text: 'Does “Monthly KPI returns” hold contractual data? Something a payment hangs on, that discharges a condition, or that the project owner will rely on as its record. If it does, it needs an acceptance step — a row is submitted, and the owner accepts or rejects it.', replies: 'q1Replies' },
      { id: 'U1', who: 'rachel', typed: true, text: 'Yes — the KPIs feed each supplier’s scorecard under the contract.' },
      { id: 'A2', who: 'agent', text: 'Done — Monthly KPI returns now has an acceptance step. Each supplier submits; Trentmoor Energy accepts or rejects.' },
      { id: 'R2', who: 'receipt', step: 2, text: 'The tables — Monthly KPI returns, with an acceptance step' },
      { id: 'A3', who: 'agent', text: 'No outside systems needed — suppliers type their returns in. I’ve written two screens: Submit this month’s KPIs, and Supplier KPI dashboard.' },
      { id: 'R3', who: 'receipt', step: 3, text: 'Data connections — none' },
      { id: 'Q2a', who: 'agent', asks: true, step: 4, text: 'Who may open “Submit this month’s KPIs”? Everyone the app is open to, or only some of those organisations. Whatever you choose, it can only narrow — a screen shows each person what they could already see, and never more.', replies: 'openReplies' },
      { id: 'U2a', who: 'echo', text: 'Everyone the app is open to' },
      { id: 'Q2b', who: 'agent', asks: true, step: 4, text: 'Who may open “Supplier KPI dashboard”?', replies: 'openReplies' },
      { id: 'U2b', who: 'echo', text: 'Trentmoor Energy' },
      { id: 'A4', who: 'agent', text: 'Set: the form opens to everyone the app is open to; Supplier KPI dashboard opens to Trentmoor Energy only.' },
      { id: 'R4', who: 'receipt', step: 4, text: 'The interface — 2 screens; the form to everyone, the dashboard to Trentmoor only' },
      { id: 'U3', who: 'rachel', typed: true, text: 'Flag any supplier below 90% on time.' },
      { id: 'A5', who: 'agent', text: 'Done — added to the dashboard.' },
      { id: 'A6', who: 'agent', text: 'Runs every month, on the 1st. Each month I’ll write a summary — the figures are computed; I only write the sentences.' },
      { id: 'R5', who: 'receipt', step: 5, text: 'How often it runs — every month' },
      { id: 'Q3', who: 'agent', asks: true, step: 6, text: 'The monthly run acts as you, Rachel Bowen, over the tables it declares — Monthly KPI returns and Insights. Is that everything it should touch?', replies: 'q3Replies' },
      { id: 'U4', who: 'echo', text: 'Yes — only these' },
      { id: 'R6', who: 'receipt', step: 6, text: 'Analysis and prompts — runs as Rachel Bowen, on 2 tables' },
      { id: 'A7', who: 'agent', text: 'Ready to check and open.' },
      { id: 'RB', who: 'card', text: 'readBack' },
    ] as Array<{ id: string; who: 'agent' | 'rachel' | 'receipt' | 'echo' | 'card'; text: string; typed?: boolean; step?: number; asks?: boolean; replies?: 'q1Replies' | 'openReplies' | 'q3Replies' }>,
    steps: [
      { title: 'What the app is', sub: 'and who it is open to', asks: false, recorded: ['Open to Trentmoor Energy + 4 suppliers'] },
      { title: 'The tables', sub: 'what people fill in, and whether it holds contractual data', asks: true, recorded: ['Monthly KPI returns · acceptance step', 'Monthly KPI returns · acceptance step · Insights'] },
      { title: 'Data connections', sub: 'systems outside Infora it draws on', asks: false, recorded: ['None'] },
      { title: 'The interface', sub: 'the screens, and who may open each', asks: true, recorded: ['2 screens · form: everyone · dashboard: Trentmoor only', '2 screens · form: everyone · dashboard: Trentmoor only · flags under 90%'] },
      { title: 'How often it runs', sub: 'a schedule, or only when someone presses Run', asks: false, recorded: ['Every month'] },
      { title: 'Analysis and prompts', sub: 'what the agent says each run', asks: true, recorded: ['Runs as Rachel Bowen, on 2 tables'] },
      { title: 'Check and open', sub: 'read it back; open it to its people', asks: false, recorded: ['Open as version 1'] },
    ],
    step2Detail: {
      head: 'Column · Type',
      rows: [
        ['Month', 'choice'],
        ['Deliveries due', 'number'],
        ['Delivered on time', 'number'],
        ['NCRs', 'number'],
        ['Safety incidents', 'number'],
        ['Carbon (tCO2e)', 'number'],
        ['Local spend (£)', 'number'],
        ['Notes', 'text'],
      ] as Array<[string, string]>,
      acceptance: '✓ Acceptance step — Trentmoor Energy accepts or rejects',
    },
    step4Detail: ['Submit this month’s KPIs — Everyone the app is open to', 'Supplier KPI dashboard — Trentmoor Energy'],
    step6Detail: { label: 'What the analysis should say' },
    columns: ['Month', 'Deliveries due', 'Delivered on time', 'NCRs', 'Safety incidents', 'Carbon (tCO2e)', 'Local spend (£)', 'Notes'],
    analysisPrompt: 'Summarise the month: on-time delivery across suppliers and which supplier had the most late deliveries, any NCR count that rose by more than 10%, and carbon against last month.',
    readBackLabel: 'Check and open',
    readBack: [
      'Supplier KPI returns — Monthly KPI returns from Trentmoor Energy’s four suppliers, accepted by Trentmoor, with a dashboard and a monthly summary.',
      'Open to: Trentmoor Energy, Netherfold Cabling, Ashcombe Civils, Wrenfield Plant Hire, Wrenbrook Fencing & Reinstatement',
      'Tables: Monthly KPI returns (with an acceptance step), Insights',
      'Data connections described: 0',
      'Screens: Submit this month’s KPIs, Supplier KPI dashboard — narrowed',
      'Runs: Every month',
      'Analysis prompt: written',
    ],
    readBackNote: 'Opening it copies what you have built to the people the app is open to, and records who opened it and when. Until then only its builders can see any of this.',
    checkAndOpen: 'Check and open',
    openApp: 'Open the app',
    openLatest: 'Open the latest version',
    screens: ['Submit this month’s KPIs', 'Supplier KPI dashboard'],
  },
  /** Sam's seat (W4 S7). */
  sam: {
    title: 'Supplier KPI returns',
    sub: 'Your organisation’s monthly return to Trentmoor Energy. Save a draft as figures come in; submit when the month is complete. A submitted return is accepted or rejected by Trentmoor Energy — a rejected one is corrected by submitting it again.',
    formTitle: 'September 2026 return',
    form: [
      ['Month', 'Sep 2026'],
      ['Deliveries due', '28'],
      ['Delivered on time', '27'],
      ['NCRs', '2'],
      ['Safety incidents', '0'],
      ['Carbon (tCO2e)', '61'],
      ['Local spend (£)', '84,200'],
      ['Notes', 'Drum delivery for section 4 slipped two days; recovered within the week.'],
    ] as Array<[string, string]>,
    saveDraft: 'Save draft',
    submit: 'Submit to Trentmoor Energy',
    saved: 'Draft · saved 10:58 AM',
    submittedLine: 'Submitted Oct 05, 2026, 11:02 AM',
    table: 'Your returns — Netherfold Cabling',
    tableSub: '4 returns · entered by Sam Kerridge',
    columns: ['Month', 'Due', 'On time', 'NCRs', 'Carbon', 'State'],
    rows: [
      { month: 'Sep 2026', due: 28, onTime: 27, ncrs: 2, carbon: 61, state: 'Draft', stamp: '', after: { state: 'Submitted', stamp: 'Oct 05, 2026' } },
      { month: 'Aug 2026', due: 26, onTime: 25, ncrs: 2, carbon: 64, state: 'Accepted', stamp: 'Sep 03, 2026 · Rachel Bowen' },
      { month: 'Jul 2026', due: 24, onTime: 24, ncrs: 1, carbon: 67, state: 'Accepted', stamp: 'Aug 04, 2026 · Rachel Bowen' },
      { month: 'Jun 2026', due: 22, onTime: 21, ncrs: 1, carbon: 70, state: 'Accepted', stamp: 'Jul 02, 2026 · Rachel Bowen' },
    ],
    note: 'This app shows you what you could already see: Netherfold Cabling’s own returns. Other suppliers’ returns, the project totals and Trentmoor Energy’s monthly summary are not part of it for you — not because the app hides them, but because every row is read by the organisation that entered it and by Trentmoor Energy, and by nobody else.',
  },
  /** Rachel's dashboard (W4 S8). Tiles and charts: WT_KPI_STATES. */
  dashboard: {
    title: 'Supplier KPI returns',
    sub: 'Every supplier’s monthly return, the project totals, and the latest analysis. Accept or reject each submitted return; an accepted return becomes Trentmoor Energy’s record.',
    actions: ['Run the analysis now', 'Export…', 'Edit the app'],
    table: 'Returns from every supplier',
    tableSub: 'Showing September · 4 rows',
    columns: ['Month', 'Organisation', 'Due', 'On time', 'NCRs', 'Carbon', 'State'],
    rows: [
      { org: 'Netherfold Cabling', person: 'Sam Kerridge', due: 28, onTime: 27, ncrs: 2, carbon: 61 },
      { org: 'Ashcombe Civils', person: 'Dan Ferris', due: 40, onTime: 34, ncrs: 3, carbon: 52, stamp: 'Oct 01, 2026 · Rachel Bowen' },
      { org: 'Wrenfield Plant Hire', person: 'Leah Morrow', due: 22, onTime: 21, ncrs: 1, carbon: 21, stamp: 'Oct 01, 2026 · Rachel Bowen' },
      { org: 'Wrenbrook Fencing & Reinstatement', person: 'Joe Pellow', due: 12, onTime: 11, ncrs: 0, carbon: 8, stamp: 'Oct 01, 2026 · Rachel Bowen' },
    ],
    rowActions: ['Accept', 'Reject'],
    confirmHead: 'Accept Netherfold Cabling’s September 2026 return?',
    confirmBody: 'Once accepted it becomes Trentmoor Energy’s record: it cannot be edited or deleted in place, and a correction from Netherfold Cabling would arrive as a new row that supersedes this one. The decision is recorded in your name.',
    confirmButtons: ['Accept', 'Reject — say why…', 'Cancel'],
    donutLegend: [
      ['Ashcombe', '£126,500'],
      ['Netherfold', '£84,200'],
      ['Plant Hire', '£38,900'],
      ['Wrenbrook', '£22,400'],
    ] as Array<[string, string]>,
    runsLabel: 'Runs',
    runsSub: 'What each run covered. The insight a run wrote is a row in the app’s insight table, read by the organisation that ran it and the project owner — open that table to read it.',
    runsColumns: ['Started', 'Trigger', 'Acted as', 'Rows covered', 'What happened', 'Against version'],
    noRuns: 'No runs yet.',
    keepSection: 'Keep it for the next project',
    keepBody: 'Keep this app as a playbook on your firm’s own shelf, in your workspace. The shape travels — the tables and their columns, whether each needs signing off, the screens, the schedule and the analysis prompt. No rows travel, whoever entered them and whichever table they are in, so what you keep carries nothing of this client into the next one. Keeping it again under the same name makes the next version, and changes nothing already deployed.',
    keepLabel: 'Call the playbook',
    keepValue: 'Supplier KPI returns',
    keepButton: 'Keep this as a playbook',
    keepNotice: 'Kept on your firm’s shelf as “Supplier KPI returns”, version 1. Its tables travelled empty.',
    shelf: 'Your firm’s playbooks',
    shelfBadge: 'Org-private — the same on every project',
  },
} as const;

/** The four tile states on Rachel's dashboard (W4 S8): totals count accepted rows only. */
export const WT_KPI_STATES = {
  before: {
    september: { value: '3 of 4', sub: 'returns submitted · nothing yet from Netherfold Cabling' },
    awaiting: { value: '0', sub: 'nothing waiting' },
    onTime: { value: '66 of 74', sub: 'accepted returns only' },
    carbon: { value: '569 tCO2e', sub: 'accepted returns only · 15 rows' },
    localSpendCentre: '£188k',
    sepCarbon: 81,
    netherfoldRow: { cells: 'No return yet', state: 'Not yet submitted' },
  },
  submitted: {
    september: { value: '4 of 4', sub: 'returns submitted' },
    awaiting: { value: '1', sub: 'Netherfold Cabling, September 2026' },
    onTime: { value: '66 of 74', sub: 'accepted returns only' },
    carbon: { value: '569 tCO2e', sub: 'accepted returns only · 15 rows' },
    localSpendCentre: '£188k',
    sepCarbon: 81,
    netherfoldRow: { state: 'Submitted', stamp: 'Oct 05, 2026' },
  },
  accepted: {
    september: { value: '4 of 4', sub: 'returns submitted' },
    awaiting: { value: '0', sub: 'nothing waiting' },
    onTime: { value: '93 of 102', sub: 'accepted returns only' },
    carbon: { value: '630 tCO2e', sub: 'accepted returns only · 16 rows' },
    localSpendCentre: '£272k',
    sepCarbon: 142,
    netherfoldRow: { state: 'Accepted', stamp: 'Oct 05, 2026 · Rachel Bowen' },
  },
  /** Tiles 3 and 4, the bar, line and donut count up over this many frames (ease.out) on acceptance. */
  countUpFrames: 30,
  tileLabels: { september: 'September 2026', awaiting: 'Awaiting your decision', onTime: 'On time, September', carbon: 'Carbon since June' },
  charts: {
    bar: 'On time by supplier · Sep 2026, %',
    barFlag: 'Flags under 90% on time',
    barUnder: 'Under 90% on time',
    bars: [
      { label: 'Netherfold', value: 96 },
      { label: 'Ashcombe', value: 85, flagged: true },
      { label: 'Plant Hire', value: 95 },
      { label: 'Wrenbrook', value: 92 },
    ],
    line: 'Carbon by month, tCO2e',
    lineSub: 'accepted returns only',
    lineBefore: [171, 163, 154, 81],
    lineAfter: [171, 163, 154, 142],
    donut: 'Local spend by supplier · Sep 2026',
    empty: { tile: '—', tileSub: 'no returns yet', table: 'Nothing entered yet.', chart: 'Nothing to draw yet.', insight: 'No runs yet.' },
  },
} as const;

export const WT_RUN = {
  row: ['Oct 05, 2026, 11:24 AM', 'Run by hand', 'Rachel Bowen', '16', 'Wrote one insight', '1'],
  insightLabel: 'Latest insight',
  insightMeta: 'Run Oct 05, 2026, 11:24 AM · run by hand · acted as Rachel Bowen over 16 rows in Monthly KPI returns · version 1',
  allRuns: 'All runs →',
  sentences: INSIGHT.sentences,
} as const;
/** The insight card's meta line (W4 S8 state E); `All runs →` is a separate link. */
export const WT_INSIGHT_META = WT_RUN.insightMeta;

// ---------------------------------------------------------------- titles (§1, §2.5, §2.8, §2.9; final per-video plans)

export interface WtChapter {
  name: string;
  /** Exact chapter length (authoritative). */
  frames: number;
  /** frames / 30, for reading. */
  seconds: number;
}

export interface WtTitle {
  kicker: string;
  name: string;
  /** The deck tagline (kept for reference; no longer on the title card). */
  deckLine: string;
  /** The title card's third row: what this video's scenario is (producer ruling). */
  scenarioLine: string;
  /** Glimpse caption (label "Where this ends"). ≤ 8 words, hyphens, no full stop. */
  glimpseLine: string;
  /** Close caption. ≤ 8 words, hyphens, no full stop. */
  closeLine: string;
  chapters: WtChapter[];
}

const ch = (name: string, frames: number): WtChapter => ({ name, frames, seconds: frames / 30 });

export const WT_TITLES: Record<1 | 2 | 3 | 4 | 5, WtTitle> = {
  1: {
    kicker: 'Pillar 01',
    name: 'Document management',
    deckLine: 'Best-in-class information management, seamless by design.',
    scenarioLine: 'WA-EIA-MST-001, from first draft to C01',
    glimpseLine: 'Accepted, issued as C01, in the library',
    closeLine: 'Accepted - now part of the project record',
    // 3,390 f; total 3,837 (W1 §2).
    chapters: [ch('Draft', 450), ch('Check', 270), ch('Promote', 330), ch('Review', 990), ch('Respond', 720), ch('Accept', 630)],
  },
  2: {
    kicker: 'Pillar 02',
    name: 'Context layer',
    deckLine: 'Every document feeds a living ontology, and every new document starts from it.',
    scenarioLine: 'One question, answered from the project library',
    glimpseLine: 'An answer from the library, every claim sourced',
    closeLine: 'Every answer from the record, every claim sourced',
    // 3,070 f; total 3,517 (W2 §2).
    chapters: [ch('Library', 420), ch('Connections', 450), ch('New document', 480), ch('Ask', 750), ch('Sources', 360), ch('Access', 610)],
  },
  3: {
    kicker: 'Pillar 03',
    name: 'Collaboration',
    deckLine: 'Shared spaces across organisations. No attachments, no lost work.',
    scenarioLine: 'Two firms write one document together',
    glimpseLine: 'One document, two firms, a resolved thread',
    closeLine: 'Two firms, one document, nothing emailed',
    // 3,078 f; total 3,525 (W3 §2).
    chapters: [ch('Shared space', 732), ch('New document', 323), ch('Together', 418), ch('Ask the agent', 676), ch('Accept', 374), ch('Discuss', 555)],
  },
  4: {
    kicker: 'Pillar 04',
    name: 'Tools',
    deckLine: 'Purpose-built AI, and an app builder that lets teams extend it themselves.',
    scenarioLine: 'A QA check, a saved workflow, and a supplier KPI app',
    glimpseLine: 'Every return accepted, the month analysed',
    closeLine: 'Built by asking - used across two organisations',
    // 3,444 f; total 3,891 (W4 §2).
    chapters: [ch('QA check', 405), ch('Findings', 370), ch('Workflow', 381), ch('Build', 1483), ch('Two seats', 432), ch('Insight', 373)],
  },
  5: {
    kicker: 'Walkthrough 05',
    name: 'Ethical walls',
    deckLine: '',
    scenarioLine: 'Who sees what, across three firms on one project',
    glimpseLine: "Each firm sees only what it's given",
    closeLine: 'Shared only where the owner opens it',
    // 2,942 f; total 3,389 (W5 §1).
    chapters: [ch('Set up', 600), ch('Owner and member', 450), ch('Each firm', 450), ch('Sandboxes', 570), ch('Together', 872)],
  },
};

// ---------------------------------------------------------------- W5 ethical walls (W5 plan §5)

/** W5's strings. UI copy is the built copy (`library.tsx`, `deliverable-status.tsx`, `sandbox.tsx`). */
export const WT_WALL = {
  dates: { mstTransmitted: 'Sep 30, 2026', mstAcknowledged: 'Oct 01, 2026' },
  /** What Nadia's library reaches before acknowledging (+ MST after). */
  reachNadia: ['PEA', 'SCC', 'SCP', 'BAS', 'GIR', 'FRA'] as WtLibKey[],
  transmit: {
    title: 'Transmit WA-EIA-MST-001',
    label: 'Issue to organisation',
    // DEV: the built hint ends " (ADR-0035)", internal shorthand, dropped.
    hint: 'A non-review transmittal — the receiving organisation must acknowledge before it grounds',
    placeholder: 'Search organisations',
    typed: 'Red',
    pick: 'Redgate Ecology',
    buttons: { cancel: 'Cancel', transmit: 'Transmit' },
    note: 'Transmitted — the receiving organisation must acknowledge before it grounds.',
  },
  history: {
    label: 'Transmittals and acknowledgements',
    row: { date: 'Sep 30, 2026', kind: 'Issued to organisation', version: 'C01', by: 'Rachel Bowen', recipient: 'Redgate Ecology' },
    awaiting: 'Awaiting acknowledgement',
    ownerFoot: 'The full distribution record — every recipient organisation and its acknowledgement state.',
  },
  ack: {
    label: 'Awaiting your acknowledgement',
    heads: ['Reference', 'Version', ''],
    button: 'Acknowledge receipt',
    note: 'Acknowledged — the deliverable is now visible and grounds for your organisation.',
  },
  cards: {
    redgate: [
      { name: 'Personal workspace', org: 'Redgate Ecology', kind: 'Personal' },
      { name: 'Redgate Ecology — working area', org: 'Redgate Ecology', kind: 'Single organisation' },
    ],
  },
  redgateRow: { title: 'Bat activity notes — brook corridor', meta: 'Infora text · Sep 24, 2026' },
} as const;
