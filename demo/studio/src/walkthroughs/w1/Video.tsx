/**
 * W1 Document management — WA-EIA-MST-001 from first draft to C01.
 * The shot table is demo/plans/w1-document-management/plan.md §5;
 * every frame below is video-local and quoted from it.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { between, C } from '../../shared';
import { WT_DATES, WT_DOC, WT_REVIEW } from '../../data/wrenfield';
import {
  checkCaptions,
  detail,
  HumanTyped,
  key,
  navPoint,
  PlanPage,
  Shell,
  SplitWindows,
  WalkthroughFrame,
  WIDE,
  work,
  WtCursor,
  type CaptionCue,
  type WtCameraKey,
} from '../shared';
import { META } from './meta';
import { Scenes, type Scene } from './scenes';
import { SandboxPage, PROMOTED_BANNER } from './sandbox';
import { EditorScreenBody, EditorSecondBar } from './editor';
import { BindModal, IssueModal, PromotionWindow } from './modals';
import { CODE_OPTS, CommentCard, Composer, OpenSelect, RespondForm, SubPill, VERDICT_OPTS, type HeaderAction, type StepState } from './cycle';
import { ListRegion, ReviewerPanel, RoundPage } from './round';
import { DeliverableStatus } from './status';
import { ReviewRecordPage } from './record';
import { SplitSeat } from './split';
import type { Anchor } from './pdf';
import { SHOTS as T, PT } from './timeline';

// ------------------------------------------------------------------ captions (§6)

const cap = (from: number, to: number, chapter: number, line: string, seat?: CaptionCue['seat']): CaptionCue => ({ from, to, chapter, line, seat });
const captions: CaptionCue[] = [
  cap(207, 654, 1, 'Eleanor binds her draft to its planned slot', 'ELEANOR'),
  cap(657, 737, 2, 'She freezes it for an in-house check', 'ELEANOR'),
  cap(740, 924, 2, 'Owen checks it - his comment is answered', 'OWEN'),
  cap(927, 1015, 3, 'Eleanor sends P01 to the client for review', 'ELEANOR'),
  cap(1018, 1254, 3, 'Only the version Owen accepted can go', 'ELEANOR'),
  cap(1257, 1449, 4, 'Rachel accepts her appointment as lead reviewer', 'RACHEL'),
  cap(1452, 1850, 4, 'A week on, Rachel comments on the page', 'RACHEL'),
  cap(1853, 2050, 4, 'Calder & Hale sees only that review is open'),
  cap(2053, 2244, 4, 'Rachel returns it at S0 - back for revision', 'RACHEL'),
  cap(2247, 2506, 5, 'Days later, Eleanor answers every comment', 'ELEANOR'),
  cap(2509, 2597, 5, 'Her answer points at the changed passage', 'ELEANOR'),
  cap(2600, 2843, 5, 'Or says no change, and why', 'ELEANOR'),
  cap(2846, 2964, 5, 'Checked in-house again, P02 goes back', 'ELEANOR'),
  cap(2967, 3156, 6, 'Later, the record pairs each comment and answer', 'RACHEL'),
  cap(3159, 3333, 6, 'Rachel reads every answer before accepting', 'RACHEL'),
  cap(3336, 3490, 6, 'A1 - authorised and accepted', 'RACHEL'),
  cap(3493, 3594, 6, 'C01 issued - the contractual revision', 'RACHEL'),
];
const problems = checkCaptions(captions);
if (problems.length) console.warn(`W${META.video} captions:\n` + problems.join('\n'));

// ------------------------------------------------------------------ camera (§5, §5.1)

const CAM_DRAFT_BIND = work(768, 333, 1.3);
const CAM_OWEN = work(900, 506, 1.3); // top edge on the status card's top (no half-line)
const CAM_STATUS = work(812, 400, 1.3); // plan: cx 800; 812 keeps `Open the review` (to x 1398) in frame
const CAM_ROUND1 = work(885, 560, 1.4); // plan: cx 900; 885 keeps the column's left edge (x 342) in frame
const CAM_RESPOND = work(888, 545, 1.4); // review: centred on the round header + panel, not (987, 555)
const CAM_RECORD = work(870, 435, 1.3); // review: foot row in frame

const camera: WtCameraKey[] = [
  key(0, WIDE),
  key(389, CAM_DRAFT_BIND),
  key(516, WIDE),
  key(752, CAM_OWEN),
  key(927, WIDE, 0), // inside the S7 → S8 crossfade (outgoing drawn at Work)
  key(974, work(768, 400, 1.3)),
  key(1078, work(768, 467, 1.3)),
  key(1175, WIDE),
  key(1269, CAM_STATUS),
  key(1452, WIDE, 0), // D9: Work out → Wide in
  key(1464, CAM_ROUND1),
  key(1960, WIDE, 0), // while the split hides the main window
  key(2259, CAM_RESPOND),
  key(2573, WIDE, 0), // D9
  key(2979, CAM_RECORD),
  key(3069, detail(1040, 392, 1.8)), // review: window's right edge on the frame edge, CODE · RESPONSE header in frame
  key(3159, CAM_RECORD),
  key(3249, WIDE),
];

// ------------------------------------------------------------------ shared screen bits

const RACHEL_ACTIONS = (closeExitAt?: number): HeaderAction[] => [
  { label: 'Back to status' },
  { label: 'Review record' },
  { label: 'Close as rejected', kind: 'danger', sep: true, exitAt: closeExitAt },
];
const steps = (s: string): StepState[] => s.split('').map((c) => (c === 'd' ? 'done' : c === 'c' ? 'current' : 'todo'));
const anchorsSaved = (n: number, from = 0): Anchor[] => WT_REVIEW.comments.slice(0, n).map((c) => ({ span: c.anchor, states: [[from, 'saved']] }));
const answered = (n: number) => WT_REVIEW.answeredLine(n);
const V = WT_REVIEW.verdicts;

// ------------------------------------------------------------------ S1 plan

const S1: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Shell seat="ELEANOR" nav={f >= T.navClick ? 'Sandbox' : 'Plan'} hoverNav={f >= T.navArrive - 4 && f < T.navClick ? 'Sandbox' : undefined}>
      <PlanPage hoverRow={f >= T.rowHover && f < T.rowHoverEnd ? 1 : undefined} />
    </Shell>
  );
};

// ------------------------------------------------------------------ S2–S4 sandbox (bind)

const SandboxBind: React.FC = () => {
  const f = useCurrentFrame();
  const firstMenu = f < T.kebab2Click;
  return (
    <Shell
      seat="ELEANOR"
      nav="Sandbox"
      overlay={<BindModal at={T.bindModal} exitAt={T.bindDone} hoverPrimary={f >= T.bindBtnArrive && f < T.bindDone} pressAt={T.bindClick} />}
    >
      <SandboxPage
        bound={false}
        boundAt={T.bindDone}
        banner={{ text: `Bound to ${WT_DOC.ref}.`, at: T.bindDone }}
        kebabHover={(f >= T.kebab1Arrive && f < T.kebab1Click + 6) || (f >= T.kebab2Arrive && f < T.kebab2Click + 6)}
        menu={
          firstMenu
            ? { at: T.menu1, exitAt: T.bindDone, hover: 'Bind…', hoverAt: T.bindItemArrive }
            : { at: T.menu2, hover: 'Open in Editor', hoverAt: T.openItemArrive }
        }
      />
    </Shell>
  );
};

// ------------------------------------------------------------------ S5–S6 editor

const Editor: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Shell seat="ELEANOR" nav={null} contentTone="sunken" secondBar={<EditorSecondBar frozenAt={T.frozen} freezeHover={f >= T.freezeArrive - 2 && f < T.frozen} />}>
      <EditorScreenBody frozenAt={T.frozen} />
    </Shell>
  );
};

// ------------------------------------------------------------------ S7 Owen's internal QA round

const OwenRound: React.FC = () => {
  const f = useCurrentFrame();
  const oc = WT_REVIEW.owenComment;
  const hovered = f >= T.owenHover;
  return (
    <Shell seat="OWEN" nav={null}>
      <RoundPage
        title="Internal QA"
        sub={
          <>
            {WT_DOC.title} · org-private internal review — the record never crosses the wall · <SubPill tone="neutral" label="Live" /> · pen with <b style={{ fontWeight: 600, color: C.text }}>the review group</b>
          </>
        }
        actions={[{ label: 'Back to status' }, { label: 'Review record' }]}
        status={{ label: 'P01 · Round 1', steps: [[0, steps('dctt')]], target: `Review period target ${WT_DATES.round1Days14}`, pill: { tone: 'info', label: 'Cycle active' } }}
        roundLabel="Round 1 · P01"
        roundBar={
          <>
            <SubPill tone="neutral" label="Open" />
            <span>{WT_REVIEW.internalAnsweredLine}</span>
          </>
        }
        hint
        pdf={{ version: 'v01', anchors: [{ span: oc.anchor, states: [[0, 'saved'], [T.owenHover, 'active']] }] }}
        panel={
          <ReviewerPanel
            listMax={400}
            cards={[
              <CommentCard
                key="o"
                author={oc.author}
                code={oc.code}
                when={oc.when}
                quote={oc.quote}
                body={oc.body}
                edit
                hovered={hovered}
                response={{ text: oc.response.text, passage: oc.response.passage }}
              />,
            ]}
            composer={<Composer />}
          />
        }
      />
    </Shell>
  );
};

// ------------------------------------------------------------------ S8–S10 sandbox (promote P01)

const SandboxPromote: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Shell
      seat="ELEANOR"
      nav="Sandbox"
      overlay={
        <PromotionWindow
          version="P01"
          at={T.promoteModal}
          exitAt={T.promoted}
          scrollY={between(f, [T.wheelFrom, T.wheelTo], [0, 330])}
          promoteHover={f >= T.promoteBtnArrive && f < T.promoted}
          pressAt={T.promoteBtnClick}
        />
      }
    >
      <SandboxPage
        bound
        banner={{ text: PROMOTED_BANNER, at: T.promoted }}
        promoteHover={f >= T.rowPromoteArrive && f < T.promoteModal}
        promotePressAt={T.rowPromoteClick}
      />
    </Shell>
  );
};

// ------------------------------------------------------------------ S11 status (appointment, acknowledgement)

const StatusReview: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Shell seat="RACHEL" nav={null}>
      <DeliverableStatus
        variant="review"
        acceptAt={T.accepted}
        ackAt={T.acked}
        acceptHover={f >= T.acceptArrive && f < T.accepted}
        acceptPressAt={T.acceptClick}
        ackHover={f >= T.ackArrive && f < T.acked}
        ackPressAt={T.ackClick}
      />
    </Shell>
  );
};

// ------------------------------------------------------------------ S12 → S15 round 1, client seat

const R1_SCROLL = 60;

const RachelRound1: React.FC = () => {
  const f = useCurrentFrame();
  const after = f >= T.splitOut; // 04:40 PM: three comments, scrolled 60
  const issued = f >= T.issued;
  const c = WT_REVIEW.comments;
  const whens = [WT_DATES.comment1, WT_DATES.comment2, WT_DATES.comment3];
  const nCards = after ? 3 : f >= T.commentPosted ? 1 : 0;
  const cards = c.slice(0, nCards).map((x, i) => (
    <CommentCard key={i} author={x.author} code={x.code} when={whens[i]} quote={x.quote} body={x.body} edit at={i === 0 && !after ? T.commentPosted : undefined} />
  ));
  const focusedText = !after && f >= T.textFocus && f < T.commentPosted;
  const composer = (
    <Composer
      empty={nCards === 0}
      anchored={!after && f < T.commentPosted ? { quote: c[0].quote, at: T.anchored } : undefined}
      text={focusedText ? <HumanTyped text={c[0].body} from={T.typeFrom} seed={44} caretFrom={T.textFocus} caretUntil={T.codeClick} /> : undefined}
      textFocus={!after && f >= T.textFocus && f < T.codeClick}
      code={!after && f >= T.codeChosen && f < T.commentPosted ? CODE_OPTS[0] : undefined}
      codeFocus={!after && f >= T.codeClick && f < T.commentArrive}
      commentArmed={!after && f >= T.typeFrom && f < T.commentPosted}
      commentHover={f >= T.commentArrive && f < T.commentPosted}
      commentPressAt={T.commentClick}
      verdict={after && f >= T.verdictChosen ? V.S0 : undefined}
      verdictFocus={after && f >= T.verdictClick && f < T.closeArrive}
      closeArmed={after && f >= T.verdictChosen}
      closeHover={f >= T.closeArrive && f < T.issueModal}
      closePressAt={T.closeClick}
    />
  );
  const anchors: Anchor[] = after
    ? anchorsSaved(3)
    : [{ span: c[0].anchor, states: [[T.anchored, 'pending'], [T.commentPosted, 'saved']] }];
  return (
    <Shell seat="RACHEL" nav={null} overlay={<IssueModal kind="S0" at={T.issueModal} exitAt={T.issued} hover={f >= T.issueArrive && f < T.issued} pressAt={T.issueClick} />}>
      <RoundPage
        title={WT_DOC.ref}
        scrollY={after ? R1_SCROLL : 0}
        sub={
          <>
            {WT_DOC.title} · produced by Calder &amp; Hale · <SubPill tone="info" label="In review" flip={{ tone: 'warning', label: 'Responding', at: T.issued }} /> · pen with{' '}
            <b style={{ fontWeight: 600, color: C.text }}>{issued ? 'the authoring team' : 'the review group'}</b>
            {issued ? (
              <>
                {' '}
                · verdict <SubPill tone="info" label={V.S0} />
              </>
            ) : null}
          </>
        }
        actions={RACHEL_ACTIONS()}
        status={{
          label: 'P01 · Round 1',
          steps: [
            [0, steps('dctt')],
            [T.issued, steps('ddct')],
          ],
          target: `Review period target ${WT_DATES.commentsMeta}`,
          pill: { tone: 'info', label: 'Cycle active' },
        }}
        roundLabel="Round 1 · P01"
        roundBar={
          <>
            <SubPill tone="neutral" label="Open" flip={{ tone: 'neutral', label: 'Issued', at: T.issued }} />
            {issued ? <SubPill tone="warning" label={V.S0} /> : null}
            {nCards ? <span>{after ? answered(0) : '0 of 1 comment answered'}</span> : null}
          </>
        }
        hint
        pdf={{ version: 'p01', anchors, select: after ? undefined : { span: c[0].anchor, from: T.dragFrom, to: T.dragTo } }}
        panel={<ReviewerPanel cards={cards} composer={composer} composerExitAt={T.issued} />}
      >
        {/* Open selects, page coordinates (y is pre-scroll). */}
        <OpenSelect x={PT.codeMenu.x - 216} y={PT.codeMenu.y - 68} at={T.codeMenu} exitAt={T.codeChosen} options={CODE_OPTS} placeholder="no code" hover={f >= T.s0Arrive ? CODE_OPTS[0] : undefined} />
        <OpenSelect
          x={PT.verdictMenu1.x - 216}
          y={PT.verdictMenu1.y - 68}
          direction="up"
          at={T.verdictMenu}
          exitAt={T.verdictChosen}
          options={VERDICT_OPTS}
          placeholder="choose a code…"
          hover={f >= T.verdictS0Arrive ? VERDICT_OPTS[0] : undefined}
        />
      </RoundPage>
    </Shell>
  );
};

