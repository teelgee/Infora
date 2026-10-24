// T-311 — THE MARKED-UP EDIT, the panel half.
//
// *In plain terms: what the QA checker found, grouped by the check that found
// it. Each entry says what is wrong, where in the draft it is, and what it is
// based on. Where the AI suggests a wording change you take it, edit it, or set
// it aside — one at a time. Where a whole group is the same small correction
// made over and over, you can take the lot in one click; where they are new
// sentences the AI wrote, you cannot, and the screen says so.*
//
// **Two views of ONE set** (ADR-0053 §6, the owner's own sketch): the document
// carries the marks, this panel carries the list, and both are drawn from a
// single read.
//
// 🔒 **THE ACCEPT-ALL SITS ABOVE A GROUP'S MECHANICAL FIXES AND NO REWRITE EVER
// GETS ONE.** That layout is the ruling made visible: accepting new prose
// unread is not the same act as normalising a capital letter, and ADR-0053 §6
// puts the difference *on the screen* rather than only in an ADR. Which kind a
// fix is comes from `Finding.fix`, computed by `classifyFix` from the text
// (T-398) — never from a judgement made here, and never from the model.
//
// 🔒 **A QUOTED RULE IS NOT A SOURCE CHIP** (ADR-0048 §5). A rule steers; it
// asserts nothing about the scheme, and it does not resolve to a document. So
// it renders as a quotation with its clause address, visually unlike the
// `SourceChip` a grounded citation gets — because the distinction survives in
// the model and dies on the screen otherwise.
//
// ── T-419 — AUDITED AGAINST `docs/design/design-rules.md` (2026-09-01) ──────
//
// *In plain terms: this panel was written before the design system covered it,
// so it styled itself with numbers typed into the file. It now uses the
// system's own spacing, tones and controls, and two of its actions became
// reachable by keyboard for the first time.*
//
// The findings and their fixes are enumerated in this ticket's record. The two
// that changed how the panel LOOKS rather than how it is built:
//
//   • **the coloured left-border accent on a finding card is gone.** §E removed
//     exactly that pattern — *"a rounded container with a left-border accent"* —
//     when `.proposed` was migrated, and replaced it with the plain nested-card
//     treatment. Severity is carried by the badge, which already pairs its
//     colour with a word (§D colour-independence) and therefore says more than
//     a bar did;
//   • **the panel's own spacing is on the 4px scale**, in `styles.css`, rather
//     than inline pixel values — several of which (6px, 2px, 3px) were not on
//     the scale at all.
import { useState } from 'react';
import type {
  CheckFamily,
  Finding,
  FindingSeverity,
  GapMarker,
  Locator,
  MechanicalFix,
  RunReach,
  StaleGroundingItem,
  StaleGroundingResponse,
} from '@infora/contracts';
import { CHECK_FAMILY_CATALOGUE, reachStatement } from '@infora/contracts';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Button, Register, RuleCard, SegmentedControl, SourceChip, TextArea } from '@infora/ui';
import type { RegisterSort } from '@infora/ui';
import { cardFor } from './source-card';

export type FindingsPanelProps = {
  findings: Finding[];
  busy: boolean;
  /** the finding the reader just clicked in the text, so the panel can open it */
  focused: { id: string; at: number } | null;
  onLocate: (finding: Finding) => void;
  /** T-468 — a citation chip lands on its passage on the document page */
  onOpenSource?: (versionId: string, chunkId?: string) => void;
  onResolve: (finding: Finding, resolution: 'accepted' | 'edited' | 'dismissed', edited?: string) => void;
  onBulk: (action: 'accept' | 'dismiss', findingIds: string[]) => void;
  /** anchors that no longer match the text under them, from the last attempt */
  drifted: string[];
  /** T-470 — what the check run behind these findings read, when this reader made it */
  reach?: RunReach | null;
  /** T-474 — the stale-grounding comparison run at read time; not a saved finding */
  stale?: StaleGroundingResponse | null;
  onLocateStale?: (item: StaleGroundingItem) => void;
  /** T-475 — the gap markers standing in the text, counted live from the text itself */
  gaps?: GapMarker[];
  onLocateGap?: (gap: GapMarker) => void;
  /** T-476 — jump to the SECOND place of a two-place finding (a contradiction) */
  onLocateOther?: (finding: Finding, anchor: Locator) => void;
  /** T-476 — where the panel starts; the grouped view is the default */
  initialView?: FindingsView;
  initialSeverity?: SeverityFilter;
  initialFamily?: FamilyFilter;
};

