/**
 * Dev-only: the shared components laid out for render checks. Eight pages of
 * 100 frames each; still at local frame 80 (global = page × 100 + 80) to see
 * the settled state.
 *   0 film furniture + primitives   1 app shell (editor)   2 drafting + review
 *   3 builder stage                 4 dashboards           5 slide deck
 *   6 prompt hero, canvas marks, tiles and charts
 *   7 PhraseLift in flight (still at 770: p1 mid-flight; 790: landed)
 */
import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import {
  AppShell,
  Badge,
  BarChart,
  BuilderHeader,
  Button,
  C,
  CardText,
  ChatPanel,
  Chip,
  CommentCard,
  Cursor,
  Dashboard,
  deckSlides,
  DocCanvas,
  EditorPanes,
  EditorSecondBar,
  Field,
  FindingCard,
  FindingGroup,
  Float,
  FONT,
  Greek,
  GreekStrip,
  GreekText,
  Highlight,
  KpiTile,
  LineChart,
  Mark,
  PhraseLift,
  PieChart,
  ProgressBar4,
  PromptHero,
  ReadBack,
  RowForm,
  RunTrace,
  SavedStrip,
  SeatLabel,
  SideChat,
  Slide,
  SlideDeck,
  SourceChip,
  SourcePanel,
  StepRail,
  SuggestionCard,
  TrackedChange,
  TypedText,
  WithheldNotice,
  Wordmark,
} from '../shared';
import {
  ACCEPT_RECEIPT,
  BUILDER,
  COMMENTS,
  DASHBOARD,
  DOC_REF,
  DOC_TITLE,
  DRAFT_SEGMENTS,
  DRAFT_TRACE,
  GIR_LOCATOR,
  GIR_PASSAGE,
  GIR_SUPERSEDED_LINE,
  KPI_APP,
  LIB,
  PEOPLE,
  PROJECT,
  QA,
  REVIEW_STEPS,
  STEPS,
  SUGGESTION_TITLE,
  WALL_NOTICE,
  WITHHELD_LINE,
} from '../data/wrenfield';

export const SHEET_PAGES = 8;

const Label: React.FC<{ x: number; y: number; children: React.ReactNode }> = ({ x, y, children }) => (
  <div style={{ position: 'absolute', left: x, top: y, fontFamily: FONT.mono, fontSize: 14, color: C.muted }}>{children}</div>
);

const Page0: React.FC = () => (
  <Field>
    <Label x={60} y={40}>
      CardText 96 · Wordmark 72 / 18 · SeatLabel
    </Label>
    <div style={{ position: 'absolute', left: 60, top: 80 }}>
      <CardText text="Drafts that show their *sources*." revealed />
    </div>
    <div style={{ position: 'absolute', left: 60, top: 230, background: C.ink, padding: '24px 32px', borderRadius: 12 }}>
      <Wordmark size={72} tone="onInk" />
    </div>
    <div style={{ position: 'absolute', left: 560, top: 262 }}>
      <Wordmark size={18} tone="onField" />
    </div>
    <SeatLabel seat="client" text="Trentmoor Energy · Rachel Bowen, lead reviewer" at={0} x={1300} y={250} />
    <SeatLabel seat="consultant" text="Calder & Hale · Eleanor Price, lead author" at={0} x={1300} y={310} />
    <SeatLabel seat="supplier" text="Netherfold Cabling · Sam Kerridge" at={0} x={1300} y={370} />

    <Label x={60} y={420}>
      Primitives at 2.4×
    </Label>
    <Float x={500} y={640} scale={2.4} shadow="none">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT.sans, fontSize: 12.5 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge tone="success" label="Accepted" pill />
          <Badge tone="warning" label="Required" pill />
          <Badge tone="info" label="In review" pill />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge tone="danger" label="Behind" pill />
          <Badge tone="neutral" label="Advisory" pill />
          <Badge tone="success" label="Member" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" label="Accept" />
          <Button variant="secondary" label="Edit" />
          <Chip label="From the library" active />
        </div>
        <div>
          Claim text <SourceChip docRef={LIB.GIR.ref} /> <SourceChip docRef={LIB.BAS.ref} activeAt={0} />
        </div>
      </div>
    </Float>
    <Float x={1400} y={640} scale={2.4} shadow="none">
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT.sans, fontSize: 13 }}>
        <WithheldNotice text={WITHHELD_LINE} />
        <div>
          <Highlight at={0}>Highlighted phrase</Highlight> then <GreekText text="greek in place words" greek />
        </div>
        <Greek lines={2} lineHeight={18} />
        <div>
          <TypedText text="Typed text with caret" from={0} to={40} caretUntil={200} />
        </div>
        <div style={{ fontFamily: FONT.serif, fontSize: 15.5 }}>
          for <TrackedChange del="the routewide works" ins="the scheme" at={0} />.
        </div>
      </div>
    </Float>
    <Cursor path={[{ f: 0, x: 1000, y: 900 }]} clicks={[76]} showFrom={0} hideAfter={300} />
  </Field>
);

