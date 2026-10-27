/**
 * Dev-only: the walkthrough foundation laid out for render checks. Pages of
 * 100 frames; still each at `page × 100 + 80` (settled).
 *
 *   0 Wide · Eleanor · Plan (02)          1 Wide · Rachel · Project library (26)
 *   2 Wide · Eleanor · Editor (09)        3 Work m 1.4 · typing in the composer
 *   4 Detail m 1.9 · the chat panel       5 Wide · Owen · frozen editor · bind-style modal
 *   6 Wide · Rachel · workspace shell     7 Wide · Sam · app page (crumb topbar), table, pills
 *   8 Split · Eleanor + Nadia, presence, remote caret, cited suggestion
 *   9 Generic parts: modal, dropdown, banner, fields, key/value card, toast
 *  10 CreatorScreen, W2 state (scroll 1060, work package list open)   11 CreatorScreen, W4 state (outline filled)
 *  12 PdfPage (W1 P01 with anchors + a select drag) and GIR page 1 (W2); editor with nav null
 *
 * The opening title, glimpse, close and logo are checked on the real
 * compositions (W1-document-management at f 40, 150, closeFrom + 100, total − 20).
 */
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Archive, Building2, FileText, Link, Pencil, Users } from 'lucide-react';
import { C, Field } from '../shared';
import { WT_COLLAB, WT_DOC, WT_GIR_PDF_P1, WT_MST_TEXT, WT_PEOPLE, WT_TITLES, WT_TOOLS, type WtPersonKey } from '../data/wrenfield';
import {
  Banner,
  Btn,
  Caption,
  CameraProvider,
  ChapterBar,
  ChatEntry,
  Checkbox,
  CreatorScreen,
  PdfPage,
  Segmented,
  SelectMenu,
  detail,
  Dropdown,
  EditorBar,
  EditorBody,
  Field as FormField,
  HumanTyped,
  key,
  KeyValueCard,
  layChapters,
  LibraryPage,
  Modal,
  Page,
  PageHeader,
  PanelComposer,
  PickRow,
  PlanPage,
  Plate,
  PresenceFlag,
  PresenceStack,
  Prose,
  QuietAction,
  Select,
  Shell,
  SplitWindows,
  StatusPill,
  SuggestionCallout,
  Table,
  TextInput,
  Toast,
  WIDE,
  WindowFrame,
  work,
  WtCursor,
  type CaptionCue,
  type WtCameraKey,
} from './shared';

export const WT_SHEET_PAGES = 13;

const W1 = WT_TITLES[1].chapters;

/** A stage like WalkthroughFrame's, page-local: window + camera + caption + chapter bar + overlay. */
const Stage: React.FC<{
  camera?: WtCameraKey[];
  chapter: number;
  line: string;
  seat?: WtPersonKey;
  children?: React.ReactNode;
  overlay?: React.ReactNode;
  split?: boolean;
}> = ({ camera = [{ f: 0, ...WIDE }], chapter, line, seat, children, overlay, split }) => {
  // Shift chapters so `chapter` is the current one and half done at frame 80.
  const pre = W1.slice(0, chapter - 1).reduce((s, c) => s + c.frames, 0);
  const cur = W1[chapter - 1].frames;
  const chapters = layChapters(W1, 80 - Math.round(cur / 2) - pre);
  const cues: CaptionCue[] = [{ from: 0, to: 400, chapter, line, seat }];
  return (
    <CameraProvider keys={camera}>
      <Field>
        {split ? null : (
          <WindowFrame>
            <Plate camera={camera}>{children}</Plate>
          </WindowFrame>
        )}
        {overlay}
        <Caption cues={cues} chapters={chapters} />
        <ChapterBar chapters={chapters} />
      </Field>
    </CameraProvider>
  );
};

