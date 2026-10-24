// T-395 — `apps/web` gets a test runner, and the load-bearing sentences get
// pinned.
//
// **The definition of done says unit-tested, and an entire app could not be.**
// `apps/web` had no runner, so T-292's zero-source warning and T-295's
// both-labels block — the two most load-bearing sentences on their branch —
// shipped unpinned, and T-338's diff routed its tests into `packages/contracts`
// for want of one.
//
// Static markup, no DOM emulation, following `packages/ui`'s own suite: what is
// under test is the COPY and the STATE it renders in, and both are decided
// before any event handler runs. A component whose sentence lives behind a
// network call has that fetch split out (see `DestinationBlock`), because a
// sentence that cannot be rendered in a test is a sentence nobody is checking.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { panelStyle } from './floating-panel';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  AppBuildTurn,
  DestinationCheckResponse,
  Finding,
  ClassificationSchemeResponse,
  SavedView,
  ListRuleProposalsResponse,
  ProposedRule,
  RuleProposal,
  RuleSetVersion,
  StyleGuideRecord,
  ToolPlan,
  ToolSummary,
  WorkingAreaDocument,
} from '@infora/contracts';
import { api } from './api';
import { sandboxLifecycleBadge } from './screens/shared';
import { ChatComposer, WorkingSetCard, WorkingSetLine } from '@infora/ui';
import { WorkingSetPicker, workingSetGroups } from './working-set-picker';
import { FirmShelfPane, ProjectShelfPane } from './screens/knowledge';
import { IntakeTable, bulkConfirmBody, startingEdit } from './screens/reference-intake';
import { CurrencyCard, ReaderPage } from './screens/document';
import type { ReaderDocument } from '@infora/contracts';
import { ImpactView } from './screens/library';
import { CitedByList } from './ontology-panel';
import { EVENT_LABEL } from './screens/notifications';
import { SourceCardView } from './source-card';
import { SourceChip } from '@infora/ui';
import type { Currency } from '@infora/contracts';
import type { IntakeFacet } from './screens/reference-intake';
import { NOT_CITABLE_LABEL, describeTextStatus, uploadSentence } from './reference-intake-words';
import type { IntakeRow } from '@infora/contracts';
import {
  ExtractionReportNote,
  ProposalsPane,
  RuleRow,
  SavedRuleSet,
  orderForReview,
} from './screens/style-guide';
import type { FirmShelf } from './screens/knowledge';
import { DestinationBlock } from './destination-selector';
import { FindingsPanel, countFindings, narrowFindings, ruleOrSource } from './findings-panel';
import { AuthorshipCard, AuthorshipRail, provenanceFits } from './authorship-rail';
import { AuthorshipAppendixToggle } from './screens/schema';
import { Markdown } from '@infora/ui';
import { gapMarkers } from '@infora/contracts';
import type { PassageProvenance } from '@infora/contracts';
import { NOTHING_TO_READ, ScopeControl, WHOLE_LIBRARY, scopeField, scopeGroups, scopeLabel, scopeOf } from './scope-control';
import type { ScopeState } from './scope-control';
import { ExternalDocumentView } from './screens/external-document';
import { ScreenBlock, chartSeries, screenFor, trendLine } from './screens/app-screen';
import { BuilderConversation } from './screens/app-builder';
import { MemoryRouter } from 'react-router';
import {
  CHECK_FAMILY_CATALOGUE,
  DEFAULT_CHECK_PRESET,
  DOCUMENT_PURPOSE_CATALOGUE,
} from '@infora/contracts';
import {
  AttachedCopy,
  CheckFamilyRow,
  CheckPlanCard,
  ChosenNote,
  DisprovingPassOption,
  StrengthMap,
  disprovingCostStatement,
  disprovingEstimateOf,
  AgentPane,
  LibraryScopeCopy,
  ProposedDocumentCard,
  RunProgress,
  SectionComposer,
  StyleGuidePicker,
  StyleSourcesNote,
  ToolCard,
} from './screens/tools';

// ── T-470 — the scope control (it replaced T-292's Data sources chip) ────────
//
// The control is a view over a `ScopeState`, so the tests hand it one: nothing
// here needs a browser, and the parts that need a keyboard are the pure
// functions in @infora/ui (`multiPickerStep`) and the end-to-end spec.
const SOURCES = [
  { containerId: 'c1', versionId: 'v1', documentReference: 'WA-GEO-001', title: 'Ground investigation', description: 'Boreholes and trial pits.' },
  { containerId: 'c2', versionId: 'v2', documentReference: 'WA-ENV-004', title: 'Environmental baseline', description: null },
];
const SCHEME: ClassificationSchemeResponse = {
  facets: [
    {
      id: 'f1',
      key: 'discipline',
      name: 'Discipline',
      source: 'owner',
      sortOrder: 0,
      terms: [
        { id: 't1', facetId: 'f1', parentTermId: null, code: 'GEO', label: 'Geotechnical', sortOrder: 0, retiredAt: null },
        { id: 't2', facetId: 'f1', parentTermId: null, code: 'OLD', label: 'Retired discipline', sortOrder: 1, retiredAt: '2026-01-01T00:00:00.000Z' },
      ],
    },
  ],
} as unknown as ClassificationSchemeResponse;
const REACH = {
  visibleLive: 5,
  inScope: 2,
  excludedByState: { superseded: 0, withdrawn: 0 },
  leftOutByScope: 3,
};
const scopeState = (over: Partial<ScopeState> = {}): ScopeState => ({
  projectId: 'p1',
  value: WHOLE_LIBRARY,
  setValue: () => {},
  grounding: { sources: SOURCES, assemblyTokenBudget: 12000, termCounts: { t1: 4 } },
  scheme: SCHEME,
  saved: [],
  reloadSaved: () => {},
  reach: null,
  scope: undefined,
  nothingToRead: false,
  blockedReason: undefined,
  ...over,
});

describe('T-470 — the scope control keeps the old chip’s honesty about an empty library', () => {
  it('states "no sources in scope" in a warning tone, and offers nothing to open', () => {
    // a grounded answer over an empty scope is the single most misleading state
    // Ask can be in: the answer arrives, it is fluent, and nothing on the
    // screen says it rested on nothing
    const html = renderToStaticMarkup(
      <ScopeControl
        state={scopeState({ grounding: { sources: [], assemblyTokenBudget: 12000, termCounts: {} } })}
      />,
    );
    expect(html).toContain('No sources in scope');
    expect(html).toContain('chip-warning');
    expect(html).toContain('disabled');
    expect(html).not.toContain('aria-haspopup');
  });

  it('a scope that could not be READ is not zero sources, and says nothing of the kind', () => {
    // the warning is a claim about the corpus; a claim we could not check must
    // not be made
    const html = renderToStaticMarkup(<ScopeControl state={scopeState({ grounding: null })} />);
    expect(html).not.toContain('No sources in scope');
    expect(html).toContain('Scope: whole library');
  });

  it('a non-empty library gives a button that opens a list, so the zero case is the exception', () => {
    const html = renderToStaticMarkup(<ScopeControl state={scopeState()} />);
    expect(html).toContain('<button');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Scope: whole library');
    expect(html).not.toContain('chip-warning');
    // closed: the list is not on the page
    expect(html).not.toContain('role="option"');
  });
});

describe('T-470 — the chip says what the run will read', () => {
  const labels = new Map([['t1', 'Geotechnical'], ['t3', 'Report']]);
  it('names a term and counts documents', () => {
    expect(scopeLabel({ termIds: ['t1'], containerIds: ['c1', 'c2'], saved: null }, labels)).toBe('Scope: Geotechnical · 2 documents');
    expect(scopeLabel({ termIds: [], containerIds: ['c1'], saved: null }, labels)).toBe('Scope: 1 document');
  });
  it('names a saved scope by its name, and the whole library by nothing', () => {
    expect(scopeLabel({ termIds: ['t1'], containerIds: [], saved: { id: 's1', name: 'Geotech only' } }, labels)).toBe('Scope: Geotech only');
    expect(scopeLabel(WHOLE_LIBRARY, labels)).toBe('Scope: whole library');
  });
  it('a scope that reaches nothing turns the chip to a warning that says so', () => {
    const html = renderToStaticMarkup(
      <ScopeControl
        state={scopeState({
          value: { termIds: ['t1'], containerIds: [], saved: null },
          scope: { termIds: ['t1'] },
          reach: { ...REACH, inScope: 0, leftOutByScope: 5 },
          nothingToRead: true,
          blockedReason: NOTHING_TO_READ,
        })}
      />,
    );
    expect(html).toContain('chip-warning');
    expect(html).toContain('nothing to read');
  });
});