// ── T-476 — FILTERS, COUNTS, AND THE TABLE VIEW ─────────────────────────────
//
// *In plain terms: on a long document the panel can hold forty findings. A row
// of switches at the top narrows them — "Required" alone, or one check alone —
// and each switch says how many it would leave. A second view lays the same
// findings out as a sortable table. Both views are the same findings; only the
// layout differs, and the grouped view is still where you land.*
//
// 🔒 **THE COUNTS ARE LIVE AND HONEST ABOUT EACH OTHER.** The severity counts
// are taken within the chosen check, and the check counts within the chosen
// severity, so a switch always says what clicking it would leave on screen —
// never a total that would shrink to something else the moment it was pressed.
export type FindingsView = 'grouped' | 'table';
export type SeverityFilter = 'all' | FindingSeverity;
export type FamilyFilter = 'all' | CheckFamily;

/** The findings that pass both filters. Pure, so a test can pin it. */
export function narrowFindings(
  findings: readonly Finding[],
  severity: SeverityFilter,
  family: FamilyFilter,
): Finding[] {
  return findings.filter(
    (finding) =>
      (severity === 'all' || finding.severity === severity) &&
      (family === 'all' || finding.checkFamily === family),
  );
}

/** What each switch would leave on screen, given the other filter. */
export function countFindings(
  findings: readonly Finding[],
  severity: SeverityFilter,
  family: FamilyFilter,
) {
  const withinFamily = narrowFindings(findings, 'all', family);
  const withinSeverity = narrowFindings(findings, severity, 'all');
  const byFamily = new Map<CheckFamily, number>();
  for (const finding of withinSeverity) {
    byFamily.set(finding.checkFamily, (byFamily.get(finding.checkFamily) ?? 0) + 1);
  }
  return {
    all: withinFamily.length,
    required: withinFamily.filter((finding) => finding.severity === 'required').length,
    advisory: withinFamily.filter((finding) => finding.severity === 'advisory').length,
    byFamily,
    allFamilies: withinSeverity.length,
  };
}

/** What a finding rests on, in a few words, for the table's "Rule or source" column. */
export function ruleOrSource(finding: Finding): string {
  const { evidence } = finding;
  if (evidence.input === 'rulebook') return `Clause ${evidence.clause}`;
  if (evidence.input === 'corpus') {
    const source = evidence.citations[0]?.source;
    return source === undefined
      ? 'The project record'
      : 'versionId' in source
        ? source.documentReference
        : source.authorityRef;
  }
  if (evidence.input === 'attached') return 'An attached document';
  return evidence.basis;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { required: 0, advisory: 1 };

function sortedRows(rows: readonly { finding: Finding; ref: string }[], sort: RegisterSort | null) {
  if (sort === null) return [...rows];
  const sign = sort.direction === 'asc' ? 1 : -1;
  const key = (row: { finding: Finding; ref: string }): string | number => {
    switch (sort.key) {
      case 'severity':
        return SEVERITY_RANK[row.finding.severity];
      case 'family':
        return LABELS.get(row.finding.checkFamily) ?? row.finding.checkFamily;
      case 'rule':
        return ruleOrSource(row.finding);
      case 'anchor':
        return row.finding.anchor.span.start;
      case 'state':
        return row.finding.status === 'open' ? 0 : 1;
      default:
        return Number.parseInt(row.ref.slice(1), 10);
    }
  };
  return [...rows].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    return (left < right ? -1 : left > right ? 1 : 0) * sign;
  });
}