const MST_PROSE = (
  <>
    <p style={{ margin: 0 }}>EIA Scoping Method Statement - Land Quality</p>
    <p style={{ margin: 0 }}>Routewide, Wrenfield-Ashcombe 400kV Connection</p>
    <p style={{ margin: '26px 0 0' }}>1. Purpose and scope</p>
    <p style={{ margin: 0 }}>
      This method statement sets out the approach to scoping the Land Quality chapter of the Environmental Impact Assessment for the scheme. It draws on the
      accepted ground investigation and contamination records held in the project library and identifies the assessment framework for land contamination,
      soils and geology along the route corridor.
    </p>
    <p style={{ margin: '26px 0 0' }}>2. Baseline sources</p>
    <p style={{ margin: 0 }}>
      The desk study draws on the Phase 2 Ground Investigation Report (WA-GEO-GIR-004), the Environmental Baseline Report (WA-ENV-BAS-003) and the Flood Risk
      Assessment (WA-WAT-FRA-001). The GIR records PAH exceedances at three trial pits south of the Wrenfield substation and a perched water table within the
      made ground west of Ashcombe Lane.
    </p>
    <p style={{ margin: '26px 0 0' }}>3. Conceptual site model</p>
    <p style={{ margin: 0 }}>
      A conceptual site model has been prepared for each land parcel crossed by the route. Sources considered include historic landfill, agricultural fuel
      storage and made ground associated with the former works.
    </p>
  </>
);

const editorShell = (seat: WtPersonKey, opts: { frozen?: boolean; value?: React.ReactNode; focused?: boolean; armed?: boolean } = {}) => (
  <Shell
    seat={seat}
    nav="Editor"
    contentTone="sunken"
    secondBar={<EditorBar location={WT_DOC.location} docRef={WT_DOC.ref} title={WT_DOC.title} bound frozen={opts.frozen} />}
  >
    <EditorBody
      canvas={<Prose>{MST_PROSE}</Prose>}
      panel={<PanelComposer value={opts.value} focused={opts.focused} armed={opts.armed} />}
    />
  </Shell>
);

const PROMPT = 'Draft the conceptual site model paragraph from the GIR.';