describe('T-470 — the open list: vocabulary, documents, saved scopes, in that order', () => {
  const saved = [{ id: 's1', name: 'Geotech only', filter: { termIds: ['t1'] }, shared: false, mine: true, savedBy: { participantId: 'x', name: 'Me' } }] as unknown as SavedView[];
  const open = (over: Partial<ScopeState> = {}) =>
    renderToStaticMarkup(<ScopeControl initiallyOpen state={scopeState({ saved, reach: REACH, ...over })} />);

  it('lists every facet term with the number of visible documents carrying it, and hides a retired term', () => {
    const html = open();
    expect(html).toContain('Geotechnical');
    expect(html).toContain('Discipline');
    expect(html).toContain('multi-picker-count">4<');
    expect(html).not.toContain('Retired discipline');
  });

  it('lists the documents by reference and title, then the saved scopes, after the vocabulary', () => {
    const html = open();
    expect(html).toContain('WA-GEO-001');
    expect(html).toContain('Ground investigation');
    expect(html).toContain('Geotech only');
    const order = ['Vocabulary', 'Documents', 'Saved scopes'].map((heading) => html.indexOf(heading));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('a document’s description is searched, not shown', () => {
    const groups = scopeGroups({ scheme: SCHEME, grounding: scopeState().grounding, saved: [] });
    const docs = groups.find((g) => g.id === 'documents')!;
    expect(docs.options[0]).toMatchObject({ label: 'WA-GEO-001', hint: 'Ground investigation', keywords: 'Boreholes and trial pits.' });
    expect(open()).not.toContain('Boreholes and trial pits.');
  });

  it('says what the choice reaches, in the one sentence — and "Nothing to read" when it is nothing', () => {
    expect(open()).toContain('2 documents in your scope can be read. Your scope left out 3 you could have included.');
    const none = open({ nothingToRead: true, reach: { ...REACH, inScope: 0 } });
    expect(none).toContain('Nothing to read in this scope');
  });

  it('marks what is ticked, and offers to clear and to save only when something is chosen', () => {
    const plain = open();
    expect(plain).not.toContain('Save this scope');
    const chosen = open({ value: { termIds: ['t1'], containerIds: [], saved: null }, scope: { termIds: ['t1'] } });
    expect(chosen).toContain('aria-selected="true"');
    expect(chosen).toContain('Save this scope…');
    expect(chosen).toContain('Use the whole library');
  });

  it('applying a saved scope names it, and a saved scope is not offered to be saved again', () => {
    const named = open({
      value: { termIds: ['t1'], containerIds: [], saved: { id: 's1', name: 'Geotech only' } },
      scope: { savedScopeId: 's1' },
    });
    expect(named).toContain('Scope: Geotech only');
    expect(named).not.toContain('Save this scope');
  });
});

describe('T-470 — every surface sends the scope the same way', () => {
  it('the whole library sends no scope at all; a choice sends exactly it; a saved scope stands alone', () => {
    expect(scopeOf(WHOLE_LIBRARY)).toBeUndefined();
    expect(scopeField(scopeOf(WHOLE_LIBRARY))).toEqual({});
    expect(scopeOf({ termIds: ['t1'], containerIds: [], saved: null })).toEqual({ termIds: ['t1'] });
    expect(scopeOf({ termIds: [], containerIds: ['c1'], saved: null })).toEqual({ containerIds: ['c1'] });
    expect(scopeOf({ termIds: ['t1'], containerIds: ['c1'], saved: null })).toEqual({ termIds: ['t1'], containerIds: ['c1'] });
    expect(scopeOf({ termIds: ['t1'], containerIds: ['c1'], saved: { id: 's1', name: 'n' } })).toEqual({ savedScopeId: 's1' });
    expect(scopeField({ termIds: ['t1'] })).toEqual({ scope: { termIds: ['t1'] } });
  });

  it('Ask’s request carries the scope in its body, and nothing when there is none', async () => {
    const bodies: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({}), { status: 201, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      await api.createRun('conv', 'a question', undefined, undefined, undefined, { termIds: ['t1'] });
      await api.createRun('conv', 'a question');
      await api.scopePreview('p1', { containerIds: ['c1'] });
      await api.scopePreview('p1', undefined);
    } finally {
      globalThis.fetch = original;
    }
    expect(bodies[0]).toMatchObject({ request: 'a question', scope: { termIds: ['t1'] } });
    expect(bodies[1]).not.toHaveProperty('scope');
    expect(bodies[2]).toEqual({ scope: { containerIds: ['c1'] } });
    expect(bodies[3]).toEqual({});
  });

  it('a scope that reaches nothing turns the composer’s send off and says why beside it', () => {
    const html = renderToStaticMarkup(
      <ChatComposer placeholder="Ask" pending={false} onSend={() => {}} blockedReason={NOTHING_TO_READ} />,
    );
    expect(html).toContain('Nothing to read in this scope');
    expect(html).toContain('disabled');
  });
});

describe('T-295 — the destination block names BOTH labels, and the reason is mandatory', () => {
  const refused: DestinationCheckResponse = {
    allowed: false,
    sourceLabel: 'single_organisation',
    destinationLabel: 'multi_organisation',
    reason: 'the sources are held by one organisation and the destination reaches two',
  };

  it('names both labels in words, not codes — "refused" alone is unactionable', () => {
    const html = renderToStaticMarkup(
      <DestinationBlock verdict={refused} destinationName="Shared drafting" onOverride={() => {}} />,
    );
    expect(html).toContain('held by one organisation');
    expect(html).toContain('shared across organisations');
    expect(html).toContain('Shared drafting');
    expect(html).toContain('so it is blocked');
  });

  it('BLOCKED BY DEFAULT: the override is disabled until a reason is typed', () => {
    // an override with no reason is a record that answers "somebody did it" and
    // not "somebody did it because"
    const html = renderToStaticMarkup(
      <DestinationBlock verdict={refused} destinationName="Shared drafting" onOverride={() => {}} />,
    );
    const button = html.slice(html.indexOf('Write it there anyway') - 200);
    expect(button).toContain('disabled');
  });
});

describe('T-334/T-335 — the Tools section and the creator’s own copy', () => {
  it('an unbuilt tool says what it waits on and offers nowhere to go', () => {
    const checker: ToolSummary = {
      id: 'qa-checker',
      label: 'QA checker',
      description: 'Check a draft.',
      state: 'unbuilt',
      waitsOn: 'being built as T-000 (a fixture — any unbuilt tool renders this way)',
    };
    // the shape the surface renders from — an `unbuilt` tool carries no href,
    // which is what stops a tile promising a screen that does not exist
    expect(checker.href).toBeUndefined();
    expect(checker.waitsOn).toContain('T-000');
  });
});

// ── T-403 — the Tools page becomes cards ───────────────────────────────────
//
// The card form is more inviting than the row it replaces, and that is exactly
// what makes the assembled-not-filtered rule worth pinning here rather than
// trusting to review: the pull of an even grid is towards rendering a tool the
// viewer cannot use as a greyed card. These tests pin what a card must say and
// what it must never contain.
describe('T-403 — a tool renders as a card with an icon and what it does', () => {
  const card = (tool: ToolSummary) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ToolCard tool={tool} />
      </MemoryRouter>,
    );

  const creator: ToolSummary = {
    id: 'document-creation',
    label: 'Document creator',
    description: 'Build a document’s structure, and choose the sources it draws on.',
    state: 'available',
    href: '/projects/p1/tools/document-creation',
  };

  it('carries the name, an icon and the description inside one card', () => {
    const html = card(creator);
    expect(html).toContain('tool-card');
    expect(html).toContain('Document creator');
    // the icon is an SVG the card draws itself, not a decoration the copy names
    expect(html).toContain('<svg');
    expect(html).toContain('choose the sources it draws on');
    expect(html).toContain('/projects/p1/tools/document-creation');
  });

  it('gives an unbuilt tool the same card form, with its note inside it', () => {
    const html = card({
      id: 'not-a-real-tool',
      label: 'Extractor',
      description: 'Pull structured rows out of the record.',
      state: 'unbuilt',
      waitsOn: 'being built as T-000 (a fixture — any unbuilt tool renders this way)',
    });
    expect(html).toContain('tool-card--unbuilt');
    expect(html).toContain('Not built yet');
    expect(html).toContain('T-000');
    // a tool this deployment's icon map has never met still gets a card
    expect(html).toContain('<svg');
    // and nowhere to go — the card is not a link
    expect(html).not.toContain('<a ');
  });
});

// ── T-406 — the launcher asks four plain questions ─────────────────────────
//
// The four answers reach the drafting call, and their prompt half is pinned in
// `capabilities`. What is pinnable HERE is the copy an author reads before
// answering — which is the half a rename or a tidy-up would silently lose, and
// the half the word "shape" failed at: it named a control without telling
// anybody what they were being asked.
describe('T-406 — the launcher explains each answer, and the style control is honest', () => {
  it('shows the chosen option’s own sentence, not just its label', () => {
    const html = renderToStaticMarkup(
      <ChosenNote catalogue={DOCUMENT_PURPOSE_CATALOGUE} value="external-document" />,
    );
    expect(html).toContain('Written to leave your firm');
  });

  it('says a project has no style guide rather than hiding the control (A1)', () => {
    // "honestly empty rather than absent" — a missing control reads as "style
    // is handled" when in fact nobody has set the project up
    const html = renderToStaticMarkup(
      <StyleGuidePicker guides={[]} selected={[]} onToggle={() => {}} />,
    );
    expect(html).toContain('No style guide is loaded');
    expect(html).toContain('will invent no house rules');
  });

  it('🔒 tells a FAILED READ apart from an empty one', () => {
    // saying "no style guide is loaded" off a request that did not answer is a
    // claim about the project this screen cannot make
    const html = renderToStaticMarkup(
      <StyleGuidePicker guides={null} selected={[]} onToggle={() => {}} />,
    );
    expect(html).toContain('could not be read');
    expect(html).toContain('not the same as there being none');
    expect(html).not.toContain('No style guide is loaded');
  });

  it('lets more than one guide be selected — it is a checklist, not a select', () => {
    const guide = (id: string, title: string): StyleGuideRecord => ({
      id,
      title,
      sourceFormat: 'docx',
      clauses: 12,
      labelled: 12,
      loadedBy: { userId: 'u1', name: 'A person' },
      loadedAt: '2026-08-31T00:00:00.000Z',
      retiredAt: null,
    });
    const html = renderToStaticMarkup(
      <StyleGuidePicker
        guides={[guide('g1', 'Project style guide'), guide('g2', 'Drawing conventions')]}
        selected={['g1', 'g2']}
        onToggle={() => {}}
      />,
    );
    expect(html).toContain('Project style guide');
    expect(html).toContain('Drawing conventions');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('<select');
  });
});

// ── T-408 — the plan is the proposed document ──────────────────────────────
//
// Two things on one page and only one of them editable, which is the whole of
// ADR-0053 addendum A2. The tests that matter are the negative ones: a control
// that edited a STEP would reopen §12, and it would look like a feature.
const proposedPlan: ToolPlan = {
  workflowId: 'document-creation',
  workflowVersion: 2,
  steps: [
    {
      key: 'build',
      stage: 'present',
      worker: 'document_builder',
      label: 'Draft 2 sections — Purpose, The evidence — from the 3 bound sources',
      estimate: { calls: 1, tokensPrompt: 2200, tokensCompletion: 700, cost: 0.01 },
    },
  ],
  coverage: '2 sections · 3 bound sources · 1 drafting pass',
  cost: { total: 0.01, priced: true },
  refusal: null,
  proposal: {
    overview: 'Does the baseline support the assessment? It will be written as a technical note.',
    sections: [
      { heading: 'Purpose', brief: 'State what this note answers.', edited: false, depth: 0 as const },
      {
        heading: 'The evidence',
        brief: 'No — set out X in bullets.',
        edited: true,
        depth: 0 as const,
      },
    ],
  },
};

describe('T-408 — the plan proposes a document, and only the briefs are editable', () => {
  const plan = proposedPlan;

  const render = (over: Partial<ToolPlan> = {}) =>
    renderToStaticMarkup(
      <ProposedDocumentCard
        plan={{ ...plan, ...over }}
        busy={false}
        onEditBrief={() => {}}
        onAccept={() => {}}
      />,
    );

  // T-412 — the prospectus is the document you are about to get, so a nested
  // outline reads nested here too. A plan that showed flat and produced nested
  // would be describing a different document.
  it('shows a sub-section as one, under its parent (T-412)', () => {
    const html = render({
      proposal: {
        overview: 'A note.',
        sections: [
          { heading: 'Baseline', brief: 'what the record says', edited: false, depth: 0 },
          { heading: '2025 survey', brief: 'what it found', edited: false, depth: 1 },
        ],
      },
    });
    expect(html).toContain('proposal-section--sub');
    expect(html).toContain('2025 survey');
  });

  it('sets out the overarching instructions, then a description per section', () => {
    const html = render();
    expect(html).toContain('Does the baseline support the assessment?');
    expect(html).toContain('Purpose');
    expect(html).toContain('State what this note answers.');
    expect(html).toContain('No — set out X in bullets.');
  });

  it('says which descriptions the author replaced', () => {
    // a corrected page must not read as one the planner wrote
    expect(render()).toContain('Your wording');
  });

  it('🔒 offers an editable control for every BRIEF and none for any STEP', () => {
    const html = render();
    // one textarea per section brief, and no more
    expect((html.match(/<textarea/g) ?? []).length).toBe(2);
    // the step is rendered as text, with nothing to edit it with
    expect(html).toContain('Draft 2 sections');
    expect(html).toContain('are not editable');
    expect(html).not.toContain('Edit step');
  });

  it('accepts the plan with a chip, and a refusal replaces it rather than sitting beside it', () => {
    expect(render()).toContain('Accept the plan and create the document');
    const refused = render({ refusal: 'No sources are bound to this document.' });
    expect(refused).toContain('No sources are bound');
    expect(refused).not.toContain('Accept the plan and create the document');
  });
});

// ── T-409 — the agent pane ─────────────────────────────────────────────────
//
// The pane is reached PER SECTION, and it writes back through the same door a
// typed correction uses. What is pinnable here is that the chip is per section
// and that the pane names the section it is targeted at — an agent told "the
// second one is wrong" about a whole plan is an agent guessing which one.
describe('T-409 — the agent pane is opened per section and named for it', () => {
  it('gives every section its own chip, and none where no pane is wired', () => {
    const withPane = renderToStaticMarkup(
      <ProposedDocumentCard
        plan={proposedPlan}
        busy={false}
        onEditBrief={() => {}}
        onAsk={async () => null}
        onAccept={() => {}}
      />,
    );
    expect((withPane.match(/Ask the agent/g) ?? []).length).toBe(2);

    const without = renderToStaticMarkup(
      <ProposedDocumentCard
        plan={proposedPlan}
        busy={false}
        onEditBrief={() => {}}
        onAccept={() => {}}
      />,
    );
    expect(without).not.toContain('Ask the agent');
  });

  it('names the section it is revising, and offers no way to touch a step', () => {
    const html = renderToStaticMarkup(
      <AgentPane heading="The evidence" busy={false} onAsk={async () => null} onClose={() => {}} />,
    );
    expect(html).toContain('The evidence');
    expect(html).toContain('Revise this description');
    // the pane's whole reach is one description
    expect(html).not.toContain('step');
  });
});

// ── T-407 — the outline is composed ────────────────────────────────────────
//
// The empty state is the one worth pinning hardest: a composer that helpfully
// pre-filled itself would be an outline arriving ready-made wearing a new
// name, which is exactly what A1 retired.
describe('T-407 — the author composes the outline', () => {
  const outline = {
    id: 'technical-note',
    label: 'Technical note',
    description: 'A short note.',
    sections: [{ heading: 'Purpose', purpose: 'why' }],
    origin: 'infora' as const,
  };

  it('starts empty, and says so rather than seeding itself', () => {
    const html = renderToStaticMarkup(
      <SectionComposer sections={[]} outlines={[outline]} onChange={() => {}} />,
    );
    expect(html).toContain('No sections yet');
    expect(html).toContain('Add a section');
  });

  it('offers a starting outline as a start, and says it stays editable', () => {
    const html = renderToStaticMarkup(
      <SectionComposer sections={[]} outlines={[outline]} onChange={() => {}} />,
    );
    expect(html).toContain('Start from:');
    expect(html).toContain('Technical note');
    // "seeds but never locks" is on the screen, not only in an ADR
    expect(html).toContain('stays yours to edit or remove');
  });

  it('gives every section a heading, a purpose and the controls to move it', () => {
    const html = renderToStaticMarkup(
      <SectionComposer
        sections={[
          { heading: 'Purpose', purpose: 'why' },
          { heading: 'The evidence', purpose: 'what' },
        ]}
        outlines={[]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('Purpose');
    expect(html).toContain('The evidence');
    expect(html).toContain('Move up');
    expect(html).toContain('Move down');
    expect(html).toContain('Remove section');
    // the first cannot move up and the last cannot move down
    expect((html.match(/disabled/g) ?? []).length).toBe(2);
  });

  // ── T-412 — sub-sections ────────────────────────────────────────────────
  it('offers an "add a sub-section" under every section', () => {
    const html = renderToStaticMarkup(
      <SectionComposer
        sections={[{ heading: 'Baseline', purpose: 'what the record says' }]}
        outlines={[]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('Add a sub-section');
  });

  it('numbers a sub-section under its parent, and gives it its own controls', () => {
    const html = renderToStaticMarkup(
      <SectionComposer
        sections={[
          { heading: 'Purpose', purpose: 'why' },
          {
            heading: 'Baseline',
            purpose: 'what the record says',
            subSections: [
              { heading: '2025 survey', purpose: 'what it found' },
              { heading: 'Earlier work', purpose: 'what preceded it' },
            ],
          },
        ]}
        outlines={[]}
        onChange={() => {}}
      />,
    );
    // `2.1` and `2.2` — the decimal numbering every engineering document
    // already uses, so the nesting needs no explaining
    expect(html).toContain('2.1');
    expect(html).toContain('2.2');
    expect(html).toContain('2025 survey');
    // 🔒 a sub-section moves WITHIN its parent and nowhere else: its controls
    // are its own, and there is no control that would lift it out
    expect(html).toContain('Move sub-section up');
    expect(html).toContain('Move sub-section down');
    expect(html).toContain('Remove sub-section');
    expect(html).not.toContain('Promote');
    expect(html).not.toContain('Outdent');
  });

  it('says on screen that a sub-section is written under its parent’s heading', () => {
    const html = renderToStaticMarkup(
      <SectionComposer sections={[]} outlines={[]} onChange={() => {}} />,
    );
    expect(html).toContain('under its parent’s heading');
  });

  // ── T-414 (ADR-0053 addendum A5) — saved starting outlines ──────────────
  //
  // The visible mark is the owner's whole answer to a stress test: a half-baked
  // outline somebody saved last Tuesday, sitting unmarked beside one Infora
  // ships, reads as the product's recommendation.
  const firm = {
    id: 'saved-1',
    label: 'Land quality note',
    description: '4 sections, saved by Eleanor Price.',
    sections: [{ heading: 'Purpose', purpose: 'why' }],
    origin: 'firm' as const,
    savedBy: { name: 'Eleanor Price' },
    savedAt: '2026-09-01T09:00:00.000Z',
  };

  it('marks a firm outline as the firm’s own, and leaves a shipped one unmarked', () => {
    const html = renderToStaticMarkup(
      <SectionComposer sections={[]} outlines={[outline, firm]} onChange={() => {}} />,
    );
    expect(html).toContain('Your firm');
    expect((html.match(/Your firm/g) ?? []).length).toBe(1);
    expect(html).toContain('Land quality note');
    expect(html).toContain('Technical note');
  });

  it('offers the retire control ONLY where the requester may retire — absent, never disabled', () => {
    const may = renderToStaticMarkup(
      <SectionComposer
        sections={[]}
        outlines={[{ ...firm, mayRetire: true }]}
        onChange={() => {}}
        onRetire={async () => {}}
      />,
    );
    const mayNot = renderToStaticMarkup(
      <SectionComposer
        sections={[]}
        outlines={[firm]}
        onChange={() => {}}
        onRetire={async () => {}}
      />,
    );
    expect(may).toContain('Retire Land quality note');
    // the assembled-not-filtered rule at a button: the control does not reach
    // the page greyed out, it does not reach it at all
    expect(mayNot).not.toContain('Retire Land quality note');
    expect(mayNot).not.toContain('disabled');
  });

  it('offers "save this outline" once there is an outline, with no tier check on it', () => {
    // A5: ANYONE in the firm saves. The curator's tier governs retiring only,
    // so there is deliberately no permission prop on the save control.
    const empty = renderToStaticMarkup(
      <SectionComposer sections={[]} outlines={[]} onChange={() => {}} onSave={async () => {}} />,
    );
    const built = renderToStaticMarkup(
      <SectionComposer
        sections={[{ heading: 'Purpose', purpose: 'why' }]}
        outlines={[]}
        onChange={() => {}}
        onSave={async () => {}}
      />,
    );
    expect(empty).not.toContain('Save this outline for your firm');
    expect(built).toContain('Save this outline for your firm');
  });

  it('says on screen that a saved outline is the firm’s alone', () => {
    // the scoping is a promise made to the person saving, so it is made where
    // they are making the decision rather than only in an ADR
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    expect(source).toContain('for your firm only, marked as yours');
    expect(source).toContain('Another organisation on this project never sees it');
  });

  it('tells the author a purpose is scope, not a conclusion', () => {
    // the rule the shipped templates' guidance was always held to, now that
    // the words are the author's: an outline that said what to conclude would
    // make every document agree with its outline rather than with its sources
    const html = renderToStaticMarkup(
      <SectionComposer sections={[]} outlines={[]} onChange={() => {}} />,
    );
    expect(html).toContain('not what you expect it to conclude');
  });
});

// ── T-311 — the two sentences the marked-up edit is sold on ─────────────────
//
// ADR-0053 §6 puts the mechanical/rewrite distinction **on the screen** rather
// than only in an ADR, and ADR-0048 §5 requires a quoted rule to render
// differently from a grounded citation *"or the distinction survives in the
// model and dies on the screen"*. Both are copy-and-layout claims decided
// before any handler runs, so both are pinnable here — and both would fail
// silently otherwise, because the wrong render still looks like a working
// screen.
describe('T-311 — the accept-all sits above the mechanical fixes and NO rewrite gets one', () => {
  const base = {
    id: 'f-1',
    runId: 'r-1',
    checkFamily: 'style' as const,
    sandboxDocumentId: 'sd-1',
    anchor: { span: { start: 0, end: 10 }, paragraph: 0, verbatim: 'The Scheme' },
    defect: 'The works are capitalised.',
    severity: 'advisory' as const,
    status: 'open' as const,
    closedBy: null,
    closedAt: null,
    createdAt: '2026-08-31T00:00:00.000Z',
  };
  const suggestion = {
    id: 'sg-1',
    runId: 'r-1',
    workItemId: null,
    sandboxDocumentId: 'sd-1',
    kind: 'replace' as const,
    content: 'The scheme',
    rationale: 'x',
    citations: [],
  };
  const styleGuide = {
    input: 'rulebook' as const,
    clause: '§2.1',
    quote: 'Refer to the works as “the scheme”, in lower case.',
    rulebookRef: 'guide-1',
    scope: 'project' as const,
  };

  const mechanical: Finding = {
    ...base,
    evidence: styleGuide,
    proposedRevision: suggestion,
    fix: {
      kind: 'mechanical',
      find: 'Scheme',
      replace: 'scheme',
      occurrences: 55,
      summary: 'Scheme → scheme, 55 places',
    },
  };
  const rewrite: Finding = {
    ...base,
    id: 'f-2',
    evidence: { ...styleGuide, clause: '§4.2', quote: 'Avoid the passive voice.', scope: 'organisation' },
    proposedRevision: { ...suggestion, id: 'sg-2', content: 'The scheme delivered a reduction.' },
    fix: { kind: 'rewrite', reason: 'the same substitution applied everywhere does not produce this proposal' },
  };

  const render = (findings: Finding[]) =>
    renderToStaticMarkup(
      <FindingsPanel
        findings={findings}
        busy={false}
        focused={null}
        drifted={[]}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
      />,
    );

  it('T-470 — the header says what the check read, in the one reach sentence, when it has the counts', () => {
    const reach = { read: 3, visibleLive: 9, inScope: 3, excludedByState: { superseded: 0, withdrawn: 1 }, leftOutByScope: 6 };
    const withReach = renderToStaticMarkup(
      <FindingsPanel
        findings={[mechanical]}
        reach={reach}
        busy={false}
        focused={null}
        drifted={[]}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
      />,
    );
    expect(withReach).toContain('Read 3 documents in your scope. Excluded: 1 withdrawn. Your scope left out 6 you could have included.');
    // not this reader's run: no counts, so no sentence and no guess
    expect(render([mechanical])).not.toContain('findings-reach');
  });

  it('offers an accept-all over a group of mechanical fixes, and states the SIZE of the decision', () => {
    const html = render([mechanical]);
    // the count is the point: it says how big the decision is, which is the
    // whole difference between bulk acceptance and bulk inattention
    expect(html).toContain('Accept 1 mechanical correction');
    expect(html).toContain('Scheme → scheme, 55 places');
  });

  it("the drift banner states the degrade path's one user-visible sentence", () => {
    // review, 2026-08-31 — the only copy a reviewer sees when accepting a fix
    // failed because the draft moved underneath it; previously untested
    const html = renderToStaticMarkup(
      <FindingsPanel
        findings={[mechanical, rewrite]}
        busy={false}
        focused={null}
        drifted={['f-1', 'f-2']}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
      />,
    );
    expect(html).toContain('2 marks have moved');
    expect(html).toContain('nothing was written');
    expect(html).toContain('rather than taking the suggestion blind');
  });

  it('🔒 offers NO accept-all to a group that is only rewrites', () => {
    const html = render([rewrite]);
    expect(html).not.toContain('Accept 1 mechanical');
    expect(html).not.toContain('mechanical correction');
    // and it says WHY this one is read alone, because "it is a rewrite" with no
    // why reads as an arbitrary system
    expect(html).toContain('does not produce this proposal');
  });

  it('🔒 in a MIXED group the accept-all covers the mechanical fixes only, and says so', () => {
    const html = render([mechanical, rewrite]);
    // one, not two — the button is scoped to the half that may be taken at once
    expect(html).toContain('Accept 1 mechanical correction');
    expect(html).toContain('The rest are rewritten wording, so they are read one at a time.');
  });

  it('bulk DISMISSAL is offered over the whole group, rewrites included', () => {
    // dismissing changes no work product: forty declined advisory findings from
    // one rule is one professional judgement, not forty skipped (ADR-0053 §6)
    expect(render([rewrite])).toContain('Dismiss all');
  });

  it('never says the document is fine — an empty panel is a record, not a verdict', () => {
    const html = render([]);
    expect(html).toContain('No findings have been recorded');
    expect(html).not.toMatch(/no (problems|issues) (were )?found/i);
  });
});

describe('T-311 — a quoted rule renders differently from a grounded citation (ADR-0048 §5)', () => {
  const base = {
    id: 'f-1',
    runId: 'r-1',
    sandboxDocumentId: 'sd-1',
    anchor: { span: { start: 0, end: 10 }, paragraph: 0, verbatim: 'The Scheme' },
    severity: 'required' as const,
    status: 'open' as const,
    closedBy: null,
    closedAt: null,
    createdAt: '2026-08-31T00:00:00.000Z',
  };

  const render = (finding: Finding) =>
    renderToStaticMarkup(
      <FindingsPanel
        findings={[finding]}
        busy={false}
        focused={null}
        drifted={[]}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
      />,
    );

  it('a quoted rule is a quotation with its clause address, and NOT a source chip', () => {
    const html = render({
      ...base,
      checkFamily: 'style',
      defect: 'This paragraph uses the passive voice three times.',
      evidence: {
        input: 'rulebook',
        clause: '§4.2',
        quote: 'Avoid the passive voice.',
        rulebookRef: 'rulebook-1',
        scope: 'organisation',
      },
    });
    expect(html).toContain('quoted-rule');
    expect(html).toContain('§4.2');
    expect(html).toContain('Avoid the passive voice.');
    // 🔒 a rule does not resolve to a document, so a chip that looked like a
    // citation would be claiming something the finding never said
    expect(html).not.toContain('source-chip');
  });

  it('names WHICH style source it came from, because the two differ in who may read them', () => {
    const firm = render({
      ...base,
      checkFamily: 'style',
      defect: 'x',
      evidence: {
        input: 'rulebook',
        clause: '§4.2',
        quote: 'Avoid the passive voice.',
        rulebookRef: 'rulebook-1',
        scope: 'organisation',
      },
    });
    const project = render({
      ...base,
      checkFamily: 'style',
      defect: 'x',
      evidence: {
        input: 'rulebook',
        clause: '§2.1',
        quote: 'Refer to the works as “the scheme”.',
        rulebookRef: 'guide-1',
        scope: 'project',
      },
    });
    expect(firm).toContain('your firm’s rulebook');
    expect(project).toContain('project style guide');
  });

  it('a corpus finding DOES get chips — only a grounded finding is cited (§7)', () => {
    const html = render({
      ...base,
      checkFamily: 'corpus_accuracy',
      defect: 'The record gives 9% where this says 12%.',
      evidence: {
        input: 'corpus',
        citations: [
          { id: 'c-1', source: { versionId: 'v-1', documentReference: 'WA-ENV-WQ-001' } },
        ],
      },
    });
    expect(html).toContain('WA-ENV-WQ-001');
    expect(html).not.toContain('quoted-rule');
  });

  // T-468 — an authority reference is an authority chip (§), not a library one,
  // and it opens a card; a library citation opens a source card
  it('renders an authority reference as an authority chip, and a library one as a library chip', () => {
    const html = render({
      ...base,
      checkFamily: 'corpus_accuracy',
      defect: 'x',
      evidence: {
        input: 'corpus',
        citations: [
          { id: 'c-1', chunkId: 'k-1', source: { versionId: 'v-1', documentReference: 'WA-ENV-WQ-001' } },
          { id: 'c-2', source: { authorityRef: 'EIA Regs 2017' } },
        ],
      },
    });
    expect(html).toContain('<button type="button" class="cite lib"');
    expect(html).toContain('<button type="button" class="cite auth"');
    expect(html).toContain('EIA Regs 2017');
  });

  it('a quoted rule carries its label and is not a chip', () => {
    const html = render({
      ...base,
      checkFamily: 'style',
      defect: 'x',
      evidence: { input: 'rulebook', clause: '§4.2', quote: 'Avoid the passive voice.', rulebookRef: 'r-1', scope: 'organisation' },
    });
    expect(html).toContain('From your firm’s rulebook — a rule, not a citation');
    expect(html).not.toContain('class="cite');
  });

  it('an attached document is quoted and says on its face that it is not a project source', () => {
    const html = render({
      ...base,
      checkFamily: 'corpus_accuracy',
      defect: 'x',
      evidence: { input: 'attached', attachedSourceId: 'as-1', excerpt: 'peak flow 9%' },
    });
    expect(html).toContain('not a project source');
    expect(html).not.toContain('source-chip');
    expect(html).not.toContain('quoted-rule');
  });

  it('a finding measured against the draft itself cites nothing at all', () => {
    const html = render({
      ...base,
      checkFamily: 'readability',
      severity: 'advisory',
      defect: 'This section is denser than the document around it.',
      evidence: { input: 'draft', basis: 'the project’s grade-14 reading target' },
    });
    expect(html).toContain('Measured against the project’s grade-14 reading target');
    expect(html).not.toContain('source-chip');
    expect(html).not.toContain('quoted-rule');
  });
});

// ── T-336 — the launcher's load-bearing sentences ──────────────────────────
//
// The plan is what a user reads **before any spend**, and three of its
// sentences are the ticket rather than decoration: what the run will cover,
// what it is weaker at, and that it cannot be edited. The two
// document-selection affordances are a fourth — they are two guarantees, and a
// user who could not tell them apart would take the weak path without knowing.
describe('T-336 — the plan is rendered, not editable, and says what it is weaker at', () => {
  const plan: ToolPlan = {
    workflowId: 'qa-check',
    workflowVersion: 1,
    steps: [
      {
        key: 'check#0',
        stage: 'analyse',
        worker: 'qa_section_check',
        label: 'Read section 1 against 12 writing rules and the project record',
        estimate: { calls: 2, tokensPrompt: 4000, tokensCompletion: 400, cost: 0.018 },
      },
      {
        key: 'measure',
        stage: 'present',
        worker: 'qa_document_check',
        label: 'Score the draft for readability and check it for gaps and placeholders',
        estimate: { calls: 0, tokensPrompt: 0, tokensCompletion: 0, cost: 0 },
      },
    ],
    coverage: '11 sections · 4 checks · style guide 80 of 80 clauses, in 2 passes',
    cost: { total: 0.018, priced: true },
    refusal: null,
    shape: 'A pass per section over 11 sections, then one comparison of what they each assert.',
  };

  const render = (over: Partial<ToolPlan> = {}) =>
    renderToStaticMarkup(<CheckPlanCard plan={{ ...plan, ...over }} busy={false} onRun={() => {}} />);

  it('states the coverage BEFORE the run, in the shape the after-statement repeats', () => {
    const html = render();
    expect(html).toContain('11 sections · 4 checks · style guide 80 of 80 clauses, in 2 passes');
    expect(html).toContain('A pass per section over 11 sections');
  });

  // ── T-417 — the plan reads as a numbered workflow ───────────────────────
  it('renders the steps as an ORDERED sequence, numbered in run order', () => {
    const html = render();
    expect(html).toContain('plan-workflow');
    expect(html).toContain('<ol');
    // the numbers, and the labels beside them, in the order the planner emitted
    expect(html).toContain('>1</span>');
    expect(html).toContain('>2</span>');
    expect(html.indexOf('Read section 1 against')).toBeLessThan(
      html.indexOf('Score the draft for readability'),
    );
    expect(html).toContain('in the order it will happen');
  });

  it('🔒 RENDERING ONLY — nothing sorts, and the step list stays uneditable', () => {
    // the planner emits its steps in the order it will execute them, so a
    // component that sorted would be a second opinion about the order the run
    // takes. And a numbered list is still not an editable one (ADR-0053 §12).
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export function CheckPlanCard');
    const end = source.indexOf('export function QaCheckerScreen');
    const body = source.slice(start, end);
    expect(body).not.toContain('.sort(');
    expect(body).not.toContain('TextInput');
    expect(body).not.toContain('TextArea');
  });

  it('says the steps are not editable, and offers no control that would edit one', () => {
    const html = render();
    expect(html).toContain('the steps are not editable');
    // shaping the run is changing an ANSWER; hand-editing a step list would make
    // the plan `model_chosen` (ADR-0053 §12)
    expect(html).not.toContain('Edit step');
    expect(html).not.toContain('<input');
  });

  it('🔒 a caveat is shown BEFORE the run button — it degrades loudly or not at all', () => {
    const html = render({
      caveats: [
        'This draft has 400 sections — too many to compare all at once — so they are compared in 4 groups. A contradiction between two sections in different groups will not be found.',
      ],
    });
    expect(html).toContain('will not be found');
    expect(html.indexOf('will not be found')).toBeLessThan(html.indexOf('Run the check'));
  });

  it('a refusal REPLACES the button rather than sitting beside it (ADR-0053 §5)', () => {
    const html = render({ refusal: 'Section 2 is too long to check even on its own.' });
    expect(html).toContain('too long to check');
    expect(html).not.toContain('Run the check');
  });

  // T-410 (ADR-0053 addendum A3, owner 2026-08-31) — THESE TWO TESTS ARE
  // INVERTED, NOT DELETED. They used to assert that an unpriced deployment said
  // "not priced" rather than showing a plausible £0.00, and that a real total
  // rendered. The owner ruled the price off the plan surfaces, so the same two
  // cases now assert its ABSENCE — a deleted test would leave the surface free
  // to grow the line back without anything noticing.
  it('shows no price at all, priced or not (T-410)', () => {
    expect(render({ cost: { total: null, priced: false } })).not.toContain('not priced');
    expect(render()).not.toContain('£');
    expect(render()).not.toContain('Estimated cost');
  });

  it('says nothing about cost even when every step carries a real one', () => {
    // the plan still CARRIES the estimate — per-step cost recording is
    // untouched (§7), and only the display retired
    const html = render();
    expect(html).not.toContain('£0.0180');
    expect(html).toContain('Run the check');
  });
});

describe('T-336 — the two document-selection affordances are two guarantees (ADR-0053 §3)', () => {
  it('scoping to the library says findings CITE NORMALLY', () => {
    const html = renderToStaticMarkup(<LibraryScopeCopy />);
    expect(html).toContain('cite normally');
    expect(html).toContain('the whole library you can reach');
  });

  it('attaching says findings are NEVER CITED, and points at the other path', () => {
    // attaching a LIBRARY document silently yields the strictly worse result,
    // so the copy has to say which you get
    const html = renderToStaticMarkup(<AttachedCopy />);
    expect(html).toContain('never cited');
    expect(html).toContain('scope to the library document above instead');
  });

  // T-399 — the copy now covers BOTH ways a document gets attached, because the
  // upload is the same ADR-0022 treatment and copy naming only one of them
  // would leave the other looking like a different guarantee.
  it('names the uploaded file as an attachment too, under the same rule', () => {
    const html = renderToStaticMarkup(<AttachedCopy />);
    expect(html).toContain('a file you upload here');
    expect(html).toContain('never cited');
  });
});

// T-399 — the sentence this ticket DELETED is the one worth pinning: it stated
// an absence, and an absence that has been filled and still says so is worse
// than the original gap. Pinned as a source assertion rather than a render one
// because the control sits inside the checker screen, which needs a router and
// a project to render at all — and the claim under test is about the words on
// the page, which the source carries exactly.
describe('T-399 — a file can be handed straight to a check', () => {
  const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');

  it('no longer says uploading into a check is not built', () => {
    expect(source).not.toContain('Uploading a file straight into a check is not built yet');
    expect(source).not.toContain('not built yet');
  });

  it('offers the upload control, in the formats the extractor actually reads', () => {
    expect(source).toContain('Upload a file…');
    expect(source).toContain('.docx,.xlsx,.pptx,.pdf');
  });

  // the transient rule is a promise made to the user, so it is made ON SCREEN
  // and not only in the record
  it('says on screen that the file is kept nowhere and must be attached again', () => {
    expect(source).toContain('kept nowhere afterwards');
    expect(source).toContain('never its text');
    expect(source).toContain('attaching it again');
  });
});

// ── T-413 (ADR-0053 addendum A4) — THE PLAN IS NOT A DOOR INTO THE CREATOR ──
//
// **These assertions are INVERTED, not deleted.** The creator used to answer
// `?containerId=` with a refusal naming `Q-037`; the owner ruled the question
// on 2026-09-01 by cutting the link rather than by deciding what may cross it,
// so the refusal has no reason to exist. A test that was simply removed would
// leave the screen free to grow the doorway back with nothing noticing — which
// is the same argument T-410's inverted price tests already carry, one ruling
// along.
//
// Pinned as source assertions rather than render ones for T-399's reason: the
// controls sit inside the creator screen, which needs a router and a project to
// render at all, and the claim under test is about what the file does and does
// not contain.
describe('T-413 — the creator starts from a working-area location, never from the plan', () => {
  const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
  const sandbox = readFileSync(new URL('./screens/sandbox.tsx', import.meta.url), 'utf8');

  it('no longer refuses a bound container, because there is nothing to refuse', () => {
    expect(source).not.toContain('Starting the creator from a deliverable in the plan is not built');
    // and it no longer puts an open design question in front of a user, which
    // is what the refusal screen did. The question's number still appears in a
    // comment above the removal, recording WHY the screen went — that is the
    // record doing its job, not the screen.
    expect(source).not.toContain('is an open design question');
    expect(source).not.toContain('choose the sources yourself');
  });

  it('READS NO PLAN ROW AT ALL — the parameter that carried one is gone', () => {
    // the ruling is the absence: nothing of the owner-controlled plan reaches
    // producing-side authoring, so `Q-034`'s wall-through-content territory is
    // never entered
    expect(source).not.toContain("params.get('containerId')");
    expect(source).not.toContain('boundContainerId');
  });

  it('opens with the destination pre-filled from the working area it was started in', () => {
    expect(source).toContain("params.get('sandboxId')");
    expect(source).toContain('setDestination(launchedFrom)');
    // and it stays CHANGEABLE — one launcher (ADR-0053 §1), starting on a
    // different answer rather than a second screen with a fixed one
    expect(source).toContain('Change it here if the document belongs');
  });

  it('pre-fills only from the assembled list, never from the parameter itself', () => {
    // an id the requester cannot reach is absent from their own sandbox list,
    // so it fills nothing — a surface that trusted the URL would be answering
    // "does this exist" for something it was never shown
    expect(source).toContain('res.items.some((sandbox) => sandbox.id === launchedFrom)');
  });

  it('the working area offers the door, and hands over the location and NOTHING else', () => {
    expect(sandbox).toContain('Create with AI');
    expect(sandbox).toContain('tools/document-creation?sandboxId=');
    // no deliverable, no title, no reference riding along — a doorway that
    // passed those would re-open at the back what the ruling closed at the front
    expect(sandbox).not.toContain('tools/document-creation?containerId=');
  });
});

// ── T-415 — TICK A CHECK, SEE ITS OPTIONS (ADR-0053 §2) ────────────────────
//
// The defect this ticket fixes was on the screen, not in the record: ADR-0053
// §2 has always ruled the record's search depth a property of the corpus check
// alone, and the shipped launcher rendered it as a global "How hard to look"
// control at the foot of the card. The owner caught it by reading the
// photograph — *"I thought this was only for certain checks"* — and the ruling
// was that the screen is wrong. So what is pinned here is both halves: that the
// options unfold under their own check, and that no global control survives.
describe('T-415 — each check carries its own options', () => {
  const accuracy = CHECK_FAMILY_CATALOGUE.find((entry) => entry.family === 'corpus_accuracy')!;
  const readability = CHECK_FAMILY_CATALOGUE.find((entry) => entry.family === 'readability')!;

  it('the corpus family is called ACCURACY on screen (owner, 2026-09-01)', () => {
    expect(accuracy.label).toBe('Accuracy');
    // and it still says what it reads against, in the sentence under the name
    expect(accuracy.description).toContain('project library');
  });

  it('unfolds a check’s options under it when it is ticked', () => {
    const html = renderToStaticMarkup(
      <CheckFamilyRow entry={accuracy} checked onToggle={() => {}}>
        <span>How hard to look</span>
      </CheckFamilyRow>,
    );
    expect(html).toContain('Accuracy');
    expect(html).toContain('How hard to look');
    expect(html).toContain('check-family-options');
  });

  it('shows NOTHING under an unticked check — a setting with no effect looks like one that has', () => {
    const html = renderToStaticMarkup(
      <CheckFamilyRow entry={accuracy} checked={false} onToggle={() => {}}>
        <span>How hard to look</span>
      </CheckFamilyRow>,
    );
    expect(html).not.toContain('How hard to look');
    expect(html).not.toContain('check-family-options');
    // the check itself is still there to tick, and still says what it does
    expect(html).toContain('Accuracy');
  });

  it('keeps the No-AI badge on the two arithmetic checks', () => {
    // a checker described as so many model calls was describing half of itself
    expect(renderToStaticMarkup(<CheckFamilyRow entry={readability} checked onToggle={() => {}} />)).toContain('No AI');
    expect(renderToStaticMarkup(<CheckFamilyRow entry={accuracy} checked onToggle={() => {}} />)).not.toContain('No AI');
  });

  it('🔒 THE GLOBAL "HOW HARD TO LOOK" CONTROL IS GONE, and depth lives under Accuracy', () => {
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    // the heading that framed the whole card as one setting
    expect(source).not.toContain('<strong>How hard to look</strong>');
    // depth renders inside the accuracy row's own options and nowhere else:
    // the ONLY control bearing that label sits after the accuracy branch opens
    const under = source.indexOf("entry.family === 'corpus_accuracy'");
    expect(under).toBeGreaterThan(-1);
    expect(source.indexOf('<Field label="How hard to look">')).toBeGreaterThan(under);
    expect((source.match(/<Field label="How hard to look">/g) ?? []).length).toBe(1);
    // and the presets survive: a preset is a starting point, not a mode
    expect(source).toContain('CHECK_PRESETS.map');
    expect(source).toContain('it is a starting point, not a mode');
  });

  // T-421 — *in plain terms: Quick and Full are one switch with two positions,
  // not two buttons.* The RULE is untouched — a preset still sets the families
  // and the depth together (ADR-0053 §2), everything stays adjustable
  // afterwards, and Full is still the default. Only the drawing changed.
  it('🔒 the presets are ONE segmented control, and Full is still the default', () => {
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<SegmentedControl');
    // two Buttons in a row is what this replaced; it must not come back
    expect(source).not.toContain("variant={preset === entry.id ? 'primary' : 'quiet'}");
    // one honest choice: the preset sets BOTH halves, which is why choosePreset
    // still writes the families and the depth from the same object
    expect(source).toContain('setFamilies([...chosen.families]);');
    expect(source).toContain('setDepth(chosen.depth);');
    expect(DEFAULT_CHECK_PRESET).toBe('full');
  });
});

describe('T-415 — ticking House style says which rules will be applied', () => {
  const guide: StyleGuideRecord = {
    id: 'g1',
    title: 'Wrenfield project style guide',
    sourceFormat: 'docx',
    clauses: 12,
    labelled: 12,
    loadedBy: { userId: 'u1', name: 'Rachel Bowen' },
    loadedAt: '2026-08-30T09:00:00.000Z',
    retiredAt: null,
  };

  it('names the project’s guides AND the firm’s own manual, with the precedence', () => {
    // a screen listing only the project's guides would read as though the
    // firm's manual did not apply, and it always does (ADR-0053 §3)
    const html = renderToStaticMarkup(<StyleSourcesNote guides={[guide]} />);
    expect(html).toContain('Wrenfield project style guide');
    expect(html).toContain('12 clauses');
    expect(html).toContain('Your firm’s own manual');
    expect(html).toContain('The project’s guide wins where the two disagree');
  });

  it('says so when no project guide is loaded, rather than falling silent', () => {
    const html = renderToStaticMarkup(<StyleSourcesNote guides={[]} />);
    expect(html).toContain('No project style guide is loaded');
    expect(html).toContain('your firm’s own manual alone');
  });

  it('a guide list that could not be READ is not an empty one, and says which', () => {
    // "none loaded" and "could not be read" are different facts about a
    // project; a check that conflated them would let a project nobody had set
    // up read exactly like one deliberately left plain
    const html = renderToStaticMarkup(<StyleSourcesNote guides={null} />);
    expect(html).toContain('could not be read');
    expect(html).not.toContain('No project style guide is loaded');
  });
});

// ── T-416 — THE TWO SEARCHES (ADR-0053 §8) ────────────────────────────────
//
// **The rule a search box is most likely to break is the one this suite exists
// to hold.** A search that asked a server "find documents matching X" and then
// hid the unreachable ones on the way out would disclose that they exist by the
// shape of what came back. Both searches here are filters over a list that was
// already access-resolved server-side, and the components take their rows as a
// prop and reach nothing else — which is what makes "an unreachable document
// never appears" assertable rather than merely true today.
describe('T-470 — the library scope under the Accuracy check is the one scope control', () => {
  it('🔒 the control is a view over a list that was already access-resolved server-side', () => {
    // it takes its state as a prop and the documents come from the grounding
    // scope — the server's own access-resolved answer, not the library list. A
    // document not in that list cannot be searched into existence.
    const groups = scopeGroups({ scheme: null, grounding: scopeState().grounding, saved: [] });
    expect(groups.map((g) => g.id)).toEqual(['documents']);
    expect(groups[0]!.options.map((o) => o.label)).toEqual(['WA-GEO-001', 'WA-ENV-004']);
  });

  it('keeps the sentence that states the default before any choice is made', () => {
    // leaving the scope alone means the WHOLE library you can reach, which is
    // the opposite of what an empty selection usually means in a form
    expect(renderToStaticMarkup(<LibraryScopeCopy />)).toContain('the whole library you can reach');
  });
});

// ── T-471 — THE WORKING SET ─────────────────────────────────────────────────
//
// *In plain terms: one "Working set" button on Ask, the creator, the checker and
// the editor. The list shows drafts from the working areas you are part of,
// titled, each with the working area it sits in. The AI reads what you pick as
// background; the answer says so and cites none of it.*
describe('T-471 — the working-set picker', () => {
  const rows: WorkingAreaDocument[] = [
    { id: 'a1', title: 'Land quality method statement', sandboxId: 's1', sandboxName: 'Calder & Hale — working area', updatedAt: '2026-10-24T10:00:00Z' },
    { id: 'a2', title: 'Ecology baseline note', sandboxId: 's2', sandboxName: 'Shared drafting', updatedAt: '2026-10-24T09:00:00Z' },
  ];

  it('lists each draft by title with the working area it sits in', () => {
    const html = renderToStaticMarkup(
      <WorkingSetPicker projectId="p1" pinned={[]} onToggle={() => {}} initiallyOpen initialRows={rows} />,
    );
    expect(html).toContain('Land quality method statement');
    expect(html).toContain('Calder &amp; Hale — working area');
    expect(html).toContain('Shared drafting');
    expect(html).toContain('Drafts in your working areas');
    // multi-select, with a way out
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain('Done');
  });

  it('pinning two is two clicks and Done — the chip counts them and each row shows ticked', () => {
    const pinned = [
      { id: 'a1', title: 'Land quality method statement' },
      { id: 'a2', title: 'Ecology baseline note' },
    ];
    const html = renderToStaticMarkup(
      <WorkingSetPicker projectId="p1" pinned={pinned} onToggle={() => {}} initiallyOpen initialRows={rows} />,
    );
    expect(html).toContain('Working set · 2');
    expect(html.match(/aria-selected="true"/g)?.length).toBe(2);
    expect(html).toContain('2 in your working set');
    expect(html).toContain('never cited');
  });

  it('a pinned draft outside the current results is still listed, so it can be unpinned', () => {
    const groups = workingSetGroups({ rows, pinned: [{ id: 'z9', title: 'Older pinned draft' }] });
    expect(groups.map((g) => g.id)).toEqual(['working-area', 'pinned-elsewhere']);
    expect(groups[1]!.options.map((o) => o.label)).toEqual(['Older pinned draft']);
    // one that IS in the results stays where it is: rows do not jump on a click
    const same = workingSetGroups({ rows, pinned: [{ id: 'a1', title: 'x' }] });
    expect(same.map((g) => g.id)).toEqual(['working-area']);
  });

  it('never offers the draft being worked on', () => {
    const groups = workingSetGroups({ rows, pinned: [], exclude: ['a1'] });
    expect(groups[0]!.options.map((o) => o.id)).toEqual(['a2']);
  });

  it('lists, by title and marked, what colleagues pinned from a working area the reader is not in', () => {
    const html = renderToStaticMarkup(
      <WorkingSetPicker projectId="p1" pinned={[]} colleagues={['Team draft', 'Narrow draft']} onToggle={() => {}} initiallyOpen initialRows={rows} />,
    );
    expect(html).toContain('Team draft');
    expect(html).toContain('Narrow draft');
    expect(html.match(/not open to you/g)?.length).toBe(2);
    expect(html).toContain('Working set · 2');
  });

  it('shows a refusal in words beside the list', () => {
    const html = renderToStaticMarkup(
      <WorkingSetPicker projectId="p1" pinned={[]} error="That document is not in a working area you are part of" onToggle={() => {}} initiallyOpen initialRows={rows} />,
    );
    expect(html).toContain('That document is not in a working area you are part of');
  });

  it('🔒 the editor has no raw-id field any more, and no kind menu', () => {
    expect(existsSync(new URL('./working-set.tsx', import.meta.url))).toBe(false);
    const editor = readFileSync(new URL('./screens/editor.tsx', import.meta.url), 'utf8');
    expect(editor).not.toContain('Sandbox document id');
    expect(editor).not.toContain('Attach a source');
    expect(editor).toContain('ConversationWorkingSet');
    const picker = readFileSync(new URL('./working-set-picker.tsx', import.meta.url), 'utf8');
    expect(picker).not.toContain('Sandbox document id');
  });

  it('🔒 nothing is pinned for the person: the only pin call is the picker’s own toggle, and the editor makes none', () => {
    const editor = readFileSync(new URL('./screens/editor.tsx', import.meta.url), 'utf8');
    expect(editor).not.toContain('pinAttachedSource');
    const picker = readFileSync(new URL('./working-set-picker.tsx', import.meta.url), 'utf8');
    expect(picker.match(/api\.pinAttachedSource\(/g)?.length).toBe(1);
    expect(picker).toContain('onToggle={async (doc, pin)');
  });

  it('the checker, the creator, Ask and the editor all use the one picker', () => {
    const tools = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    expect(tools.match(/<WorkingSetPicker/g)?.length).toBe(2); // creator + checker
    expect(tools).not.toContain('AttachPicker');
    const ask = readFileSync(new URL('./screens/ask.tsx', import.meta.url), 'utf8');
    expect(ask).toContain('<ConversationWorkingSet');
  });

  it('the creator and the checker send the picked ids in the run body', () => {
    const tools = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    expect(tools.match(/attachedDocumentIds: (workingSet|attached)\.map\(\(doc\) => doc\.id\)/g)?.length).toBe(2);
  });
});

describe('T-471 — a finding quoting a draft from a working area the reader is not in', () => {
  it('says so in place of the excerpt', () => {
    const panel = readFileSync(new URL('./findings-panel.tsx', import.meta.url), 'utf8');
    expect(panel).toContain('Quoted from a document in a working area you are not in.');
    expect(panel).toContain('Quoted from “{evidence.label}” — a document in a working area you are not in.');
    expect(panel.indexOf("'openToYou' in evidence")).toBeLessThan(panel.indexOf('From a document you attached'));
  });
});

describe('T-471/T-482 — the label beside a result, and the titles in its card', () => {
  it('a result handed a working set says so with the count, and cites nothing', () => {
    const html = renderToStaticMarkup(
      <WorkingSetLine
        entries={[
          { sandboxDocumentId: 'a1', label: 'Land quality method statement', openToYou: true },
          { sandboxDocumentId: 'a2', label: 'Ecology baseline note', openToYou: true },
        ]}
      />,
    );
    expect(html).toContain('Drawing on your working area — 2 documents');
    // the titles are on hover, not on the line; and the line is no citation chip
    expect(html).not.toContain('Land quality method statement');
    expect(html).not.toContain('class="cite');
  });

  it('a reader outside the working area reads the same line, and the card lists each title marked — none a link', () => {
    const entries = [
      { label: 'Team draft', openToYou: false as const },
      { label: 'Gone draft', openToYou: false as const, removed: true as const },
    ];
    const html = renderToStaticMarkup(<WorkingSetLine entries={entries} />);
    expect(html).toContain('Drawing on your working area — 2 documents');
    const card = renderToStaticMarkup(<WorkingSetCard entries={entries} />);
    expect(card).toContain('Team draft');
    expect(card).toContain('Gone draft');
    expect(card).toContain('not open to you');
    expect(card).toContain('document removed');
    expect(card).not.toContain('<a ');
    // an open draft carries no mark
    expect(renderToStaticMarkup(<WorkingSetCard entries={[{ sandboxDocumentId: 'a', label: 'Mine', openToYou: true }]} />)).not.toContain('working-set-mark');
  });

  it('a run handed nothing carries no line', () => {
    expect(renderToStaticMarkup(<WorkingSetLine entries={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<WorkingSetLine entries={[]} />)).toBe('');
  });
});

describe('T-471 — Ask’s composer carries the working-set chip', () => {
  it('Ask renders the picker beside the scope control', () => {
    const ask = readFileSync(new URL('./screens/ask.tsx', import.meta.url), 'utf8');
    const scope = ask.indexOf('<ScopeControl');
    const set = ask.indexOf('<ConversationWorkingSet');
    expect(scope).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(scope);
    expect(set - scope).toBeLessThan(1200);
  });

  it('the workingArea call is a plain GET with the search and the page', async () => {
    const urls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, hasMore: false, q: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    try {
      await api.workingArea('p1', ' land ');
      await api.workingArea('p1', '');
    } finally {
      globalThis.fetch = original;
    }
    expect(urls[0]).toBe('/projects/p1/working-area?q=land&page=1');
    expect(urls[1]).toBe('/projects/p1/working-area?page=1');
  });
});

// ── T-418 — A RUNNING CHECK SHOWS ITS STEPS COMPLETING ─────────────────────
//
// *In plain terms: once a check is running, the plan's steps stay on screen and
// tick off as each one finishes, so a long run reads as working rather than
// hung.*
//
// The two properties worth pinning are the honest ones: the SCALE is the plan's
// own step list rather than whatever the poll returned, and a poll that failed
// says so rather than freezing at a number that no longer means anything.
describe('T-418 — the run-progress box', () => {
  const plan: ToolPlan = {
    workflowId: 'qa-check',
    workflowVersion: 3,
    steps: [
      { key: 'a', stage: 'analyse', worker: 'qa_section_check', label: 'Read section 1', estimate: { calls: 1, tokensPrompt: 1, tokensCompletion: 1, cost: 0 } },
      { key: 'b', stage: 'analyse', worker: 'qa_section_check', label: 'Read section 2', estimate: { calls: 1, tokensPrompt: 1, tokensCompletion: 1, cost: 0 } },
      { key: 'c', stage: 'present', worker: 'qa_document_check', label: 'Total up what was read', estimate: { calls: 0, tokensPrompt: 0, tokensCompletion: 0, cost: 0 } },
    ],
    coverage: '2 sections · 5 checks',
    cost: { total: 0, priced: true },
    refusal: null,
  };

  it('shows the plan’s OWN steps, and counts against the plan’s own total', () => {
    // counting the rows that came back instead would show "2 of 2" on a run
    // that had opened two of three and call it finished
    const html = renderToStaticMarkup(<RunProgress plan={plan} completed={2} lost={false} />);
    expect(html).toContain('2 of 3 steps finished');
    expect(html).toContain('Read section 1');
    expect(html).toContain('Total up what was read');
  });

  it('says it has started before the first poll has answered', () => {
    // "0 of 3" would be a claim about the run; "it has started" is a claim
    // about what this page knows, which is the only one it can make yet
    const html = renderToStaticMarkup(<RunProgress plan={plan} completed={null} lost={false} />);
    expect(html).toContain('The run has started');
    expect(html).not.toContain('0 of 3');
  });

  it('🔒 DEGRADES HONESTLY: a failed poll says the run continues, never that it is stuck', () => {
    const html = renderToStaticMarkup(<RunProgress plan={plan} completed={1} lost />);
    expect(html).toContain('could not read the run’s progress');
    expect(html).toContain('The check is still going');
    // the count it last had is kept rather than reset or zeroed
    expect(html).toContain('1 of 3 steps finished');
    expect(html.toLowerCase()).not.toContain('stuck');
    expect(html.toLowerCase()).not.toContain('failed');
  });

  it('never reports more finished than the plan has steps', () => {
    // a run whose rows outnumber the plan's steps is a disagreement to survive,
    // not to render as "5 of 3"
    const html = renderToStaticMarkup(<RunProgress plan={plan} completed={5} lost={false} />);
    expect(html).toContain('3 of 3 steps finished');
  });

  it('🔒 the plan card is hidden only WHILE running, and comes back beside the result', () => {
    // ADR-0053 §5's whole design is the two coverage sentences read against
    // each other in one frame — "6 sections" beside "6 of 6 sections read".
    // Hiding the plan once a result arrives would take that away.
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    expect(source).toContain('{plan !== null && running === null && (');
    expect(source).not.toContain('running === null && result === null');
  });

  it('🔒 INVENTS NO ENGINE STATE — it reads the rows and computes nothing else', () => {
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export function RunProgress');
    const end = source.indexOf('export function QaCheckerScreen');
    const body = source.slice(start, end);
    // no percentage, no elapsed-time guess, no estimate of what is left: every
    // one of those would be the surface asserting something the run has not
    expect(body).not.toContain('%');
    expect(body).not.toContain('Date.now');
    // and the poll counts CLOSED step rows, which is state the engine already
    // keeps — the run's own append-only tree (ADR-0028)
    expect(source).toContain("step.status !== 'running'");
  });
});

// ── T-419 — THE MARKED-UP EDIT MEETS THE DESIGN GUIDE ─────────────────────
//
// *In plain terms: this panel was written before the design system covered it,
// so it styled itself with numbers typed into the file and two of its controls
// could not be reached by keyboard at all. What is pinned here is what the
// audit tightened — because a design fix nothing asserts is a design fix that
// comes back.*
//
// The findings are enumerated in T-419's record; these are the ones with a
// visible or behavioural consequence worth a test rather than an eye.
describe('T-419 — the findings panel, audited against design-rules.md', () => {
  const raw = readFileSync(new URL('./findings-panel.tsx', import.meta.url), 'utf8');
  // 🔒 THE ASSERTIONS BELOW ARE ABOUT THE CODE, NOT ABOUT THE FILE. The
  // comments in this panel deliberately name what the audit REMOVED —
  // `var(--danger)`, a bare `<textarea>` — because a removal nobody recorded is
  // one that comes back wearing an innocent face. Asserting over the raw file
  // would make keeping that record impossible, so the comments are stripped
  // first and the claim stays "the code no longer does this".
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const css = readFileSync(
    new URL('../../../packages/ui/src/styles.css', import.meta.url),
    'utf8',
  );

  const finding: Finding = {
    id: 'f-419',
    runId: 'r-1',
    checkFamily: 'style',
    sandboxDocumentId: 'sd-1',
    anchor: { span: { start: 0, end: 10 }, paragraph: 0, verbatim: 'The Scheme' },
    defect: 'The works are capitalised.',
    severity: 'required',
    status: 'open',
    closedBy: null,
    closedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    evidence: {
      input: 'rulebook',
      clause: '§2.1',
      quote: 'Refer to the works as “the scheme”.',
      rulebookRef: 'guide-1',
      scope: 'project',
    },
  };
  const panel = (over: Partial<Finding> = {}) =>
    renderToStaticMarkup(
      <FindingsPanel
        findings={[{ ...finding, ...over }]}
        busy={false}
        focused={null}
        drifted={[]}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
      />,
    );

  it('🔒 carries NO inline styles at all — every value is on the system', () => {
    // §A's hard rule: never hardcode a raw hex or px value in app code. The
    // panel had twenty-odd of them, and 6px, 3px and 2px are not even on the
    // 4px scale.
    expect(source).not.toContain('style={{');
  });

  it('🔒 has no coloured left-border accent on a finding — §E removed that pattern', () => {
    // "a rounded container with a left-border accent" is exactly what §E
    // deleted when `.proposed` migrated, in favour of the plain nested-card
    // treatment. Severity is the badge's job.
    expect(source).not.toContain('borderLeft');
    expect(source).not.toContain('var(--danger)');
    const start = css.indexOf('.finding {');
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).not.toContain('border-left');
    // and it is a level-3 nested card: radius, no shadow of its own
    expect(block).toContain('--primitive-radius-md');
    expect(block).not.toContain('box-shadow');
  });

  it('🔒 severity still reaches the reader, by a word and not by a colour alone (§D)', () => {
    // the bar carried severity by colour alone; the badge pairs it with a word,
    // which is the rule the bar could never satisfy
    expect(panel({ severity: 'required' })).toContain('Required');
    expect(panel({ severity: 'advisory' })).toContain('Advisory');
  });

  it('🔒 both actions are BUTTONS — an <a> with no href cannot be focused (§D)', () => {
    // "Go to it" and the group's collapse were anchors with an onClick, so
    // neither could be reached by keyboard or show a focus ring at all
    expect(source).not.toContain('<a onClick');
    const html = panel();
    expect(html).toContain('class="finding-locate"');
    expect(html).toContain('class="finding-group-toggle"');
    // and the collapse says which way it is going, rather than leaving the
    // state to be inferred from what is below it
    expect(html).toContain('aria-expanded="true"');
  });

  it('both controls meet the 32px minimum hit target (§D)', () => {
    for (const selector of ['.finding-group-toggle', '.finding-locate']) {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThan(-1);
      expect(css.slice(start, css.indexOf('}', start))).toContain('min-height: 32px');
    }
  });

  it('uses the shared TextArea rather than growing its own <textarea>', () => {
    // this was the one editing surface in the product with its own font, its
    // own border and its own focus behaviour
    expect(source).not.toContain('<textarea');
    expect(source).toContain('<TextArea value={editing}');
  });

  it('🔒 the focused finding is outlined in a LINE colour, not in a background tint', () => {
    // `feedback.info.tint` as a 2px outline is near-invisible against a pane,
    // and is not the pairing §D's contrast table measures — the tint is the
    // fill and the text colour is the line
    const start = css.indexOf('.finding--focused {');
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('outline: 2px solid var(--feedback-info-text)');
    expect(block).toContain('background: var(--feedback-info-tint)');
  });

  it('the suggested wording is on the system, beside the quoted rule it sits next to', () => {
    expect(source).toContain('className="suggested-wording"');
    expect(css).toContain('.suggested-wording {');
  });
});

// ── T-422 — the Knowledge section, and its two shelves (ADR-0054 decision 1) ──
//
// **Two things must be true on this screen and neither is visible from the
// route.** The firm's shelf is ONE shelf reached through two doors, so it has
// to be marked as the firm's own and the same on every project *wherever it
// renders* — a consultant on three schemes must not be able to believe they are
// editing a per-project copy. And a shelf a viewer may not curate must show no
// disabled control at all, because a greyed "New style guide" would advertise a
// curation route to a firm that has no business learning it exists.
describe('T-422 — the firm’s shelf is one shelf, marked as one, in both doors', () => {
  const shelf: FirmShelf = {
    rulebooks: [
      {
        id: 'rb1',
        title: 'Drafting Manual',
        sourceFormat: 'docx',
        clauses: 80,
        labelled: 74,
        loadedBy: { userId: 'u1', name: 'Priya Raman' },
        loadedAt: '2026-08-27T09:00:00.000Z',
        retiredAt: null,
      },
    ],
    outlines: [
      {
        id: 'o1',
        label: 'Chapter shell — EIA',
        description: '6 sections · saved by Priya Raman',
        sections: [],
        origin: 'firm',
        savedBy: { name: 'Priya Raman' },
        savedAt: '2026-09-01T09:00:00.000Z',
      },
    ],
  };

  const project = renderToStaticMarkup(
    <MemoryRouter>
      <FirmShelfPane shelf={shelf} door="project" />
    </MemoryRouter>,
  );
  const workspace = renderToStaticMarkup(
    <MemoryRouter>
      <FirmShelfPane shelf={{ rulebooks: shelf.rulebooks, outlines: null }} door="workspace" />
    </MemoryRouter>,
  );

  it('says it is the firm’s own and the same on every project, in the project door', () => {
    expect(project).toContain('Org-private — the same on every project');
    expect(project).toContain('same on every project you work on');
  });

  it('says exactly the same thing in the workspace door', () => {
    expect(workspace).toContain('Org-private — the same on every project');
    expect(workspace).toContain('same on every project you work on');
  });

  it('lists the firm’s manuals and its saved outlines in the project door', () => {
    expect(project).toContain('Drafting Manual');
    expect(project).toContain('80 clauses, 74 quotable by number');
    expect(project).toContain('Chapter shell — EIA');
  });

  it('says why the outlines are not listed outside a project rather than showing none', () => {
    // the difference between "your firm has saved none" and "this door cannot
    // ask" is the whole reason `absent` is a separate state from `empty`
    expect(workspace).toContain('no answer outside a project');
    expect(workspace).not.toContain('Nothing saved yet');
  });

  it('renders no rulebook list at all where the read answered as nonexistence', () => {
    // T-308's tier: a member's read of /organisation/rulebooks is a 404, and
    // this shelf must render that as an ABSENT list — never an empty state
    // claiming the firm has no manual, and never a disabled row
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FirmShelfPane shelf={{ rulebooks: null, outlines: [] }} door="project" />
      </MemoryRouter>,
    );
    expect(html).not.toContain('No manual loaded');
    expect(html).not.toContain('shelf-rows');
    expect(html).not.toContain('disabled');
  });
});

describe('T-422 — the project shelf is assembled, not filtered', () => {
  const guides: StyleGuideRecord[] = [
    {
      id: 'sg1',
      title: 'Scheme Writing Standard',
      sourceFormat: 'docx',
      clauses: 42,
      labelled: 40,
      loadedBy: { userId: 'u2', name: 'Tom Beck' },
      loadedAt: '2026-08-30T09:00:00.000Z',
      retiredAt: null,
    },
  ];
  const render = (mayCurate: boolean) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ProjectShelfPane
          guides={guides}
          mayCurate={mayCurate}
          newHref="/projects/p1/knowledge/style-guides/new"
          libraryHref="/projects/p1/documents"
        />
      </MemoryRouter>,
    );

  it('offers the owner’s super user the New style guide door', () => {
    expect(render(true)).toContain('New style guide');
  });

  it('shows a viewer who may not curate NO control at all — not a disabled one', () => {
    const html = render(false);
    expect(html).not.toContain('New style guide');
    expect(html).not.toContain('disabled');
    // and still reads the guide, because a rule that binds you is one you may read
    expect(html).toContain('Scheme Writing Standard');
  });

  it('points at the library for standards and legislation rather than making a third shelf', () => {
    const html = render(true);
    expect(html).toContain('project library');
    expect(html).toContain('/projects/p1/documents');
  });
});

// ── T-425 — the review screen (ADR-0054 decisions 2 and 3) ──────────────────
//
// The load-bearing sentence on this screen is one the type system cannot hold:
// **an extracted rule renders beside the client's own wording, and a rule that
// has none does not fake one.** An invented quotation looks identical to a real
// one on screen, so the absence has to be visible and it has to be words.
describe('T-425 — a rule row shows its origin, and only a real quotation', () => {
  const base = {
    kind: 'term' as const,
    scope: 'sentence' as const,
    exceptedContexts: [] as never[],
    exceptedTerms: [] as string[],
    register: 'all' as const,
    enforcement: 'raises_findings' as const,
    severity: 'required' as const,
    payload: {},
  };
  const row = (rule: ProposedRule) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <RuleRow rule={rule} onChange={() => {}} onDelete={() => {}} />
      </MemoryRouter>,
    );

  it('shows an extracted rule beside the guide’s own wording, addressed', () => {
    const html = row({
      ...base,
      origin: 'extracted',
      statement: 'Use “scheme”, not “project”.',
      clauseId: 'c1',
      clause: '4.2',
      clauseWording: 'Refer to the works as the scheme throughout; never as the project.',
    });
    expect(html).toContain('From your document');
    expect(html).toContain('Your guide, 4.2');
    expect(html).toContain('Refer to the works as the scheme throughout');
  });

  it('says the address is missing rather than inventing one', () => {
    const html = row({
      ...base,
      origin: 'extracted',
      statement: 'Something.',
      clauseId: 'c1',
      clause: null,
      clauseWording: 'The guide says this, in a section it never numbered.',
    });
    expect(html).toContain('unnumbered clause');
    expect(html).not.toContain('Your guide, null');
  });

  it('gives a TYPED rule no quotation at all, and says why in words', () => {
    const html = row({ ...base, origin: 'typed', statement: 'Never promise a date.' });
    expect(html).toContain('Typed by a person');
    expect(html).toContain('rule-no-wording');
    // 🔒 no blockquote, no empty quotation, nothing that could read as the
    // client's own words
    expect(html).not.toContain('rule-wording');
    expect(html).not.toContain('Your guide');
  });

  it('marks an Infora-proposed rule as Infora’s own, with no client wording', () => {
    const html = row({
      ...base,
      origin: 'infora_proposed',
      kind: 'judgement',
      statement: 'Write in the active voice where the meaning allows it.',
    });
    expect(html).toContain('Proposed by Infora');
    expect(html).toContain('binds only because you accepted it');
    expect(html).not.toContain('rule-wording');
  });

  it('names what each kind costs, so a client can see what is free', () => {
    expect(row({ ...base, origin: 'typed', statement: 'x' })).toContain('settled by code');
    expect(row({ ...base, kind: 'judgement', origin: 'typed', statement: 'x' })).toContain(
      'needs the AI',
    );
  });
});

describe('T-425 — the review orders the common rules first', () => {
  it('puts every-register rules above register-specific ones, keeping their order', () => {
    const rule = (register: 'all' | 'technical', statement: string): ProposedRule => ({
      kind: 'judgement',
      origin: 'typed',
      statement,
      scope: 'sentence',
      exceptedContexts: [],
      exceptedTerms: [],
      register,
      enforcement: 'raises_findings',
      severity: 'advisory',
      payload: {},
    });
    const ordered = orderForReview([
      rule('technical', 'first technical'),
      rule('all', 'first common'),
      rule('technical', 'second technical'),
      rule('all', 'second common'),
    ]);
    expect(ordered.map((each) => each.statement)).toEqual([
      'first common',
      'second common',
      'first technical',
      'second technical',
    ]);
  });
});

describe('T-425 — extraction reports the honest number, and says when it got nothing', () => {
  it('leads with how many rules can quote the guide', () => {
    const html = renderToStaticMarkup(
      <ExtractionReportNote
        report={{ clausesRead: 12, proposed: 20, withWording: 14, gapFilled: 6, nothingExtracted: null }}
      />,
    );
    expect(html).toContain('12 clauses read');
    expect(html).toContain('14</b> of 20 rules can quote your guide’s own wording');
    expect(html).toContain('6 more were proposed by Infora');
  });

  it('says a document produced nothing rather than showing an empty configured set', () => {
    const html = renderToStaticMarkup(
      <ExtractionReportNote
        report={{
          clausesRead: 0,
          proposed: 0,
          withWording: 0,
          gapFilled: 0,
          nothingExtracted: 'Nothing could be read out of this document as a rule — it has no clauses.',
        }}
      />,
    );
    expect(html).toContain('Nothing came out of this document');
    expect(html).toContain('it has no clauses');
  });
});

// ── T-426 — the proposals pane (ADR-0054 decision 2) ────────────────────────
//
// The surface obligation the wall carries with it: the two decision buttons are
// **rendered or absent**, never disabled. `mayDecide` arrives from the server
// only where this requester may act, so a surface that greyed a button would be
// advertising a decision to somebody who cannot take it.
describe('T-426 — the decision is offered only to whoever may take it', () => {
  const proposal: RuleProposal = {
    id: 'p1',
    state: 'pending',
    rule: {
      kind: 'judgement',
      origin: 'typed',
      statement: 'This rule fires on every quoted document title.',
      scope: 'sentence',
      exceptedContexts: [],
      exceptedTerms: [],
      register: 'all',
      enforcement: 'raises_findings',
      severity: 'advisory',
      payload: {},
    },
    proposedBy: { userId: 'u1', name: 'Rob Neill' },
    proposedAt: '2026-09-02T09:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
  };
  const pane = (proposals: ListRuleProposalsResponse | null) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ProposalsPane
          proposals={proposals}
          canPropose
          onPropose={() => {}}
          onDecide={() => {}}
        />
      </MemoryRouter>,
    );

  it('shows Accept and Decline to a requester the server marked as able to decide', () => {
    const html = pane({ items: [proposal], mayDecide: true });
    expect(html).toContain('Accept — this makes a new version');
    expect(html).toContain('Decline');
  });

  it('shows NEITHER button to anyone else — not a disabled one', () => {
    const html = pane({ items: [proposal] });
    expect(html).toContain('This rule fires on every quoted document title');
    // absent, not greyed: the decision is not in the markup at all
    expect(html).not.toContain('Accept — this makes a new version');
    expect(html).not.toContain('>Decline<');
    // (the Propose button IS disabled here, and legitimately so — an empty
    // textarea has nothing to submit, which is a form state and not a
    // permission)
  });

  it('offers no decision on a proposal that has already been decided', () => {
    const html = pane({
      items: [
        {
          ...proposal,
          state: 'declined',
          decidedBy: { userId: 'u2', name: 'Anna Whitby' },
          decidedAt: '2026-09-02T10:00:00.000Z',
        },
      ],
      mayDecide: true,
    });
    expect(html).toContain('Declined');
    expect(html).toContain('decided by Anna Whitby');
    expect(html).not.toContain('Accept — this makes a new version');
  });

  it('lets anyone propose, and says who decides', () => {
    const html = pane({ items: [] });
    expect(html).toContain('Propose a change');
    expect(html).toContain('accepts or declines it');
  });
});

// ── T-429 — the compiled brief is readable by the super user ───────────────
describe('T-429 — the drafting brief is shown to the curator, verbatim', () => {
  const set: RuleSetVersion = {
    id: 'v1',
    styleGuideId: 'sg1',
    version: 2,
    acceptedBy: { userId: 'u1', name: 'Anna Whitby' },
    acceptedAt: '2026-09-02T09:00:00.000Z',
    draftingBrief:
      'How this project wants its documents written:\n\n• Write in the active voice where the meaning allows it.',
    rules: [
      {
        id: 'r1',
        ordinal: 1,
        kind: 'term',
        origin: 'extracted',
        statement: 'Use “scheme”, not “project”.',
        scope: 'sentence',
        exceptedContexts: [],
        exceptedTerms: [],
        register: 'all',
        enforcement: 'raises_findings',
        severity: 'required',
        payload: {},
        clauseId: 'c1',
        clause: '4.2',
        clauseWording: 'Refer to the works as the scheme throughout.',
      },
    ],
  };
  const render = (mayReadBrief: boolean) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <SavedRuleSet set={set} mayReadBrief={mayReadBrief} />
      </MemoryRouter>,
    );

  it('shows the curator exactly what the drafting AI is told', () => {
    const html = render(true);
    expect(html).toContain('What the drafting AI is told');
    expect(html).toContain('Write in the active voice where the meaning allows it.');
    // and says it is the same every time, which is the guarantee it rests on
    expect(html).toContain('the same rules always produce the same brief');
  });

  it('does not show it to anyone else — the rules are what everyone is bound by', () => {
    const html = render(false);
    expect(html).not.toContain('What the drafting AI is told');
    // the rules themselves still render, because a rule that binds you is one
    // you may look up
    expect(html).toContain('Use “scheme”, not “project”.');
    expect(html).toContain('Refer to the works as the scheme throughout.');
  });

  it('says who accepted the version and when', () => {
    expect(render(true)).toContain('accepted by Anna Whitby');
  });
});

// (review, 2026-09-02) — the one page that renders OUTSIDE the session gate
// had no test of any kind. What matters on it: the reader can reach the file
// and nothing else, the snapshot-and-expiry promise is said in words, and no
// link leads anywhere but the token's own file routes.
describe('the external recipient page (T-431, ADR-0055)', () => {
  const doc = {
    documentReference: 'WA-LQ-MS-004',
    versionReference: 'P02',
    title: 'Land Quality method statement',
    recipientName: 'R. Harlow',
    message: 'As discussed on site, the method statement for your records.',
    standardMessage: 'Issued under the Wrenfield–Ashcombe consultation protocol.',
    senderOrganisationName: 'Trentmoor Energy',
    projectName: 'Wrenfield–Ashcombe 400kV Connection',
    issuedAt: '2026-09-02T09:00:00.000Z',
    expiresAt: '2026-10-02T09:00:00.000Z',
    renditions: [
      { id: 'r-pdf', kind: 'pdf' as const, format: 'pdf' },
      { id: 'r-doc', kind: 'native' as const, format: 'docx' },
    ],
    content: 'The method statement text.',
  };
  const html = renderToStaticMarkup(<ExternalDocumentView doc={doc as never} token="tok-123" />);

  it('says the snapshot-and-expiry promise in words, and asks nothing of the reader', () => {
    expect(html).toContain('one revision of one document, as it stood when it was sent');
    expect(html).toContain('A later revision does\n        not appear here'.replace(/\s+/g, ' '));
    expect(html).toContain('Nothing is being');
    expect(html).toContain('nothing to acknowledge or sign');
  });

  it('🔒 every link on the page stays inside the token’s own file routes', () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith('/external-documents/tok-123/')).toBe(true);
    }
  });

  it('shows the covering note and the project’s standing message as two voices', () => {
    expect(html).toContain('For the attention of R. Harlow');
    expect(html).toContain('for your records');
    expect(html).toContain('consultation protocol');
  });
});