// ------------------------------------------------------------------ S16 respond, consultant seat

const ELEANOR_ACTIONS = (hover?: boolean, pressAt?: number): HeaderAction[] => [
  { label: 'Back to status' },
  { label: 'Review record' },
  { label: 'Open the draft in the Editor' },
  { label: 'Promote the next version', kind: 'primary', hover, pressAt },
  { label: 'Close as rejected', kind: 'danger', sep: true },
];

const ACTIVITY: Array<[string, string]> = [
  ['Review cycle launched', WT_DATES.p01Promoted],
  ['Round 1 submitted for review by Eleanor Price', WT_DATES.p01Promoted],
  ['Round 1 issued by Rachel Bowen — verdict S0', WT_DATES.round1Issued],
];

/** Which part of the respond flow. */
type RespondStage = 'c1' | 'c3' | 'sep17';

const EleanorRespond: React.FC<{ stage: RespondStage }> = ({ stage }) => {
  const f = useCurrentFrame();
  const c = WT_REVIEW.comments;
  const r = WT_REVIEW.responses;
  const whens = [WT_DATES.comment1, WT_DATES.comment2, WT_DATES.comment3];
  // Comment 1
  const c1Open = stage === 'c1' && f >= T.formOpen;
  const c1Done = stage !== 'c1' || f >= T.r1Recorded;
  const c2Done = stage !== 'c1';
  const c3Done = stage === 'sep17' || (stage === 'c3' && f >= T.r3Recorded);
  const nAnswered = [c1Done, c2Done, c3Done].filter(Boolean).length;
  const hover1 = stage === 'c1' && f >= T.respondArrive - 4;
  const hover3 = stage === 'c3';
  const r1Text = <HumanTyped text={r[0].text} from={T.r1TypeFrom} seed={44} caretFrom={T.r1Focus} caretUntil={T.passageFocus} />;
  const passageFocus = f >= T.passageFocus && f < T.r1Recorded;
  const form1 = c1Open && !c1Done ? (
    <RespondForm
      text={f >= T.r1Focus ? r1Text : <span style={{ color: C.muted }}>The response — how the comment is addressed…</span>}
      textFocus={f >= T.r1Focus && f < T.passageFocus}
      passage={f >= T.paste ? <>{r[0].passage}{passageFocus ? <span style={{ display: 'inline-block', width: 1.5, height: 15, background: C.ink, verticalAlign: '-3px', marginLeft: 1 }} /> : null}</> : undefined}
      passageFocus={passageFocus}
      passagePlaceholder="The revised passage that answers it — the link into the next version…"
      recordHover={f >= T.r1RecordArrive && f < T.r1Recorded}
      recordPressAt={T.r1RecordClick}
    />
  ) : null;
  const ticked = f >= T.ticked;
  const form3 =
    stage === 'c3' && !c3Done ? (
      <RespondForm
        text={r[2].text}
        textH={80}
        noChangeAt={T.ticked}
        checkHover={f >= T.checkArrive && f < T.ticked}
        passage={ticked && f >= T.reasonFocus ? <HumanTyped text={r[2].noChange} from={T.reasonFrom} seed={63} caretFrom={T.reasonFocus} caretUntil={T.r3RecordClick} /> : undefined}
        passageFocus={f >= T.reasonFocus && f < T.r3RecordClick}
        passagePlaceholder={ticked ? 'Why no change was made…' : 'The revised passage that answers it — the link into the next version…'}
        recordHover={f >= T.r3RecordArrive && f < T.r3Recorded}
        recordPressAt={T.r3RecordClick}
      />
    ) : null;
  const cards = [
    <CommentCard
      key={1}
      author={c[0].author}
      code={c[0].code}
      when={whens[0]}
      quote={c[0].quote}
      body={c[0].body}
      hovered={hover1}
      respond={{ hover: f >= T.respondArrive && f < T.formOpen, pressAt: T.respondClick }}
      form={form1}
      response={c1Done ? { text: r[0].text, passage: r[0].passage } : undefined}
      responseAt={stage === 'c1' ? T.r1Recorded : undefined}
    />,
    <CommentCard key={2} author={c[1].author} code={c[1].code} when={whens[1]} quote={c[1].quote} body={c[1].body} respond={{}} response={c2Done ? { text: r[1].text, passage: r[1].passage } : undefined} />,
    <CommentCard
      key={3}
      author={c[2].author}
      code={c[2].code}
      when={whens[2]}
      quote={c[2].quote}
      body={c[2].body}
      hovered={hover3}
      respond={{}}
      form={form3}
      response={c3Done ? { text: r[2].text, noChange: r[2].noChange } : undefined}
      responseAt={stage === 'c3' ? T.r3Recorded : undefined}
    />,
  ];
  const active = hover1 ? 0 : hover3 ? 2 : -1;
  const anchors: Anchor[] = c.map((x, i) => ({ span: x.anchor, states: [[0, i === active ? 'active' : 'saved']] }));
  const sep17 = stage === 'sep17';
  return (
    <Shell
      seat="ELEANOR"
      nav={null}
      overlay={sep17 ? <PromotionWindow version="P02" at={T.p02Modal} promoteHover={f >= T.p02PromoteArrive} pressAt={T.p02PromoteClick} /> : undefined}
    >
      <RoundPage
        title={WT_DOC.ref}
        scrollY={stage === 'c3' ? 282 : 0}
        sub={
          <>
            {WT_DOC.title} · produced by Calder &amp; Hale · <SubPill tone="warning" label="Responding" /> · pen with <b style={{ fontWeight: 600, color: C.text }}>the authoring team</b> · verdict{' '}
            <SubPill tone="info" label={V.S0} />
          </>
        }
        actions={ELEANOR_ACTIONS(sep17 && f >= T.nextArrive && f < T.p02Modal, T.nextClick)}
        status={{ label: 'P01 · Round 1', steps: [[0, steps('ddct')]], target: `Review period target ${WT_DATES.round1Target}`, pill: { tone: 'info', label: 'Cycle active' } }}
        roundLabel="Round 1 · P01"
        roundBar={
          <>
            <SubPill tone="neutral" label="Issued" />
            <SubPill tone="warning" label={V.S0} />
            <span>{answered(nAnswered)}</span>
          </>
        }
        pdf={{ version: 'p01', anchors }}
        panelFull
        panel={
          <ListRegion fill align={stage === 'c3' ? 'end' : 'start'}>
            {cards}
          </ListRegion>
        }
        activity={ACTIVITY}
      />
    </Shell>
  );
};

