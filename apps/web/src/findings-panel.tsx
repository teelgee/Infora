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
import type { CheckFamily, Finding, MechanicalFix, RunReach } from '@infora/contracts';
import { CHECK_FAMILY_CATALOGUE, reachStatement } from '@infora/contracts';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Button, RuleCard, SourceChip, TextArea } from '@infora/ui';
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
};

const LABELS = new Map(CHECK_FAMILY_CATALOGUE.map((entry) => [entry.family, entry.label]));
const isMechanical = (finding: Finding): finding is Finding & { fix: MechanicalFix } =>
  finding.fix?.kind === 'mechanical';

export function FindingsPanel(props: FindingsPanelProps) {
  const open = props.findings.filter((finding) => finding.status === 'open');
  const closed = props.findings.length - open.length;

  if (props.findings.length === 0) {
    return (
      <p className="findings-empty">
        {/* ⚠ NEVER an unqualified "your document is fine". The coverage
            statement beside a run (T-336) is what says how much was read; this
            panel is only entitled to say that nothing has been recorded. */}
        No findings have been recorded against this draft. The QA checker writes them here when it
        runs, with a statement of what it covered beside them.
      </p>
    );
  }

  const families = [...new Set(open.map((finding) => finding.checkFamily))];

  return (
    <div className="findings-panel">
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
      {props.drifted.length > 0 && (
        <div className="banner banner--warning">
          {props.drifted.length} {props.drifted.length === 1 ? 'mark has' : 'marks have'} moved
          since the check ran, so nothing was written for {props.drifted.length === 1 ? 'it' : 'them'}
          . The text they pointed at has been edited — look at {props.drifted.length === 1 ? 'it' : 'them'}{' '}
          yourself rather than taking the suggestion blind.
        </div>
      )}
      {families.map((family) => (
        <CheckGroup
          key={family}
          {...props}
          family={family}
          findings={open.filter((finding) => finding.checkFamily === family)}
        />
      ))}
      {closed > 0 && (
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
      <Evidence finding={finding} onOpenSource={props.onOpenSource} />

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
  // the draft measured against itself or its own template: nothing external,
  // so nothing cited and nothing to chip
  return (
    <p className="finding-evidence finding-note">Measured against {evidence.basis}.</p>
  );
}