// T-442 — the generated screen, drawn.
//
// **This is where the pinning test lands on the SURFACE.** The grammar cannot
// name a URL (packages/contracts) and the renderer's module cannot reach one
// (source rule 4); what is left to check is what the browser actually receives
// when the text a screen carries is itself hostile — and the answer is that it
// arrives as characters on the page, in no attribute, in no link, with no call
// made. Every block also proves the other half of ADR-0056 §11: the rows a
// screen draws are the rows it was handed, and the totals are sums of those.
describe('a generated screen (T-442, ADR-0056 §11)', () => {
  const table = {
    id: 'table-1',
    appId: 'app-1',
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text' as const, required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number' as const, required: true },
    ],
    kind: 'data' as const,
    hasAcceptance: true,
    retiredAt: null,
    shares: [],
  };
  const rows = [
    {
      id: 'row-1',
      appTableId: 'table-1',
      values: { month: 'August 2026', landfill: 12.4 },
      organisationId: 'org-b',
      organisationName: 'Calder & Hale',
      enteredByName: 'Eleanor Price',
      enteredAt: '2026-09-01T09:00:00.000Z',
      state: 'submitted' as const,
      decidedByName: null,
      decidedAt: null,
      rejectionReason: null,
      supersedesRowId: null,
      supersededByRowId: null,
      previousVersionId: null,
      retiredAt: null,
      mayEdit: false,
      maySubmit: false,
      mayDecide: false,
      mayCorrect: false,
      mayRetire: false,
    },
    {
      id: 'row-2',
      appTableId: 'table-1',
      values: { month: 'September 2026', landfill: 7.6 },
      organisationId: 'org-b',
      organisationName: 'Calder & Hale',
      enteredByName: 'Eleanor Price',
      enteredAt: '2026-09-02T09:00:00.000Z',
      state: 'accepted' as const,
      decidedByName: 'Rachel Bowen',
      decidedAt: '2026-09-03T09:00:00.000Z',
      rejectionReason: null,
      supersedesRowId: null,
      supersededByRowId: null,
      previousVersionId: null,
      retiredAt: null,
      mayEdit: false,
      maySubmit: false,
      mayDecide: false,
      mayCorrect: false,
      mayRetire: false,
    },
  ];

  const draw = (block: unknown) =>
    renderToStaticMarkup(
      <ScreenBlock
        block={block as never}
        table={table as never}
        rows={rows as never}
        onEnter={() => {}}
        pending={false}
      />,
    );

  it('🔒 renders a hostile heading as text — in no attribute, and no link', () => {
    const html = draw({ kind: 'heading', text: 'https://exfiltrate.example?key=sk-live-nope' });
    expect(html).toContain('https://exfiltrate.example?key=sk-live-nope');
    expect(html).not.toContain('href');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('src=');
  });

  it('draws the rows it was handed, and the columns the block named', () => {
    const html = draw({
      kind: 'rowTable',
      columnKeys: ['month', 'landfill'],
      showOrganisation: true,
      showState: true,
    });
    expect(html).toContain('August 2026');
    expect(html).toContain('Calder &amp; Hale');
    expect(html).toContain('Accepted');
    // the LABEL the table declared, not the key
    expect(html).toContain('Waste to landfill (tonnes)');
  });

  it('totals and counts only what the viewer received', () => {
    // 12.4 + 7.6 — summed from the rows this viewer received, never a figure
    // computed elsewhere over rows they cannot read
    expect(draw({ kind: 'total', columnKey: 'landfill', label: 'Year to date' })).toContain(
      '<strong>20</strong>',
    );
    expect(draw({ kind: 'count', label: 'Returns' })).toContain('<strong>2</strong>');
  });

  it('T-452: draws its figures from CURRENT rows — a superseded or retired row is history, not a second figure', () => {
    // a file source supersedes the last import every month; a chart over every
    // row it received would grow by a whole report each time
    const history = [
      { ...rows[0]!, id: 'old-1', state: 'superseded' as const },
      { ...rows[1]!, id: 'old-2', retiredAt: '2026-09-04T09:00:00.000Z' },
      ...rows,
    ];
    const drawOver = (block: unknown) =>
      renderToStaticMarkup(
        <ScreenBlock block={block as never} table={table as never} rows={history as never} onEnter={() => {}} pending={false} />,
      );
    expect(drawOver({ kind: 'total', columnKey: 'landfill', label: 'Year to date' })).toContain('<strong>20</strong>');
    expect(drawOver({ kind: 'count', label: 'Returns' })).toContain('<strong>2</strong>');
    expect(
      drawOver({ kind: 'barChart', label: 'By month', categoryColumn: 'month', valueColumn: 'landfill' }),
    ).toContain('>12.4<');
    // the table block still lists the history, each row with its state
    expect(
      drawOver({ kind: 'rowTable', columnKeys: ['month'], showOrganisation: false, showState: true }),
    ).toContain('Superseded');
  });

  it('refuses a screen naming a column the table no longer declares', () => {
    expect(
      screenFor(
        JSON.stringify({
          version: 1,
          blocks: [{ kind: 'total', columnKey: 'diesel', label: 'Diesel' }],
        }),
        table as never,
      ),
    ).toBeNull();
  });

  // ── T-443's chart blocks, drawn from the same rows ────────────────────────
  //
  // The charts are SVG shapes computed in `app-screen.tsx` from the array the
  // viewer received. These assertions read the markup: the bars are there, the
  // figures on them are the sums of the rows handed in, and nothing in the
  // output reaches outward.

  it('draws a bar per category, each bar the sum of the rows this viewer received', () => {
    const html = draw({
      kind: 'barChart',
      label: 'Waste to landfill by month',
      categoryColumn: 'month',
      valueColumn: 'landfill',
    });
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    expect(html).toContain('Waste to landfill by month');
    // one bar per month, labelled, each carrying its own figure
    expect(html).toContain('August 2026');
    expect(html).toContain('September 2026');
    expect(html).toContain('>12.4<');
    expect(html).toContain('>7.6<');
    // 🔒 no picture, no link, nothing that fetches
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href');
  });

  it('draws a line with its trend, and says in words that the trend is Infora’s line and not a forecast', () => {
    const html = draw({
      kind: 'lineChart',
      label: 'Landfill over time',
      categoryColumn: 'month',
      valueColumn: 'landfill',
      showTrend: true,
    });
    expect(html).toContain('<polyline');
    expect(html).toContain('stroke-dasharray'); // the trend line itself
    expect(html).toContain('not a forecast');
  });

  it('draws a pie with a legend naming each share', () => {
    const html = draw({
      kind: 'pieChart',
      label: 'Share by month',
      categoryColumn: 'month',
      valueColumn: 'landfill',
    });
    expect(html).toContain('August 2026 — 12.4');
    expect(html).toContain('September 2026 — 7.6');
  });

  it('says so plainly when there is nothing to draw, rather than drawing an empty axis', () => {
    const html = renderToStaticMarkup(
      <ScreenBlock
        block={
          {
            kind: 'barChart',
            label: 'Waste to landfill by month',
            categoryColumn: 'month',
            valueColumn: 'landfill',
          } as never
        }
        table={table as never}
        rows={[]}
        onEnter={() => {}}
        pending={false}
      />,
    );
    expect(html).toContain('Nothing to draw yet.');
  });

  it('groups and totals in first-seen order, and ignores a value that is not a number', () => {
    expect(
      chartSeries(
        [
          { values: { month: 'August', landfill: 10 } },
          { values: { month: 'July', landfill: 1 } },
          { values: { month: 'August', landfill: 2.5 } },
          { values: { month: 'August', landfill: 'twelve' } },
        ] as never,
        'month',
        'landfill',
      ),
    ).toEqual([
      { label: 'August', value: 12.5 },
      { label: 'July', value: 1 },
    ]);
  });

  it('fits a straight trend line, and refuses to fit one through a single point', () => {
    expect(trendLine([1, 2, 3])).toEqual({ first: 1, last: 3 });
    expect(trendLine([5])).toBeNull();
  });
});

