// T-422 — THE KNOWLEDGE SECTION, AND ITS TWO SHELVES (ADR-0054 decision 1).
//
// *In plain terms: three stores have existed with working routes and no screen
// since T-308, T-397 and T-414 — the firm's drafting manual, the project's
// style guide, and the outlines somebody saved in the document creator. This is
// the screen. A Knowledge item appears in every project's left-hand menu and
// holds two shelves: your firm's own material, and the project's.*
//
// 🔒 **ONE SHELF, TWO DOORS.** The firm's shelf is not a copy per project. It
// also appears in the organisation's own workspace — which is what the
// workspace rail's `knowledge` placeholder becomes — and **in the workspace
// door no project material is shown at all**. Because it is one shelf, it is
// **marked as the firm's own and the same on every project** wherever it
// renders: a consultant working three schemes must not be able to believe they
// are editing a per-project copy.
//
// 🔒 **ASSEMBLED, NOT FILTERED** (T-269, principle 4). A shelf a viewer may not
// curate shows **no disabled controls**, and material they may not see is
// **absent** rather than greyed. The firm's rulebook list is org-admin's
// (T-308's tier, unchanged): a member's read of it answers as nonexistence, so
// this screen renders nothing where it got nothing, and never a locked row.
//
// **Standards and legislation are not a third shelf** (decision 1). They are
// project library reference material, which is built (T-304) and has its own
// screen; this one links to it rather than restating it.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { RulebookRecord, StartingOutline, StyleGuideRecord } from '@infora/contracts';
import { Badge, Button, Card, Field, SectionLabel, TextInput } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';

/**
 * Which door the firm's shelf is being rendered through.
 *
 * It changes **one sentence and nothing else** — see `OUTLINES_OUTSIDE_A_PROJECT`
 * — because the shelf is one shelf. Anything else that differed between the two
 * doors would be the per-project-copy confusion decision 1 exists to prevent.
 */
export type ShelfDoor = 'project' | 'workspace';

/**
 * What the firm's shelf holds, resolved.
 *
 * **A store this viewer could not read comes back `null` and renders nothing** —
 * never an empty state, which would be a claim that the firm has no manual
 * rather than that this person may not list one.
 */
export type FirmShelf = {
  rulebooks: RulebookRecord[] | null;
  /**
   * ⚠ **Reachable only through a project.** T-414 built the saved outlines on
   * the document creator's own route, so listing them runs that tool's
   * entitlement check — which has no answer outside a project. In the workspace
   * door the list is not fetched at all and the shelf says so in words, rather
   * than showing a shorter version of the same shelf and letting a reader draw
   * the wrong conclusion from it.
   */
  outlines: StartingOutline[] | null;
};

/** How the firm's shelf is labelled, in both doors, identically. */
export const FIRM_SHELF_NOTE =
  'Your firm’s own material. It is the same on every project you work on — changing it here changes it everywhere — and no other organisation on any project can see it.';

/** What the project's shelf is, and who may change it (T-397 as built). */
export const PROJECT_SHELF_NOTE =
  'The writing standards this project sets. Every organisation working on the scheme is held to them and may read them; only a super user of the owner organisation can change them.';

/** The one sentence the workspace door says and the project door does not. */
export const OUTLINES_OUTSIDE_A_PROJECT =
  'Your firm’s saved starting outlines are on this same shelf inside any project. Listing them runs the document creator’s own check, which has no answer outside a project.';

