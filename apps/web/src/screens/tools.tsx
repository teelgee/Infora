// T-334 — the Tools section stops being an empty state, and T-335 — the
// document creator, the first tool that lives in it.
//
// *In plain terms: the rail's "Tools" item has been empty since the skeleton.
// This is what fills it — the standalone things you can open and run, and the
// first of them: build a document's structure, say what each part is for,
// choose the library documents it may draw on, see what it will cost and what
// it will cover, and only then generate.*
//
// 🔒 **THE LIST IS ASSEMBLED SERVER-SIDE, NOT FILTERED HERE.** `GET
// /projects/:id/tools` returns the set for this requester, so a tool they
// cannot use never reaches this component at all. There is no `enabled` check
// below and there must never be one: the moment a surface decides what to grey
// out, the section is advertising capabilities the viewer cannot reach.
//
// 🔒 **THE LAUNCH KEEPS ITS STATE** (ADR-0053 §1). Pick the template, say what
// the document is for, choose the sources, choose where it goes, **see the
// plan**, then step back and change one thing without re-entering the rest.
// That is the pattern T-336 sets for the checker and it is not re-invented
// here: the form's state survives the plan being shown, and changing any field
// discards the plan rather than the answers.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type {
  CheckFamily,
  CheckFamilyDescriptor,
  CorpusDepth,
  CreatorOption,
  DocumentCreationRunResponse,
  DocumentLanguage,
  DocumentPurpose,
  DocumentSection,
  DocumentSubSection,
  DocumentType,
  GroundingSource,
  StartingOutline,
  QaCheckRunResponse,
  Sandbox,
  SandboxDocument,
  StyleGuideRecord,
  ToolSummary,
  ToolPlan,
} from '@infora/contracts';
import {
  flattenOutline,
  withBriefAt,
  CHECK_FAMILIES,
  CHECK_FAMILY_CATALOGUE,
  CHECK_PRESETS,
  DEFAULT_CHECK_PRESET,
  DEFAULT_CORPUS_DEPTH,
  DEFAULT_DOCUMENT_LANGUAGE,
  DEFAULT_DOCUMENT_PURPOSE,
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_LANGUAGE_CATALOGUE,
  DOCUMENT_PURPOSE_CATALOGUE,
  DOCUMENT_TYPE_CATALOGUE,
} from '@infora/contracts';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  ClipboardCheck,
  FileText,
  Plus,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  SelectInput,
  TextArea,
  TextInput,
} from '@infora/ui';
import { api } from '../api';
import { useGroundingScope } from '../composer-chips';