const Page1: React.FC = () => (
  <Field>
    <Float x={960} y={540} scale={1.15} shadow="pane" radius={10}>
      <AppShell
        seat={PEOPLE.ELEANOR}
        nav="Editor"
        topbar={{ project: PROJECT, owner: 'Trentmoor Energy', role: 'Member' }}
        secondBar={<EditorSecondBar docRef={DOC_REF} title={DOC_TITLE} />}
        greekChrome
        keep={[PROJECT, DOC_TITLE, 'Ask for a draft into this document', 'From the library']}
      >
        <EditorPanes
          canvas={
            <div>
              <Greek lines={2} lineHeight={27} seed={2} />
              <div style={{ height: 14 }} />
              <GreekText text="2. Baseline sources" greek />
              <div style={{ marginTop: 6, fontFamily: FONT.serif }}>
                {DRAFT_SEGMENTS.map((s, i) => (
                  <span key={i}>
                    <GreekText text={s.text} greek /> <SourceChip docRef={s.source} />{' '}
                  </span>
                ))}
              </div>
              <div style={{ height: 14 }} />
              <Greek lines={5} lineHeight={27} seed={9} />
            </div>
          }
          side={<SideChat>{<div style={{ marginTop: 12, fontSize: 12.5, color: C.text2 }}>{ACCEPT_RECEIPT}</div>}</SideChat>}
        />
      </AppShell>
    </Float>
  </Field>
);

const Page2: React.FC = () => (
  <Field>
    <Float x={420} y={260} scale={1.2}>
      <SuggestionCard
        title={SUGGESTION_TITLE}
        segments={DRAFT_SEGMENTS.map((s, i) => ({ ...s, greek: i !== 2, highlightAt: i === 2 ? 0 : undefined }))}
        revealFrom={0}
        withheld={{ text: WITHHELD_LINE, at: 30 }}
        actionsAt={34}
      />
    </Float>
    <Float x={420} y={640} scale={1.2}>
      <RunTrace
        title="Agent · Working"
        doneTitle={{ text: 'Agent · Done', at: 70 }}
        steps={DRAFT_TRACE.map((s, i) => ({ ...s, doneAt: [10, 30, 100][i] }))}
        startAt={0}
      />
    </Float>
    <Float x={420} y={900} scale={1.2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: C.pane, padding: 14, borderRadius: 8 }}>
        <ProgressBar4 labels={REVIEW_STEPS} current={2} compact />
        <ProgressBar4 labels={REVIEW_STEPS} current={2} advanceAt={60} compact />
      </div>
    </Float>
    <Float x={1010} y={420} scale={1.2}>
      <SourcePanel
        docRef={LIB.GIR.ref}
        title={LIB.GIR.title}
        badges={[
          { tone: 'success', label: 'v2 · Current' },
          { tone: 'neutral', label: 'Used for AI answers' },
        ]}
        page={GIR_LOCATOR}
        passage={GIR_PASSAGE}
        hlAt={0}
        footer={{ text: GIR_SUPERSEDED_LINE }}
      />
    </Float>
    <Float x={1590} y={300} scale={1.2}>
      <FindingCard severity="required" defect={QA.accuracyDefect} source={{ docRef: LIB.GIR.ref }} suggested={{ text: QA.accuracySuggested }} />
    </Float>
    <Float x={1590} y={760} scale={1.2} shadow="soft">
      <FindingGroup label="House style" count={4} primary={{ label: QA.fixButton, pressAt: 40, flipTo: { label: QA.fixedButton, at: 46 } }} note="The same substitution, applied consistently — one decision, 1 place.">
        <FindingCard severity="advisory" defect={QA.styleDefect} rule={{ clause: QA.styleClause, from: '(project style guide)', quote: 'Refer to the works as “the scheme”, in lower case, throughout.' }} fix={{ text: QA.styleFixLine }} width="100%" />
      </FindingGroup>
    </Float>
    <Float x={1010} y={890} scale={1.2}>
      <div style={{ display: 'flex', gap: 10 }}>
        <CommentCard {...COMMENTS.B} answeredAt={20} width={300} />
      </div>
    </Float>
    <Float x={1010} y={790} scale={1}>
      <div style={{ display: 'flex', gap: 10 }}>
        <WithheldNotice text={WALL_NOTICE} style={{ width: 420 }} />
      </div>
    </Float>
  </Field>
);

