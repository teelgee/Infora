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
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  AppBuildTurn,
  DestinationCheckResponse,
  Finding,
  GroundingSource,
  ListRuleProposalsResponse,
  ProposedRule,
  RuleProposal,
  RuleSetVersion,
  StyleGuideRecord,
  SandboxDocument,
  ToolPlan,
  ToolSummary,
} from '@infora/contracts';
import { DataSourcesChip } from './composer-chips';
import { FirmShelfPane, ProjectShelfPane } from './screens/knowledge';
import {
  ExtractionReportNote,
  ProposalsPane,
  RuleRow,
  SavedRuleSet,
  orderForReview,
} from './screens/style-guide';
import type { FirmShelf } from './screens/knowledge';
import { DestinationBlock } from './destination-selector';
import { FindingsPanel } from './findings-panel';
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
  AttachPicker,
  AttachedCopy,
  CheckFamilyRow,
  CheckPlanCard,
  LibraryScopePicker,
  ChosenNote,
  AgentPane,
  LibraryScopeCopy,
  ProposedDocumentCard,
  RunProgress,
  SectionComposer,
  SourceRow,
  StyleGuidePicker,
  matchesQuery,
  StyleSourcesNote,
  ToolCard,
} from './screens/tools';

describe('T-292 — the zero-source warning is a STATEMENT, not a menu', () => {
  const empty = { sources: [], assemblyTokenBudget: 12000 };

  it('states "no sources in scope" in a warning tone, and offers nothing to open', () => {
    // a grounded answer over an empty scope is the single most misleading state
    // Ask can be in: the answer arrives, it is fluent, and nothing on the
    // screen says it rested on nothing
    const html = renderToStaticMarkup(
      <DataSourcesChip scope={empty} selected={[]} onChange={() => {}} />,
    );
    expect(html).toContain('No sources in scope');
    expect(html).toContain('chip-warning');
    // THE STATEMENT-NOT-MENU HALF: there is no dropdown, because there is
    // nothing to refine, and an empty list would read as a loading failure
    expect(html).not.toContain('dropdown');
    expect(html).toContain('disabled');
  });

  it('a scope that could not be READ is not zero sources, and says nothing at all', () => {
    // the warning is a claim about the corpus; a claim we could not check must
    // not be made
    const html = renderToStaticMarkup(
      <DataSourcesChip scope={null} selected={[]} onChange={() => {}} />,
    );
    expect(html).not.toContain('No sources in scope');
    expect(html).toContain('Data sources');
  });

  it('a non-empty scope IS a menu, so the zero case is the exception rather than the rule', () => {
    const html = renderToStaticMarkup(
      <DataSourcesChip
        scope={{
          sources: [
            {
              containerId: 'c1',
              versionId: 'v1',
              documentReference: 'WA-GEO-001',
              title: 'GI',
              description: null,
            },
          ],
          assemblyTokenBudget: 12000,
        }}
        selected={[]}
        onChange={() => {}}
      />,
    );
    // the items live behind a closed dropdown, which is the point: the
    // non-empty case is a MENU you open, where the zero case is a statement
    // you cannot
    expect(html).toContain('1 source');
    expect(html).not.toContain('chip-warning');
    expect(html).not.toContain('disabled');
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

// ── T-405 — the source picker says what each document IS ───────────────────
//
// A coded reference identifies a document; it does not say what is in it.
// Choosing what a draft may draw on off references alone is choosing blind,
// which is the whole of this ticket. The absent case is pinned beside the
// present one because it is the common one — most of a real corpus predates
// the column, and a row that spent a line saying "no description" would be
// worse than one that says nothing.
describe('T-405 — a source row carries reference, title and description', () => {
  const row = (over: Partial<GroundingSource>) =>
    renderToStaticMarkup(
      <SourceRow
        source={{
          containerId: 'c1',
          versionId: 'v1',
          documentReference: 'WA-ENV-0004',
          title: 'Environmental baseline',
          description: null,
          ...over,
        }}
        checked={false}
        onToggle={() => {}}
      />,
    );

  it('shows all three when all three are there', () => {
    const html = row({
      description: 'The environmental baseline for the northern section.',
    });
    expect(html).toContain('WA-ENV-0004');
    expect(html).toContain('Environmental baseline');
    expect(html).toContain('The environmental baseline for the northern section.');
  });

  it('says nothing at all where nobody has written a description', () => {
    const html = row({ description: null });
    expect(html).toContain('WA-ENV-0004');
    expect(html).not.toContain('source-row-desc');
    // and no stand-in sentence in its place — an absent description is a state,
    // not a gap to fill with copy
    expect(html.toLowerCase()).not.toContain('no description');
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
describe('T-416 — the library scope search, under the Accuracy check', () => {
  const sources: GroundingSource[] = [
    {
      containerId: 'c1',
      versionId: 'v1',
      documentReference: 'WA-ENV-0004',
      title: 'Environmental baseline',
      description: 'The northern section.',
    },
    {
      containerId: 'c2',
      versionId: 'v2',
      documentReference: 'WA-GEO-0011',
      title: 'Ground investigation report',
      description: null,
    },
  ];
  const render = (over: Partial<Parameters<typeof LibraryScopePicker>[0]> = {}) =>
    renderToStaticMarkup(
      <LibraryScopePicker sources={sources} selected={[]} onToggle={() => {}} {...over} />,
    );

  it('shows the documents with their TITLES, not references alone', () => {
    const html = render();
    expect(html).toContain('Environmental baseline');
    expect(html).toContain('Ground investigation report');
    expect(html).toContain('WA-ENV-0004');
  });

  it('offers a search, and states the whole default before it', () => {
    // leaving everything unticked means the WHOLE library you can reach, which
    // is the opposite of what an empty selection usually means in a form — so
    // it is said in words rather than discovered in the coverage sentence
    const html = render();
    expect(html).toContain('Search by title or reference');
    expect(html).toContain('the whole library you can reach');
    expect(html).toContain('2 documents');
  });

  it('🔒 THE ONLY ROWS ARE THE ONES IT WAS GIVEN — there is no wider set to narrow', () => {
    // the component takes an access-resolved list as a prop and reaches nothing
    // else. A document not in that list cannot be searched into existence, and
    // is not greyed or ranked low: it never reached the browser.
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export function LibraryScopePicker');
    const end = source.indexOf('export function AttachPicker');
    const body = source.slice(start, end);
    expect(body).not.toContain('api.');
    expect(body).not.toContain('fetch(');
    // and the page hands it the grounding scope, which is the server's own
    // access-resolved answer rather than the library list
    expect(source).toContain('sources={scope?.sources ?? null}');
  });

  it('says nothing in scope rather than showing an empty search', () => {
    // an empty picker under a search box reads as a search that failed; the
    // zero case is a statement, exactly as the Ask composer's is
    const html = render({ sources: [] });
    expect(html).toContain('nothing to check against');
    expect(html).not.toContain('Search by title or reference');
  });

  it('a scope that could not be READ is not zero sources, and says the same thing', () => {
    expect(render({ sources: null })).toContain('nothing to check against');
  });
});

describe('T-416 — the attach picker gains the same search', () => {
  const drafts: SandboxDocument[] = [
    { id: 'd1', title: 'Land quality method statement' },
    { id: 'd2', title: 'Ecology baseline note' },
  ] as SandboxDocument[];

  it('searches your own drafts by title, and counts what it found', () => {
    const html = renderToStaticMarkup(
      <AttachPicker drafts={drafts} selected={[]} onToggle={() => {}} />,
    );
    expect(html).toContain('Search your drafts by title');
    expect(html).toContain('Land quality method statement');
    expect(html).toContain('2 documents');
  });

  it('says you have none rather than showing an empty list', () => {
    const html = renderToStaticMarkup(
      <AttachPicker drafts={[]} selected={[]} onToggle={() => {}} />,
    );
    expect(html).toContain('no other drafts');
  });

  it('🔒 reaches nothing beyond the drafts it was handed', () => {
    const source = readFileSync(new URL('./screens/tools.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export function AttachPicker');
    const end = source.indexOf('export function CheckFamilyRow');
    expect(source.slice(start, end)).not.toContain('api.');
  });
});

describe('T-416 — one search behaviour, matched the same way in both pickers', () => {
  it('matches on any of the fields it is given, case-folded', () => {
    expect(matchesQuery(['WA-ENV-0004', 'Environmental baseline'], 'env')).toBe(true);
    expect(matchesQuery(['WA-ENV-0004', 'Environmental baseline'], 'BASELINE')).toBe(true);
    expect(matchesQuery(['WA-ENV-0004', 'Environmental baseline'], 'ecology')).toBe(false);
  });

  it('an empty query matches everything — a search box is not a filter you must satisfy', () => {
    expect(matchesQuery(['anything'], '')).toBe(true);
    expect(matchesQuery(['anything'], '   ')).toBe(true);
  });

  it('a null field is absent rather than a crash', () => {
    // most of a real corpus predates the description column
    expect(matchesQuery([null, 'Title'], 'title')).toBe(true);
    expect(matchesQuery([null], 'x')).toBe(false);
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