function FindingsTable(props: FindingsPanelProps & { findings: Finding[]; refs: Map<string, string> }) {
  const [sort, setSort] = useState<RegisterSort | null>(null);
  const rows = sortedRows(
    props.findings.map((finding) => ({ finding, ref: props.refs.get(finding.id) ?? 'F?' })),
    sort,
  );
  return (
    <Register<{ finding: Finding; ref: string }>
      label="Findings"
      rows={rows}
      rowKey={(row) => row.finding.id}
      rowLabel={(row) => row.ref}
      onRowClick={(row) => props.onLocate(row.finding)}
      sort={{ value: sort, onChange: setSort }}
      empty="No findings match."
      columns={[
        { key: 'ref', label: 'Ref', sortable: true, render: (row) => row.ref },
        {
          key: 'severity',
          label: 'Severity',
          sortable: true,
          render: (row) => (
            <Badge tone={row.finding.severity === 'required' ? 'warning' : 'neutral'}>
              {row.finding.severity === 'required' ? 'Required' : 'Advisory'}
            </Badge>
          ),
        },
        {
          key: 'family',
          label: 'Check',
          sortable: true,
          render: (row) => LABELS.get(row.finding.checkFamily) ?? row.finding.checkFamily,
        },
        { key: 'rule', label: 'Rule or source', sortable: true, render: (row) => ruleOrSource(row.finding) },
        {
          key: 'anchor',
          label: 'Where',
          sortable: true,
          render: (row) => {
            const quote = row.finding.anchor.verbatim;
            return `“${quote.length > 48 ? `${quote.slice(0, 48)}…` : quote}”`;
          },
        },
        {
          key: 'state',
          label: 'State',
          sortable: true,
          render: (row) => (row.finding.status === 'open' ? 'Open' : 'Resolved'),
        },
      ]}
    />
  );
}

/**
 * T-475 — the gap markers in the draft, read from the text as it stands. Like
 * the stale list it is computed now and stored nowhere: a gap is a line of text,
 * and it clears when the line is rewritten or deleted. It counts toward the
 * promotion gate exactly as an open thread or finding does, and says so.
 */
function GapList(props: { gaps: GapMarker[]; onLocate?: (gap: GapMarker) => void }) {
  return (
    <section className="findings-gaps" aria-label="Gaps">
      <p className="findings-count">
        <strong>
          {props.gaps.length} {props.gaps.length === 1 ? 'gap' : 'gaps'}
        </strong>{' '}
        — places where the record did not support a sentence. Write what the record can support,
        or delete the line; promotion is held while one stands.
      </p>
      {props.gaps.map((gap) => (
        <button
          key={gap.start}
          type="button"
          className="gap-row"
          onClick={() => props.onLocate?.(gap)}
        >
          <span className="gap-row-label">⚠ Gap</span>
          {gap.text}
        </button>
      ))}
    </section>
  );
}

const LABELS = new Map(CHECK_FAMILY_CATALOGUE.map((entry) => [entry.family, entry.label]));
const isMechanical = (finding: Finding): finding is Finding & { fix: MechanicalFix } =>
  finding.fix?.kind === 'mechanical';

/**
 * T-474 — out-of-date sources, computed when the tab is opened. It says so
 * ("computed now, not a saved finding") because it is not one: it has no run
 * behind it, cannot be dismissed, and clears itself when the sentence is
 * edited or the source is current again. Saved findings are the checker's.
 */
