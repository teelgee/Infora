// T-049 — the kit renders the mockups' class vocabulary (static markup, no
// DOM emulation needed). The stylesheet is the visual spec; these tests pin
// the class names the spec styles.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { Plan, PlanStep, PlanStepState, Run, Step } from '@infora/contracts';
import {
  AgentReceipt,
  AppFrame,
  Badge,
  Button,
  ChatBubble,
  Chip,
  CollapseToggle,
  Combobox,
  CommandBar,
  DropdownMenu,
  Field,
  IconButton,
  MadeCard,
  Modal,
  OutChip,
  Pane,
  PaneHeader,
  ProjectCard,
  CompletionFooter,
  formatStepCost,
  ProgressRail,
  ProjectSwitcher,
  Prose,
  Rail,
  RailNav,
  ResizeGrip,
  RunTrace,
  SelectInput,
  Skeleton,
  SourceChip,
  SuggestionCard,
  Table,
  TextInput,
  UserChip,
} from './index';

describe('primitives (T-049)', () => {
  it('badges carry their tone class and dot', () => {
    const html = renderToStaticMarkup(<Badge tone="success">Grounded &amp; cited</Badge>);
    expect(html).toContain('badge b-success');
    expect(html).toContain('class="dot"');
  });

  it('sources distinguish library fact from external authority', () => {
    expect(renderToStaticMarkup(<SourceChip corpus="library">WA-GEO-GIR-004 v2</SourceChip>)).toContain('cite lib');
    expect(renderToStaticMarkup(<SourceChip corpus="authority">EIA Regs 2017</SourceChip>)).toContain('cite auth');
  });

  it('buttons compose variant and size classes', () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" size="sm">
        Accept
      </Button>,
    );
    expect(html).toContain('class="btn primary sm"');
  });

  it('the command bar shows the ✦ glyph and the return hint', () => {
    const html = renderToStaticMarkup(<CommandBar hint="↵">Ask about the project</CommandBar>);
    expect(html).toContain('class="command"');
    expect(html).toContain('✦');
    expect(html).toContain('class="hint"');
  });

  it('the output-target chip and made-card render the Ask affordances', () => {
    expect(renderToStaticMarkup(<OutChip onRemove={() => {}}>Land Quality draft</OutChip>)).toContain('out-chip');
    const made = renderToStaticMarkup(
      <MadeCard title="EIA Scoping Method Statement" subtitle="Sandbox document · 6 citations" action={<a>Open</a>} />,
    );
    expect(made).toContain('made-card');
    expect(made).toContain('EIA Scoping Method Statement');
  });
});

describe('rail (T-049)', () => {
  it('renders the chrome: wordmark, switcher, nav with active item, user chip', () => {
    const html = renderToStaticMarkup(
      <Rail>
        <ProjectSwitcher name="Wrenfield–Ashcombe 400kV" />
        <RailNav
          items={[
            { label: 'Home', glyph: '⌂', href: '#' },
            { label: 'Ask', glyph: '✦', href: '#', active: true },
          ]}
        />
        <UserChip initials="EP" name="Eleanor Price" org="Calder &amp; Hale — Consultant" />
      </Rail>,
    );
    expect(html).toContain('class="rail"');
    expect(html).toContain('class="wordmark"');
    expect(html).toContain('project-switcher');
    expect(html).toContain('class="active"');
    expect(html).toContain('class="avatar"');
  });

  // T-331 (ADR-0049 §6a) — the rail carries the unread count, because it is the
  // placement that survives wherever the user is. Zero renders NOTHING: a badge
  // saying "0" is a badge asking to be ignored, and an item that always wears
  // one stops being read on the day it means something.
  it('carries an unread count, and renders none at zero', () => {
    const nav = (count?: number) =>
      renderToStaticMarkup(
        <RailNav items={[{ label: 'Notifications', glyph: '◔', href: '#', count }]} />,
      );
    expect(nav(3)).toContain('nav-count');
    expect(nav(3)).toContain('>3<');
    expect(nav(0)).not.toContain('nav-count');
    expect(nav(undefined)).not.toContain('nav-count');
    // a three-digit count would push the label out of a 216px rail
    expect(nav(140)).toContain('99+');
  });
});

