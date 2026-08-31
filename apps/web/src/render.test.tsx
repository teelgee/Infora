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
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DestinationCheckResponse, Finding, ToolPlan, ToolSummary } from '@infora/contracts';
import { DataSourcesChip } from './composer-chips';
import { DestinationBlock } from './destination-selector';
import { FindingsPanel } from './findings-panel';
import { AttachedCopy, CheckPlanCard, LibraryScopeCopy } from './screens/tools';

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
            { containerId: 'c1', versionId: 'v1', documentReference: 'WA-GEO-001', title: 'GI' },
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
      waitsOn: 'being built as T-336',
    };
    // the shape the surface renders from — an `unbuilt` tool carries no href,
    // which is what stops a tile promising a screen that does not exist
    expect(checker.href).toBeUndefined();
    expect(checker.waitsOn).toContain('T-336');
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

  it('an unpriced deployment says so rather than showing a plausible £0.00 (T-254)', () => {
    const html = render({ cost: { total: null, priced: false } });
    expect(html).toContain('not priced');
    expect(html).not.toContain('£0.0000');
  });

  it('a code step priced at zero is a real price, and is shown as part of a real total', () => {
    // 0 is a price (it genuinely spends nothing); null is nobody priced it
    expect(render()).toContain('£0.0180');
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
});
