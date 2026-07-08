// T-049 — the kit renders the mockups' class vocabulary (static markup, no
// DOM emulation needed). The stylesheet is the visual spec; these tests pin
// the class names the spec styles.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Step } from '@infora/contracts';
import {
  Badge,
  Button,
  CitationChip,
  CommandBar,
  MadeCard,
  OutChip,
  ProjectSwitcher,
  Rail,
  RailNav,
  RunTrace,
  SuggestionCard,
  UserChip,
} from './index';

describe('primitives (T-049)', () => {
  it('badges carry their tone class and dot', () => {
    const html = renderToStaticMarkup(<Badge tone="green">Grounded &amp; cited</Badge>);
    expect(html).toContain('badge b-green');
    expect(html).toContain('class="dot"');
  });

  it('citation chips distinguish library fact from external authority', () => {
    expect(renderToStaticMarkup(<CitationChip corpus="library">WA-GEO-GIR-004 v2</CitationChip>)).toContain('cite lib');
    expect(renderToStaticMarkup(<CitationChip corpus="authority">EIA Regs 2017</CitationChip>)).toContain('cite auth');
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