describe('agent receipt (T-370)', () => {
  const receipt = (over: Partial<Parameters<typeof AgentReceipt>[0]['receipt']> = {}) => ({
    runId: 'r1',
    canUndo: true,
    acts: [
      {
        id: 'a1',
        runId: 'r1',
        act: 'folder_created',
        subject: { kind: 'sandbox_folder', id: 'f1' },
        summary: 'Created the folder “Ground investigation”',
        performedAt: '2026-08-28T10:00:00.000Z',
        undoneAt: null,
      },
      {
        id: 'a2',
        runId: 'r1',
        act: 'folder_created',
        subject: { kind: 'sandbox_folder', id: 'f2' },
        summary: 'Created the folder “Ecology”',
        performedAt: '2026-08-28T10:00:01.000Z',
        undoneAt: '2026-08-28T10:05:00.000Z',
      },
    ],
    ...over,
  });

  it('lists acts line by line — a receipt is what you can check, not a summary', () => {
    const html = renderToStaticMarkup(<AgentReceipt receipt={receipt()} onUndo={() => {}} />);
    expect(html).toContain('Ground investigation');
    expect(html).toContain('Ecology');
    // the head states how much still stands, because that is the question a
    // person asks after undoing one of them
    expect(html).toContain('1 of 2');
  });

  it('keeps an undone act on the receipt, struck, and offers no second undo', () => {
    // currency by state: the record of what the agent did is not edited by
    // undoing it, and a receipt that emptied itself would leave a person unable
    // to answer "what did it do that I then reversed"
    const html = renderToStaticMarkup(<AgentReceipt receipt={receipt()} onUndo={() => {}} />);
    expect(html).toContain('agent-act undone');
    expect(html).toContain('Undone');
    expect(html.match(/>Undo</g) ?? []).toHaveLength(1); // the standing act only
  });

  it('offers no undo at all to someone who is not the run’s requester', () => {
    const html = renderToStaticMarkup(
      <AgentReceipt receipt={receipt({ canUndo: false })} onUndo={() => {}} />,
    );
    expect(html).not.toContain('>Undo<');
  });

  it('renders nothing when the agent did nothing — a receipt for no acts is noise', () => {
    expect(renderToStaticMarkup(<AgentReceipt receipt={receipt({ acts: [] })} />)).toBe('');
  });
});

describe('suggestion card + run trace (T-049)', () => {
  it('the suggestion card numbers, titles and hosts the surface’s actions', () => {
    const html = renderToStaticMarkup(
      <SuggestionCard
        number={1}
        title="Insert §3.3 — contamination pathways"
        description="New subsection from the GIR and baseline."
        active
        actions={<Button size="sm">Accept</Button>}
      />,
    );
    expect(html).toContain('s-card active');
    expect(html).toContain('num-badge');
    expect(html).toContain('s-actions');
  });

  it('the run trace renders the chain as a checklist with the withheld count', () => {
    const base = {
      runId: 'r1',
      parentStepId: null,
      status: 'completed' as const,
      startedAt: '2026-07-08T10:00:00.000Z',
      endedAt: '2026-07-08T10:00:02.500Z',
      sourceSet: [{ versionId: 'v1' }],
      railOutcomes: [],
    };
    const steps: Step[] = [
      { ...base, id: 's1', type: 'retrieve' },
      { ...base, id: 's2', type: 'delegate', childRunId: '0d8f1234-aaaa' },
      { ...base, id: 's3', type: 'draft', model: { id: 'claude-opus-4-8', version: 'x' } },
      {
        ...base,
        id: 's4',
        type: 'ground_check',
        railOutcomes: [{ rail: 'grounding', outcome: 'withheld', detail: 'the claim' }],
      },
      { ...base, id: 's5', type: 'cite' },
    ];
    const html = renderToStaticMarkup(<RunTrace steps={steps} />);
    expect(html).toContain('class="trace"');
    expect(html).toContain('retrieve → draft → ground-check → cite');
    expect(html).toContain('1 access-resolved source');
    expect(html).toContain('1 sub-agent');
    expect(html).toContain('run 0d8f1234');
    expect(html).toContain('Drafted — claude-opus-4-8');
    expect(html).toContain('1 claim withheld');
    expect(html).toContain('2.5s');
  });
});