export function KnowledgeScreen() {
  const { projectId } = useParams();
  const me = useMe();
  const participant = me.participants.find((p) => p.projectId === projectId);
  const [firm, setFirm] = useState<FirmShelf>({ rulebooks: null, outlines: null });
  const [guides, setGuides] = useState<StyleGuideRecord[] | null>(null);

  useEffect(() => {
    if (projectId === undefined) return;
    // 🔒 each read stands alone and a refusal is ABSENCE: `/organisation/
    // rulebooks` answers 404 to a member (T-308's tier), and that must render
    // as a shelf without a rulebook list — not as a broken screen, and never as
    // a disabled control.
    void api
      .rulebooks()
      .then((res) => setFirm((shelf) => ({ ...shelf, rulebooks: res.items })))
      .catch(() => setFirm((shelf) => ({ ...shelf, rulebooks: null })));
    void api
      .startingOutlines(projectId)
      .then((res) =>
        setFirm((shelf) => ({
          ...shelf,
          // the firm's own, never the shipped ones: Infora's starting outlines
          // are the product's, and a shelf labelled "your firm's own" that
          // listed them would be the per-project-copy confusion in reverse
          outlines: res.items.filter((outline) => outline.origin === 'firm'),
        })),
      )
      .catch(() => setFirm((shelf) => ({ ...shelf, outlines: null })));
    void api
      .styleGuides(projectId)
      .then((res) => setGuides(res.items))
      .catch(() => setGuides(null));
  }, [projectId]);

  const mayCurate = participant?.membershipRole === 'owner' && participant.elevated === true;
  // T-456 — the firm's shelf is curated by the organisation's admin (T-308's tier)
  const reloadRulebooks = () =>
    api
      .rulebooks()
      .then((res) => setFirm((shelf) => ({ ...shelf, rulebooks: res.items })))
      .catch(() => setFirm((shelf) => ({ ...shelf, rulebooks: null })));
  const curation =
    me.orgRole === 'admin'
      ? {
          onLoad: (file: File, title: string) => api.loadRulebook(file, title).then(reloadRulebooks),
          onRetire: (id: string) => api.retireRulebook(id).then(reloadRulebooks),
        }
      : undefined;

  return (
    <div className="content">
      <h1 className="page">Knowledge</h1>
      <p className="page-sub">
        The writing material that steers drafting and checking here — your firm’s own, and this
        project’s.
      </p>
      <FirmShelfPane shelf={firm} door="project" {...(curation && { curation })} />
      <ProjectShelfPane
        guides={guides}
        mayCurate={mayCurate}
        newHref={`/projects/${projectId ?? ''}/knowledge/style-guides/new`}
        libraryHref={`/projects/${projectId ?? ''}/documents`}
      />
    </div>
  );
}

/**
 * The firm's shelf — **identical in both doors**, and labelled as one shelf.
 *
 * The label is not decoration: decision 1 requires the mark, because the whole
 * failure it guards against is somebody believing they are editing a
 * per-project copy of their own manual.
 */
/**
 * T-456 — the org admin's two doors on the firm's shelf: load a drafting
 * manual, retire one. Passed only when the viewer is an org admin (T-308's
 * tier); absent, the shelf draws no control at all, as the rule above says.
 */
export type FirmShelfCuration = {
  onLoad: (file: File, title: string) => Promise<void>;
  onRetire: (rulebookId: string) => Promise<void>;
};

export function FirmShelfPane(props: { shelf: FirmShelf; door: ShelfDoor; curation?: FirmShelfCuration }) {
  const { rulebooks, outlines } = props.shelf;
  const { curation } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <SectionLabel>Your firm’s own</SectionLabel>
      <Card>
        <Badge tone="neutral">Org-private — the same on every project</Badge>
        <p className="page-sub">{FIRM_SHELF_NOTE}</p>
        <ShelfList
          heading="Drafting manuals and playbooks"
          empty="No manual loaded. Your firm’s own rules steer the checker and fill the gaps where a project’s guide is silent."
          items={rulebooks?.map((rulebook) => ({
            key: rulebook.id,
            title: rulebook.title,
            note:
              rulebook.retiredAt === null
                ? `${countOf(rulebook.clauses, 'clause')}, ${rulebook.labelled} quotable by number · loaded by ${rulebook.loadedBy.name}`
                : `Retired · ${countOf(rulebook.clauses, 'clause')} · still resolves for findings written against it`,
            ...(curation !== undefined &&
              rulebook.retiredAt === null && {
                action: (
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={busy}
                    aria-label={`Retire ${rulebook.title}`}
                    onClick={() => {
                      setBusy(true);
                      void curation.onRetire(rulebook.id).finally(() => setBusy(false));
                    }}
                  >
                    Retire
                  </Button>
                ),
              }),
          }))}
        />
        {curation !== undefined && rulebooks !== null && (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <Field label="Load a drafting manual" hint="Word, PDF, PowerPoint or Excel. Its clauses steer the checker and the drafting tool, quoted by number where the manual numbers them, and are never cited as project fact.">
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  <TextInput value={title} onChange={setTitle} placeholder="Title (optional — the file name if left blank)" />
                </span>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => fileInput.current?.click()}>
                  {busy ? 'Loading…' : 'Choose file'}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".docx,.pdf,.pptx,.xlsx"
                  hidden
                  aria-label="Drafting manual file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setBusy(true);
                    setProblem(null);
                    void curation
                      .onLoad(file, title)
                      .then(() => setTitle(''))
                      .catch(() => setProblem('The manual could not be read. A scanned PDF, or a file in another format, cannot be loaded.'))
                      .finally(() => setBusy(false));
                  }}
                />
              </span>
            </Field>
            {problem && <span className="field-hint">{problem}</span>}
          </div>
        )}
        <ShelfList
          heading="Saved starting outlines"
          empty="Nothing saved yet. Compose an outline in the document creator and keep it for the firm."
          {...(props.door === 'workspace' && { absent: OUTLINES_OUTSIDE_A_PROJECT })}
          items={
            props.door === 'workspace'
              ? undefined
              : outlines?.map((outline) => ({
                  key: outline.id,
                  title: outline.label,
                  note: outline.description,
                }))
          }
        />
      </Card>
    </>
  );
}