export const WalkthroughSheet: React.FC = () => (
  <AbsoluteFill style={{ background: C.field }}>
    {/* 0 · Wide · Eleanor · Plan */}
    <Sequence from={0} durationInFrames={100}>
      <Stage
        chapter={1}
        line="Eleanor's draft has a planned slot"
        seat="ELEANOR"
        overlay={<WtCursor showFrom={0} path={[{ f: 0, at: { x: 900, y: 600 } }, { f: 40, at: { x: 520, y: 363 }, shape: 'hand' }]} clicks={[60]} />}
      >
        <Shell seat="ELEANOR" nav="Plan">
          <PlanPage hoverRow={1} />
        </Shell>
      </Stage>
    </Sequence>

    {/* 1 · Wide · Rachel · Project library */}
    <Sequence from={100} durationInFrames={100}>
      <Stage chapter={6} line="The library now holds C01" seat="RACHEL">
        <Shell seat="RACHEL" nav="Project library" hoverNav="Review" unread={1}>
          <LibraryPage owner />
        </Shell>
      </Stage>
    </Sequence>

    {/* 2 · Wide · Eleanor · Editor */}
    <Sequence from={200} durationInFrames={100}>
      <Stage chapter={1} line="She opens the draft in the Editor" seat="ELEANOR">
        {editorShell('ELEANOR')}
      </Stage>
    </Sequence>

    {/* 3 · Work m 1.4 · typing */}
    <Sequence from={300} durationInFrames={100}>
      <Stage
        chapter={2}
        line="Eleanor asks for a draft"
        seat="ELEANOR"
        camera={[key(0, WIDE), key(4, work(1240, 300, 1.45))]}
        overlay={<WtCursor showFrom={0} path={[{ f: 0, at: { x: 1300, y: 600 } }, { f: 22, at: { x: 1250, y: 236 }, shape: 'ibeam' }]} clicks={[30]} />}
      >
        {editorShell('ELEANOR', { value: <HumanTyped text={PROMPT} from={34} seed={3} />, focused: true, armed: true })}
      </Stage>
    </Sequence>

    {/* 4 · Detail m 1.9 */}
    <Sequence from={400} durationInFrames={100}>
      <Stage chapter={2} line="Every sentence comes back sourced" seat="ELEANOR" camera={[key(0, detail(1260, 330, 1.9))]}>
        <Shell seat="ELEANOR" nav="Editor" contentTone="sunken" secondBar={<EditorBar location={WT_DOC.location} docRef={WT_DOC.ref} title={WT_DOC.title} bound />}>
          <EditorBody
            canvas={<Prose>{MST_PROSE}</Prose>}
            tabs={{ active: 'Chat', pending: '1 pending in the document' }}
            panel={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ChatEntry who="You">{PROMPT}</ChatEntry>
                <ChatEntry who="Infora agent" agent>
                  Done — 1 suggestion on the document.
                </ChatEntry>
                <div style={{ flex: 1 }} />
                <PanelComposer />
              </div>
            }
          />
        </Shell>
      </Stage>
    </Sequence>

    {/* 5 · Owen · frozen · modal */}
    <Sequence from={500} durationInFrames={100}>
      <Stage chapter={2} line="Owen checks it in-house" seat="OWEN">
        <Shell
          seat="OWEN"
          nav="Sandbox"
          overlay={
            <Modal
              at={10}
              title={`Bind “${WT_DOC.workingTitle}”`}
              footer={
                <>
                  <Btn variant="quiet" label="Cancel" />
                  <Btn variant="primary" label={`Bind to ${WT_DOC.ref}`} />
                </>
              }
            >
              <FormField label="Planned deliverable" hint="Pre-selected from the deliverable folder this draft sits in — confirm it, or pick another.">
                <TextInput value={WT_DOC.ref} />
              </FormField>
              <KeyValueCard
                label="From the plan"
                locked
                rows={[
                  ['Security classification', 'OFFICIAL'],
                  ['Role / Discipline', 'EEN'],
                  ['Suitability code', 'S2'],
                  ['Lead reviewer', <StatusPill key="r" tone="success" label="Rachel Bowen · Confirmed" />],
                ]}
              />
            </Modal>
          }
        >
          <Page>
            <PageHeader title="Sandbox" sub="Work in progress across your organisation. Nothing here is in the project record, and the AI never grounds on anything here." />
          </Page>
        </Shell>
      </Stage>
    </Sequence>

    {/* 6 · Rachel · workspace shell */}
    <Sequence from={600} durationInFrames={100}>
      <Stage chapter={6} line="The app is kept as a playbook" seat="RACHEL">
        <Shell seat="RACHEL" nav="Playbooks" workspace>
          <Page>
            <PageHeader title={WT_TOOLS.dashboard.shelf} pill={{ tone: 'neutral', label: WT_TOOLS.dashboard.shelfBadge }} />
            <div style={{ marginTop: 20 }}>
              <Banner tone="success" text={WT_TOOLS.dashboard.keepNotice} />
            </div>
          </Page>
        </Shell>
      </Stage>
    </Sequence>

    {/* 7 · Sam · app page */}
    <Sequence from={700} durationInFrames={100}>
      <Stage chapter={5} line="Sam submits September's return" seat="SAM">
        <Shell seat="SAM" nav="Tools" topbar={{ crumb: ['Tools', 'Supplier KPI returns'] }}>
          <Page>
            <PageHeader title="Supplier KPI returns" sub={WT_TOOLS.sam.sub} />
            <div style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, margin: '28px 0 10px' }}>
              {WT_TOOLS.sam.table}
            </div>
            <Table
              columns={[
                { key: 'm', label: 'Month', w: 140 },
                { key: 'd', label: 'Due', w: 90 },
                { key: 'o', label: 'On time', w: 90 },
                { key: 'n', label: 'NCRs', w: 90 },
                { key: 'c', label: 'Carbon', w: 90 },
                { key: 's', label: 'State' },
              ]}
              hoverRow={0}
              rows={WT_TOOLS.sam.rows.map((r, i) => ({
                m: r.month,
                d: r.due,
                o: r.onTime,
                n: r.ncrs,
                c: r.carbon,
                s:
                  i === 0 ? (
                    <StatusPill tone="neutral" label="Draft" flipTo={{ tone: 'warning', label: 'Submitted Oct 05, 2026', at: 40 }} />
                  ) : (
                    <StatusPill tone="success" label={`${r.state} ${r.stamp}`} />
                  ),
              }))}
            />
          </Page>
        </Shell>
      </Stage>
    </Sequence>

    {/* 8 · split */}
    <Sequence from={800} durationInFrames={100}>
      <Stage
        split
        chapter={4}
        line="Both see the same draft arrive"
        overlay={
          <>
            <SplitWindows
              at={-20}
              left={{ seat: 'ELEANOR', content: splitEditor('ELEANOR', 'NADIA') }}
              right={{ seat: 'NADIA', content: splitEditor('NADIA', 'ELEANOR') }}
            />
            <WtCursor window="right" showFrom={0} path={[{ f: 0, at: { x: 500, y: 600 } }, { f: 30, at: { x: 340, y: 520 }, shape: 'hand' }]} />
          </>
        }
      />
    </Sequence>

    {/* 9 · generic parts */}
    <Sequence from={900} durationInFrames={100}>
      <Stage chapter={3} line="Generic parts, at native size" seat="ELEANOR">
        <Shell
          seat="ELEANOR"
          nav="Sandbox"
          overlay={
            <>
              <Dropdown
                x={1120}
                y={330}
                width={220}
                at={10}
                items={[
                  { label: 'Open in Editor', icon: <FileText size={14} /> },
                  { label: 'Rename…', icon: <Pencil size={14} /> },
                  { label: 'Bind…', icon: <Link size={14} />, hover: true },
                ]}
              />
              <Toast text="Saved" at={20} x={870} y={820} />
            </>
          }
        >
          <Page>
            <PageHeader
              title="Sandbox"
              actions={
                <>
                  <Btn variant="primary" label="New document" />
                  <QuietAction icon={<Archive size={14} />} label="Sandbox" />
                </>
              }
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
              <div style={{ display: 'grid', gap: 14 }}>
                <Banner tone="success" text={WT_DOC.boundBanner} />
                <Banner tone="warning" text="The round is open. Its comments are withheld until the lead reviewer closes the round and issues it." dismissible={false} />
                <FormField label="Name">
                  <TextInput value={<HumanTyped text={WT_COLLAB.sandboxName} from={0} seed={5} caretUntil={400} />} focused />
                </FormField>
                <FormField label="Access" hint={WT_COLLAB.wizard.accessHint.shared}>
                  <Select value={WT_COLLAB.wizard.access.shared} />
                </FormField>
              </div>
              <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                <FormField label="Organisations" hint={WT_COLLAB.wizard.orgsHint}>
                  <div>
                    {WT_COLLAB.wizard.orgs.map((o, i) => (
                      <PickRow key={o} name={o} checked={i < 2} hover={i === 1} />
                    ))}
                  </div>
                </FormField>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, fontSize: 13 }}>
                  <Building2 size={14} color={C.muted} /> Trentmoor Energy <Users size={14} color={C.muted} /> Shared
                  <Checkbox checked />
                  <StatusPill tone="neutral" label="Unbound" />
                  <StatusPill tone="success" label="Accepted" />
                  <StatusPill tone="info" label="In review" />
                  <StatusPill tone="warning" label="Responding" />
                </div>
              </div>
            </div>
          </Page>
        </Shell>
      </Stage>
    </Sequence>

    {/* 10 · CreatorScreen, W2 state */}
    <Sequence from={1000} durationInFrames={100}>
      <Stage chapter={3} line="Related documents come first, each with a reason" seat="ELEANOR">
        <Shell seat="ELEANOR" nav="Sandbox">
          <CreatorScreen scrollY={1060} ticked={{ 'WA-GEO-GIR-004': 40, 'WA-ENV-BAS-003': 70 }} hoverRef="WA-ENV-BAS-003" workPackage={{ value: 'Land quality' }} />
        </Shell>
      </Stage>
    </Sequence>

    {/* 11 · CreatorScreen, W4 state */}
    <Sequence from={1100} durationInFrames={100}>
      <Stage chapter={3} line="Eleanor starts from her firm's outline" seat="ELEANOR">
        <Shell seat="ELEANOR" nav="Tools">
          <CreatorScreen
            scrollY={430}
            styleGuide
            workPackage={{ value: 'Land quality' }}
            outline={{ firmHover: true, sections: WT_TOOLS.creator.sections, sectionsAt: 20 }}
            brief={{ forText: WT_TOOLS.creator.brief, title: WT_TOOLS.creator.docTitle }}
            ticked={{ 'WA-GEO-GIR-004': true, 'WA-ENV-BAS-003': true }}
          />
        </Shell>
      </Stage>
    </Sequence>

    {/* 12 · PdfPage + nav null + menus */}
    <Sequence from={1200} durationInFrames={100}>
      <Stage chapter={4} line="Rachel comments on the page itself" seat="RACHEL">
        <Shell seat="RACHEL" nav={null} unread={1}>
          <div style={{ flex: 1, background: C.sunken, display: 'flex', gap: 24, padding: 24, alignItems: 'flex-start' }}>
            <PdfPage
              sections={WT_MST_TEXT.p01}
              firstLine={WT_MST_TEXT.pdfFirstLine}
              height={700}
              anchors={[
                { span: 'Conceptual site model', state: 'saved' },
                { span: 'Asbestos in soils', state: 'pending' },
                { span: 'route section', state: [{ from: 50, state: 'active' }] },
              ]}
              select={{ span: 'perched water table within the made ground', from: 30, to: 60 }}
            />
            <div style={{ display: 'grid', gap: 16, position: 'relative' }}>
              <PdfPage runningHead={WT_GIR_PDF_P1.runningHead} cover={{ title: WT_GIR_PDF_P1.title, lines: [WT_GIR_PDF_P1.subtitle, WT_GIR_PDF_P1.revision] }} sections={[{ heading: WT_GIR_PDF_P1.heading, text: WT_GIR_PDF_P1.body }]} width={460} height={330} />
              <Segmented options={['List', 'How it connects']} active="How it connects" />
              <Segmented options={['Full check', 'Quick check']} active="Full check" />
              <div style={{ position: 'relative', height: 160 }}>
                <SelectMenu x={0} y={150} at={10} direction="up" options={WT_COLLAB.libraryEleanor} hover="WA-GEO-GIR-004" />
              </div>
            </div>
          </div>
        </Shell>
      </Stage>
    </Sequence>
  </AbsoluteFill>
);

function splitEditor(seat: WtPersonKey, other: WtPersonKey) {
  const o = WT_PEOPLE[other];
  return (
    <Shell
      seat={seat}
      nav="Editor"
      width={752}
      height={832}
      contentTone="sunken"
      secondBar={
        <EditorBar
          location={WT_COLLAB.editor.location}
          title={WT_COLLAB.docTitle}
          presence={<PresenceStack people={[{ initials: o.initials, name: o.name, org: o.org, editing: true }]} />}
          pill={<span />}
        />
      }
    >
      <EditorBody
        narrow
        canvas={
          <Prose style={{ margin: '12px 0 0' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>1. Dewatering and the brook</p>
            <SuggestionCallout claims={WT_COLLAB.suggestion.claims.slice(0, 2)} hover={seat === 'NADIA' ? 'accept' : undefined} />
            <p style={{ margin: '14px 0 0', fontWeight: 600 }}>1. Ecological receptors</p>
            <p style={{ margin: 0 }}>
              Redgate’s appraisal records the brook corridor
              {seat === 'ELEANOR' ? <PresenceFlag name="Nadia Okonjo" initials="NO" /> : null}
            </p>
          </Prose>
        }
        panel={<PanelComposer chips={false} />}
      />
    </Shell>
  );
}