// ------------------------------------------------------------------ S18 record, S19–S21 round 2

const Record: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Shell seat="RACHEL" nav={null}>
      <ReviewRecordPage openHover={f >= T.openArrive} openPressAt={T.openClick} />
    </Shell>
  );
};

const RachelRound2: React.FC = () => {
  const f = useCurrentFrame();
  const accepted = f >= T.acceptedA1;
  return (
    <Shell seat="RACHEL" nav={null} overlay={<IssueModal kind="A1" at={T.a1Modal} exitAt={T.acceptedA1} hover={f >= T.acceptPubArrive && f < T.acceptedA1} pressAt={T.acceptPubClick} />}>
      <RoundPage
        title={WT_DOC.ref}
        sub={
          <>
            {WT_DOC.title} · produced by Calder &amp; Hale · <SubPill tone="info" label="In review" flip={{ tone: 'success', label: 'Accepted', at: T.acceptedA1 }} />{' '}
            {accepted ? (
              <span style={{ whiteSpace: 'nowrap' }}>
                · verdict <SubPill tone="success" label={V.A1} />
              </span>
            ) : (
              <>
                · pen with <b style={{ fontWeight: 600, color: C.text }}>the review group</b> · verdict <SubPill tone="info" label={V.S0} />
              </>
            )}
          </>
        }
        actions={[{ label: 'Back to status', hover: f >= T.backArrive }, { label: 'Review record' }, { label: 'Close as rejected', kind: 'danger', sep: true, exitAt: T.acceptedA1 }]}
        status={{
          label: 'P02 · Round 2',
          steps: [
            [0, steps('dctt')],
            [T.acceptedA1, steps('dddd')],
          ],
          target: accepted ? undefined : `Review period target ${WT_DATES.round2Meta}`,
          pill: accepted ? { tone: 'success', label: 'Accepted' } : { tone: 'info', label: 'Cycle active' },
        }}
        roundLabel="Round 2 · P02"
        roundBar={
          <>
            <SubPill tone="neutral" label="Open" flip={{ tone: 'neutral', label: 'Issued', at: T.acceptedA1 }} />
            {accepted ? <SubPill tone="success" label={V.A1} /> : null}
          </>
        }
        hint={!accepted}
        pdf={{ version: 'p02' }}
        panel={
          accepted ? (
            <div style={{ fontSize: 13, lineHeight: '16px', color: C.muted }}>No comments yet — the round is open to the review group.</div>
          ) : (
            <ReviewerPanel
              cards={[]}
              composer={
                <Composer
                  empty
                  verdict={f >= T.a1Chosen ? VERDICT_OPTS[6] : undefined}
                  verdictFocus={f >= T.a1VerdictClick && f < T.a1CloseArrive}
                  closeArmed={f >= T.a1Chosen}
                  closeHover={f >= T.a1CloseArrive && f < T.a1Modal}
                  closePressAt={T.a1CloseClick}
                />
              }
            />
          )
        }
      >
        <OpenSelect
          x={PT.verdictMenu2.x - 216}
          y={PT.verdictMenu2.y - 68}
          direction="up"
          at={T.a1Menu}
          exitAt={T.a1Chosen}
          options={VERDICT_OPTS}
          placeholder="choose a code…"
          hover={f >= T.a1Arrive ? VERDICT_OPTS[6] : undefined}
        />
      </RoundPage>
    </Shell>
  );
};