export function ToolsScreen() {
  const { projectId } = useParams();
  const [tools, setTools] = useState<ToolSummary[] | null>(null);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .tools(projectId)
      .then((res) => setTools(res.items))
      // a failed read is not an empty tool set: rendering "no tools" off a
      // request that did not answer is a claim about this deployment we cannot
      // make
      .catch(() => setTools(null));
  }, [projectId]);

  return (
    <div className="content">
      <h1 className="page">Tools</h1>
      <p className="page-sub">
        Infora’s standard tools. Each runs a codified workflow — the same inputs produce the same
        steps, in the same order, every time.
      </p>
      {tools === null ? (
        <p className="page-sub">Loading…</p>
      ) : (
        <div className="tool-cards">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The icon a tool wears, by tool id.
 *
 * **A presentation decision, made here rather than sent over the wire.** What a
 * tool *is* — its name, what it does, whether the viewer may reach it — is the
 * server's to say, and does. Which glyph sits beside it is not: putting an icon
 * name in the contract would make the API answerable for the icon set, and the
 * next surface that wanted a different one would have to change the server.
 * A tool this map has not met falls back to a neutral glyph and still renders
 * as a card, which is the honest failure — a tile is never dropped for want of
 * a picture.
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  'document-creation': FileText,
  'qa-check': ClipboardCheck,
};

/**
 * T-403 — one tool, as a card.
 *
 * 🔒 **THE ASSEMBLED-NOT-FILTERED RULE IS UNTOUCHED, AND THE CARD FORM IS WHY
 * IT IS WORTH RESTATING.** A card is a more inviting shape than a row, and the
 * temptation a card form creates is to render an unentitled tool greyed out so
 * the grid stays even. It must not: a tool the requester cannot use never
 * reaches this component, and there is no `enabled` prop here to add one with.
 * `unbuilt` is a different thing — the tool exists, nobody has built it, and it
 * says so **inside its own card** rather than as a note beside the grid.
 */
export function ToolCard({ tool }: { tool: ToolSummary }) {
  const Icon = TOOL_ICONS[tool.id] ?? Wrench;
  const body = (
    <>
      <span className="tool-card-head">
        <span className="tool-card-icon">
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="tool-card-name">{tool.label}</span>
        {tool.state === 'unbuilt' && <Badge tone="neutral">Not built yet</Badge>}
      </span>
      <p className="tool-card-desc">{tool.description}</p>
    </>
  );

  return tool.state === 'available' && tool.href !== undefined ? (
    <Link className="tool-card" to={tool.href}>
      {body}
    </Link>
  ) : (
    <div className="tool-card tool-card--unbuilt">
      {body}
      <p className="tool-card-waits">{tool.waitsOn}</p>
    </div>
  );
}

/**
 * T-405 — one row of the source picker: what this document is, not just what it
 * is called.
 *
 * *In plain terms: choosing what a draft may draw on used to mean reading a
 * list of coded references. A reference identifies a document; it does not say
 * what is in it. The row now carries the reference, the title, and the
 * description whoever filed the document typed.*
 *
 * **The description is absent, not blank, where nobody has written one.** Most
 * of a real corpus predates the column, and a row that said "no description"
 * would spend a line saying nothing. **It is never generated** — a
 * model-written description would be an uncited claim about a document, shown
 * next to that document's own grounded content.
 *
 * One component for both tools' pickers, because it is one control over one
 * list doing one job; two copies is how the creator's rows and the checker's
 * end up telling a user different things about the same document.
 */
export function SourceRow(props: {
  source: GroundingSource;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="source-row">
      <input type="checkbox" checked={props.checked} onChange={props.onToggle} />
      <span className="source-row-body">
        <span className="source-row-head">
          <span className="mono">{props.source.documentReference}</span>
          {props.source.title !== null && (
            <span className="source-row-title">{props.source.title}</span>
          )}
        </span>
        {props.source.description !== null && (
          <span className="source-row-desc">{props.source.description}</span>
        )}
      </span>
    </label>
  );
}

/**
 * T-406 — the sentence under a chosen answer.
 *
 * The catalogue already carries one per option and it does the work the label
 * cannot: *"External document"* is a category, *"written to leave your firm;
 * every statement stands on its own"* is what choosing it does. Showing it for
 * the CURRENT choice only, rather than all of them at once, keeps the launcher
 * a form rather than a page of documentation.
 */
export function ChosenNote<T extends string>(props: {
  catalogue: readonly CreatorOption<T>[];
  value: T;
}) {
  const chosen = props.catalogue.find((option) => option.value === props.value);
  return chosen === undefined ? null : <p className="field-hint">{chosen.description}</p>;
}

/**
 * T-406 — which of the project's style guides this document is written to.
 *
 * **More than one may apply**, and the store has always been able to hold more
 * than one, so this is a checklist rather than a select. Three states, and all
 * three are said out loud:
 *
 *   • guides loaded — pick any number, none is a real answer;
 *   • **none loaded** — the control is *honestly empty* rather than absent (A1),
 *     because a missing control reads as "style is handled" when in fact
 *     nobody has set the project up;
 *   • **the read failed** — which is NOT the same as none loaded, and saying
 *     "no style guide is loaded" off a request that did not answer would be a
 *     claim about the project this screen cannot make.
 */
export function StyleGuidePicker(props: {
  guides: StyleGuideRecord[] | null;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (props.guides === null) {
    return (
      <p className="field-hint">
        This project’s style guides could not be read, so none can be selected. That is not the same
        as there being none — reload the page before drafting to a guide.
      </p>
    );
  }
  if (props.guides.length === 0) {
    return (
      <p className="field-hint">
        No style guide is loaded for this project. The draft will follow the language you chose and
        ordinary professional convention, and will invent no house rules.
      </p>
    );
  }
  return (
    <div className="style-guide-picker">
      {props.guides.map((guide) => (
        <label key={guide.id} className="style-guide-option">
          <input
            type="checkbox"
            checked={props.selected.includes(guide.id)}
            onChange={() => props.onToggle(guide.id)}
          />
          <span>{guide.title}</span>
          <span className="style-guide-clauses">
            {guide.clauses} clause{guide.clauses === 1 ? '' : 's'}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * T-407 — THE OUTLINE, COMPOSED (ADR-0053 addendum A1).
 *
 * *In plain terms: instead of an outline arriving ready-made, the author builds
 * it. Add a section, say what should go in it — "an introductory section
 * setting out the site, the constraints and the programme" — add the next.
 * Reorder them, edit them, take one out. A starting outline can be chosen and
 * then it is a copy: every section it produced is as editable as one typed by
 * hand, and starting from nothing is the primary path rather than the fallback.*
 *
 * 🔒 **A PURPOSE SAYS WHAT BELONGS IN A SECTION, NEVER WHAT TO CONCLUDE.** It
 * is the rule the shipped templates' own authoring guide has always held their
 * per-part guidance to, and it did not stop mattering when the words became the
 * author's: an outline that told the drafting call what to find would make
 * every document agree with its outline rather than with its sources.
 *
 * **The list starts empty, deliberately.** Seeding it from a default template
 * would be an outline arriving ready-made wearing a different name, which is
 * precisely what A1 retired.
 */
export function SectionComposer(props: {
  sections: DocumentSection[];
  outlines: StartingOutline[];
  onChange: (sections: DocumentSection[]) => void;
  /** T-414 — absent where this deployment has no saved-outline store wired */
  onSave?: (label: string) => Promise<void>;
  /** T-414 — absent likewise; per-outline permission rides `mayRetire` */
  onRetire?: (outlineId: string) => Promise<void>;
}) {
  // T-414 — the save control's own state: a name, and whether the author has
  // opened it. Kept here rather than lifted, because nothing outside this card
  // needs to know a label is half-typed.
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const at = (index: number, section: DocumentSection) =>
    props.onChange(props.sections.map((existing, i) => (i === index ? section : existing)));
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= props.sections.length) return;
    const next = [...props.sections];
    [next[index], next[to]] = [next[to]!, next[index]!];
    props.onChange(next);
  };

  // ── T-412 — the sub-section editors ──────────────────────────────────────
  //
  // *In plain terms: under any section, "add a sub-section" makes a nested
  // part with its own heading and its own description.*
  //
  // 🔒 **A SUB-SECTION MOVES WITHIN ITS PARENT AND NOWHERE ELSE.** The board
  // says *"reordered within their parent"*, and the restriction is the whole of
  // what one level means at the surface: a control that let a sub-section climb
  // out of its section would be asking the author to build a shape the
  // splitter, the manifest and the coverage count have no depth for.
  const subs = (index: number) => props.sections[index]?.subSections ?? [];
  const setSubs = (index: number, next: DocumentSubSection[]) => {
    const section = props.sections[index];
    if (section === undefined) return;
    // the key goes away when the last sub-section does, rather than staying as
    // an empty list: a section with no sub-sections and a section that once had
    // some are the same section, and a request carrying `subSections: []` would
    // be saying otherwise on the wire
    const rest = { ...section };
    delete rest.subSections;
    at(index, { ...rest, ...(next.length > 0 && { subSections: next }) });
  };
  const subAt = (index: number, subIndex: number, sub: DocumentSubSection) =>
    setSubs(
      index,
      subs(index).map((existing, i) => (i === subIndex ? sub : existing)),
    );
  const moveSub = (index: number, subIndex: number, by: number) => {
    const list = [...subs(index)];
    const to = subIndex + by;
    if (to < 0 || to >= list.length) return;
    [list[subIndex], list[to]] = [list[to]!, list[subIndex]!];
    setSubs(index, list);
  };

  return (
    <Card>
      <span className="card-title">The outline</span>
      <p className="card-lede">
        Build the document section by section: a heading, and what should go in it. Say what belongs
        there, not what you expect it to conclude — the draft rests on the sources, not on the
        outline. A section can carry sub-sections, and each one is written as a part of its own
        under its parent’s heading.
      </p>

      {props.outlines.length > 0 && (
        <div className="outline-seeds">
          <span className="field-hint">Start from:</span>
          {props.outlines.map((outline) => (
            <span key={outline.id} className="outline-seed">
              <Button
                size="sm"
                variant="quiet"
                title={outline.description}
                onClick={() => props.onChange([...props.sections, ...outline.sections])}
              >
                {outline.label}
              </Button>
              {/* 🔒 T-414 (ADR-0053 addendum A5) — A FIRM OUTLINE IS VISIBLY
                  THE FIRM'S OWN. An outline a colleague saved last Tuesday and
                  one Infora ships carry different authority, and an unmarked
                  half-baked outline sitting beside a shipped one reads as the
                  product's recommendation. The badge is the whole of the
                  owner's answer to that stress test, together with the
                  curator's retire beside it. */}
              {outline.origin === 'firm' && <Badge tone="neutral">Your firm</Badge>}
              {outline.mayRetire === true && props.onRetire !== undefined && (
                <IconButton
                  aria-label={`Retire ${outline.label}`}
                  title="Stop offering this outline. Documents already made from it are untouched."
                  onClick={() => void props.onRetire!(outline.id)}
                >
                  <X size={13} strokeWidth={2} />
                </IconButton>
              )}
            </span>
          ))}
          {/* a seed is a COPY — every section it adds is as editable and as
              removable as one typed by hand, which is the whole of "seeds but
              never locks" */}
          <span className="field-hint">— every section it adds stays yours to edit or remove.</span>
        </div>
      )}

      {props.sections.length === 0 ? (
        <p className="card-lede" style={{ marginTop: 12 }}>
          No sections yet. Add the first one, or start from an outline above.
        </p>
      ) : (
        <ol className="outline-sections">
          {props.sections.map((section, index) => (
            <li key={index} className="outline-section">
              {/* T-404 — the number, the heading and the controls read as ONE
                  row: the controls used to stack down the left of a two-field
                  group, which left the remove button floating beside a
                  textarea it does not act on. */}
              <div className="outline-section-head">
                <span className="outline-section-n">{index + 1}</span>
                <TextInput
                  value={section.heading}
                  onChange={(heading) => at(index, { ...section, heading })}
                  placeholder="Heading"
                />
                <span className="outline-section-controls">
                  <IconButton
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={13} strokeWidth={2} />
                  </IconButton>
                  <IconButton
                    aria-label="Move down"
                    disabled={index === props.sections.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={13} strokeWidth={2} />
                  </IconButton>
                  <IconButton
                    aria-label="Remove section"
                    onClick={() =>
                      props.onChange(props.sections.filter((_, i) => i !== index))
                    }
                  >
                    <X size={13} strokeWidth={2} />
                  </IconButton>
                </span>
              </div>
              <TextArea
                value={section.purpose}
                onChange={(purpose) => at(index, { ...section, purpose })}
                rows={2}
                placeholder="What should go in this section?"
              />

              {/* T-412 — the sub-sections, numbered under their parent. The
                  numbering is `2.1` because that is what every engineering
                  document already uses, and because the plan, the prompt and
                  the finished document all carry the same shape — a nesting
                  the author sees one way on this screen and another way in the
                  output would be two outlines. */}
              {subs(index).length > 0 && (
                <ol className="outline-subsections">
                  {subs(index).map((sub, subIndex) => (
                    <li key={subIndex} className="outline-subsection">
                      <div className="outline-section-head">
                        <span className="outline-section-n outline-section-n--sub">
                          {index + 1}.{subIndex + 1}
                        </span>
                        <TextInput
                          value={sub.heading}
                          onChange={(heading) => subAt(index, subIndex, { ...sub, heading })}
                          placeholder="Sub-section heading"
                        />
                        <span className="outline-section-controls">
                          <IconButton
                            aria-label="Move sub-section up"
                            disabled={subIndex === 0}
                            onClick={() => moveSub(index, subIndex, -1)}
                          >
                            <ArrowUp size={13} strokeWidth={2} />
                          </IconButton>
                          <IconButton
                            aria-label="Move sub-section down"
                            disabled={subIndex === subs(index).length - 1}
                            onClick={() => moveSub(index, subIndex, 1)}
                          >
                            <ArrowDown size={13} strokeWidth={2} />
                          </IconButton>
                          <IconButton
                            aria-label="Remove sub-section"
                            onClick={() =>
                              setSubs(
                                index,
                                subs(index).filter((_, i) => i !== subIndex),
                              )
                            }
                          >
                            <X size={13} strokeWidth={2} />
                          </IconButton>
                        </span>
                      </div>
                      <TextArea
                        value={sub.purpose}
                        onChange={(purpose) => subAt(index, subIndex, { ...sub, purpose })}
                        rows={2}
                        placeholder="What should go in this sub-section?"
                      />
                    </li>
                  ))}
                </ol>
              )}

              <div className="outline-section-add">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setSubs(index, [...subs(index), { heading: '', purpose: '' }])}
                >
                  <Plus size={13} strokeWidth={2} /> Add a sub-section
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="outline-actions">
        <Button
          size="sm"
          variant="quiet"
          onClick={() => props.onChange([...props.sections, { heading: '', purpose: '' }])}
        >
          <Plus size={13} strokeWidth={2} /> Add a section
        </Button>
        {/* T-414 — keep the outline you just built. **Anyone in the firm may**
            (A5), so there is no permission check here and there must not be
            one: the curator's tier governs retiring, not saving. */}
        {props.onSave !== undefined && props.sections.length > 0 && !saving && (
          <Button size="sm" variant="quiet" onClick={() => setSaving(true)}>
            <BookmarkPlus size={13} strokeWidth={2} /> Save this outline for your firm
          </Button>
        )}
      </div>

      {props.onSave !== undefined && saving && (
        <div className="outline-save">
          <Field label="Name this outline">
            <TextInput
              value={label}
              onChange={setLabel}
              placeholder="e.g. Land quality technical note"
            />
          </Field>
          <p className="field-hint">
            It appears beside the outlines Infora ships, for your firm only, marked as yours.
            Another organisation on this project never sees it.
          </p>
          <div className="outline-save-controls">
            <Button
              size="sm"
              variant="primary"
              disabled={label.trim() === ''}
              onClick={() => {
                void props.onSave!(label.trim()).then(() => {
                  setLabel('');
                  setSaving(false);
                });
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * T-409 (ADR-0053 addendum A2, second half) — THE AGENT PANE.
 *
 * *In plain terms: you tell the agent what it got wrong for this one section —
 * "no, this should set out X in bullets" — and it rewrites that section's
 * description. Nothing runs; the plan just redraws with the new wording, and
 * you still have to accept it.*
 *
 * 🔒 **IT WRITES BACK THROUGH THE SAME DOOR A TYPED CORRECTION USES.** The
 * revised text becomes `section.brief` — a parameter — through
 * `onEditBrief`, and the plan is recomputed in code. There is deliberately no
 * second path: two ways to change a brief would be two chances for them to
 * produce different plans, and the whole claim of this design is that they
 * cannot. The model never sees a step list, let alone edits one.
 *
 * **Per section, not per document.** The pane opens targeted at the section
 * whose chip was pressed, because an agent told "the second one is wrong"
 * about a whole plan is an agent guessing which one.
 */
export function AgentPane(props: {
  heading: string;
  busy: boolean;
  onAsk: (ask: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [ask, setAsk] = useState('');
  const [followUp, setFollowUp] = useState<string | null>(null);
  const send = () => {
    if (ask.trim() === '') return;
    void props.onAsk(ask.trim()).then((question) => {
      setFollowUp(question);
      // the ask is kept where the agent asked a question back, cleared where it
      // acted: a question is a conversation continuing, not a failed attempt
      if (question === null) setAsk('');
    });
  };
  return (
    <div className="agent-pane">
      <span className="field-label">Tell the agent what is wrong with “{props.heading}”</span>
      <TextArea
        value={ask}
        onChange={setAsk}
        rows={2}
        placeholder="e.g. No — this should set out the three constraints in bullets, not prose."
      />
      {followUp !== null && <p className="agent-pane-followup">{followUp}</p>}
      <div className="agent-pane-controls">
        <Button size="sm" variant="primary" disabled={props.busy || ask.trim() === ''} onClick={send}>
          Revise this description
        </Button>
        <Button size="sm" variant="quiet" onClick={props.onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/**
 * T-408 (ADR-0053 addendum A2) — THE PLAN IS THE PROPOSED DOCUMENT.
 *
 * *In plain terms: before anything runs you read the document you are about to
 * get — a short overview of the instructions as a whole, then, section by
 * section, a short description of what will be written into each. Anything
 * wrong you click and correct there and then, and the page redraws. A chip at
 * the bottom accepts the plan and creates the document.*
 *
 * 🔒 **TWO THINGS ON THIS PAGE, AND ONLY ONE OF THEM IS EDITABLE.** The
 * descriptions are **briefs — parameters of the run**, and correcting one asks
 * for a new plan computed from the new inputs. The **step list** underneath is
 * computed in code, is editable by nobody (human or model), and regenerates
 * when a brief changes. That is what keeps the run `declared` and ADR-0053 §12
 * closed: no step list is ever hand-edited; one more input simply became
 * correctable before the run.
 *
 * The step list is kept on the page rather than hidden behind the prospectus.
 * A page that showed only the pretty half would be a page that stopped saying
 * what the machine will actually do.
 */
export function ProposedDocumentCard(props: {
  plan: ToolPlan;
  busy: boolean;
  onEditBrief: (index: number, brief: string) => void;
  /** T-409 — absent where this deployment has no agent pane wired */
  onAsk?: (index: number, ask: string) => Promise<string | null>;
  onAccept: () => void;
}) {
  const { plan } = props;
  const [asking, setAsking] = useState<number | null>(null);
  return (
    <Card>
      <span className="card-title">The document this will write</span>
      {plan.proposal !== undefined && (
        <>
          <p className="proposal-overview">{plan.proposal.overview}</p>
          <ol className="proposal-sections">
            {plan.proposal.sections.map((section, index) => (
              <li
                key={`${section.heading}-${index}`}
                className={
                  // T-412 — a sub-section reads as one on the plan too. The
                  // prospectus is the document you are about to get, so an
                  // outline that showed flat here and nested in the output
                  // would be describing a different document.
                  section.depth === 1 ? 'proposal-section proposal-section--sub' : 'proposal-section'
                }
              >
                <div className="proposal-section-head">
                  <span className="proposal-section-heading">{section.heading}</span>
                  {section.edited && <Badge tone="neutral">Your wording</Badge>}
                  {props.onAsk !== undefined && (
                    <span className="proposal-section-ask">
                      <Chip
                        title={`Tell the agent what is wrong with “${section.heading}”`}
                        onClick={() => setAsking(asking === index ? null : index)}
                      >
                        Ask the agent
                      </Chip>
                    </span>
                  )}
                </div>
                <TextArea
                  value={section.brief}
                  rows={3}
                  onChange={(brief) => props.onEditBrief(index, brief)}
                />
                {props.onAsk !== undefined && asking === index && (
                  <AgentPane
                    heading={section.heading}
                    busy={props.busy}
                    onAsk={(ask) => props.onAsk!(index, ask)}
                    onClose={() => setAsking(null)}
                  />
                )}
              </li>
            ))}
          </ol>
          <p className="card-lede">
            Correct any description above and the plan redraws. Every other answer stays as it is.
          </p>
        </>
      )}

      {/* 🔒 Rendered, NOT editable (ADR-0053 §4 and §12). The descriptions above
          are parameters; this is what the parameters produce. You change it by
          changing an answer and watching it regenerate — hand-editing a step
          list is what would make the run `model_chosen` rather than
          `declared`. */}
      <p className="card-lede" style={{ marginTop: 16 }}>
        And this is what will run. The steps are computed from the answers above and are not
        editable, which is what makes the run repeatable.
      </p>
      <ul className="plan-steps">
        {plan.steps.map((step) => (
          <li key={step.key}>{step.label}</li>
        ))}
      </ul>
      <p className="plan-covers">
        <strong>Covers:</strong> {plan.coverage}
      </p>
      {/* T-406 — what the run will DO that the step list does not show: what it
          is writing, in which register, to which guides, and A1's RULED
          PRECEDENCE where those two disagree. Before the click, because a
          resolution an author only meets in the output is one they had no
          chance to argue with. */}
      {plan.notes?.map((note) => (
        <p key={note} className="plan-note">
          {note}
        </p>
      ))}
      {/* 🚫 NO PRICE HERE, AND ITS ABSENCE IS A RULING (T-410, ADR-0053
          addendum A3, owner 2026-08-31). An estimate was on this surface
          because §4 deliberately put it there, so taking it off is a decision
          rather than a tidy-up, and putting it back is one too. PER-STEP COST
          IS UNTOUCHED (§7): every Step row still records what it spent, as an
          audit and operations fact. What retired is the display. */}
      {plan.refusal !== null ? (
        // ADR-0053 §5 — refusal is said BEFORE any spend, and the chip is
        // absent rather than offered-and-refused
        <div className="banner banner--warning">{plan.refusal}</div>
      ) : (
        <div className="proposal-accept">
          <Chip tone="primary" disabled={props.busy} onClick={props.onAccept}>
            Accept the plan and create the document
          </Chip>
        </div>
      )}
    </Card>
  );
}

export function DocumentCreatorScreen() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const scope = useGroundingScope(projectId ?? '');
  const [destinations, setDestinations] = useState<Sandbox[]>([]);

  // T-406 (ADR-0053 addendum A1) — the four questions that replaced "shape"
  const [purpose, setPurpose] = useState<DocumentPurpose>(DEFAULT_DOCUMENT_PURPOSE);
  const [language, setLanguage] = useState<DocumentLanguage>(DEFAULT_DOCUMENT_LANGUAGE);
  const [documentType, setDocumentType] = useState<DocumentType>(DEFAULT_DOCUMENT_TYPE);
  const [styleGuides, setStyleGuides] = useState<StyleGuideRecord[] | null>(null);
  const [styleGuideIds, setStyleGuideIds] = useState<string[]>([]);
  // T-407 — the outline the author composes. Starts empty on purpose: a
  // pre-filled outline is a shape arriving ready-made, which is the thing A1
  // retired. A starting outline can be chosen, and then it is a copy.
  const [outlines, setOutlines] = useState<StartingOutline[]>([]);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [brief, setBrief] = useState('');
  const [title, setTitle] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [destination, setDestination] = useState('');

  const [plan, setPlan] = useState<ToolPlan | null>(null);
  const [result, setResult] = useState<DocumentCreationRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 🔒 **T-413 (ADR-0053 addendum A4) — THERE IS NO PATH FROM THE OWNER'S PLAN
  // INTO THIS SCREEN, AND ITS ABSENCE IS A RULING.**
  //
  // The creator used to answer `?containerId=` with a refusal naming `Q-037`,
  // because whether a plan row seeded the outline was raised and unruled. The
  // owner ruled it on 2026-09-01 by **cutting the link** rather than by
  // deciding what may cross it: *"starting doc creator from a deliverable in
  // the plan should not be possible"*. So the refusal has no reason to exist
  // and is gone with the question — but taking a screen out is exactly the
  // kind of change that grows back quietly, which is why the render suite now
  // asserts its absence rather than simply having dropped the test that
  // asserted its presence. **Nothing here reads a plan row, and nothing
  // anywhere hands one to this route.**
  //
  // What replaced it is the other half of A4: `?sandboxId=` — the creator
  // opened from a **location in your own working area**, with the destination
  // already set to that location. That is producing-side authoring start to
  // finish, so it never enters `Q-034`'s wall-through-content territory the
  // way a plan-row seed would have.
  const launchedFrom = params.get('sandboxId');

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .sandboxes(projectId)
      .then((res) => {
        setDestinations(res.items);
        // T-413 — the destination arrives pre-filled when the creator was
        // opened from a working-area location, **and stays changeable**: it is
        // the same one control the Tools path uses, starting on a different
        // answer.
        //
        // 🔒 ASSEMBLED, NOT FILTERED, ONE LEVEL ALONG. The list is what the
        // server says this requester can reach, so a `sandboxId` they cannot
        // reach is simply not in it and pre-fills nothing — the select stays
        // on "Choose a working area…". Trusting the parameter instead would
        // let a hand-typed URL put an id on screen that the requester's own
        // sandbox list does not contain, which is a surface answering "does
        // this exist" for something it was never shown.
        if (launchedFrom !== null && res.items.some((sandbox) => sandbox.id === launchedFrom)) {
          setDestination(launchedFrom);
        }
      })
      .catch(() => setDestinations([]));
    // T-406 — the guides this project has loaded. A failed read is NOT an empty
    // list: rendering "no style guide is loaded" off a request that did not
    // answer is a claim about this project we cannot make, so `null` stays null
    // and the control says it could not read them.
    void api
      .styleGuides(projectId)
      .then((res) => setStyleGuides(res.items.filter((guide) => guide.retiredAt === null)))
      .catch(() => setStyleGuides(null));
    // T-407 — the starting outlines. An empty list is survivable: composing
    // from nothing is the primary path, and a deployment with no templates
    // simply offers no shortcut.
    void api
      .startingOutlines(projectId)
      .then((res) => setOutlines(res.items))
      .catch(() => setOutlines([]));
  }, [projectId, launchedFrom]);

  /** Any change to the answers discards the plan — a plan is about the inputs it was computed from. */
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPlan(null);
    setResult(null);
    setError(null);
  };

  const ready =
    brief.trim() !== '' &&
    title.trim() !== '' &&
    destination !== '' &&
    // T-407 — an outline with no sections is not a document, and a section with
    // no heading or no purpose is not a section. Refused here AND at the API,
    // because the server may never trust a surface.
    //
    // T-412 — **a half-typed sub-section blocks the plan exactly as a
    // half-typed section does**, and `flattenOutline` is what makes that one
    // rule rather than two: an unnamed part at either depth is a heading the
    // document has no way to carry.
    sections.length > 0 &&
    flattenOutline(sections).every(
      (entry) => entry.heading.trim() !== '' && entry.purpose.trim() !== '',
    );

  const body = () => ({
    sections: sections.map((section) => ({
      heading: section.heading.trim(),
      purpose: section.purpose.trim(),
      // ⚠ **THE CORRECTED DESCRIPTION TRAVELS WITH THE RUN.** This mapping
      // dropped `brief` when it was written (T-407, before briefs existed) and
      // kept dropping it after T-408 added them, because the plan path passes
      // its own sections and only the RUN path goes through here. So the plan
      // showed a correction and the draft would have been written without it —
      // found by T-404's audit, fixed here rather than left for a later ticket.
      ...(section.brief !== undefined && { brief: section.brief.trim() }),
      // T-412 — and the sub-sections travel with it, for the very same reason:
      // an outline the plan drew and the run did not receive is the defect
      // above, one level down.
      ...(section.subSections !== undefined &&
        section.subSections.length > 0 && {
          subSections: section.subSections.map((sub) => ({
            heading: sub.heading.trim(),
            purpose: sub.purpose.trim(),
            ...(sub.brief !== undefined && { brief: sub.brief.trim() }),
          })),
        }),
    })),
    brief: brief.trim(),
    purpose,
    language,
    documentType,
    styleGuideIds,
    sourceVersionIds: sources,
    destinationSandboxId: destination,
    title: title.trim(),
  });

  /**
   * T-414 — save the outline as it stands, then re-read the menu.
   *
   * Re-read rather than appended locally: the server computes what a firm
   * outline says about itself (its size and whose it is) and whether this
   * requester may retire it, and a surface that guessed at either would show a
   * different menu from the one the next page load gives.
   */
  const saveOutline = async (label: string) => {
    if (projectId === undefined) return;
    setError(null);
    try {
      await api.saveStartingOutline(projectId, { label, sections: body().sections });
      setOutlines((await api.startingOutlines(projectId)).items);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  /** T-414 — a curator retires one; it stops being offered and nothing already made from it moves. */
  const retireOutline = async (outlineId: string) => {
    if (projectId === undefined) return;
    setError(null);
    try {
      await api.retireStartingOutline(projectId, outlineId);
      setOutlines((await api.startingOutlines(projectId)).items);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const seePlan = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .documentCreationPlan(projectId, body())
      .then((res) => setPlan(res.plan))
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  /**
   * T-408 (ADR-0053 addendum A2) — correcting one section's description.
   *
   * 🔒 **WHAT CHANGES IS A PARAMETER.** The brief goes onto the section, the
   * plan is asked for again, and the step list underneath is recomputed in
   * code from the new inputs. Nothing here edits a plan, and there is no code
   * path that could. That is what keeps the run `declared` and §12 closed.
   *
   * Every OTHER answer survives — the launch-keeps-its-state rule (ADR-0053
   * §1), one step deeper — so correcting one description does not cost the
   * author the outline they built.
   */
  const editBrief = (index: number, brief: string) => {
    // T-412 — the index is a position in the FLATTENED outline, because that is
    // what the plan's proposed document lists. `withBriefAt` is the one door
    // into a brief at either depth, so an agent revision (T-409) and a typed
    // correction still cannot produce two different plans.
    const next = withBriefAt(sections, index, brief.trim() || undefined);
    setSections(next);
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .documentCreationPlan(projectId, { ...body(), sections: next })
      .then((res) => setPlan(res.plan))
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  /**
   * T-409 — the agent's revision of one section's description.
   *
   * 🔒 It goes through **`editBrief`** — the very function a typed correction
   * uses. That is the ticket's own guarantee made structural rather than
   * remembered: there is one door into a brief, so the step list after an agent
   * tweak cannot differ from the step list after the same edit made by hand.
   *
   * Returns the agent's follow-up question where it asked one instead of
   * acting, so the pane can put it in front of the author rather than swallow
   * it.
   */
  const askAgent = async (index: number, ask: string): Promise<string | null> => {
    // T-412 — flattened, like the plan's own list: the agent pane opens on the
    // entry whose chip was pressed, at either depth
    const section = flattenOutline(sections)[index];
    const proposed = plan?.proposal?.sections[index];
    if (projectId === undefined || section === undefined || proposed === undefined) return null;
    setBusy(true);
    setError(null);
    try {
      const revision = await api.reviseSectionBrief(projectId, {
        heading: section.heading,
        purpose: section.purpose,
        brief: proposed.brief,
        ask,
      });
      if (revision.brief !== null) editBrief(index, revision.brief);
      return revision.followUp;
    } catch (problem) {
      setError((problem as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .documentCreationRun(projectId, body())
      .then(setResult)
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="content">
      <h1 className="page">Document creator</h1>
      <p className="page-sub">
        Say what kind of document this is, what language it should be in, which style guides apply
        and whether it is a whole document, a chapter or a section — then pick the library documents
        it may draw on. The sources are chosen before anything is drafted, so the result can be
        checked against what you asked for.
      </p>

      {/* T-406 (ADR-0053 addendum A1) — FOUR PLAIN QUESTIONS, NOT A "SHAPE".
          The word is retired: it named one control that picked one of two
          templates, and it told an author nothing about what they were being
          asked. Each control carries the chosen option's own sentence beneath
          it, so the answer explains itself rather than being a term of art. */}
      <Card>
        <span className="card-title">What this document is</span>
        <div className="card-stack">
        <Field label="What kind of document is this?">
          <SelectInput
            value={purpose}
            onChange={change((value: string) => setPurpose(value as DocumentPurpose))}
            options={DOCUMENT_PURPOSE_CATALOGUE.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <ChosenNote catalogue={DOCUMENT_PURPOSE_CATALOGUE} value={purpose} />
        </Field>
        <Field label="What language should it be written in?">
          <SelectInput
            value={language}
            onChange={change((value: string) => setLanguage(value as DocumentLanguage))}
            options={DOCUMENT_LANGUAGE_CATALOGUE.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <ChosenNote catalogue={DOCUMENT_LANGUAGE_CATALOGUE} value={language} />
        </Field>
        <Field label="Which style guides apply?">
          <StyleGuidePicker
            guides={styleGuides}
            selected={styleGuideIds}
            onToggle={(id) =>
              change(setStyleGuideIds)(
                styleGuideIds.includes(id)
                  ? styleGuideIds.filter((other) => other !== id)
                  : [...styleGuideIds, id],
              )
            }
          />
        </Field>
        <Field label="Is this a whole document, a chapter or a section?">
          <SelectInput
            value={documentType}
            onChange={change((value: string) => setDocumentType(value as DocumentType))}
            options={DOCUMENT_TYPE_CATALOGUE.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <ChosenNote catalogue={DOCUMENT_TYPE_CATALOGUE} value={documentType} />
        </Field>
        </div>
      </Card>

      {/* T-407 (ADR-0053 addendum A1) — THE OUTLINE IS COMPOSED, not chosen. */}
      <SectionComposer
        sections={sections}
        outlines={outlines}
        onChange={change(setSections)}
        onSave={saveOutline}
        onRetire={retireOutline}
      />

      <Card>
        <span className="card-title">The brief, and where it goes</span>
        <div className="card-stack">
          <Field label="What is this document for?">
            <TextArea value={brief} onChange={change(setBrief)} rows={3} />
          </Field>
          <Field label="Title">
            <TextInput value={title} onChange={change(setTitle)} />
          </Field>
          <Field label="Where it goes">
            <SelectInput
              value={destination}
              onChange={change(setDestination)}
              options={[
                { value: '', label: 'Choose a working area…' },
                ...destinations.map((sandbox) => ({ value: sandbox.id, label: sandbox.name })),
              ]}
            />
            {/* T-413 — said out loud when the answer was filled in for you.
                A pre-filled control the user did not set, and is not told
                about, is one they read as their own choice. */}
            {launchedFrom !== null && destination === launchedFrom && (
              <p className="field-hint">
                Set from the working area you started in. Change it here if the document belongs
                somewhere else.
              </p>
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <span className="card-title">Sources this draft may use</span>
        {/* The list is `grounding-scope` — the SAME pre-filter retrieval runs, so
            a document offered here is one the draft could actually have used
            (T-292). Nothing unreachable is greyed: it is absent. */}
        {scope === null || scope.sources.length === 0 ? (
          <p className="card-lede">
            Nothing in this project’s library is in scope for a grounded draft. Without at least one
            source there is nothing to draft from, and the plan will say so.
          </p>
        ) : (
          scope.sources.map((source: GroundingSource) => (
            <SourceRow
              key={source.containerId}
              source={source}
              checked={sources.includes(source.versionId)}
              onToggle={() =>
                change(setSources)(
                  sources.includes(source.versionId)
                    ? sources.filter((id) => id !== source.versionId)
                    : [...sources, source.versionId],
                )
              }
            />
          ))
        )}
      </Card>

      <div className="card-actions">
        <Button variant="primary" disabled={!ready || busy} onClick={seePlan}>
          See the plan
        </Button>
      </div>

      {error !== null && <div className="banner banner--warning">{error}</div>}

      {plan !== null && (
        <ProposedDocumentCard
          plan={plan}
          busy={busy}
          onEditBrief={editBrief}
          onAsk={askAgent}
          onAccept={run}
        />
      )}

      {result !== null && (
        <Card>
          <span className="card-title">What was made</span>
          {/* Coverage again, in the SAME SHAPE as the plan's — so the difference
              between what was promised and what happened is visible at a
              glance rather than something to go looking for (ADR-0053 §5). */}
          <p className="card-lede">
            <strong>Covered:</strong> {result.coverage}
          </p>
          {result.label.refusal !== null ? (
            <div className="banner banner--warning">
              Nothing was written. This draft would draw on material {result.label.computed}, and the
              working area you chose is {result.label.destination} — writing it there would widen who
              can read it. {result.label.refusal}
            </div>
          ) : (
            <p>
              <Link to={`/projects/${projectId}/editor/${result.documentId}`}>
                Open the document
              </Link>
            </p>
          )}
          {result.unreachableSources.length > 0 && (
            <p className="card-lede">
              {result.unreachableSources.length} source
              {result.unreachableSources.length === 1 ? '' : 's'} you named returned nothing from the
              library — either out of reach, or nothing in them matched the brief.
            </p>
          )}
          {result.withheld.length > 0 && (
            <p className="card-lede">
              {result.withheld.length} sentence{result.withheld.length === 1 ? '' : 's'} rested on no
              source and {result.withheld.length === 1 ? 'was' : 'were'} not written.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

// ── T-336 — THE QA CHECKER'S LAUNCHER ───────────────────────────────────────
//
// *In plain terms: pick a draft, pick how hard to look, see exactly what will
// run and roughly what it will cost, then run it. Afterwards the same sentence
// comes back with what actually happened in it, beside what was found.*
//
// 🔒 **THE LAUNCH KEEPS ITS STATE** (ADR-0053 §1). Pick the document, pick the
// checks and their settings, see the plan, then **step back and change one
// thing without re-entering the rest**. That is the pattern T-334/T-335 set for
// the creator and it is not re-invented here: the form's answers survive the
// plan being shown, and changing any of them discards the plan rather than the
// answers.
//
// 🔒 **THE PLAN IS RENDERED AND NOT EDITABLE** (ADR-0053 §4, §12). The user
// shapes it by changing **parameters** and the plan regenerates. Hand-editing a
// step list would make the plan `model_chosen` by T-267's own correct rule, and
// for a tool sold on *same inputs, same steps, same order* that is the
// guarantee a user should not be able to switch off in passing.
//
// 🔒 **TWO DOCUMENT-SELECTION AFFORDANCES, NAMED DIFFERENTLY BECAUSE THEY ARE
// TWO GUARANTEES** (ADR-0053 §3). *Check against library documents* cites
// normally, resolves to a locator and carries currency; *attach a document*
// never grounds and is never cited. Attaching a library document silently
// yields the strictly worse result, so the copy says which you get.

/**
 * 🔒 **TWO DOCUMENT-SELECTION AFFORDANCES, NAMED DIFFERENTLY BECAUSE THEY ARE
 * TWO GUARANTEES** (ADR-0053 §3) — and the copy has to say which one you get.
 *
 * Attaching a *library* document silently yields the strictly worse result — no
 * citation, no locator, no currency — and a user choosing *"select a document
 * to check against"* would have no way to know they took the weak path. Pure
 * components so both sentences can be pinned in a test: a sentence that cannot
 * be rendered in a test is a sentence nobody is checking (T-395).
 */
export function LibraryScopeCopy() {
  return (
    <p style={{ color: 'var(--text-muted)' }}>
      {/* the DEFAULT is the whole access-resolved library, and saying so is the
          difference between "everything you can see" and "nothing" */}
      By default the whole library you can reach. Narrow it here if you want. Findings from these{' '}
      <strong>cite normally</strong> — they resolve to a place in a source document.
    </p>
  );
}

export function AttachedCopy() {
  return (
    <p style={{ color: 'var(--text-muted)' }}>
      One of your own drafts, or a file you upload here, read as background. Findings from an
      attached document are <strong>never cited</strong> — they quote an excerpt instead of
      resolving to a source. If you want citations, scope to the library document above instead.
    </p>
  );
}

// ── T-416 — THE TWO SEARCHES (ADR-0053 §8) ──────────────────────────────────
//
// *In plain terms: both places where you pick documents for a check now have a
// search box, and the results show titles rather than only coded references.*
//
// 🔒 **ASSEMBLED, NOT FILTERED — AND A SEARCH IS EXACTLY WHERE THAT RULE GETS
// BROKEN.** The temptation a search box creates is to ask the server "find me
// documents matching X" and then hide the ones the requester may not reach on
// the way out, which discloses that they exist by the shape of what comes back.
// Neither search here does that, and neither *can*: both are a filter over a
// list that was **already access-resolved server-side** — the grounding scope
// (`GET /projects/:id/grounding-scope`, computed from the same `liveLibraryFilter`
// both arms of the assembly gateway run) and the requester's own sandbox
// documents. **There is no wider set on this screen to narrow.** An unreachable
// document is not greyed and not ranked low; it never reached the browser.
//
// The components below take their rows as a prop and reach nothing else, which
// is what makes that assertable in a test rather than merely true today.

/** Does this row answer the query? Reference and title both, case-folded. */
export function matchesQuery(haystack: ReadonlyArray<string | null>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return haystack.some((value) => (value ?? '').toLowerCase().includes(needle));
}

/**
 * T-416 — a search box over a list already on this page.
 *
 * It states its own count rather than only filtering silently: *"3 of 24"* is
 * how a person tells a search that found little from a library that holds
 * little, and the two are very different facts about a project.
 */
export function ListSearch(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="list-search">
      <TextInput
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        aria-label={props.label}
      />
      <span className="list-search-count">
        {props.value.trim() === ''
          ? `${props.total} document${props.total === 1 ? '' : 's'}`
          : `${props.shown} of ${props.total} match`}
      </span>
    </div>
  );
}

/**
 * T-416 — the library scope, searchable, under the Accuracy check.
 *
 * **The default is stated before the search, not implied by an empty box.**
 * Leaving everything unticked means *the whole library you can reach*, which is
 * the opposite of what an empty selection usually means in a form — so the
 * screen says it in words rather than leaving a person to discover it in the
 * plan's coverage sentence afterwards.
 */
export function LibraryScopePicker(props: {
  sources: GroundingSource[] | null;
  selected: string[];
  onToggle: (versionId: string) => void;
}) {
  const [query, setQuery] = useState('');
  if (props.sources === null || props.sources.length === 0) {
    return (
      <p className="field-hint">
        Nothing in this project’s library is in scope, so this check has nothing to check against.
        The plan will say so.
      </p>
    );
  }
  const shown = props.sources.filter((source) =>
    matchesQuery([source.documentReference, source.title, source.description], query),
  );
  return (
    <>
      <LibraryScopeCopy />
      <ListSearch
        label="Search the library"
        placeholder="Search by title or reference…"
        value={query}
        onChange={setQuery}
        shown={shown.length}
        total={props.sources.length}
      />
      {shown.length === 0 ? (
        <p className="field-hint">
          Nothing in the library you can reach matches that. Clear the search to see all{' '}
          {props.sources.length}.
        </p>
      ) : (
        shown.map((source) => (
          <SourceRow
            key={source.containerId}
            source={source}
            checked={props.selected.includes(source.versionId)}
            onToggle={() => props.onToggle(source.versionId)}
          />
        ))
      )}
    </>
  );
}

/**
 * T-416 — the attach-from-working-area picker, searchable, on the same terms.
 *
 * One search behaviour across both pickers, because they are one gesture done
 * twice: two searches that matched differently would teach a person that one of
 * them was broken.
 */
export function AttachPicker(props: {
  drafts: SandboxDocument[];
  selected: string[];
  onToggle: (documentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const shown = props.drafts.filter((draft) => matchesQuery([draft.title], query));
  return (
    <>
      <ListSearch
        label="Search your working area"
        placeholder="Search your drafts by title…"
        value={query}
        onChange={setQuery}
        shown={shown.length}
        total={props.drafts.length}
      />
      {props.drafts.length === 0 ? (
        <p className="field-hint">
          You have no other drafts in this project’s working areas to attach.
        </p>
      ) : shown.length === 0 ? (
        <p className="field-hint">
          None of your drafts match that. Clear the search to see all {props.drafts.length}.
        </p>
      ) : (
        shown.map((draft) => (
          <label key={draft.id} className="attach-row">
            <input
              type="checkbox"
              checked={props.selected.includes(draft.id)}
              onChange={() => props.onToggle(draft.id)}
            />
            <span>{draft.title}</span>
          </label>
        ))
      )}
    </>
  );
}

/**
 * T-415 — ONE CHECK IN THE LIST: its tick, its name, and its own options
 * unfolding underneath when it is on.
 *
 * *In plain terms: each check gets a tick-box, and ticking it opens that
 * check's own settings beneath it.*
 *
 * 🔒 **THE OPTIONS ARE A PROPERTY OF THE CHECK, NOT OF THE RUN**, which is
 * ADR-0053 §2's own rule — it declares the grain per family precisely because
 * the five are different enough that one setting cannot serve them. A launcher
 * with a global settings block invites the next option onto it, and the shipped
 * one had already collected the corpus check's search depth that way. There is
 * no global block left to collect the next one.
 *
 * **Nothing unfolds under an unticked check**, and that is the honest form: a
 * setting for a check that will not run is a control with no effect, which is
 * worse than an absent one because it looks like it has one.
 */
export function CheckFamilyRow(props: {
  entry: CheckFamilyDescriptor;
  checked: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={props.checked ? 'check-family check-family--on' : 'check-family'}>
      <label className="check-family-head">
        <input type="checkbox" checked={props.checked} onChange={props.onToggle} />
        <span className="check-family-name">{props.entry.label}</span>
        {props.entry.execution === 'code' && <Badge tone="neutral">No AI</Badge>}
      </label>
      <p className="check-family-desc">{props.entry.description}</p>
      {props.checked && props.children !== undefined && (
        <div className="check-family-options">{props.children}</div>
      )}
    </div>
  );
}

/**
 * T-415 — what ticking **House style** will actually apply.
 *
 * *In plain terms: the style check does not let you pick rules. The project's
 * style guides and your firm's own manual bind you either way, so this says
 * which of them are loaded rather than offering a choice nobody has.*
 *
 * Three states, all three said out loud, for `StyleGuidePicker`'s reason one
 * tool along: **"none loaded"** and **"could not be read"** are different facts
 * about a project, and a check that conflated them would let a project nobody
 * had set up read exactly like one that was deliberately left plain. The firm's
 * own manual is named as always applying, because it does (ADR-0053 §3) and a
 * screen listing only the project's guides would read as though it did not.
 */
export function StyleSourcesNote(props: { guides: StyleGuideRecord[] | null }) {
  if (props.guides === null) {
    return (
      <p className="field-hint">
        This project’s style guides could not be read, so this check cannot say which rules it will
        apply. That is not the same as there being none — reload the page before running it.
      </p>
    );
  }
  return (
    <>
      <span className="field-label">Rules this check will apply</span>
      {props.guides.length === 0 ? (
        <p className="field-hint">
          No project style guide is loaded, so this check reads the draft against your firm’s own
          manual alone.
        </p>
      ) : (
        <ul className="check-style-sources">
          {props.guides.map((guide) => (
            <li key={guide.id}>
              {guide.title}{' '}
              <span className="style-guide-clauses">
                {guide.clauses} clause{guide.clauses === 1 ? '' : 's'}
              </span>
            </li>
          ))}
          <li>Your firm’s own manual, where the project’s guides are silent.</li>
        </ul>
      )}
      <p className="field-hint">
        The project’s guide wins where the two disagree; your firm’s fills the gaps.
      </p>
    </>
  );
}

/**
 * The plan, **rendered and not editable** (ADR-0053 §4, §12).
 *
 * The user shapes it by changing parameters and it regenerates; hand-editing a
 * step list would make the plan `model_chosen` by T-267's own correct rule, and
 * for a tool sold on *same inputs, same steps, same order* that is the
 * guarantee a user should not be able to switch off in passing.
 *
 * 🔒 A `caveat` is rendered **before** the run button, never after the result:
 * the very-long shape compares sections in groups, and a run that reported a
 * clean cross-section result without saying it had not looked everywhere would
 * be the silent degradation ADR-0053 §4 forbids. It degrades loudly or not at
 * all.
 */
export function CheckPlanCard(props: { plan: ToolPlan; busy: boolean; onRun: () => void }) {
  const { plan } = props;
  return (
    <Card>
      <span className="card-title">The plan</span>
      <p className="card-lede">
        This is what will run, step by step, in the order it will happen. Change an answer above to
        change it — the steps are not editable, which is what makes the run repeatable.
      </p>
      {plan.shape !== undefined && <p className="plan-shape">{plan.shape}</p>}
      {/* 🔒 T-417 — RENDERING ONLY, AND THAT IS THE WHOLE TICKET. The list
          underneath is the same list, computed in code from the same
          parameters, editable by nobody (ADR-0053 §4, §12). What changed is
          that a person reads it as a **sequence** rather than as a summary: an
          unordered list of five sentences says these things happen; a numbered
          workflow says this happens, then this. The steps already arrived in
          run order — the planner emits them in the order it will execute them
          — so nothing here sorts, and a component that sorted would be a
          second opinion about the order the run takes. */}
      <ol className="plan-workflow">
        {plan.steps.map((step, index) => (
          <li key={step.key} className="plan-workflow-step">
            <span className="plan-workflow-n">{index + 1}</span>
            <span className="plan-workflow-label">{step.label}</span>
          </li>
        ))}
      </ol>
      <p className="plan-covers">
        <strong>Covers:</strong> {plan.coverage}
      </p>
      {plan.caveats?.map((caveat) => (
        <div key={caveat} className="banner banner--warning">
          {caveat}
        </div>
      ))}
      {/* 🚫 NO PRICE HERE, AND ITS ABSENCE IS A RULING — T-410 / ADR-0053
          addendum A3, the same ruling that took it off the creator's plan.
          Per-step cost recording (§7) is unchanged; only the display retired. */}
      {plan.refusal !== null ? (
        // ADR-0053 §5 — refusal is said BEFORE any spend, and the button is
        // absent rather than offered-and-refused
        <div className="banner banner--warning">{plan.refusal}</div>
      ) : (
        <Button variant="primary" disabled={props.busy} onClick={props.onRun}>
          Run the check
        </Button>
      )}
    </Card>
  );
}

export function QaCheckerScreen() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const scope = useGroundingScope(projectId ?? '');
  const [drafts, setDrafts] = useState<SandboxDocument[]>([]);

  // ⚠ THE EDITOR ROUTE IS THIS ROUTE WITH ITS FIRST STEP PRE-FILLED. One
  // launcher, one run shape, one place the scope is stated (ADR-0053 §1) — so
  // the tool chip in the editor sets this parameter and nothing else.
  const bound = params.get('documentId');
  const [documentId, setDocumentId] = useState(bound ?? '');
  const [preset, setPreset] = useState<'full' | 'quick'>(DEFAULT_CHECK_PRESET);
  const [families, setFamilies] = useState<CheckFamily[]>([...CHECK_FAMILIES]);
  const [depth, setDepth] = useState<CorpusDepth>(DEFAULT_CORPUS_DEPTH);
  const [scopeVersionIds, setScopeVersionIds] = useState<string[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  // T-399 — files handed straight to this check. They live in the browser until
  // the request carries them, are parsed server-side for the run, and are
  // stored nowhere: leaving the page loses them, which is the design.
  const [uploads, setUploads] = useState<File[]>([]);
  // T-415 — the rules the style check will apply. `null` is "could not be
  // read", which is NOT "none loaded" — the same distinction the creator's own
  // picker keeps, and for the same reason.
  const [styleGuides, setStyleGuides] = useState<StyleGuideRecord[] | null>(null);

  const [plan, setPlan] = useState<ToolPlan | null>(null);
  const [result, setResult] = useState<QaCheckRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .sandboxDocuments(projectId)
      .then((res) => setDrafts(res.items))
      .catch(() => setDrafts([]));
    void api
      .styleGuides(projectId)
      .then((res) => setStyleGuides(res.items.filter((guide) => guide.retiredAt === null)))
      .catch(() => setStyleGuides(null));
  }, [projectId]);

  /** Any change to the answers discards the PLAN and keeps the ANSWERS. */
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPlan(null);
    setResult(null);
    setError(null);
  };

  /** A preset sets the families and the depth TOGETHER — one honest choice. */
  const choosePreset = (id: 'full' | 'quick') => {
    const chosen = CHECK_PRESETS.find((entry) => entry.id === id)!;
    setPreset(id);
    setFamilies([...chosen.families]);
    setDepth(chosen.depth);
    setPlan(null);
    setResult(null);
  };

  const toggleFamily = (family: CheckFamily) =>
    change(setFamilies)(
      families.includes(family) ? families.filter((f) => f !== family) : [...families, family],
    );

  const ready = documentId !== '' && families.length > 0;
  const body = () => ({
    sandboxDocumentId: documentId,
    families,
    depth,
    scopeVersionIds,
    attachedDocumentIds: attached,
  });

  const seePlan = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .qaCheckPlan(projectId, body(), uploads)
      .then((res) => setPlan(res.plan))
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  const run = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .qaCheckRun(projectId, body(), uploads)
      .then(setResult)
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="content">
      <h1 className="page">QA checker</h1>
      <p className="page-sub">
        Read a draft against the writing rules that bind it and the project record it rests on. You
        see the plan, and what it will cover, before anything is spent.
      </p>

      <Card>
        <Field label="Which draft">
          <SelectInput
            value={documentId}
            onChange={change(setDocumentId)}
            options={[
              { value: '', label: 'Choose a draft…' },
              ...drafts.map((draft) => ({ value: draft.id, label: draft.title })),
            ]}
          />
        </Field>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {/* a run covers ONE document (ADR-0053 §1): a set sweep produces a
              report, which the checker deliberately is not */}
          A check covers one document. Its findings are marks in that draft, not a report about
          several.
        </p>
      </Card>

      <Card>
        <span className="card-title">Which checks to run</span>
        <p className="card-lede">
          Tick a check and its own settings appear underneath it. Start from a preset if you like —
          it is a starting point, not a mode, and every part of it stays adjustable afterwards.
        </p>
        <div className="check-presets">
          {CHECK_PRESETS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={preset === entry.id ? 'primary' : 'quiet'}
              onClick={() => choosePreset(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <p className="field-hint">
          {CHECK_PRESETS.find((entry) => entry.id === preset)?.description}
        </p>

        <div className="check-families">
          {CHECK_FAMILY_CATALOGUE.map((entry) => (
            <CheckFamilyRow
              key={entry.family}
              entry={entry}
              checked={families.includes(entry.family)}
              onToggle={() => toggleFamily(entry.family)}
            >
              {/* 🔒 T-415 — THE OPTIONS BELONG TO THE CHECK, NOT TO THE RUN.
                  ADR-0053 §2 has always ruled the record's search depth a
                  property of the corpus check alone; the shipped launcher
                  rendered it as a global "How hard to look" control at the foot
                  of the card, which is a build error the owner caught by
                  reading the screen ("I thought this was only for certain
                  checks"). It now unfolds under Accuracy's own tick, which is
                  where §2 always put it, and there is no global control left
                  for a later ticket to grow options onto. */}
              {entry.family === 'corpus_accuracy' && (
                <Field label="How hard to look">
                  <SelectInput
                    value={depth}
                    onChange={(value) => change(setDepth)(value === 'quick' ? 'quick' : 'full')}
                    options={[
                      {
                        value: 'full',
                        label: 'Statement by statement (slower, catches buried figures)',
                      },
                      {
                        value: 'quick',
                        label: 'Once per section (faster, will miss a buried figure)',
                      },
                    ]}
                  />
                </Field>
              )}
              {/* T-416 — WHAT IT CHECKS AGAINST, and it is the FIRST thing
                  under Accuracy because it is the first question: the default
                  is the whole library you can reach, and narrowing is the
                  exception. It lives here rather than in a card of its own
                  because it is a property of this check and of no other —
                  §2's rule, the same one that brought the depth select in. */}
              {entry.family === 'corpus_accuracy' && (
                <div className="check-family-option">
                  <span className="field-label">What it checks against</span>
                  <LibraryScopePicker
                    sources={scope?.sources ?? null}
                    selected={scopeVersionIds}
                    onToggle={(versionId) =>
                      change(setScopeVersionIds)(
                        scopeVersionIds.includes(versionId)
                          ? scopeVersionIds.filter((id) => id !== versionId)
                          : [...scopeVersionIds, versionId],
                      )
                    }
                  />
                </div>
              )}
              {/* T-415 — ticking style says WHICH RULES will be applied. The
                  checker does not choose its style material — the project's
                  guides and the firm's own manual bind it (ADR-0053 §3) — so
                  this is a statement rather than a picker, and its three states
                  are the StyleGuidePicker's three for the same reason: "none
                  loaded" and "could not be read" are different facts about a
                  project and a check that conflated them would let a project
                  nobody had set up look like a deliberate choice. */}
              {entry.family === 'style' && <StyleSourcesNote guides={styleGuides} />}
            </CheckFamilyRow>
          ))}
        </div>
      </Card>

      {/* T-416 — the library scope moved UNDER the Accuracy check (see the
          option above), because it is a property of that check and of no
          other. A card of its own beside the check list said the opposite. */}

      <Card>
        <span className="card-title">Attach a document</span>
        <AttachedCopy />
        <AttachPicker
          drafts={drafts.filter((draft) => draft.id !== documentId)}
          selected={attached}
          onToggle={(id) =>
            change(setAttached)(
              attached.includes(id) ? attached.filter((other) => other !== id) : [...attached, id],
            )
          }
        />
        {/* T-399 — the other half ADR-0053 §3 names: a file handed straight to
            the check, without being filed in the working area first. It is read
            for this run and kept nowhere, which the copy says plainly rather
            than leaving the user to assume either way. */}
        <div style={{ marginTop: 12 }}>
          <label className="btn" style={{ display: 'inline-block', cursor: 'pointer' }}>
            Upload a file…
            <input
              type="file"
              multiple
              accept=".docx,.xlsx,.pptx,.pdf"
              style={{ display: 'none' }}
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                if (chosen.length > 0) change(setUploads)([...uploads, ...chosen]);
                // the input is cleared so the same file can be chosen again
                // after it has been removed
                event.target.value = '';
              }}
            />
          </label>
          {uploads.map((file, index) => (
            <div key={`${file.name}-${index}`} style={{ marginTop: 6 }}>
              <span className="mono">{file.name}</span>{' '}
              <Button
                onClick={() => change(setUploads)(uploads.filter((_, at) => at !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Word, Excel, PowerPoint or PDF. An uploaded file is read for this check and{' '}
          <strong>kept nowhere afterwards</strong> — the record keeps its name, size and content
          hash, never its text — so running the check again means attaching it again.
        </p>
      </Card>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" disabled={!ready || busy} onClick={seePlan}>
          See the plan
        </Button>
      </div>

      {error !== null && <div className="banner banner--warning">{error}</div>}

      {plan !== null && <CheckPlanCard plan={plan} busy={busy} onRun={run} />}

      {result !== null && (
        <Card>
          <strong>What was checked</strong>
          {/* 🔒 THE SAME SHAPE AS THE PLAN'S SENTENCE (ADR-0053 §5). This is the
              only thing distinguishing a clean result from an unexamined one,
              so it sits BESIDE the count rather than under it: "no findings"
              must always read as "no findings in what was read". */}
          <p>
            <strong>Covered:</strong> {result.coverage}
          </p>
          <p>
            {result.findings.length === 0
              ? 'No findings in what was read — the sentence above is what that claim rests on.'
              : `${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}, anchored in the draft.`}
          </p>
          <p>
            <Link to={`/projects/${projectId}/editor/${documentId}`}>
              Open the draft to work through them
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}