function LiveStale(props: { stale: StaleGroundingResponse; onLocate?: (item: StaleGroundingItem) => void }) {
  const { stale } = props;
  return (
    <section className="findings-stale" aria-label="Out-of-date sources">
      <p className="findings-count">
        <strong>Out-of-date sources</strong> — computed now, not a saved finding.{' '}
        {stale.items.length === 0
          ? `None of the ${stale.claimsChecked} cited ${stale.claimsChecked === 1 ? 'claim rests' : 'claims rest'} on a source that has changed.`
          : `${stale.items.length} ${stale.items.length === 1 ? 'sentence rests' : 'sentences rest'} on a source that has changed.`}
      </p>
      {stale.items.map((item) => (
        <div key={`${item.citation.id}-${item.anchor.span.start}`} className="finding-card">
          <Badge tone={item.severity === 'required' ? 'warning' : 'neutral'}>
            {item.severity === 'required' ? 'Required' : 'Advisory'}
          </Badge>{' '}
          <button type="button" className="finding-locate" onClick={() => props.onLocate?.(item)}>
            {item.located ? `“${item.anchor.verbatim}”` : 'The document'}
          </button>
          <p>{item.defect}</p>
        </div>
      ))}
    </section>
  );
}

export function FindingsPanel(props: FindingsPanelProps) {
  // T-476 — hooks first, before the empty-state return below
  const [view, setView] = useState<FindingsView>(props.initialView ?? 'grouped');
  const [severity, setSeverity] = useState<SeverityFilter>(props.initialSeverity ?? 'all');
  const [family, setFamily] = useState<FamilyFilter>(props.initialFamily ?? 'all');

  const open = props.findings.filter((finding) => finding.status === 'open');
  const closed = props.findings.length - open.length;
  const live =
    props.stale !== undefined && props.stale !== null && (props.stale.items.length > 0 || props.stale.claimsChecked > 0) ? (
      <LiveStale stale={props.stale} {...(props.onLocateStale && { onLocate: props.onLocateStale })} />
    ) : null;

  const gapList =
    props.gaps !== undefined && props.gaps.length > 0 ? (
      <GapList gaps={props.gaps} {...(props.onLocateGap && { onLocate: props.onLocateGap })} />
    ) : null;

  if (props.findings.length === 0) {
    return (
      <>
        {gapList}
        {live}
      <p className="findings-empty">
        {/* ⚠ NEVER an unqualified "your document is fine". The coverage
            statement beside a run (T-336) is what says how much was read; this
            panel is only entitled to say that nothing has been recorded. */}
        No findings have been recorded against this draft. The QA checker writes them here when it
        runs, with a statement of what it covered beside them.
      </p>
      </>
    );
  }

  // the table lists every finding, resolved ones included (its State column says
  // which); the grouped view is the work list and shows what is still open
  const pool = view === 'table' ? props.findings : open;
  const counts = countFindings(pool, severity, family);
  const shown = narrowFindings(pool, severity, family);
  const families = [...new Set(shown.filter((f) => f.status === 'open').map((finding) => finding.checkFamily))];
  // a stable reference per finding, in the order the run raised them
  const refs = new Map(props.findings.map((finding, index) => [finding.id, `F${index + 1}`]));
  const familiesPresent = [...new Set(pool.map((finding) => finding.checkFamily))];
  const narrowed = severity !== 'all' || family !== 'all';

  return (
    <div className="findings-panel">
      {gapList}
      {live}
      <p className="findings-count">
        {open.length} open {open.length === 1 ? 'finding' : 'findings'}
        {closed > 0 && `, ${closed} resolved`}. Each one points into the draft — click it to go
        there.
      </p>
      {/* T-470 — what the check covered, in the one sentence every surface
          renders. It sits beside the count because "N findings" always means
          "N findings in what was read". Absent where the reader did not make
          the run: those counts were taken under the maker's visibility. */}
      {props.reach !== undefined && props.reach !== null && (
        <p className="findings-reach">{reachStatement(props.reach)}</p>
      )}
      {/* T-476 — the filter row. Every switch says how many it would leave. */}
      <div className="findings-filters">
        <SegmentedControl<SeverityFilter>
          label="Show findings by severity"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: 'all', label: `All ${counts.all}` },
            { value: 'required', label: `Required ${counts.required}` },
            { value: 'advisory', label: `Advisory ${counts.advisory}` },
          ]}
        />
        {familiesPresent.length > 1 && (
          <SegmentedControl<FamilyFilter>
            label="Show findings by check"
            value={family}
            onChange={setFamily}
            options={[
              { value: 'all', label: `All checks ${counts.allFamilies}` },
              ...familiesPresent.map((entry) => ({
                value: entry,
                label: `${LABELS.get(entry) ?? entry} ${counts.byFamily.get(entry) ?? 0}`,
              })),
            ]}
          />
        )}
        <SegmentedControl<FindingsView>
          label="How to lay the findings out"
          value={view}
          onChange={setView}
          options={[
            { value: 'grouped', label: 'Grouped' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>
      {props.drifted.length > 0 && (
        <div className="banner banner--warning">
          {props.drifted.length} {props.drifted.length === 1 ? 'mark has' : 'marks have'} moved
          since the check ran, so nothing was written for {props.drifted.length === 1 ? 'it' : 'them'}
          . The text they pointed at has been edited — look at {props.drifted.length === 1 ? 'it' : 'them'}{' '}
          yourself rather than taking the suggestion blind.
        </div>
      )}
      {narrowed && (
        <p className="findings-narrowed">
          Showing {shown.length} of {pool.length}.{' '}
          <button
            type="button"
            className="finding-locate"
            onClick={() => {
              setSeverity('all');
              setFamily('all');
            }}
          >
            Show all
          </button>
        </p>
      )}
      {shown.length === 0 && narrowed && (
        <p className="findings-empty">No findings match these filters.</p>
      )}
      {view === 'table' ? (
        shown.length > 0 && <FindingsTable {...props} findings={shown} refs={refs} />
      ) : (
        families.map((entry) => (
          <CheckGroup
            key={entry}
            {...props}
            family={entry}
            findings={shown.filter((finding) => finding.checkFamily === entry && finding.status === 'open')}
          />
        ))
      )}
      {closed > 0 && view === 'grouped' && (
        <p className="findings-resolved">
          {closed} {closed === 1 ? 'finding has' : 'findings have'} been resolved. Resolved is
          resolved either way — the promotion gate counts what is still open, not how it was
          cleared.
        </p>
      )}
    </div>
  );
}

function CheckGroup(props: FindingsPanelProps & { family: CheckFamily; findings: Finding[] }) {
  const [unrolled, setUnrolled] = useState(true);
  // 🔒 THE ORDER IS THE RULING: mechanical fixes first, under the accept-all
  // that covers exactly them; rewrites after it, each with no accept-all
  // anywhere near it.
  const mechanical = props.findings.filter(isMechanical);
  const rest = props.findings.filter((finding) => !isMechanical(finding));

  return (
    <div className="finding-group">
      <div className="finding-group-head">
        {/* T-419 — a BUTTON, not an anchor with an onClick. An `<a>` with no
            `href` is not keyboard-focusable at all, so this control could not
            be reached by keyboard and could not show a focus ring (§D). The
            chevron is the system's own collapse affordance (§B
            `component.collapseToggle`), Lucide at 2px in `currentColor` (§F.7),
            and it says which way the group is going rather than leaving the
            state to be inferred from what is below it. */}
        <button
          type="button"
          className="finding-group-toggle"
          aria-expanded={unrolled}
          onClick={() => setUnrolled(!unrolled)}
        >
          {unrolled ? (
            <ChevronDown size={13} strokeWidth={2} />
          ) : (
            <ChevronRight size={13} strokeWidth={2} />
          )}
          <strong>{LABELS.get(props.family) ?? props.family}</strong> ({props.findings.length})
        </button>
        <span className="finding-group-actions">
          {/* bulk DISMISSAL takes anything and records no reason: declining
              forty advisory findings from one rule is one professional
              judgement, not forty skipped (ADR-0053 §6) */}
          <Button
            disabled={props.busy}
            onClick={() => props.onBulk('dismiss', props.findings.map((finding) => finding.id))}
          >
            Dismiss all
          </Button>
        </span>
      </div>
      {unrolled && (
        <>
          {mechanical.length > 0 && (
            <div className="finding-mechanical">
              <Button
                variant="primary"
                disabled={props.busy}
                onClick={() => props.onBulk('accept', mechanical.map((finding) => finding.id))}
              >
                Accept {mechanical.length} mechanical{' '}
                {mechanical.length === 1 ? 'correction' : 'corrections'}
              </Button>
              <p className="finding-note">
                The same substitution, applied consistently — one decision, {mechanical.length}{' '}
                {mechanical.length === 1 ? 'place' : 'places'}.
              </p>
              {mechanical.map((finding) => (
                <FindingCard key={finding.id} finding={finding} {...props} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div className="finding-rewrites">
              {mechanical.length > 0 && (
                <p className="finding-note">
                  {/* the honest fact, on the screen rather than only in the ADR */}
                  The rest are rewritten wording, so they are read one at a time.
                </p>
              )}
              {rest.map((finding) => (
                <FindingCard key={finding.id} finding={finding} {...props} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FindingCard(props: FindingsPanelProps & { finding: Finding }) {
  const { finding } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const focused = props.focused?.id === finding.id;

  return (
    // 🔒 T-419 — NO COLOURED LEFT-BORDER ACCENT. §E removed exactly this
    // pattern when `.proposed` migrated — "a rounded container with a
    // left-border accent" — in favour of the plain nested-card treatment, and
    // this card had grown one back with a raw `var(--danger)` at that. Severity
    // is the badge's job, and the badge pairs its colour with a word, which is
    // what §D's colour-independence rule asks for and a bar cannot do.
    <div className={focused ? 'finding finding--focused' : 'finding'}>
      <div className="finding-head">
        {/* neither word is a verdict on the document (T-328): they describe
            what the reviewer must do about the finding */}
        <Badge tone={finding.severity === 'required' ? 'warning' : 'neutral'}>
          {finding.severity === 'required' ? 'Required' : 'Advisory'}
        </Badge>
        {/* T-419 — a real button, for the reason the group toggle is one */}
        <button type="button" className="finding-locate" onClick={() => props.onLocate(finding)}>
          Go to it
        </button>
      </div>
      <p className="finding-defect">{finding.defect}</p>
      <Evidence
        finding={finding}
        onOpenSource={props.onOpenSource}
        onLocate={() => props.onLocate(finding)}
        onLocateOther={
          props.onLocateOther === undefined
            ? undefined
            : (anchor) => props.onLocateOther!(finding, anchor)
        }
      />

      {finding.proposedRevision !== undefined && (
        <div className="finding-fix">
          {finding.fix?.kind === 'mechanical' ? (
            <p className="mono finding-substitution">{finding.fix.summary}</p>
          ) : (
            <>
              <p className="finding-note">
                Suggested wording — {finding.fix?.kind === 'rewrite' ? finding.fix.reason : 'read it before taking it'}:
              </p>
              {/* T-419 — on the system beside `.quoted-rule`, which sits four
                  lines up the same panel and had a class while this had three
                  inline pixel values */}
              <blockquote className="suggested-wording">
                {finding.proposedRevision.content}
              </blockquote>
            </>
          )}
          {editing === null ? (
            <div className="finding-actions">
              <Button disabled={props.busy} onClick={() => props.onResolve(finding, 'accepted')}>
                Accept
              </Button>
              <Button
                disabled={props.busy}
                onClick={() => setEditing(finding.proposedRevision!.content)}
              >
                Edit
              </Button>
              <Button disabled={props.busy} onClick={() => props.onResolve(finding, 'dismissed')}>
                Dismiss
              </Button>
            </div>
          ) : (
            <div className="finding-editing">
              {/* T-419 — the shared control, not a bare `<textarea>`. This was
                  the one editing surface in the product growing its own font,
                  its own border and its own focus behaviour. */}
              <TextArea value={editing} rows={3} onChange={setEditing} />
              <div className="finding-actions">
                <Button
                  variant="primary"
                  disabled={props.busy || editing.trim() === ''}
                  onClick={() => {
                    props.onResolve(finding, 'edited', editing);
                    setEditing(null);
                  }}
                >
                  Use my wording
                </Button>
                <Button onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {finding.proposedRevision === undefined && (
        <div className="finding-fix">
          {/* most findings are for a person to fix — there is nothing to
              accept, only the defect and the decision to act on it or not */}
          <Button disabled={props.busy} onClick={() => props.onResolve(finding, 'dismissed')}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The three treatments, rendered as three different things (ADR-0048 §7).
 *
 * 🔒 A **quoted rule** is a quotation with a clause address and is deliberately
 * NOT a `SourceChip`: a rule is an instruction to the author, it asserts
 * nothing about the scheme, and it does not resolve to a document — so a chip
 * that looked like a citation would be claiming something the finding never
 * said. An **attached** excerpt is likewise uncited (ADR-0022) and says on its
 * face that it is the user's own material. Only a **corpus** finding gets
 * chips, because only a corpus finding is grounded.
 */
function Evidence(props: {
  finding: Finding;
  onOpenSource?: ((versionId: string, chunkId?: string) => void) | undefined;
  onLocate?: (() => void) | undefined;
  onLocateOther?: ((anchor: Locator) => void) | undefined;
}) {
  const { evidence } = props.finding;
  if (evidence.input === 'corpus') {
    return (
      <div className="finding-evidence">
        {evidence.citations.map((citation) => {
          const source = citation.source;
          return (
            <SourceChip
              key={citation.id}
              // an authority reference is an authority chip, not a library one (T-468)
              corpus={'versionId' in source ? 'library' : 'authority'}
              card={cardFor(citation)}
              currency={citation.currency}
              cardLabel={`Source: ${'versionId' in source ? source.documentReference : source.authorityRef}`}
              onClick={
                props.onOpenSource !== undefined && 'versionId' in source
                  ? () => props.onOpenSource!(source.versionId, citation.chunkId)
                  : undefined
              }
            >
              {'versionId' in source ? source.documentReference : source.authorityRef}
            </SourceChip>
          );
        })}
      </div>
    );
  }
  if (evidence.input === 'attached') {
    // T-471/T-484 — the draft sits in a working area this reader is not in:
    // its title is public (the owner's ruling of 2026-10-24), its words are not
    if ('openToYou' in evidence) {
      return (
        <p className="finding-evidence finding-note">
          {evidence.label === '' ? (
            'Quoted from a document in a working area you are not in.'
          ) : (
            <>
              Quoted from “{evidence.label}” — a document in a working area you are not in.
            </>
          )}
        </p>
      );
    }
    return (
      <p className="finding-evidence finding-note">
        From a document you attached — not a project source, so it is quoted rather than cited:{' '}
        <em>“{evidence.excerpt}”</em>
      </p>
    );
  }
  if (evidence.input === 'rulebook') {
    return (
      <RuleCard clause={evidence.clause} scope={evidence.scope}>
        {evidence.quote}
      </RuleCard>
    );
  }
  // T-476 — a TWO-PLACE finding (a contradiction): both passages quoted side by
  // side, each with its own jump, because half a contradiction is not one and
  // the reader should not have to find the other end by memory
  if (evidence.otherAnchor !== undefined) {
    const other = evidence.otherAnchor;
    return (
      <div className="finding-evidence finding-pair" role="group" aria-label="The two places">
        <figure className="finding-pair-side">
          <figcaption>This place</figcaption>
          <blockquote className="suggested-wording">{props.finding.anchor.verbatim}</blockquote>
          <button type="button" className="finding-locate" onClick={props.onLocate}>
            Go to this place
          </button>
        </figure>
        <figure className="finding-pair-side">
          <figcaption>The other place — {evidence.basis}</figcaption>
          <blockquote className="suggested-wording">{other.verbatim}</blockquote>
          <button
            type="button"
            className="finding-locate"
            onClick={() => props.onLocateOther?.(other)}
          >
            Go to the other place
          </button>
        </figure>
      </div>
    );
  }
  // the draft measured against itself or its own template: nothing external,
  // so nothing cited and nothing to chip
  return (
    <p className="finding-evidence finding-note">Measured against {evidence.basis}.</p>
  );
}