const StatusAccepted: React.FC = () => (
  <Shell seat="RACHEL" nav={null}>
    <DeliverableStatus variant="accepted" />
  </Shell>
);

// ------------------------------------------------------------------ the scene list

const SCENES: Scene[] = [
  { from: 195, to: 309, node: <S1 /> },
  { from: 309, to: 627, node: <SandboxBind /> },
  { from: 627, to: 740, node: <Editor />, fade: {} },
  { from: 740, to: 927, node: <OwenRound />, fade: { outCam: CAM_OWEN } },
  { from: 927, to: 1257, node: <SandboxPromote />, fade: {} },
  { from: 1257, to: 1452, node: <StatusReview />, fade: { outCam: CAM_STATUS } },
  { from: 1452, to: 2247, node: <RachelRound1 />, fade: {} },
  { from: 2247, to: 2573, node: <EleanorRespond stage="c1" />, fade: { outCam: CAM_RESPOND } },
  { from: 2573, to: 2846, node: <EleanorRespond stage="c3" />, fade: {} },
  { from: 2846, to: 2967, node: <EleanorRespond stage="sep17" />, fade: {} },
  { from: 2967, to: 3304, node: <Record /> },
  { from: 3304, to: 3504, node: <RachelRound2 /> },
  { from: 3504, to: 99999, node: <StatusAccepted /> },
];