/**
 * The project's shelf — every participant reads it, the owner's super user
 * curates it.
 *
 * 🔒 The **New style guide** control is rendered only where the viewer may use
 * it, and is never rendered disabled: a disabled control here would advertise a
 * curation route to a firm that has no business learning it exists (principle
 * 4, and T-397's own 404/403 split at the boundary).
 */
export function ProjectShelfPane(props: {
  guides: StyleGuideRecord[] | null;
  mayCurate: boolean;
  newHref: string;
  libraryHref: string;
}) {
  return (
    <>
      <SectionLabel>This project’s</SectionLabel>
      <Card>
        <div className="shelf-head">
          <Badge tone="info">Set by the owner organisation — binding on every firm here</Badge>
          {props.mayCurate && (
            <Link className="btn" to={props.newHref}>
              New style guide
            </Link>
          )}
        </div>
        <p className="page-sub">{PROJECT_SHELF_NOTE}</p>
        <ShelfList
          heading="Style guides"
          empty="No style guide set. Drafts follow the register the author picks and ordinary professional convention."
          items={props.guides?.map((guide) => ({
            key: guide.id,
            title: guide.title,
            note:
              guide.retiredAt === null
                ? `${countOf(guide.clauses, 'clause')}, ${guide.labelled} quotable by number · loaded by ${guide.loadedBy.name}`
                : 'Retired · still resolves for findings written against it',
            href: props.newHref.replace(/\/new$/, `/${guide.id}`),
          }))}
        />
        <p className="page-sub">
          Standards, policy and legislation are not kept here — they are received documents and live
          in the <Link to={props.libraryHref}>project library</Link>, marked as received rather than
          produced.
        </p>
      </Card>
    </>
  );
}

export type ShelfRow = { key: string; title: string; note: string; href?: string; action?: ReactNode };

/**
 * One list on a shelf. **Three states, and they are three different sentences**:
 * the rows; *nothing here yet*, which is a fact about the store; and **absent**,
 * which is a fact about this **reader** — and is why it is a separate prop
 * rather than a second empty string.
 */
export function ShelfList(props: {
  heading: string;
  empty: string;
  absent?: string;
  items?: ShelfRow[];
}) {
  return (
    <div className="shelf-list">
      <div className="shelf-list-head">{props.heading}</div>
      {props.items === undefined ? (
        props.absent === undefined ? null : (
          <p className="page-sub">{props.absent}</p>
        )
      ) : props.items.length === 0 ? (
        <p className="page-sub">{props.empty}</p>
      ) : (
        <ul className="shelf-rows">
          {props.items.map((item) => (
            <li key={item.key}>
              {item.href === undefined ? (
                <span className="shelf-row-title">{item.title}</span>
              ) : (
                <Link className="shelf-row-title" to={item.href}>
                  {item.title}
                </Link>
              )}
              <span className="shelf-row-note">{item.note}</span>
              {item.action}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const countOf = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
