// T-348 — the deliverable status page (approved mockup:
// docs/design/mockups/deliverable-status-page.html). Clicking a reference on
// the review schedule lands HERE, not in the round: everything a coordinator
// needs before opening the review on one screen — the four-state status bar
// (T-347), the people (reviewer confirmation moved here from the schedule,
// where T-133 first put it), the deliverable's metadata, and every reviewed
// version with its renditions. "Open the review" is the single primary
// action; the round tray lives one step deeper at review/:containerId/cycle.
// The transmittal & acknowledgement history card is T-350.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import type {
  AppointmentGrant,
  MeResponse,
  PlanRow,
  Rendition,
  ReviewCycle,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
  TransmittalHistoryRow,
} from '@infora/contracts';
import { X } from 'lucide-react';
import { Badge, Button, Skeleton } from '@infora/ui';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { CycleStatusBar } from '../cycle-status-bar';
import { formatDate, initialsOf, statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function DeliverableStatusScreen() {
  const { participant: me } = useOutletContext<ShellContext>();
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<PlanRow | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [draft, setDraft] = useState<SandboxDocument | null>(null);
  const [renditionsByVersion, setRenditions] = useState<Record<string, Rendition[]>>({});
  const [transmittals, setTransmittals] = useState<TransmittalHistoryRow[]>([]);
  const [orgByParticipant, setOrgByParticipant] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!containerId) return;
    try {
      const [plan, cycleRead, docs, history, roster] = await Promise.all([
        api.plan(me.projectId),
        api.cycle(containerId),
        api.sandboxDocuments(me.projectId).catch(() => ({ items: [] as SandboxDocument[] })),
        // the server applies the ADR-0035-addendum three-way distribution cut
        api.containerTransmittals(containerId).catch(() => ({ items: [] as TransmittalHistoryRow[] })),
        // the roster is visible by design — the wall hides work, never
        // presence (ADR-0033); it supplies each person's organisation
        api.participants(me.projectId).catch(() => ({ items: [] as RosterEntry[] })),
      ]);
      const planRow = plan.items.find((r) => r.containerId === containerId) ?? null;
      setRow(planRow);
      setCycle(cycleRead);
      setDraft(docs.items.find((d) => d.containerId === containerId) ?? null);
      setTransmittals(history.items);
      setOrgByParticipant(
        new Map(roster.items.map((r) => [r.participantId, r.organisationName])),
      );
      setLoaded(true);
      // renditions for every reviewed version, plus the current version when it
      // is a fresh issue outside the rounds (the accepted C revision, ADR-0041)
      const wanted = new Set<string>(cycleRead?.rounds.map((r) => r.versionId) ?? []);
      if (planRow?.currentVersion) wanted.add(planRow.currentVersion.versionId);
      const entries = await Promise.all(
        [...wanted].map(async (v) => [v, await api.renditions(v).then((r) => r.items, () => [])] as const),
      );
      setRenditions(Object.fromEntries(entries));
    } catch (error) {
      setLoadError(error instanceof RequestError ? describeApiError(errorCode(error)) : 'Could not load this deliverable.');
    }
  }, [containerId, me.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      await action();
      await reload();
    } catch (error) {
      if (error instanceof RequestError) setNotice(describeApiError(errorCode(error)));
      else throw error;
    }
  }

  if (!containerId) return null;
  if (loadError) {
    return (
      <div className="content">
        <p style={{ color: 'var(--text-muted)' }}>{loadError}</p>
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="content">
        {loaded ? (
          <p style={{ color: 'var(--text-muted)' }}>This deliverable is not on a plan you can see.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <Skeleton height={28} width="40%" />
            <Skeleton height={16} width="70%" />
            <Skeleton height={320} />
          </div>
        )}
      </div>
    );
  }

  const isOwner = me.membershipRole === 'owner';
  const myAuthor = row.authors.find((g) => g.participantId === me.participantId && g.revokedAt === null);
  const status = statusBadge(row.workItem?.status ?? row.state);
  const containerState = statusBadge(row.state);
  const liveAuthors = row.authors.filter((g) => g.revokedAt === null);
  const liveReviewers = row.reviewers.filter((g) => g.revokedAt === null);
  const newestRound = cycle ? [...cycle.rounds].sort((a, b) => a.number - b.number).at(-1) : null;

  const renditionLinks = (versionId: string) => {
    const items = renditionsByVersion[versionId] ?? [];
    if (items.length === 0) return null;
    return (
      <>
        {items.map((r, i) => (
          <span key={r.id}>
            {i > 0 && ' · '}
            <a href={`/renditions/${r.id}/file`}>{r.kind === 'pdf' ? 'PDF' : `native .${r.format}`}</a>
          </span>
        ))}
      </>
    );
  };

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page" style={{ fontFamily: 'var(--primitive-font-family-mono)' }}>
            {row.documentReference}
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {row.workItem?.title ?? 'Reference material'} · produced by {row.producingOrganisationName} ·{' '}
            <Badge tone={status.tone}>{status.label}</Badge>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {draft && myAuthor && (
            <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${me.projectId}/editor/${draft.id}`)}>
              Open the draft in the Editor
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => void navigate(`/projects/${me.projectId}/review/${containerId}/cycle`)}
          >
            Open the review
          </Button>
        </div>
      </div>

      {notice && (
        <div className="banner banner--error" style={{ marginBottom: 8 }}>
          {notice}
          <button className="modal-x" aria-label="Dismiss" onClick={() => setNotice(null)} style={{ marginLeft: 'auto' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {cycle ? (
        <CycleStatusBar
          cycle={cycle}
          onAcknowledge={
            isOwner && newestRound
              ? () => void act(() => api.acknowledgeRound(newestRound.id))
              : undefined
          }
        />
      ) : (
        <StatusCard>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Not yet promoted — the review cycle launches when the lead author promotes the first
            version from the sandbox draft.
          </div>
        </StatusCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <StatusCard label="Reviewers">
            {liveReviewers.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                No reviewers appointed yet.
              </p>
            )}
            {liveReviewers.map((g) => (
              <PersonRow key={g.id} grant={g} organisationName={orgByParticipant.get(g.participantId)}>
                {/* one badge per row: the lead's title subsumes "confirmed";
                    a proposed row states that plus the owner's act */}
                {g.confirmedAt !== null ? (
                  g.isLead ? (
                    <Badge tone="neutral">Lead reviewer</Badge>
                  ) : (
                    <Badge tone="success">Confirmed</Badge>
                  )
                ) : (
                  <>
                    {g.isLead && <Badge tone="neutral">Lead reviewer</Badge>}
                    <Badge tone="warning">Proposed</Badge>
                    {/* confirmation is the owner's act, and access follows
                        confirmation, never proposal (ADR-0033, T-133) */}
                    {isOwner && (
                      <Button size="sm" variant="quiet" onClick={() => void act(() => api.confirmReviewer(g.id))}>
                        Confirm
                      </Button>
                    )}
                  </>
                )}
              </PersonRow>
            ))}
        </StatusCard>

        <StatusCard label="Authors">
            {liveAuthors.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                No authors appointed yet.
              </p>
            )}
            {liveAuthors.map((g) => (
              <PersonRow key={g.id} grant={g} organisationName={orgByParticipant.get(g.participantId)}>
                {g.isLead && <Badge tone="neutral">Lead author</Badge>}
              </PersonRow>
            ))}
        </StatusCard>

        <StatusCard label="Deliverable">
            <MetaRow k="Reference">
              <span style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>{row.documentReference}</span>
            </MetaRow>
            <MetaRow k="Producing organisation">{row.producingOrganisationName}</MetaRow>
            <MetaRow k="State">
              <Badge tone={containerState.tone}>{containerState.label}</Badge>
            </MetaRow>
            {row.currentVersion && (
              <MetaRow k="Current revision">
                {row.currentVersion.versionReference}
                {(() => {
                  // the revision with its context, per the mockup: which round
                  // holds it, or that it is the accepted contractual issue
                  const inRound = cycle?.rounds.find((r) => r.versionId === row.currentVersion!.versionId);
                  if (inRound) return ` — round ${inRound.number} ${statusBadge(inRound.state).label.toLowerCase()}`;
                  if (cycle?.state === 'accepted' && row.currentVersion!.versionReference.startsWith('C'))
                    return ' — issued on acceptance';
                  return '';
                })()}
              </MetaRow>
            )}
            {row.deliverableCode && (
              <MetaRow k="Verdict">{`${row.deliverableCode.code} — ${row.deliverableCode.description}`}</MetaRow>
            )}
            {row.documentOwner && <MetaRow k="Document owner">{row.documentOwner.name}</MetaRow>}
        </StatusCard>

        <StatusCard label="Documents">
            {!cycle && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                No versions yet — nothing has been promoted.
              </p>
            )}
            {cycle &&
              [...cycle.rounds]
                .sort((a, b) => b.number - a.number)
                .map((r) => (
                  <MetaRow key={r.id} k={r.versionReference}>
                    Round {r.number} — {statusBadge(r.state).label.toLowerCase()}
                    {renditionsByVersion[r.versionId]?.length ? <> · {renditionLinks(r.versionId)}</> : null}
                  </MetaRow>
                ))}
            {row.currentVersion &&
              cycle &&
              !cycle.rounds.some((r) => r.versionId === row.currentVersion!.versionId) && (
                <MetaRow k={row.currentVersion.versionReference}>
                  Issued {formatDate(row.currentVersion.createdAt)} — current
                  {renditionsByVersion[row.currentVersion.versionId]?.length ? (
                    <> · {renditionLinks(row.currentVersion.versionId)}</>
                  ) : null}
                </MetaRow>
              )}
        </StatusCard>

        {/* T-350 — the transmittal & acknowledgement history. The rows arrive
            already cut three ways by the server (ADR-0035 addendum): the owner
            sees every recipient organisation and its acknowledgement state; a
            receiving organisation only its own rows; the producing
            organisation sees that issues occurred, recipients withheld. */}
        {transmittals.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <StatusCard label="Transmittals and acknowledgements">
                <table style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Kind</th>
                      <th>Version</th>
                      <th>Issued by</th>
                      <th>Recipient</th>
                      <th>Acknowledgement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transmittals.map((t) => (
                      <TransmittalRow key={t.id} row={t} />
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.4 }}>
                  {isOwner
                    ? 'The full distribution record — every recipient organisation and its acknowledgement state.'
                    : 'Your organisation’s view of the record; the owner holds the full distribution list.'}
                </p>
            </StatusCard>
          </div>
        )}
      </div>
    </div>
  );
}

/** A card on the status page: the design system's nested-card treatment
 * exactly as the approved mockup renders it (owner-ruled 2026-08-06, after a
 * pane-elevation experiment was reverted), with a tight in-card label
 * (`.section-label`'s own 34px top margin is page rhythm, wrong inside a
 * card). */
function StatusCard(props: { label?: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {props.label && (
        <div className="section-label" style={{ margin: '0 0 8px' }}>
          {props.label}
        </div>
      )}
      {props.children}
    </div>
  );
}

function TransmittalRow({ row }: { row: TransmittalHistoryRow }) {
  const kindLabel =
    row.kind === 'review'
      ? row.direction === 'return'
        ? 'Review — submitted'
        : 'Review — issued'
      : (row.purposeCode ?? 'Issued to organisation');
  const recipientLabel =
    row.kind === 'review' ? (row.direction === 'return' ? 'Review group' : 'Authoring team') : null;
  const ackCell = (() => {
    if (row.kind === 'review') {
      if (row.direction !== 'return') return <Badge tone="neutral">Not required</Badge>;
      if (row.submissionAcknowledged) {
        // "for <organisation>" is the audit fact — on whose behalf (ADR-0051)
        return (
          <Badge tone="success">
            Acknowledged — {row.submissionAcknowledged.by.name} for{' '}
            {row.submissionAcknowledged.by.organisationName}, {formatDate(row.submissionAcknowledged.at)}
          </Badge>
        );
      }
      // pre-gate history: a round that advanced without a recorded receipt
      // (before migration 0040) is a dash, never a false "awaiting"
      return row.roundState === 'submitted' ? <Badge tone="warning">Awaiting acknowledgement</Badge> : <>—</>;
    }
    return null;
  })();

  if (row.kind === 'review' || row.recipientsWithheld) {
    return (
      <tr>
        <td>{formatDate(row.issuedAt)}</td>
        <td>{kindLabel}</td>
        <td style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>{row.versionReference ?? '—'}</td>
        <td>{row.sender.name}</td>
        <td style={row.recipientsWithheld ? { color: 'var(--text-muted)' } : undefined}>
          {row.recipientsWithheld ? 'Withheld — the owner’s distribution record' : recipientLabel}
        </td>
        <td>{row.recipientsWithheld ? '—' : ackCell}</td>
      </tr>
    );
  }
  // one display row per visible recipient organisation
  return (
    <>
      {row.recipientOrganisations.map((org) => (
        <tr key={`${row.id}:${org.organisationId}`}>
          <td>{formatDate(row.issuedAt)}</td>
          <td>{kindLabel}</td>
          <td style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>{row.versionReference ?? '—'}</td>
          <td>{row.sender.name}</td>
          <td>{org.organisationName}</td>
          <td>
            {org.acknowledged ? (
              <Badge tone="success">
                Acknowledged — {org.acknowledged.by.name}, {formatDate(org.acknowledged.at)}
              </Badge>
            ) : (
              <Badge tone="warning">Awaiting acknowledgement</Badge>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function PersonRow(props: {
  grant: AppointmentGrant | ReviewerGrant;
  organisationName?: string;
  children?: ReactNode;
}) {
  const { grant } = props;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: 'var(--action-primary-bg)',
          color: 'var(--action-primary-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          flex: 'none',
        }}
      >
        {initialsOf(grant.name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{grant.name}</span>
        {/* the organisation, always — a cross-organisation review group is
            the point of the page (per the approved mockup) */}
        {props.organisationName && (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
            {props.organisationName}
          </span>
        )}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{props.children}</span>
    </div>
  );
}

function MetaRow(props: { k: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '7px 0',
        fontSize: 12.5,
        borderBottom: '1px solid var(--border-subtle, var(--border-default))',
      }}
    >
      <span style={{ color: 'var(--text-muted)', flex: 'none' }}>{props.k}</span>
      <span style={{ textAlign: 'right' }}>{props.children}</span>
    </div>
  );
}