// T-450 — the conversation on the building screen (ADR-0056's third addendum).
describe('the builder’s conversation', () => {
  const turn = (over: Partial<AppBuildTurn>): AppBuildTurn => ({
    id: 'turn-1',
    seq: 1,
    role: 'agent',
    speakerName: 'Eleanor Price',
    text: 'I have drafted a monthly returns app.',
    asked: [],
    acts: [],
    proposals: [],
    createdAt: '2026-10-18T10:00:00.000Z',
    ...over,
  });

  it('says what it is for, and names the two questions it must ask, before anything is said', () => {
    const html = renderToStaticMarkup(<BuilderConversation appId="app-1" turns={[]} onTurn={() => {}} />);
    expect(html).toContain('Describe the app in your own words');
    expect(html).toContain('whether a table holds contractual data, and who may open each screen');
  });

  it('draws the agent’s receipt from the stored turn — what it did, and what it suggests a person does', () => {
    const html = renderToStaticMarkup(
      <BuilderConversation
        appId="app-1"
        turns={[
          turn({ id: 'p', role: 'person', text: 'Build me a returns app.' }),
          turn({
            id: 'a',
            acts: [{ kind: 'declareTable', summary: 'Declared the table “Monthly returns”.' }],
            proposals: [{ kind: 'publish', subject: null, summary: 'Open the app to its people, from the panel.' }],
          }),
        ]}
        onTurn={() => {}}
      />,
    );
    expect(html).toContain('Build me a returns app.');
    expect(html).toContain('What it did');
    expect(html).toContain('Declared the table “Monthly returns”.');
    expect(html).toContain('It suggests');
    expect(html).toContain('Open the app to its people, from the panel.');
  });
});