// ------------------------------------------------------------------ cursors (§5)

const Cursors: React.FC = () => (
  <>
    {/* Eleanor, ch 1–2 */}
    <WtCursor
      showFrom={207}
      hideAfter={740}
      clicks={[T.navClick, T.kebab1Click, T.bindItemClick, T.bindClick, T.kebab2Click, T.openItemClick, T.freezeClick]}
      path={[
        { f: 207, at: { x: 760, y: 640 }, shape: 'arrow' },
        { f: T.rowHover, at: PT.planStatus, shape: 'arrow' },
        { f: T.navArrive, at: navPoint('Sandbox'), shape: 'hand' },
        { f: T.kebab1Arrive, at: PT.kebab1, shape: 'hand' },
        { f: T.bindItemArrive, at: PT.bindItem, shape: 'hand' },
        { f: T.bindBtnArrive, at: PT.bindBtn, shape: 'hand' },
        { f: T.kebab2Arrive, at: PT.kebab2, shape: 'hand' },
        { f: T.openItemArrive, at: PT.openItem, shape: 'hand' },
        { f: T.freezeArrive, at: PT.freeze, shape: 'hand' },
      ]}
    />
    {/* Owen */}
    <WtCursor showFrom={776} hideAfter={920} path={[{ f: 776, at: { x: 1000, y: 700 }, shape: 'arrow' }, { f: T.owenHover, at: PT.owenCard, shape: 'arrow' }]} />
    {/* Eleanor, promote P01 */}
    <WtCursor
      showFrom={932}
      hideAfter={1250}
      clicks={[T.rowPromoteClick, T.promoteBtnClick]}
      path={[
        { f: 932, at: { x: 1180, y: 600 }, shape: 'arrow' },
        { f: T.rowPromoteArrive, at: PT.rowPromote, shape: 'hand' },
        { f: T.wheelFrom, at: PT.modalBody, shape: 'arrow' },
        { f: T.promoteBtnArrive, at: PT.promoteBtn, shape: 'hand' },
      ]}
    />
    {/* Rachel, appointment */}
    <WtCursor
      showFrom={1333}
      hideAfter={1445}
      clicks={[T.acceptClick, T.ackClick]}
      path={[
        { f: 1333, at: { x: 760, y: 600 }, shape: 'arrow' },
        { f: T.acceptArrive, at: PT.accept, shape: 'hand' },
        { f: T.ackArrive, at: PT.ack, shape: 'hand' },
      ]}
    />
    {/* Rachel, round 1 comment */}
    <WtCursor
      showFrom={1478}
      hideAfter={1853}
      idle={[[1666, 1742]]}
      clicks={[T.textClick, T.codeClick, T.s0Click, T.commentClick]}
      drags={[{ from: T.dragFrom, to: T.dragTo }]}
      path={[
        { f: 1478, at: { x: 900, y: 500 }, shape: 'arrow' },
        { f: T.dragFrom - 8, at: PT.dragA, shape: 'ibeam' },
        { f: T.dragFrom, at: PT.dragA, shape: 'ibeam' },
        { f: T.dragTo, at: PT.dragB, shape: 'ibeam', linear: true },
        { f: T.textArrive, at: PT.textarea, shape: 'ibeam' },
        { f: T.codeArrive, at: PT.codeSelect, shape: 'hand' },
        { f: T.s0Arrive, at: PT.s0Item, shape: 'hand' },
        { f: T.commentArrive, at: PT.commentBtn, shape: 'hand' },
      ]}
    />
    {/* Rachel, issue round 1 */}
    <WtCursor
      showFrom={2061}
      hideAfter={2240}
      clicks={[T.verdictClick, T.verdictS0Click, T.closeClick, T.issueClick]}
      path={[
        { f: 2061, at: { x: 1100, y: 600 }, shape: 'arrow' },
        { f: T.verdictArrive, at: PT.verdict1, shape: 'hand' },
        { f: T.verdictS0Arrive, at: PT.verdictS0, shape: 'hand' },
        { f: T.closeArrive, at: PT.close1, shape: 'hand' },
        { f: T.issueArrive, at: PT.issueBtn, shape: 'hand' },
      ]}
    />
    {/* Eleanor, response 1 */}
    <WtCursor
      showFrom={2273}
      hideAfter={2567}
      idle={[[2430, 2495]]}
      clicks={[T.respondClick, T.r1TextClick, T.passageClick, T.r1RecordClick]}
      path={[
        { f: 2273, at: { x: 900, y: 600 }, shape: 'arrow' },
        { f: T.respondArrive, at: PT.respond1, shape: 'hand' },
        { f: T.r1TextArrive, at: PT.r1Text, shape: 'ibeam' },
        { f: T.passageArrive, at: PT.passage1, shape: 'ibeam' },
        { f: T.r1RecordArrive, at: PT.record1, shape: 'hand' },
      ]}
    />
    {/* Eleanor, response 3 (no change) */}
    <WtCursor
      showFrom={2578}
      hideAfter={2840}
      idle={[[2734, 2793]]}
      clicks={[T.checkClick, T.reasonClick, T.r3RecordClick]}
      path={[
        { f: 2578, at: PT.record3, shape: 'hand' },
        { f: T.checkArrive, at: PT.check3, shape: 'hand' },
        { f: T.reasonArrive, at: PT.reason3, shape: 'ibeam' },
        { f: T.r3RecordArrive, at: PT.record3, shape: 'hand' },
      ]}
    />
    {/* Eleanor, promote P02 */}
    <WtCursor
      showFrom={2851}
      hideAfter={2967}
      clicks={[T.nextClick, T.p02PromoteClick]}
      path={[
        { f: 2851, at: { x: 1060, y: 260 }, shape: 'arrow' },
        { f: T.nextArrive, at: PT.nextBtn, shape: 'hand' },
        { f: T.p02PromoteArrive, at: PT.promoteBtn, shape: 'hand' },
      ]}
    />
    {/* Rachel, accept */}
    <WtCursor
      showFrom={3263}
      hideAfter={T.backClick + 2} // gone with the cut: it must not rest on `Review record`
      clicks={[T.openClick, T.a1VerdictClick, T.a1Click, T.a1CloseClick, T.acceptPubClick, T.backClick]}
      path={[
        { f: 3263, at: { x: 900, y: 500 }, shape: 'arrow' },
        { f: T.openArrive, at: PT.openRound, shape: 'hand' },
        { f: T.a1VerdictArrive, at: PT.verdict2, shape: 'hand' },
        { f: T.a1Arrive, at: PT.a1Item, shape: 'hand' },
        { f: T.a1CloseArrive, at: PT.close2, shape: 'hand' },
        { f: T.acceptPubArrive, at: PT.acceptPub, shape: 'hand' },
        { f: T.backArrive, at: PT.back, shape: 'hand' },
      ]}
    />
  </>
);

// ------------------------------------------------------------------ the video

export const Video: React.FC = () => (
  <WalkthroughFrame
    video={META.video}
    chapters={META.chapters}
    captions={captions}
    camera={camera}
    glimpse={<StatusAccepted />}
    splits={[{ from: T.splitIn, to: T.splitOut }]}
    overlay={
      <>
        <Cursors />
        <SplitWindows at={T.splitIn} exitAt={T.splitOut} left={{ seat: 'RACHEL', content: <SplitSeat seat="RACHEL" /> }} right={{ seat: 'ELEANOR', content: <SplitSeat seat="ELEANOR" /> }} />
      </>
    }
  >
    <Scenes scenes={SCENES} />
  </WalkthroughFrame>
);