const Page3: React.FC = () => (
  <Field>
    <div style={{ position: 'absolute', left: 120, top: 48 }}>
      <BuilderHeader
        crumb={['Tools', 'App builder']}
        app={KPI_APP.name}
        badge={{ tone: 'neutral', label: BUILDER.draftBadge, flipTo: { tone: 'success', label: KPI_APP.publish, at: 90 } }}
        role={{ tone: 'info', label: 'Owner' }}
      />
    </div>
    <div style={{ position: 'absolute', left: 120, top: 136 }}>
      <ChatPanel
        title={BUILDER.panelTitle}
        width={1120}
        height={864}
        scale={2.4}
        progress={{ done: [2, 4, 6], of: 7 }}
        turns={[
          { kind: 'user', name: 'Rachel Bowen', text: KPI_APP.prompt, at: 0, greekFrom: 1 },
          { kind: 'receipt', label: KPI_APP.r1, at: 4 },
          { kind: 'question', text: KPI_APP.q2.text, replies: [...KPI_APP.q2.replies], chosen: 1, chosenAt: 60, at: 20 },
        ]}
        composer={{ placeholder: BUILDER.composer }}
      />
    </div>
    <div style={{ position: 'absolute', left: 1320, top: 136 }}>
      <StepRail
        steps={STEPS.map((t, i) => ({
          n: i + 1,
          title: t,
          summary: KPI_APP.summaries[i],
          doneAt: i < 3 ? 0 : undefined,
          waitingAt: i === 3 ? 20 : undefined,
          asks: i === 5,
        }))}
      />
    </div>
    <Cursor path={[{ f: 0, x: 900, y: 1010 }, { f: 40, x: 560, y: 840 }]} clicks={[60]} showFrom={0} hideAfter={300} />
  </Field>
);

const Page4: React.FC = () => (
  <Field>
    <Float x={520} y={430} scale={1.19}>
      <Dashboard seat="client" data={DASHBOARD.client} flagRuleAt={0} flagAt={0} />
    </Float>
    <Float x={1420} y={300} scale={1.0}>
      <Dashboard seat="supplier" data={DASHBOARD.supplier} crop="payoff" />
    </Float>
    <Float x={1420} y={800} scale={0.75}>
      <Dashboard seat="client" data={DASHBOARD.client} empty />
    </Float>
  </Field>
);