describe('new components (design-rules.md §B)', () => {
  it('table scopes the component.table token set around a plain <table>', () => {
    const html = renderToStaticMarkup(
      <Table>
        <table>
          <tbody>
            <tr>
              <td>row</td>
            </tr>
          </tbody>
        </table>
      </Table>,
    );
    expect(html).toContain('class="table"');
    expect(html).toContain('<table>');
  });

  it('skeleton renders a shimmering placeholder at the given size', () => {
    const html = renderToStaticMarkup(<Skeleton width={120} height={16} />);
    expect(html).toContain('class="skeleton"');
    expect(html).toContain('width:120px');
    expect(html).toContain('height:16px');
  });

  it('project card renders title/subtitle/action, as a link when href is given', () => {
    const asDiv = renderToStaticMarkup(<ProjectCard title="Wrenfield 400kV" subtitle="Owner: Calder & Hale" />);
    expect(asDiv).toContain('class="project-card"');
    expect(asDiv).toContain('Wrenfield 400kV');
    expect(asDiv).toMatch(/^<div/);

    const asLink = renderToStaticMarkup(<ProjectCard title="Wrenfield 400kV" href="/projects/1" />);
    expect(asLink).toMatch(/^<a /);
    expect(asLink).toContain('href="/projects/1"');
  });

  it('chip is a real button, disabled chips still carry their title', () => {
    const html = renderToStaticMarkup(
      <Chip disabled title="waits on the search provider">
        ◍ Web search
      </Chip>,
    );
    expect(html).toContain('class="chip disabled"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="waits on the search provider"');
  });

  it('dropdown menu renders its trigger; the menu itself is closed until toggled', () => {
    const html = renderToStaticMarkup(
      <DropdownMenu trigger={(toggle) => <button onClick={toggle}>Open</button>}>
        <span>item</span>
      </DropdownMenu>,
    );
    expect(html).toContain('Open');
    expect(html).not.toContain('dropdown-menu');
    expect(html).not.toContain('item');
  });
});