// ── T-472 — reference-material intake ───────────────────────────────────────
//
// *In plain terms: the table where uploaded files are checked shows each file,
// its proposed title in a box you can correct, one choice per facet already set
// to the proposal with the AI's own word beside it, and a tick, a Confirm and a
// Reject on every row. A scan says there is no proposal; with the AI switched
// off every row says so. Ticking rows and confirming sends their ids.*
describe('the reference-material intake (T-472)', () => {
  const FACETS: IntakeFacet[] = [
    {
      id: 'f-type',
      key: 'document_type',
      name: 'Document type',
      source: 'iso_19650',
      sortOrder: 0,
      terms: [
        { id: 't-std', facetId: 'f-type', parentTermId: null, code: 'STD', label: 'Standard', sortOrder: 0, retiredAt: null },
        { id: 't-gdn', facetId: 'f-type', parentTermId: null, code: 'GDN', label: 'Guidance', sortOrder: 1, retiredAt: null },
      ],
    },
  ];
  const row = (over: Partial<IntakeRow>): IntakeRow => ({
    id: 'i1',
    originalFilename: 'BS-5228-1.pdf',
    format: 'pdf',
    textStatus: 'extracted',
    readable: true,
    proposedTitle: 'BS 5228-1 Noise and vibration',
    proposedClassifications: [{ facetId: 'f-type', termId: 't-std', confidence: 'likely' }],
    status: 'proposed',
    uploadedBy: { participantId: 'p1', name: 'Rachel Bowen' },
    uploadedAt: '2026-10-24T10:00:00.000Z',
    confirmedBy: null,
    confirmedAt: null,
    containerId: null,
    needsIndexing: false,
    ...over,
  });
  const render = (rows: IntakeRow[], over: Partial<Parameters<typeof IntakeTable>[0]> = {}) =>
    renderToStaticMarkup(
      <IntakeTable
        rows={rows}
        facets={FACETS}
        edits={Object.fromEntries(rows.map((r) => [r.id, startingEdit(r)]))}
        proposalsOn
        busy={false}
        selected={new Set()}
        onSelect={() => undefined}
        onTitle={() => undefined}
        onTerm={() => undefined}
        onConfirm={() => undefined}
        onReject={() => undefined}
        {...over}
      />,
    );

  it('shows the file, an editable title, the facet prefilled with the AI’s word beside it, a tick, Confirm and Reject', () => {
    const html = render([row({})]);
    expect(html).toContain('BS-5228-1.pdf');
    expect(html).toContain('value="BS 5228-1 Noise and vibration"');
    expect(html).toContain('aria-label="Title for BS-5228-1.pdf"');
    // the facet's select is set to the proposal, and its word is beside it
    expect(html).toContain('aria-label="Document type for BS-5228-1.pdf"');
    expect(html).toMatch(/<option value="t-std" selected="">Standard<\/option>/);
    expect(html).toContain('likely');
    expect(html).toContain('aria-label="Select BS-5228-1.pdf"');
    expect(html).toContain('aria-label="Confirm BS-5228-1.pdf"');
    expect(html).toContain('aria-label="Reject BS-5228-1.pdf"');
  });

  it('a correction removes the word: the person’s own choice is not the AI’s guess', () => {
    const r = row({});
    const html = render([r], { edits: { [r.id]: { title: r.proposedTitle, terms: { 'f-type': 't-gdn' } } } });
    expect(html).toMatch(/<option value="t-gdn" selected="">Guidance<\/option>/);
    expect(html).not.toContain('likely');
  });

  it('a scan says there is no proposal and why; the AI being off says so on every readable row', () => {
    const scan = row({ id: 'i2', originalFilename: 'scan.pdf', readable: false, textStatus: 'pdf_no_text', proposedClassifications: null });
    expect(render([scan])).toContain('A scan — no text layer');
    expect(render([scan])).toContain('No proposal — no readable text');
    const unproposed = row({ id: 'i3', originalFilename: 'plain.pdf', proposedClassifications: null });
    expect(render([unproposed], { proposalsOn: false })).toContain('No proposal — the AI is switched off for this project');
    // …and not when the AI is on and simply proposed nothing
    expect(render([unproposed], { proposalsOn: true })).not.toContain('switched off');
  });

  it('ticked rows are confirmed together: the body carries their ids, corrected titles and chosen terms', () => {
    const a = row({ id: 'a', originalFilename: 'a.pdf' });
    const b = row({ id: 'b', originalFilename: 'b.pdf', proposedClassifications: null, proposedTitle: 'b' });
    const body = bulkConfirmBody([a, b], {
      a: { title: '  A, corrected  ', terms: { 'f-type': 't-std' } },
      b: { title: 'b', terms: {} },
    });
    expect(body).toEqual({
      items: [
        { id: 'a', title: 'A, corrected', classifications: [{ facetId: 'f-type', termId: 't-std' }] },
        { id: 'b', title: 'b', classifications: [] },
      ],
    });
  });

  it('the bulk door sends exactly those ids, to the bulk route', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ results: [], confirmed: 0, failed: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      await api.confirmIntakeBulk('p1', bulkConfirmBody([row({ id: 'a' }), row({ id: 'b' })], {}));
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]!.url).toBe('/projects/p1/reference-intake/confirm');
    expect((seen[0]!.body as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('the library’s count line is fed by what each request answered', () => {
    expect(uploadSentence({ total: 50, uploaded: 7, scanned: 0, failed: ['x.docx: …', 'y.docx: …'], finished: false })).toBe(
      '7 of 50 uploaded · 2 could not be read',
    );
    expect(uploadSentence({ total: 3, uploaded: 3, scanned: 1, failed: [], finished: true })).toBe(
      '3 of 3 uploaded · 1 with no readable text — waiting for you in the intake queue.',
    );
    expect(uploadSentence({ total: 4, uploaded: 0, scanned: 0, failed: [], finished: false })).toBe('0 of 4 uploaded');
  });

  it('a held-but-unreadable file is labelled in words, never by a code', () => {
    expect(NOT_CITABLE_LABEL).toBe('Not citable — no readable text');
    expect(describeTextStatus('pdf_no_text')).toBe('A scan — no text layer');
    expect(describeTextStatus('some_new_reason')).toBe('No readable text');
  });
});

describe('currency on reference material (T-473)', () => {
  const UNCONFIRMED: Currency = { state: 'unconfirmed', confirmedBy: null, confirmedAt: null, recheckDue: null };
  const OVERDUE: Currency = {
    state: 'overdue',
    confirmedBy: 'Rachel Bowen',
    confirmedAt: '2025-08-24T00:00:00.000Z',
    recheckDue: '2026-08-24T00:00:00.000Z',
  };
  const CONFIRMED: Currency = {
    state: 'confirmed',
    confirmedBy: 'Rachel Bowen',
    confirmedAt: '2026-10-01T00:00:00.000Z',
    recheckDue: '2027-10-01T00:00:00.000Z',
  };

  it('a source chip carries a visible, named mark when the document is unconfirmed or overdue — and none when it is confirmed', () => {
    const chip = (currency: Currency | null) =>
      renderToStaticMarkup(
        <SourceChip corpus="library" currency={currency}>
          WA-STD-BS5930-001
        </SourceChip>,
      );
    const unconfirmed = chip(UNCONFIRMED);
    expect(unconfirmed).toContain('class="cite-currency unconfirmed"');
    expect(unconfirmed).toContain('aria-label="Not confirmed current"');
    expect(unconfirmed).toContain('title="Not confirmed current — nobody has checked this document is still the one to rely on"');
    // a glyph, not colour alone
    expect(unconfirmed).toMatch(/cite-currency unconfirmed"[^>]*>\?</);
    const overdue = chip(OVERDUE);
    expect(overdue).toContain('class="cite-currency overdue"');
    expect(overdue).toContain('aria-label="Re-check overdue"');
    expect(overdue).toContain('Re-check overdue since 24 Aug 2026 — confirmed current by Rachel Bowen on 24 Aug 2025');
    expect(chip(CONFIRMED)).not.toContain('cite-currency');
    expect(chip(null)).not.toContain('cite-currency');
  });

  const passage = (currency: Currency | null) =>
    renderToStaticMarkup(
      <SourceCardView
        loaded={{
          kind: 'passage',
          read: {
            versionId: 'v1',
            chunkId: 'k1',
            containerId: 'c1',
            documentReference: 'WA-STD-BS5930-001',
            documentTitle: 'BS 5930',
            versionReference: 'v1',
            containerState: 'live',
            isCurrent: true,
            passage: { chunkIndex: 0, verbatim: 'test the ground' },
            held: true,
            currency,
          },
        }}
      />,
    );

  it('the source card adds a line in words for an unconfirmed document and for an overdue one, and none otherwise', () => {
    expect(passage(UNCONFIRMED)).toContain('Not confirmed current — nobody has checked this document is still the one to rely on');
    expect(passage(OVERDUE)).toContain('Re-check overdue since 24 Aug 2026 — confirmed current by Rachel Bowen on 24 Aug 2025');
    expect(passage(CONFIRMED)).not.toContain('source-card-currency');
    expect(passage(null)).not.toContain('source-card-currency');
  });

  const card = (currency: Currency, mayConfirm: boolean) =>
    renderToStaticMarkup(
      <CurrencyCard read={{ currency, intervalMonths: 12 }} mayConfirm={mayConfirm} confirming={false} onConfirm={() => undefined} />,
    );

  it('the document page’s Currency card shows the state, the names and dates, the interval, and a button only for the owner’s super user', () => {
    const overdue = card(OVERDUE, true);
    expect(overdue).toContain('Re-check overdue');
    expect(overdue).toContain('Rachel Bowen');
    expect(overdue).toContain('would run for 12 months');
    expect(overdue).toContain('Confirm current');
    expect(card(OVERDUE, false)).not.toContain('Confirm current');
    const unconfirmed = card(UNCONFIRMED, true);
    expect(unconfirmed).toContain('Not confirmed current');
    expect(unconfirmed).not.toContain('Last confirmed');
    const confirmed = card(CONFIRMED, false);
    expect(confirmed).toContain('Confirmed current');
    expect(confirmed).toContain('Re-check due');
  });
});

// T-474 — what the owner reads in the dialog, the live list in the Checks tab,
// "cited by", and the new notification's words. Static markup: the copy and the
// state it renders in.
describe('T-474 — supersede impact on screen', () => {
  it('the owner\'s dialog lists library documents that point at it and the owner\'s own work, and says "your organisation\'s"', () => {
    const html = renderToStaticMarkup(
      <ImpactView
        impact={{
          edges: [
            {
              id: 'e1', projectId: 'p', fromContainerId: 'a', toContainerId: 'b', type: 'responds_to', proposed: false,
              confirmedByParticipantId: null, createdAt: '2026-10-01T00:00:00Z', confirmedAt: '2026-10-01T00:00:00Z', retiredAt: null,
              direction: 'incoming', otherContainerId: 'a', otherDocumentReference: 'WA-GEO-RSP-002',
            },
          ],
          ownWork: [{ kind: 'draft', id: 'd1', title: 'Owner note', at: '2026-10-20T10:00:00Z' }],
        }}
      />,
    );
    expect(html).toContain('What relies on this');
    expect(html).toContain('WA-GEO-RSP-002 (responds to)');
    expect(html).toContain('Your organisation’s own work that cites it');
    expect(html).toContain('Owner note');
  });

  it('says plainly when nothing of the owner\'s own relies on it — and never offers a total', () => {
    const html = renderToStaticMarkup(<ImpactView impact={{ edges: [], ownWork: [] }} />);
    expect(html).toContain('none of your organisation’s own drafts or past answers cite it');
    expect(html).not.toMatch(/\d+ (drafts|documents|organisations)/);
  });

  it('"cited by" lists the requester\'s work by kind, and draws nothing when there is none', () => {
    const html = renderToStaticMarkup(
      <CitedByList
        items={[
          { kind: 'draft', id: 'd', title: 'Chapter 9', at: '2026-10-20T10:00:00Z' },
          { kind: 'run', id: 'r', title: 'What did the ground investigation find?', at: '2026-10-19T10:00:00Z' },
        ]}
      />,
    );
    expect(html).toContain('Cited by');
    expect(html).toContain('Draft');
    expect(html).toContain('Chapter 9');
    expect(html).toContain('Answer');
    expect(renderToStaticMarkup(<CitedByList items={[]} />)).toBe('');
  });

  it('the notification\'s event is named in words', () => {
    expect(EVENT_LABEL['cited-document-superseded']).toBe('A document you cited was superseded');
  });

  it('T-482 — the superseded notice names one document and never counts more (ADR-0049, owner ruling 2026-10-24)', () => {
    const sentence = EVENT_LABEL['cited-document-superseded'];
    expect(sentence).not.toMatch(/\d|more|and \w+ other/i);
    const source = readFileSync(new URL('./screens/notifications.tsx', import.meta.url), 'utf8');
    expect(source).toContain('notification.subject.label'); // the one document, named beside the sentence
    expect(source).not.toMatch(/and \$\{|more\b.*notification/i);
  });

  it('the Checks tab shows the live list above the stored findings, saying it is not a saved finding', () => {
    const html = renderToStaticMarkup(
      <FindingsPanel
        findings={[]}
        busy={false}
        focused={null}
        drifted={[]}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
        stale={{
          computedAt: '2026-10-24T10:00:00Z',
          claimsChecked: 4,
          items: [
            {
              anchor: { span: { start: 0, end: 31 }, paragraph: 0, verbatim: 'Made ground was found to 2.4 m.' },
              located: true,
              defect: 'WA-GEO-GIR-004 v2 has been superseded by WA-GEO-GIR-005, and this sentence still rests on it.',
              severity: 'required',
              reason: 'superseded',
              citation: { id: 'c', versionId: 'v', documentReference: 'WA-GEO-GIR-004' },
            },
          ],
        }}
      />,
    );
    expect(html).toContain('computed now, not a saved finding');
    expect(html).toContain('Made ground was found to 2.4 m.');
    expect(html).toContain('has been superseded by WA-GEO-GIR-005');
    expect(html).toContain('1 sentence rests on a source that has changed');
    // a clean, examined result says what it examined
    const clean = renderToStaticMarkup(
      <FindingsPanel findings={[]} busy={false} focused={null} drifted={[]} onLocate={() => {}} onResolve={() => {}} onBulk={() => {}}
        stale={{ computedAt: 'x', claimsChecked: 4, items: [] }} />,
    );
    expect(clean).toContain('None of the 4 cited claims rest on a source that has changed');
    // nothing cited at all: no live section, the old empty message stands
    const none = renderToStaticMarkup(
      <FindingsPanel findings={[]} busy={false} focused={null} drifted={[]} onLocate={() => {}} onResolve={() => {}} onBulk={() => {}}
        stale={{ computedAt: 'x', claimsChecked: 0, items: [] }} />,
    );
    expect(none).not.toContain('Out-of-date sources');
  });
});

// T-475 — a gap is drawn as a gap in the read view and the Checks tab, and who
// wrote a paragraph is a card in the margin
describe('T-475 — gap markers and passage authorship on screen', () => {
  const agent: PassageProvenance = {
    start: 0, end: 12, origin: 'agent', runId: 'abcdef12-0000-4000-8000-000000000000',
    draftedAt: '2026-10-20T10:00:00Z', acceptedByName: 'Eleanor Price', acceptedAt: '2026-10-21T09:00:00Z',
    edited: false, savedByName: null, savedAt: null,
  };
  const hand: PassageProvenance = {
    start: 14, end: 30, origin: 'hand', runId: null, draftedAt: null, acceptedByName: null,
    acceptedAt: null, edited: false, savedByName: 'Owen Vance', savedAt: '2026-10-22T08:00:00Z',
  };
  const text = 'Agent claim.\n\nHand-written bit';

  it('the read view draws a gap line as a gap, with the word, not as prose', () => {
    const html = renderToStaticMarkup(
      <Markdown>{'Before.\n\n[Gap: the record does not give the made-ground thickness]\n\nAfter.'}</Markdown>,
    );
    expect(html).toContain('class="gap-marker"');
    expect(html).toContain('>Gap<');
    expect(html).toContain('the record does not give the made-ground thickness');
    expect(html).not.toContain('[Gap:');
    // a look-alike inside a sentence is just text
    expect(renderToStaticMarkup(<Markdown>{'See [Gap: inline] here.'}</Markdown>)).not.toContain('gap-marker');
  });

  it('the Checks tab counts and lists the gaps, each as a jump-to', () => {
    const gaps = gapMarkers('One.\n\n[Gap: first thing]\n\n[Gap: second thing]');
    const html = renderToStaticMarkup(
      <FindingsPanel findings={[]} busy={false} focused={null} drifted={[]} onLocate={() => {}}
        onResolve={() => {}} onBulk={() => {}} gaps={gaps} onLocateGap={() => {}} />,
    );
    expect(html).toContain('2 gaps');
    expect(html).toContain('first thing');
    expect(html).toContain('second thing');
    expect(html).toContain('promotion is held while one stands');
    // none: nothing is said
    expect(
      renderToStaticMarkup(
        <FindingsPanel findings={[]} busy={false} focused={null} drifted={[]} onLocate={() => {}}
          onResolve={() => {}} onBulk={() => {}} gaps={[]} />,
      ),
    ).not.toContain('findings-gaps');
  });

  it('the hover card names author and acceptor, or the hand that last saved', () => {
    expect(renderToStaticMarkup(<AuthorshipCard passage={agent} />)).toContain(
      'Drafted by the agent in run abcdef12 on 2026-10-20, accepted by Eleanor Price on 2026-10-21',
    );
    const handHtml = renderToStaticMarkup(<AuthorshipCard passage={hand} />);
    expect(handHtml).toContain('Written by hand — by Owen Vance on 2026-10-22');
    expect(handHtml).toContain('reads here as hand-written');
  });

  it('the rail draws one mark per paragraph, and steps aside when the text has moved on', () => {
    expect(provenanceFits(text, [agent, hand])).toBe(true);
    const html = renderToStaticMarkup(<AuthorshipRail content={text} passages={[agent, hand]} />);
    expect(html).toContain('Who wrote paragraph 1: Drafted by the agent');
    expect(html).toContain('Who wrote paragraph 2: Written by hand');
    // edited since the answer was fetched: no marks rather than wrong ones
    expect(provenanceFits(`${text} and more\n\nA third`, [agent, hand])).toBe(false);
    expect(renderToStaticMarkup(<AuthorshipRail content={`${text}\n\nThird`} passages={[agent, hand]} />)).toBe('');
    expect(renderToStaticMarkup(<AuthorshipRail content={text} passages={null} />)).toBe('');
  });

  it('the settings toggle is off until told, and read-only for anyone but the owner\'s super user', () => {
    const off = renderToStaticMarkup(
      <AuthorshipAppendixToggle enabled={false} canEdit saved={false} onChange={() => {}} />,
    );
    expect(off).toContain('End exported documents with a list of machine-drafted passages');
    expect(off).not.toContain('checked');
    expect(off).not.toContain('disabled');
    const on = renderToStaticMarkup(
      <AuthorshipAppendixToggle enabled canEdit={false} saved={false} onChange={() => {}} />,
    );
    expect(on).toContain('checked');
    expect(on).toContain('disabled');
    expect(
      renderToStaticMarkup(<AuthorshipAppendixToggle enabled={null} canEdit saved={false} onChange={() => {}} />),
    ).toContain('disabled');
  });
});


// ── T-476 — findings polish, the strength map, and the disproving pass ──────
//
// *In plain terms: forty findings narrow to the required ones in one click, the
// same findings can be read as a table, a contradiction shows both of its places
// side by side, the launcher says which findings are settled in code, and the
// second-look option shows its price beside its switch and nowhere else.*
//
// The panel keeps its filters in React state, so a one-click test cannot press a
// button in static markup; the filtering itself is the pure `narrowFindings`
// and `countFindings`, tested directly, and the panel is rendered in each state
// it can start in. The click itself is the end-to-end spec.
describe('T-476 — filters, counts, the table, and the two places side by side', () => {
  const anchorAt = (at: number, verbatim: string) => ({
    span: { start: at, end: at + verbatim.length },
    paragraph: 0,
    verbatim,
  });
  const make = (n: number, over: Partial<Finding> = {}): Finding => ({
    id: `f-${n}`,
    runId: 'r-1',
    checkFamily: 'style',
    sandboxDocumentId: 'sd-1',
    anchor: anchorAt(n * 20, `sentence number ${n}`),
    defect: `defect ${n}`,
    severity: n % 6 === 0 ? 'required' : 'advisory',
    evidence: { input: 'draft', basis: 'a rule typed onto the standard', ruleId: 'rule-1' },
    status: 'open',
    closedBy: null,
    closedAt: null,
    createdAt: '2026-10-24T00:00:00.000Z',
    ...over,
  });
  // forty findings: 6 required (every sixth) and 34 advisory, in two checks
  const forty = Array.from({ length: 40 }, (_, at) =>
    make(at + 1, at % 2 === 0 ? {} : { checkFamily: 'completeness' }),
  );
  const panel = (findings: Finding[], over: Partial<React.ComponentProps<typeof FindingsPanel>> = {}) =>
    renderToStaticMarkup(
      <FindingsPanel
        findings={findings}
        busy={false}
        focused={null}
        drifted={[]}
        onLocate={() => {}}
        onResolve={() => {}}
        onBulk={() => {}}
        {...over}
      />,
    );

  it('forty findings narrow to the required ones in one click, and the counts say so first', () => {
    const counts = countFindings(forty, 'all', 'all');
    expect(counts).toMatchObject({ all: 40, required: 6, advisory: 34 });
    const required = narrowFindings(forty, 'required', 'all');
    expect(required).toHaveLength(6);
    expect(required.every((finding) => finding.severity === 'required')).toBe(true);
    // the switches carry the counts
    const html = panel(forty);
    expect(html).toContain('All 40');
    expect(html).toContain('Required 6');
    expect(html).toContain('Advisory 34');
    // and starting on Required shows only those six
    const narrowed = panel(forty, { initialSeverity: 'required' });
    expect(narrowed).toContain('Showing 6 of 40');
    expect(narrowed).toContain('defect 6');
    expect(narrowed).not.toContain('defect 5<');
  });

  it('the counts are live about each other: a switch says what pressing it would leave', () => {
    // within one check, the severity counts shrink to that check
    const style = countFindings(forty, 'all', 'style');
    expect(style.all).toBe(20);
    expect(style.required + style.advisory).toBe(20);
    // within one severity, the check counts shrink to that severity
    const requiredOnly = countFindings(forty, 'required', 'all');
    expect(requiredOnly.allFamilies).toBe(6);
    expect(([...requiredOnly.byFamily.values()] as number[]).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('keeps the grouped view as the default, and offers the table as a second view', () => {
    const html = panel(forty.slice(0, 4));
    expect(html).toContain('finding-group');
    expect(html).toContain('Grouped');
    expect(html).toContain('Table');
    expect(html).not.toContain('<table');
  });

  it('the table view lists reference, severity, check, rule, where and state, and carries the same filters', () => {
    const html = panel(forty.slice(0, 6), { initialView: 'table', initialSeverity: 'required' });
    expect(html).toContain('<table');
    for (const heading of ['Ref', 'Severity', 'Check', 'Rule or source', 'Where', 'State']) {
      expect(html).toContain(heading);
    }
    // the sixth finding is the only required one among these six
    expect(html).toContain('F6');
    expect(html).not.toContain('F5<');
    expect(html).toContain('Open');
  });

  it('the table names what each finding rests on', () => {
    expect(ruleOrSource(make(1))).toContain('a rule typed onto the standard');
    expect(
      ruleOrSource(make(1, { evidence: { input: 'rulebook', clause: '§2.1', quote: 'q', rulebookRef: 'g', scope: 'project' } })),
    ).toBe('Clause §2.1');
  });

  it('shows BOTH places of a contradiction side by side, each with its own jump', () => {
    const two = make(1, {
      checkFamily: 'self_contradiction',
      anchor: anchorAt(10, 'a 12% reduction'),
      evidence: {
        input: 'draft',
        basis: '“Conclusions”, section 3 of this draft',
        otherAnchor: anchorAt(400, 'a 9% reduction'),
      },
    });
    const html = panel([two]);
    expect(html).toContain('finding-pair');
    expect(html).toContain('a 12% reduction');
    expect(html).toContain('a 9% reduction');
    expect(html).toContain('Go to this place');
    expect(html).toContain('Go to the other place');
    // a one-place finding does not
    expect(panel([make(2)])).not.toContain('finding-pair');
  });
});

describe('T-476 — the strength map, and the disproving pass beside its price', () => {
  it('the launcher marks each rule kind and each check "Settled in code" or "The model’s reading"', () => {
    const html = renderToStaticMarkup(<StrengthMap />);
    for (const label of ['Preferred wording', 'Convention', 'Required structure', 'A number with a target', 'Judgement']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Settled in code');
    expect(html).toContain('The model’s reading');
    // every check family is on the map
    for (const entry of CHECK_FAMILY_CATALOGUE) expect(html).toContain(entry.label);
  });

  const estimate = { calls: 6, tokens: 4200, cost: 0.0213 };

  it('off: the option shows no price and nothing to wait for', () => {
    const html = renderToStaticMarkup(
      <DisprovingPassOption on={false} onToggle={() => {}} estimate={estimate} loading={false} />,
    );
    expect(html).toContain('Second look at the model');
    expect(html).not.toContain('more model call');
    expect(html).not.toContain('0.0213');
  });

  it('on: the cost is shown beside the switch — calls, tokens and, where priced, the price', () => {
    const html = renderToStaticMarkup(
      <DisprovingPassOption on onToggle={() => {}} estimate={estimate} loading={false} />,
    );
    expect(html).toContain('about 6 more model calls');
    expect(html).toContain('4,200 tokens');
    expect(html).toContain('0.0213');
    // unpriced is said, never shown as a free pass
    expect(disprovingCostStatement({ calls: 1, tokens: 900, cost: null })).toContain('No price is set');
    expect(disprovingCostStatement({ calls: 1, tokens: 900, cost: null })).toContain('about 1 more model call ');
  });

  it('reads the figure off the plan’s own disprove step, and off nothing else', () => {
    const step = (key: string, calls: number, cost: number | null) => ({
      key,
      stage: 'analyse' as const,
      worker: 'qa_section_check',
      label: key,
      estimate: { calls, tokensPrompt: 1000, tokensCompletion: 200, cost },
    });
    expect(disprovingEstimateOf([step('check#0', 1, 0.5)])).toBeNull();
    expect(disprovingEstimateOf([step('check#0', 1, 0.5), step('disprove', 3, 0.1)])).toEqual({
      calls: 3,
      tokens: 1200,
      cost: 0.1,
    });
  });

  it('🔒 the plan screens still show NO price line, even for a plan that carries the disprove step (A3 stands)', () => {
    const html = renderToStaticMarkup(
      <CheckPlanCard
        plan={{
          workflowId: 'qa-check',
          workflowVersion: 4,
          steps: [
            { key: 'check#0', stage: 'analyse', worker: 'qa_section_check', label: 'Read the whole draft', estimate: { calls: 1, tokensPrompt: 10, tokensCompletion: 5, cost: 0.4321 } },
            { key: 'disprove', stage: 'analyse', worker: 'qa_section_check', label: 'Ask the model to argue that each finding it raised is wrong, and withdraw any it can disprove', estimate: { calls: 2, tokensPrompt: 10, tokensCompletion: 5, cost: 0.1234 } },
          ],
          coverage: '1 section · 1 check · each finding the model raises argued against before you see it',
          cost: { total: 0.5555, priced: true },
          refusal: null,
          shape: 'One pass over the whole draft.',
        }}
        busy={false}
        onRun={() => {}}
      />,
    );
    expect(html).toContain('Ask the model to argue');
    for (const figure of ['0.4321', '0.1234', '0.5555']) expect(html).not.toContain(figure);
    expect(html.toLowerCase()).not.toContain('cost');
  });
});

describe('T-483 — the document page for a reader who is not on the plan row', () => {
  const standard: ReaderDocument = {
    containerId: 'c1',
    documentReference: 'WA-STD-BS5930-001',
    currentVersionId: 'v1',
    title: 'Code of practice for ground investigations',
    revision: 'R01',
    suitability: null,
    discipline: null,
    producerName: 'Trentmoor',
    issuedAt: '2026-01-01T00:00:00.000Z',
    state: 'live',
    kind: 'reference',
    contextState: { grounds: true, reason: null },
    producingOrganisationId: 'o1',
    withdrawalProposal: null,
    notCitable: false,
    notCitableReason: null,
    currency: null,
    withdrawnReason: null,
  };
  const page = (reader: ReaderDocument, currencyRead: Parameters<typeof ReaderPage>[0]['currencyRead']) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ReaderPage
          reader={reader}
          containerId="c1"
          projectId="p1"
          tab="overview"
          setTab={() => undefined}
          versions={[]}
          renditionsByVersion={{}}
          citedVersionId={null}
          cited={null}
          currencyRead={currencyRead}
          stateChanges={[]}
        />
      </MemoryRouter>,
    );

  it('shows four tabs and none of the plan-only ones, and no actions', () => {
    const html = page(standard, null);
    for (const label of ['Overview', 'Versions', 'Relationships', 'Activity']) expect(html).toContain(label);
    expect(html).not.toContain('Review record');
    expect(html).not.toContain('Transmittals');
    expect(html).not.toContain('Edit details');
    expect(html).not.toContain('Open the review');
    expect(html).not.toContain('Who can see this');
    expect(html).toContain('WA-STD-BS5930-001');
    expect(html).toContain('Trentmoor');
  });

  it('shows the Currency card for a reference document and none for a deliverable', () => {
    const currency = {
      currency: { state: 'unconfirmed' as const, confirmedAt: null, confirmedBy: null, recheckDue: null },
      intervalMonths: 12,
    };
    expect(page(standard, currency)).toContain('Currency');
    expect(page({ ...standard, kind: 'deliverable' }, null)).not.toContain('Currency');
  });
});

// The scope panel escapes its card (a card clips what overhangs it): placed from
// the chip's rect, flipped up when there is no room below.
describe('floating panel placement', () => {
  const view = { width: 1280, height: 800 };
  it('hangs below the chip when there is room', () => {
    const s = panelStyle({ left: 100, top: 100, bottom: 130 }, view, 'bottom');
    expect(s).toMatchObject({ position: 'fixed', left: 100, top: 136 });
  });
  it('flips up when the chip is near the bottom', () => {
    const s = panelStyle({ left: 100, top: 700, bottom: 730 }, view, 'bottom');
    expect(s).toMatchObject({ bottom: 106, top: 'auto' });
  });
  it('opens up when asked to, and stays inside the viewport sideways', () => {
    const s = panelStyle({ left: 1200, top: 100, bottom: 130 }, view, 'top');
    expect(s.bottom).toBe(706);
    expect(s.left).toBe(1280 - 460 - 16);
  });
});

// T-478 - the editor's badge beside the document's name reads the internal round
describe('the sandbox lifecycle badge sees the internal round (T-478)', () => {
  const round = (state: 'open' | 'issued') => ({ versionReference: 'P01', state }) as never;
  const cycle = (state: 'active' | 'accepted', rounds: never[]) => ({ state, rounds }) as never;
  it('says Working, then Frozen, until a round is open', () => {
    expect(sandboxLifecycleBadge({ headLocked: false, workingRevision: 'v0.2' }).label).toBe('Working v0.2');
    expect(sandboxLifecycleBadge({ headLocked: true, workingRevision: 'v0.2' }, null).label).toBe('Frozen v0.2');
  });
  it('says In internal QA P01 while the round is open, and QA accepted after', () => {
    const doc = { headLocked: true, workingRevision: 'v0.2' };
    expect(sandboxLifecycleBadge(doc, cycle('active', [round('open')])).label).toBe('In internal QA P01');
    expect(sandboxLifecycleBadge(doc, cycle('accepted', [round('issued')])).label).toBe('QA accepted P01');
    expect(sandboxLifecycleBadge(doc, cycle('active', [round('issued')])).label).toBe('Frozen v0.2');
  });
});