const Page5: React.FC = () => {
  const slides = deckSlides({ quoteHighlightAt: 0, forecastHighlightAt: 0 });
  return (
    <Field>
      <div style={{ position: 'absolute', left: 60, top: 60 }}>
        <SlideDeck slides={slides} at={0} stagger={4} />
      </div>
      <div style={{ position: 'absolute', left: 1360, top: 60, width: 500, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Float x={250} y={170} scale={1.6}>
          <RowForm
            title="Write this month’s commentary"
            sub="September 2026"
            fields={[
              { label: 'Package', value: 'Ashcombe Brook crossing', kind: 'choice' },
              { label: 'Progress this month', value: 'Launch pit complete. Drill rig mobilised.', greek: true },
              { label: 'Key risks', value: 'Perched water in the launch pit after heavy rain.', typeFrom: 0, typeTo: 24, highlightAt: 30 },
              { label: 'Decisions needed', value: 'Confirm night working for the pull-back.', greek: true },
              { label: 'Status', kind: 'badge', badge: { tone: 'danger', label: 'Behind' } },
            ]}
            submitLabel="Save"
            savedAt={60}
          />
        </Float>
      </div>
      <div style={{ position: 'absolute', left: 60, top: 590, transform: 'scale(0.52)', transformOrigin: '0 0', boxShadow: '0 10px 26px rgba(20,20,20,.12)' }}>
        <Slide spec={slides[3]} />
      </div>
      <Float x={1500} y={900} scale={1.6}>
        <ReadBack lines={KPI_APP.readBack} primary={KPI_APP.publish} />
      </Float>
      <SavedStrip at={0} x={1180} y={1024} />
    </Field>
  );
};


const PAGES = [Page0, Page1, Page2, Page3, Page4, Page5, () => <Page6 />, () => <Page7 />];

export const ComponentSheet: React.FC = () => (
  <AbsoluteFill style={{ background: C.field }}>
    <Series>
      {PAGES.map((P, i) => (
        <Series.Sequence key={i} durationInFrames={100}>
          <P />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

const Page6: React.FC = () => (
  <Field>
    <PromptHero
      placeholder={BUILDER.placeholder}
      text={KPI_APP.prompt}
      typeFrom={0}
      typeTo={30}
      author={{ name: PEOPLE.RACHEL.name, org: PEOPLE.RACHEL.org }}
      highlights={KPI_APP.phrases.map((p, i) => ({ phrase: p.phrase, at: 40 + i * 3, id: p.id }))}
      y={300}
    />
    <Float x={700} y={760} scale={2.4}>
      <DocCanvas
        blocks={[
          { kind: 'h', text: <GreekText text="1. Purpose and scope" greek /> },
          { kind: 'p', text: <span>This method statement covers <Mark kind="advisory" at={0}>the routewide works</Mark>.</span> },
          { kind: 'h', text: <GreekText text="2. Baseline sources" greek /> },
          { kind: 'strip', text: <GreekStrip docRef={LIB.GIR.ref} /> },
          { kind: 'p', text: <span>including <Mark kind="required" at={0}>{QA.requiredSpan}</Mark>.</span> },
        ]}
        width={420}
      />
    </Float>
    <div style={{ position: 'absolute', left: 1300, top: 560, display: 'flex', flexDirection: 'column', gap: 12, transform: 'scale(1.4)', transformOrigin: '0 0' }}>
      <KpiTile label="On time · Sep 2026" value="93 of 102" countFrom={0} />
      <BarChart title="On time by supplier" data={[{ label: 'A', value: 90 }]} max={100} />
      <LineChart title="Carbon" points={[{ label: 'Jun', value: 171 }, { label: 'Sep', value: 142 }]} />
      <PieChart title="Spend" data={[{ label: 'a', value: 1 }, { label: 'b', value: 2 }]} />
    </div>
  </Field>
);

const Page7: React.FC = () => (
  <Field>
    <PromptHero
      text={KPI_APP.prompt}
      typeFrom={-2}
      typeTo={-1}
      highlights={KPI_APP.phrases.map((p, i) => ({ phrase: p.phrase, at: 20 + i * 3, id: p.id }))}
      x={640}
      y={300}
      width={1040}
    />
    <div style={{ position: 'absolute', left: 1320, top: 136 }}>
      <StepRail steps={STEPS.map((t, i) => ({ n: i + 1, title: t }))} />
    </div>
    {KPI_APP.phrases.map((p, i) => (
      <PhraseLift key={p.id} id={p.id} target={`step-${p.step}`} from={60 + i * 3} />
    ))}
  </Field>
);