describe('shell additions (slice-ui-redesign, design-rules.md §C)', () => {
  it('the app frame renders the rail flush and the panes in a content region', () => {
    const html = renderToStaticMarkup(
      <AppFrame rail={<aside className="rail" />}>
        <Pane>
          <PaneHeader title="Statement of Community Consultation" />
        </Pane>
      </AppFrame>,
    );
    expect(html).toContain('class="app-frame"');
    expect(html).toContain('class="frame-content"');
    // the rail is a direct child of the frame, never inside the content region
    expect(html.indexOf('class="rail"')).toBeLessThan(html.indexOf('frame-content'));
  });

  it('panes carry their variant; panel takes a live-resize width override', () => {
    expect(renderToStaticMarkup(<Pane>x</Pane>)).toContain('class="pane canvas"');
    const panel = renderToStaticMarkup(
      <Pane variant="panel" width={348}>
        x
      </Pane>,
    );
    expect(panel).toContain('class="pane panel"');
    expect(panel).toContain('width:348px');
  });

  it('the pane header slots location / title / action', () => {
    const html = renderToStaticMarkup(
      <PaneHeader location="Project sandbox" title="SoCC" action={<Button variant="primary">Promote</Button>} />,
    );
    expect(html).toContain('class="pane-header"');
    expect(html).toContain('location-chip');
    expect(html).toContain('class="btn primary"');
  });

  it('the collapse toggle is an accessibly-labelled button with a direction glyph', () => {
    const html = renderToStaticMarkup(<CollapseToggle direction="right" label="Collapse panel" />);
    expect(html).toContain('class="collapse-toggle"');
    expect(html).toContain('aria-label="Collapse panel"');
    expect(html).toContain('»');
  });

  it('the resize grip is a vertical separator carrying the gutter', () => {
    const html = renderToStaticMarkup(<ResizeGrip />);
    expect(html).toContain('class="grip"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
  });
});

describe('component additions (slice-ui-redesign)', () => {
  it('icon button composes the .btn state set with the square variant', () => {
    const html = renderToStaticMarkup(
      <IconButton variant="primary" aria-label="Send">
        ↵
      </IconButton>,
    );
    expect(html).toContain('class="btn icon-btn primary"');
    expect(html).toContain('aria-label="Send"');
  });

  it('prose wraps the document body; tracked changes ride inside as spans', () => {
    const html = renderToStaticMarkup(
      <Prose>
        <p>
          A restriction <span className="del">may be considered</span>
          <span className="ins">remains available</span> as a fallback.
        </p>
      </Prose>,
    );
    expect(html).toContain('class="prose"');
    expect(html).toContain('class="del"');
    expect(html).toContain('class="ins"');
  });

  it('chat turns are asymmetric: user is a filled bubble, agent is plain reply text', () => {
    expect(renderToStaticMarkup(<ChatBubble>Draft a mitigation</ChatBubble>)).toContain('class="bubble mine"');
    expect(renderToStaticMarkup(<ChatBubble from="agent">Done — 1 suggestion.</ChatBubble>)).toContain(
      'class="reply"',
    );
  });
});

describe('modal + form controls (T-163)', () => {
  it('a closed modal renders nothing; the field vocabulary is stable', () => {
    expect(
      renderToStaticMarkup(
        <Modal open={false} onClose={() => {}} title="X">
          body
        </Modal>,
      ),
    ).toBe('');
  });

  it('Field wraps a labelled control with hint/error slots', () => {
    const html = renderToStaticMarkup(
      <Field label="Reference" hint="scheme-compliant">
        <TextInput value="WA-BB-GEO-004" onChange={() => {}} mono />
      </Field>,
    );
    expect(html).toContain('class="field"');
    expect(html).toContain('field-label');
    expect(html).toContain('field-input mono');
    expect(html).toContain('field-hint');
  });

  it('SelectInput renders a styled native select with its options', () => {
    const html = renderToStaticMarkup(
      <SelectInput
        value="GEO"
        onChange={() => {}}
        options={[
          { value: 'GEO', label: 'Geotechnical' },
          { value: 'ENV', label: 'Environmental' },
        ]}
      />,
    );
    expect(html).toContain('field-select');
    expect(html).toContain('Geotechnical');
    expect(html).toContain('field-select-chev');
  });

  it('Combobox renders a searchable control (list closed until focus)', () => {
    const html = renderToStaticMarkup(
      <Combobox
        value={null}
        onChange={() => {}}
        options={[{ value: 'c1', label: 'WA-BB-GEO-004', sub: 'Geotech report' }]}
        placeholder="Search deliverables"
      />,
    );
    expect(html).toContain('class="combobox"');
    expect(html).toContain('combobox-input');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('role="listbox"'); // the list is closed until focus
  });
});

// T-293 — the progress rail. These are not rendering tests: each one pins a
// rule that, broken, makes the surface tell the user something untrue.
describe('ProgressRail (T-293)', () => {
  const step = (
    ordinal: number,
    stage: PlanStep['stage'],
    state: PlanStepState,
  ): PlanStep => ({
    id: `s${ordinal}`,
    ordinal,
    stage,
    worker: null,
    inputs: {},
    dependsOn: [],
    state,
    stepRowId: null,
    outputRef: null,
    editedByParticipantId: null,
    editedAt: null,
  });

  // RULE 4, and the reason the prop is nullable: a run in flight has no
  // readable plan, and the honest rendering of that is a stated absence — not
  // the first stage lit up, which is a client-side timer with the timer hidden.
  it('claims nothing when no plan has been read', () => {
    const html = renderToStaticMarkup(<ProgressRail steps={null} />);
    expect(html).toContain('No plan has been recorded yet');
    expect(html).not.toContain('pr-step');
  });

  // RULE 1 — a stage that did not run is never shown as having run.
  it('renders a pending stage as not started, never as done', () => {
    const html = renderToStaticMarkup(
      <ProgressRail steps={[step(0, 'search_corpus', 'pending'), step(1, 'analyse', 'complete')]} />,
    );
    expect(html).toContain('Searching project documents');
    expect(html).toContain('not started');
    expect(html).toContain('is-pending');
  });

  // RULE 2 — a stage the plan never declared is ABSENT, not quietly completed.
  it('shows only the stages the plan declared', () => {
    const html = renderToStaticMarkup(<ProgressRail steps={[step(0, 'analyse', 'complete')]} />);
    expect(html).toContain('Running the analysis');
    expect(html).not.toContain('Researching publicly available sources');
    expect(html).not.toContain('Checking the consenting canon');
  });

  // RULE 3 — failed and skipped show as failed and skipped, in those words.
  it('names a failed stage failed and a skipped stage skipped', () => {
    const html = renderToStaticMarkup(
      <ProgressRail steps={[step(0, 'analyse', 'failed'), step(1, 'present', 'skipped')]} />,
    );
    expect(html).toContain('failed');
    expect(html).toContain('skipped');
    expect(html).toContain('is-failed');
    expect(html).toContain('is-skipped');
  });

  // the plan's own order, read off `ordinal` rather than off array position —
  // the rail must not reorder what the plan declared
  it('orders by the plan step ordinal', () => {
    const html = renderToStaticMarkup(
      <ProgressRail steps={[step(2, 'present', 'complete'), step(0, 'search_corpus', 'complete')]} />,
    );
    expect(html.indexOf('Searching project documents')).toBeLessThan(html.indexOf('Report'));
  });

  // an empty plan is a fact and reads differently from no plan at all
  it('distinguishes a plan with no steps from no plan', () => {
    expect(renderToStaticMarkup(<ProgressRail steps={[]} />)).toContain('declared no steps');
  });
});

// A guard rather than a rendering test, in the repo's own idiom: the rail's
// whole claim is that it moves when the record moves. A timer would break that
// silently and would still look right, so the absence of one is checked at the
// source rather than trusted to review.
describe('the progress rail has no clock (T-293)', () => {
  it('mentions no timer, interval or animation frame', () => {
    const source = readFileSync(new URL('./progress-rail.tsx', import.meta.url), 'utf8');
    for (const forbidden of ['setInterval', 'setTimeout', 'requestAnimationFrame', 'Date.now']) {
      expect(source).not.toContain(forbidden);
    }
  });
});

// T-294 — the footer's hard requirement is the mode, and the failures worth
// pinning are all the same shape: a footer that states something the record
// does not hold. Each case below is a sentence the user must never be able to
// read off an answer that did not earn it.
describe('CompletionFooter (T-294)', () => {
  const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p1',
    runId: 'r1',
    conversationId: 'c1',
    projectId: 'proj',
    requesterParticipantId: 'part',
    mode: 'declared',
    workflowId: 'answer-a-question',
    workflowVersion: 2,
    lensId: null,
    lensVersion: null,
    state: 'complete',
    question: 'q',
    restatement: null,
    assumptions: [],
    createdAt: '2026-08-29T00:00:00.000Z',
    supersededByPlanId: null,
    steps: [],
    ...over,
  });

  const run = (over: Partial<Run> = {}): Run => ({
    id: 'r1',
    conversationId: 'c1',
    parentRunId: null,
    agentId: 'infora.grounded_draft',
    agentProvenance: 'infora',
    state: 'completed',
    request: 'q',
    response: 'An answer.',
    startedAt: '2026-08-29T00:00:00.000Z',
    endedAt: '2026-08-29T00:00:01.000Z',
    steps: [],
    suggestions: [],
    citations: [],
    ...over,
  });

  const groundCheck = (outcomes: Step['railOutcomes']): Step => ({
    id: 'st1',
    runId: 'r1',
    parentStepId: null,
    type: 'ground_check',
    status: 'completed',
    startedAt: '2026-08-29T00:00:00.000Z',
    endedAt: '2026-08-29T00:00:01.000Z',
    sourceSet: [],
    railOutcomes: outcomes,
  });

  // THE hard requirement: the mode is in words and is never behind Details.
  it('states the orchestration mode in words, outside the Details affordance', () => {
    const html = renderToStaticMarkup(<CompletionFooter run={run()} plan={plan()} />);
    expect(html).toContain('Ran a declared workflow');
    expect(html).toContain('answer-a-question');
    expect(html.indexOf('Ran a declared workflow')).toBeLessThan(html.indexOf('Details'));
  });

  // T-267: an edited plan is `model_chosen` and still carries a workflow-shaped
  // history. Deriving the label from `workflowId` would put the declared
  // workflow's promise — same inputs, same steps — on a plan that broke it.
  it('reads the mode off the stored column, never off the workflow id', () => {
    const edited = plan({ mode: 'model_chosen', workflowId: 'answer-a-question' });
    const html = renderToStaticMarkup(<CompletionFooter run={run()} plan={edited} />);
    expect(html).toContain('Composed for this question');
    expect(html).not.toContain('Ran a declared workflow');
  });

  // a plan that could not be read is a stated absence, not a guess — the same
  // rule the progress rail's nullable steps carry
  it('says the mode is not recorded rather than assuming one', () => {
    const html = renderToStaticMarkup(<CompletionFooter run={run()} plan={null} />);
    expect(html).toContain('Orchestration mode not recorded');
    expect(html).not.toContain('Composed for this question');
  });

  // "where verification could not be taken independently, say so" — the
  // independent-family verifier is beyond V1, so EVERY answer here must say it
  it('states that no independent model verification was taken', () => {
    const html = renderToStaticMarkup(
      <CompletionFooter run={run({ steps: [groundCheck([{ rail: 'grounding', outcome: 'passed' }])] })} plan={plan()} />,
    );
    expect(html).toContain('no independent model verification was taken');
  });

  // no ground-check outcomes at all is not "nothing was withheld"
  it('distinguishes an unrecorded check from a clean one', () => {
    const html = renderToStaticMarkup(<CompletionFooter run={run()} plan={plan()} />);
    expect(html).toContain('No ground-check outcomes were recorded');
  });

  // T-254's null-is-not-zero rule, on the surface that reports the number.
  // Pinned on the formatter directly: the per-step costs sit behind Details,
  // which static markup does not render, and this rule is far too easy to lose
  // to leave untested for that reason.
  it('renders an unpriced step as unpriced, never as zero', () => {
    expect(formatStepCost(null)).toBe('unpriced');
    expect(formatStepCost(undefined)).toBe('unpriced');
    // a DECLARED rate of zero is still a price — a self-hosted model that
    // genuinely costs nothing must not read as "we do not know"
    expect(formatStepCost(0)).toBe('$0.0000');
    expect(formatStepCost(0.0123)).toBe('$0.0123');
  });

  // the plan and the manifest are behind Details; the mode is not
  it('keeps the plan breakdown behind Details and the mode outside it', () => {
    const html = renderToStaticMarkup(<CompletionFooter run={run()} plan={plan()} />);
    expect(html).toContain('Details');
    expect(html).not.toContain('Citation manifest');
    expect(html).toContain('Ran a declared workflow');
  });
});

// T-401 — the notice style is the thing under test, not any one screen. Every
// notice in the product is a `.banner`, so a layout rule that breaks sentences
// breaks all of them at once; this pins the rule at its single source.
describe('a notice reads as one sentence (T-401)', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const bannerRule = /\n\.banner \{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('lays its children out in normal text flow, not as flex columns', () => {
    expect(bannerRule).toContain('display: block');
    expect(bannerRule).not.toContain('display: flex');
  });

  it('gives a dismissible notice its own rule rather than a flex row', () => {
    expect(css).toContain('.banner--dismissible');
  });
});
