/**
 * S2 · the QA checker (BUILT t2-02, t2-05, t2-06-progress, t2-06-run; DEV
 * numbers per flows D-19: Full check with all five ticked, no attachment).
 * Flow layout in the built page column; `scrollY` scrolls it.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT, RADIUS, ui, type F } from '../../shared';
import { WT_LIB, WT_TOOLS } from '../../data/wrenfield';
import { Btn, Checkbox, Page, PageHeader, SearchInput, Segmented, Select, SelectMenu, Shell, StatusPill } from '../shared';
import { Probe } from './kit';

const Q = WT_TOOLS.checker;

const Card: React.FC<{ title?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; a?: string; opacity?: number }> = ({ title, children, style, a, opacity = 1 }) => (
  <div
    data-w4={a}
    style={{ background: C.sunken, borderRadius: RADIUS.lg, boxShadow: '0 10px 28px rgba(20,20,20,.05)', padding: '16px 16px 18px', marginTop: 12, opacity, ...style }}
  >
    {title ? <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: '20px', marginBottom: 4 }}>{title}</div> : null}
    {children}
  </div>
);

const Sub: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 13, lineHeight: '19px', color: C.muted, maxWidth: 790, ...style }}>{children}</div>
);

const NoAi: React.FC = () => <StatusPill tone="neutral" label="No AI" size={11.5} style={{ marginLeft: 6 }} />;

const CheckRow: React.FC<{ name: string; desc: string; noAi?: boolean; children?: React.ReactNode; last?: boolean }> = ({ name, desc, noAi, children, last }) => (
  <div style={{ padding: '14px 0 16px', borderBottom: last ? undefined : `1px solid ${C.borderStrong}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Checkbox checked />
      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{name}</span>
      {noAi ? <NoAi /> : null}
    </div>
    <Sub style={{ marginLeft: 25, marginTop: 4, color: C.muted }}>{desc}</Sub>
    {children ? <div style={{ marginLeft: 35, marginTop: 12 }}>{children}</div> : null}
  </div>
);

const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text2, marginBottom: 6, ...style }}>{children}</div>
);

const ACCURACY_ROWS = ['WA-CON-SCC-002', 'WA-EIA-SCP-001', 'WA-ENV-BAS-003', 'WA-GEO-GIR-004', 'WA-WAT-FRA-001', 'WA-EIA-MST-001'];
const LIB = Object.fromEntries(Object.values(WT_LIB).map((d) => [d.ref, d]));

/** Step list: 20 px outlined circles; while running, the current one is ink-outlined and bold; done = ink fill + tick. */
const Steps: React.FC<{ running?: number; done?: number }> = ({ running, done = 0 }) => (
  <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
    {Q.planSteps.map((s, i) => {
      const isDone = i < done;
      const isRun = running === i;
      return (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: C.text }}>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              flex: 'none',
              boxSizing: 'border-box',
              border: `1.5px solid ${isRun || isDone ? C.ink : C.borderStrong}`,
              background: isDone ? C.ink : C.pane,
              color: isDone ? '#fff' : isRun ? C.ink : C.muted,
              fontSize: 11,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDone ? '✓' : i + 1}
          </span>
          <span style={{ fontWeight: isRun ? 700 : 400 }}>{s}</span>
        </div>
      );
    })}
  </div>
);

export interface QaCheckerProps {
  scrollY: number;
  /** Select hover from, menu open at, option hovered from, value set at. */
  selectHoverFrom: F;
  menuAt: F;
  optHoverFrom: F;
  valueAt: F;
  seePlanHoverFrom: F;
  seePlanPressAt: F;
  planAt: F;
  runHoverFrom: F;
  runPressAt: F;
  runningAt: F;
  step1DoneAt: F;
  doneAt: F;
  resultAt: F;
  openHoverFrom: F;
  openPressAt: F;
}

