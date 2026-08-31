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
import { useState } from 'react';
import type { CheckFamily, Finding, MechanicalFix } from '@infora/contracts';
import { CHECK_FAMILY_CATALOGUE } from '@infora/contracts';
import { Badge, Button, SourceChip } from '@infora/ui';

export type FindingsPanelProps = {
  findings: Finding[];
  busy: boolean;
  /** the finding the reader just clicked in the text, so the panel can open it */
  focused: { id: string; at: number } | null;
  onLocate: (finding: Finding) => void;
  onResolve: (finding: Finding, resolution: 'accepted' | 'edited' | 'dismissed', edited?: string) => void;
  onBulk: (action: 'accept' | 'dismiss', findingIds: string[]) => void;
  /** anchors that no longer match the text under them, from the last attempt */
  drifted: string[];
};

const LABELS = new Map(CHECK_FAMILY_CATALOGUE.map((entry) => [entry.family, entry.label]));
const isMechanical = (finding: Finding): finding is Finding & { fix: MechanicalFix } =>
  finding.fix?.kind === 'mechanical';

export function FindingsPanel(props: FindingsPanelProps) {
  const open = props.findings.filter((finding) => finding.status === 'open');
  const closed = props.findings.length - open.length;

  if (props.findings.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
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
    <div style={{ fontSize: 12.5 }}>
      <p style={{ color: 'var(--text-muted)' }}>
        {open.length} open {open.length === 1 ? 'finding' : 'findings'}
        {closed > 0 && `, ${closed} resolved`}. Each one points into the draft — click it to go
        there.
      </p>
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
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
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
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <a onClick={() => setUnrolled(!unrolled)} style={{ cursor: 'pointer' }}>
          <strong>{LABELS.get(props.family) ?? props.family}</strong> ({props.findings.length})
        </a>
        <span style={{ marginLeft: 'auto' }}>
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
            <div style={{ marginTop: 6 }}>
              <Button
                variant="primary"
                disabled={props.busy}
                onClick={() => props.onBulk('accept', mechanical.map((finding) => finding.id))}
              >
                Accept {mechanical.length} mechanical{' '}
                {mechanical.length === 1 ? 'correction' : 'corrections'}
              </Button>
              <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                The same substitution, applied consistently — one decision, {mechanical.length}{' '}
                {mechanical.length === 1 ? 'place' : 'places'}.
              </p>
              {mechanical.map((finding) => (
                <FindingCard key={finding.id} finding={finding} {...props} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {mechanical.length > 0 && (
                <p style={{ color: 'var(--text-muted)' }}>
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
    <div
      className={focused ? 'finding finding--focused' : 'finding'}
      style={{
        marginTop: 6,
        padding: 8,
        borderLeft: `3px solid ${finding.severity === 'required' ? 'var(--danger)' : 'var(--border-default)'}`,
        background: focused ? 'var(--surface-sunken)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {/* neither word is a verdict on the document (T-328): they describe
            what the reviewer must do about the finding */}
        <Badge tone={finding.severity === 'required' ? 'warning' : 'neutral'}>
          {finding.severity === 'required' ? 'Required' : 'Advisory'}
        </Badge>
        <a onClick={() => props.onLocate(finding)} style={{ cursor: 'pointer' }}>
          Go to it
        </a>
      </div>
      <p style={{ marginTop: 4 }}>{finding.defect}</p>
      <Evidence finding={finding} />

      {finding.proposedRevision !== undefined && (
        <div style={{ marginTop: 6 }}>
          {finding.fix?.kind === 'mechanical' ? (
            <p className="mono" style={{ fontSize: 12 }}>
              {finding.fix.summary}
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)' }}>
                Suggested wording — {finding.fix?.kind === 'rewrite' ? finding.fix.reason : 'read it before taking it'}:
              </p>
              <blockquote style={{ margin: '4px 0', paddingLeft: 8, borderLeft: '2px solid var(--border-default)' }}>
                {finding.proposedRevision.content}
              </blockquote>
            </>
          )}
          {editing === null ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
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
            <div style={{ marginTop: 4 }}>
              <textarea
                value={editing}
                rows={3}
                style={{ width: '100%' }}
                onChange={(e) => setEditing(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
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
        <div style={{ marginTop: 6 }}>
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
function Evidence(props: { finding: Finding }) {
  const { evidence } = props.finding;
  if (evidence.input === 'corpus') {
    return (
      <div style={{ marginTop: 4 }}>
        {evidence.citations.map((citation) => (
          <SourceChip key={citation.id} corpus="library">
            {'versionId' in citation.source
              ? citation.source.documentReference
              : citation.source.authorityRef}
          </SourceChip>
        ))}
      </div>
    );
  }
  if (evidence.input === 'attached') {
    return (
      <p style={{ marginTop: 4, color: 'var(--text-muted)' }}>
        From a document you attached — not a project source, so it is quoted rather than cited:{' '}
        <em>“{evidence.excerpt}”</em>
      </p>
    );
  }
  if (evidence.input === 'rulebook') {
    return (
      <blockquote className="quoted-rule" style={{ marginTop: 4 }}>
        <span className="mono">{evidence.clause}</span>{' '}
        <span style={{ color: 'var(--text-muted)' }}>
          ({evidence.scope === 'project' ? 'project style guide' : 'your firm’s rulebook'})
        </span>
        <div>“{evidence.quote}”</div>
      </blockquote>
    );
  }
  // the draft measured against itself or its own template: nothing external,
  // so nothing cited and nothing to chip
  return (
    <p style={{ marginTop: 4, color: 'var(--text-muted)' }}>Measured against {evidence.basis}.</p>
  );
}