export const QaChecker: React.FC<QaCheckerProps> = (p) => {
  const f = useCurrentFrame();
  const valueSet = f >= p.valueAt;
  const menuOpen = f >= p.menuAt && f < p.valueAt + 4;
  const planShown = f >= p.planAt;
  const running = f >= p.runningAt && f < p.doneAt + 1;
  const done = f > p.doneAt;
  const planO = planShown ? ui(f, p.planAt) : 0;
  return (
    <Shell seat="ELEANOR" nav="Tools" overlay={<Probe tag="qa" />}>
      <Page scrollY={p.scrollY}>
        <PageHeader title={Q.title} sub={Q.sub} />

        <Card a="qa-card-draft" style={{ marginTop: 10 }}>
          <Label>Which draft</Label>
          <div style={{ position: 'relative', width: 778 }} data-w4="qa-draft">
            <Select
              value={valueSet ? Q.draft : Q.draftPlaceholder}
              muted={!valueSet}
              focused={menuOpen || (f >= p.selectHoverFrom && f < p.valueAt)}
              style={{ height: 32 }}
            />
            {menuOpen ? (
              <SelectMenu x={0} y={36} width={778} at={p.menuAt} exitAt={p.valueAt} options={Q.draftOptions} hover={f >= p.optHoverFrom ? Q.draftOptions[0] : undefined} />
            ) : null}
          </div>
          <Sub style={{ marginTop: 8 }}>{Q.draftHint}</Sub>
        </Card>

        <Card title="Which checks to run">
          <Sub>Tick a check and its own settings appear underneath it. Start from a preset if you like — it is a starting point, not a mode, and every part of it stays adjustable afterwards.</Sub>
          <div style={{ marginTop: 14 }}>
            <Segmented options={['Full check', 'Quick check']} active="Full check" size={13} />
          </div>
          <Sub style={{ marginTop: 12, fontSize: 12, lineHeight: '17px' }}>
            Every check, and the project record looked up for each checkable statement rather than once per section. Slower and more expensive — and it is what catches a wrong figure buried in a paragraph about something else.
          </Sub>
          <div style={{ marginTop: 6 }}>
            <CheckRow
              name="House style"
              desc="Reads each section against the project style guide and your firm’s own rules, and quotes the clause it is enforcing. Where the two disagree, the project’s guide wins and your firm’s fills the gaps."
            >
              <Label>Rules this check will apply</Label>
              <div style={{ fontSize: 13, lineHeight: '20px', color: C.text }}>
                Wrenfield–Ashcombe Project Style Guide <span style={{ fontSize: 11.5, color: C.muted }}>3 clauses</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: '20px', color: C.text }}>Your firm’s own manual, where the project’s guides are silent.</div>
              <Sub style={{ marginTop: 6, fontSize: 11.5, lineHeight: '17px' }}>
                The project’s guide wins where the two disagree; your firm’s fills the gaps. Where a guide has been turned into accepted rules, this check applies those rules instead of reading it as prose — and the plan’s coverage below says how many of them it will apply.
              </Sub>
            </CheckRow>
            <CheckRow
              name="Accuracy"
              desc="Reads each section against what the project library actually says, and cites the passage behind every finding. Where the library is silent it says nothing rather than guessing."
            >
              <Label>How hard to look</Label>
              <Select value="Statement by statement (slower, catches buried figures)" style={{ height: 32, width: 778, background: C.pane }} />
              <Label style={{ marginTop: 10 }}>What it checks against</Label>
              <Sub style={{ color: C.text2 }}>
                By default the whole library you can reach. Narrow it here if you want. Findings from these <b style={{ color: C.text }}>cite normally</b> — they resolve to a place in a source document.
              </Sub>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <SearchInput placeholder="Search by title or reference…" width={700} />
                <span style={{ fontSize: 12, color: C.muted }}>6 documents</span>
              </div>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {ACCURACY_ROWS.map((r) => (
                  <div key={r} style={{ fontSize: 12.5, lineHeight: '18px', paddingLeft: 12, borderLeft: `2px solid ${C.borderStrong}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 900 }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: 600, color: C.text, fontSize: 12 }}>{r}</span>{' '}
                    <span style={{ color: C.muted }}>{LIB[r]?.description}</span>
                  </div>
                ))}
              </div>
            </CheckRow>
            <CheckRow
              name="Internal consistency"
              desc="Compares what each section asserts against what the others do, so a figure that changes between chapters is caught. One pass over the whole draft."
            />
            <CheckRow
              name="Readability"
              noAi
              desc="Scores each section against the project’s reading-age target and flags the ones well outside it. Arithmetic, not AI — and never a pass or a fail."
            />
            <CheckRow
              name="Completeness"
              noAi
              last
              desc="Looks for sections the outline expects and the draft does not have, and for placeholder text left behind. Arithmetic, not AI."
            />
          </div>
        </Card>

        <Card title="Attach a document" style={{ marginTop: 12 }}>
          <Sub style={{ color: C.text2 }}>
            One of your own drafts, or a file you upload here, read as background. Findings from an attached document are <b style={{ color: C.text }}>never cited</b> — they quote an excerpt instead of resolving to a source. If you want citations, scope to the library document above instead.
          </Sub>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <SearchInput placeholder="Search your drafts by title…" width={700} />
            <span style={{ fontSize: 12, color: C.muted }}>1 document</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: C.text }}>
            <Checkbox checked={false} />
            Land Quality scoping method statement — working draft
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn variant="secondary" label="Upload a file…" />
          </div>
          <Sub style={{ marginTop: 10, color: C.text2 }}>
            Word, Excel, PowerPoint or PDF. An uploaded file is read for this check and <b style={{ color: C.text }}>kept nowhere afterwards</b> — the record keeps its name, size and content hash, never its text — so running the check again means attaching it again.
          </Sub>
        </Card>

        <div style={{ marginTop: 12 }} data-w4="qa-see-plan-row">
          <span data-w4="qa-see-plan" style={{ display: 'inline-block' }}>
            <Btn
              variant={running ? 'disabled' : 'primary'}
              label={Q.seePlan}
              hover={f >= p.seePlanHoverFrom && f < p.seePlanPressAt + 6}
              pressAt={p.seePlanPressAt}
              style={{ padding: '6px 16px' }}
            />
          </span>
        </div>

        {planShown && !running ? (
          <Card a="qa-plan" opacity={done ? 1 : planO}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: '20px', marginBottom: 4 }}>The plan</div>
            <Sub style={{ color: C.text2 }}>{Q.planIntro}</Sub>
            <div style={{ fontSize: 13, color: C.text, marginTop: 10 }}>{Q.planOnePass}</div>
            <Steps />
            <div style={{ fontSize: 13, lineHeight: '17px', color: C.text, marginTop: 14, maxWidth: 790 }}>
              <b>Covers:</b> {Q.covers}
            </div>
            <div style={{ marginTop: 14 }}>
              <span data-w4="qa-run" style={{ display: 'inline-block' }}>
                <Btn variant="primary" label={Q.run} hover={f >= p.runHoverFrom && f < p.runPressAt + 6} pressAt={p.runPressAt} style={{ padding: '6px 16px' }} />
              </span>
            </div>
          </Card>
        ) : null}

        {running ? (
          <Card a="qa-running">
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: '20px', marginBottom: 4 }}>{Q.running}</div>
            <Sub style={{ color: C.text2 }}>{f >= p.step1DoneAt ? Q.runningSteps[1] : Q.runningSteps[0]}</Sub>
            <Steps running={f >= p.step1DoneAt ? 1 : 0} done={f >= p.step1DoneAt ? 1 : 0} />
          </Card>
        ) : null}

        {f >= p.resultAt ? (
          <Card a="qa-result" opacity={ui(f, p.resultAt)}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: '20px' }}>{Q.checkedCard}</div>
            <div style={{ fontSize: 13.5, lineHeight: '19px', color: C.text, marginTop: 2 }}>
              <b>Covered:</b> {Q.covered}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: '19px', color: C.text, marginTop: 6 }}>{Q.result}</div>
            <div style={{ marginTop: 6 }}>
              <span
                data-w4="qa-open-draft"
                style={{
                  fontSize: 13.5,
                  lineHeight: '19px',
                  color: C.text,
                  textDecoration: f >= p.openHoverFrom ? 'underline' : 'none',
                  textUnderlineOffset: 3,
                }}
              >
                {Q.openDraft}
              </span>
            </div>
          </Card>
        ) : null}
      </Page>
    </Shell>
  );
};
