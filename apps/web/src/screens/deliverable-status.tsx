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
import { Badge, Button, Field, Modal, SelectInput, Skeleton, TextArea } from '@infora/ui';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { CycleStatusBar } from '../cycle-status-bar';
import { useMe } from '../session';
import { contextStateBadge, formatDate, initialsOf, lifecycleBadgeOf, statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function DeliverableStatusScreen() {
  const { participant: me } = useOutletContext<ShellContext>();
  // the requester's own organisation — the internal QA staffing surface needs
  // it, and the shell context carries only the project participant (T-372)
  const account = useMe();
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<PlanRow | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [draft, setDraft] = useState<SandboxDocument | null>(null);
  const [renditionsByVersion, setRenditions] = useState<Record<string, Rendition[]>>({});
  const [transmittals, setTransmittals] = useState<TransmittalHistoryRow[]>([]);
  const [orgByParticipant, setOrgByParticipant] = useState<Map<string, string>>(new Map());
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // T-372 — the decline flow asks for a reason before anything is recorded
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);
  // whether a reviewer added from the roster is being named LEAD — only offered
  // where no live lead stands (a decline, or an internal QA round with nobody
  // appointed yet, which is T-355's named staffing residual)
  const [addAsLead, setAddAsLead] = useState(false);

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
      // T-355: a sandbox-scope (internal QA) container resolves through the
      // dedicated qa-row read — producer-org only, never on the plan
      const planRow =
        (plan.items.find((r) => r.containerId === containerId) ?? null) ||
        (await api.qaRow(containerId).catch(() => null));
      setRow(planRow);
      setCycle(cycleRead);
      setDraft(
        docs.items.find((d) => d.containerId === containerId || d.freezeContainerId === containerId) ??
          null,
      );
      setTransmittals(history.items);
      setOrgByParticipant(
        new Map(roster.items.map((r) => [r.participantId, r.organisationName])),
      );
      setRoster(roster.items.filter((r) => r.removedAt === null));
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
  // T-372 — a DECLINED appointment confers nothing. It stays on the row (the
  // refusal is why the deliverable is visibly waiting) but the person who said
  // no is not a reviewer of this deliverable any more.
  const myConfirmedReviewer = row.reviewers.some(
    (g) =>
      g.participantId === me.participantId &&
      g.revokedAt === null &&
      g.declinedAt === null &&
      g.confirmedAt !== null,
  );
  const myLeadReviewer = row.reviewers.some(
    (g) =>
      g.participantId === me.participantId &&
      g.revokedAt === null &&
      g.declinedAt === null &&
      g.confirmedAt !== null &&
      g.isLead,
  );
  // ADR-0033 addendum (T-352): the owner and the confirmed lead reviewer
  // manage the group from here; a lead-reviewer proposal is non-confirming
  // unless owner-side, and revocation is always wall-safe
  // T-355's named staffing residual, closed by T-372: the org-private internal
  // QA container has no owner in the loop and no lead to inherit the right
  // from, so its own producing organisation staffs it — which is what the
  // grant endpoint already permits at sandbox scope and no screen ever offered.
  const isInternalQa = row.documentReference === null;
  const isProducerSide = row.producingOrganisationId === account.organisationId;
  const canManageReviewers = isOwner || myLeadReviewer || (isInternalQa && isProducerSide);
  const myAuthor = row.authors.find((g) => g.participantId === me.participantId && g.revokedAt === null);
  const status = lifecycleBadgeOf(row);
  const containerState = statusBadge(row.state);
  const contextBadge = contextStateBadge(row.contextState);
  const liveAuthors = row.authors.filter((g) => g.revokedAt === null);
  const liveReviewers = row.reviewers.filter((g) => g.revokedAt === null);
  const newestRound = cycle ? [...cycle.rounds].sort((a, b) => a.number - b.number).at(-1) : null;

  // ── The appointment, from the appointee's side (T-372) ────────────────────
  // My own live lead-reviewer grant, whatever state it is in. Confirmation is
  // the owner's act and acceptance is mine, so a grant can be unconfirmed (a
  // proposal about me), confirmed-unanswered (mine to answer), accepted or
  // declined — and my row on the roster reads differently in each.
  const myLeadGrant =
    row.reviewers.find(
      (g) => g.participantId === me.participantId && g.revokedAt === null && g.isLead,
    ) ?? null;
  // owner-side appointees may accept an unconfirmed proposal, because acceptance
  // IS the confirmation for them (ADR-0033 addendum §2); everyone else waits
  const myAppointmentAnswerable =
    myLeadGrant !== null &&
    myLeadGrant.acceptedAt === null &&
    myLeadGrant.declinedAt === null &&
    (isOwner || myLeadGrant.confirmedAt !== null);
  // the deliverable's own lead, and whether anyone has taken the undertaking
  const leadGrant =
    row.reviewers.find((g) => g.revokedAt === null && g.declinedAt === null && g.isLead) ?? null;
  const declinedLead =
    row.reviewers.find((g) => g.revokedAt === null && g.declinedAt !== null && g.isLead) ?? null;
  // T-377 — a proposed lead is now an ordinary state (the promotion window's
  // swap writes one), so the two waits are distinguished: confirmation is the
  // OWNER's missing act, acceptance the APPOINTEE's — blaming the wrong party
  // sends the chaser to the wrong desk
  const awaitingConfirmation = leadGrant !== null && leadGrant.confirmedAt === null;
  const awaitingAcceptance =
    leadGrant !== null && leadGrant.confirmedAt !== null && leadGrant.acceptedAt === null;
  const awaitingALead = leadGrant === null;
  // ADR-0051 addendum via T-372: until a lead reviewer has accepted, NOBODY may
  // acknowledge — the owner's super user included, because the override covers
  // the receipt and never the undertaking
  const acknowledgementBlocked =
    !isInternalQa &&
    newestRound?.state === 'submitted' &&
    (awaitingALead || awaitingConfirmation || awaitingAcceptance);

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
            {row.documentReference ?? 'Internal QA'}{' '}
            {/* T-457 — the record lives on the document page; this screen is the review */}
            <button
              className="linklike"
              style={{ fontFamily: 'var(--primitive-font-family-sans, inherit)', fontSize: 12.5, fontWeight: 400, marginLeft: 8 }}
              onClick={() => void navigate(`/projects/${me.projectId}/documents/${containerId}`)}
            >
              Document page
            </button>
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {row.documentReference === null
              ? `${draft?.title ?? 'Working draft'} · org-private internal review — the record never crosses the wall (ADR-0032)`
              : `${row.workItem?.title ?? 'Reference material'} · produced by ${row.producingOrganisationName}`}{' '}
            · <Badge tone={status.tone}>{status.label}</Badge>
            {/* T-388 — beside the work-item status, never folded into it: one
                says where the deliverable is in its lifecycle, the other says
                whether the agent may rely on it, and a deliverable can be
                accepted and still out of reach. */}
            {contextBadge && (
              <>
                {' '}
                <Badge tone={contextBadge.tone}>{contextBadge.label}</Badge>
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {draft && myAuthor && (
            <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${me.projectId}/editor/${draft.id}`)}>
              Open the draft in the Editor
            </Button>
          )}
          {/* T-375 — the record is a place you can send someone: the chapter's
              whole review history in one table, either side. */}
          {cycle && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => void navigate(`/projects/${me.projectId}/review/${containerId}/record`)}
            >
              Review record
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
        <div className="banner banner--error banner--dismissible" style={{ marginBottom: 8 }}>
          {notice}
          <button className="modal-x" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {cycle ? (
        <CycleStatusBar
          cycle={cycle}
          onAcknowledge={
            // T-374 (ADR-0051 addendum, 2026-08-22, superseding T-351's): the
            // LEAD reviewer, or the owner organisation's SUPER USER when the
            // lead is away. Not a non-lead reviewer signing for a submission
            // they do not run, and not an owner participant who is not elevated.
            (myLeadReviewer || (isOwner && me.elevated)) && newestRound
              ? () => void act(() => api.acknowledgeRound(newestRound.id))
              : undefined
          }
          // T-372 — the receipt waits on the undertaking (ADR-0033/0051
          // addenda). Disabled rather than hidden: the act is the viewer's to
          // fire, it is simply not available yet, and the card below says why.
          acknowledgeBlockedReason={
            acknowledgementBlocked
              ? awaitingALead
                ? 'No lead reviewer stands on this deliverable'
                : awaitingConfirmation
                  ? 'The proposed lead reviewer awaits the owner organisation’s confirmation'
                  : myAppointmentAnswerable
                    ? 'Accept the lead reviewer appointment above first'
                    : 'The lead reviewer has not accepted the appointment yet'
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

      {/* T-372 (ADR-0033 addendum §2) — the undertaking. It states the DUTY,
          not the mechanism: nothing about tables or grants, because a
          professional undertaking should be readable by the person giving it.
          The plain sunken card, deliberately untinted — this is a decision
          asked of you, not a warning about a failure, and hue stays reserved
          for status (which is why the badge on your own row carries it and
          this card does not). */}
      {myAppointmentAnswerable && myLeadGrant && (
        <StatusCard>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            You have been named lead reviewer
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {`Proposed by ${myLeadGrant.grantedBy.name}`}
            {orgByParticipant.get(myLeadGrant.grantedBy.participantId)
              ? `, ${orgByParticipant.get(myLeadGrant.grantedBy.participantId)}`
              : ''}
            {` — ${formatDate(myLeadGrant.grantedAt)}`}
          </div>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
            <li>You set the authoritative deliverable code on every round.</li>
            <li>Only you close a round. No count of comments closes it.</li>
            <li>You hold the accepting code that makes this a contractual revision.</li>
            <li>You may propose and revoke reviewers on this deliverable.</li>
          </ul>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void act(() => api.acceptAppointment(myLeadGrant.id))}
            >
              Accept the appointment
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setDeclineReason('');
                setDeclining(myLeadGrant.id);
              }}
            >
              Decline
            </Button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
            {myLeadGrant.confirmedAt === null
              ? 'Accepting also confirms your access, because you are in the owner organisation.'
              : 'Your access was confirmed by the owner organisation; this is the undertaking itself.'}{' '}
            Declining asks for a reason and leaves the deliverable waiting for someone else to be
            named.
          </p>
        </StatusCard>
      )}

      {/* A decline is a STATE, not an error — it says what happened, who did
          it, and what happens next, and ends on nothing being lost. The reason
          stays inside the owner organisation: the server withholds it from
          every other reader, so this renders only what arrived. */}
      {declinedLead && (
        <StatusCard>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            The appointment was declined
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {`Declined by ${declinedLead.name}`}
            {orgByParticipant.get(declinedLead.participantId)
              ? `, ${orgByParticipant.get(declinedLead.participantId)}`
              : ''}
            {` · ${formatDate(declinedLead.declinedAt!)}`}
          </div>
          {declinedLead.declineReason && (
            <MetaRow k="Reason given">
              <span style={{ fontStyle: 'italic' }}>“{declinedLead.declineReason}”</span>
            </MetaRow>
          )}
          <MetaRow k="What happens now">
            {isProducerSide
              ? 'The submission stays with the owner organisation, unacknowledged, and no reviewer can comment. This deliverable is awaiting a lead reviewer.'
              : 'The submission stays here, unacknowledged, and no reviewer can comment until a new lead reviewer is named and accepts. The producing organisation sees that a lead reviewer is awaited — not the reason, which stays inside this organisation.'}
          </MetaRow>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
            Nothing is lost and nothing has failed. The version stays frozen and opens for review as
            soon as a lead reviewer accepts.
          </p>
        </StatusCard>
      )}

      {/* The submission card the gate explains itself in: shown exactly while
          a round is submitted, which is exactly when the acknowledgement is
          the next act and may be blocked. */}
      {cycle && newestRound?.state === 'submitted' && !isInternalQa && (
        <StatusCard label="Submission">
          <MetaRow k="Version">{newestRound.versionReference}</MetaRow>
          {(() => {
            const submitted = newestRound.transmittals.find((tr) => tr.direction === 'return');
            return submitted ? (
              <MetaRow k="Submitted">
                {formatDate(submitted.issuedAt)} · {submitted.sender.name}
              </MetaRow>
            ) : null;
          })()}
          {newestRound.reviewPeriodTarget && (
            <MetaRow k="Review period">
              {`target ${formatDate(newestRound.reviewPeriodTarget)}`}
            </MetaRow>
          )}
          <MetaRow k="Round state">Submitted, not yet open</MetaRow>
          {acknowledgementBlocked && (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
              {awaitingALead
                ? 'Nobody can acknowledge this submission until a lead reviewer has been named and has accepted — a super user of the owner organisation included.'
                : awaitingConfirmation
                  ? 'The proposed lead reviewer awaits the owner organisation’s confirmation — access begins there, and they accept the appointment for themselves after it.'
                  : 'Nobody can acknowledge this submission until the lead reviewer has accepted the appointment — a super user of the owner organisation included. If they are away, name a different lead reviewer rather than acknowledging in their place.'}
            </p>
          )}
        </StatusCard>
      )}

      {/* T-372 — the decline's reason, asked for before anything is recorded.
          It is a named person's stated refusal (personal-data.md), so the form
          says where it goes. */}
      {declining && (
        <Modal
          open
          onClose={() => setDeclining(null)}
          title="Decline the lead reviewer appointment"
          size="sm"
          footer={
            <>
              <Button variant="quiet" disabled={declineBusy} onClick={() => setDeclining(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={declineBusy || declineReason.trim() === ''}
                onClick={async () => {
                  setDeclineBusy(true);
                  await act(() => api.declineAppointment(declining, declineReason.trim()));
                  setDeclineBusy(false);
                  setDeclining(null);
                }}
              >
                Decline the appointment
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            The deliverable stays where it is and waits for a lead reviewer to be named. Nothing is
            lost — the submitted version stays frozen.
          </p>
          <Field
            label="Reason"
            hint="Recorded against the appointment and read inside this organisation only — the producing side learns that a lead reviewer is awaited, never why."
          >
            <TextArea
              value={declineReason}
              onChange={setDeclineReason}
              rows={3}
              placeholder="e.g. I am the approving officer for the land purchase on this section and should not also be the reviewer of record."
            />
          </Field>
        </Modal>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <StatusCard label="Reviewers">
            {liveReviewers.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                No reviewers appointed yet.
              </p>
            )}
            {liveReviewers.map((g) => {
              // ADR-0052 — the newest round's completion signals. The server
              // already withholds them from the authoring side while the
              // round is open; while open the group sees live state, after
              // issue only the completions stand (no stale "Reviewing").
              const completion =
                g.confirmedAt !== null
                  ? newestRound?.reviewerCompletions.find((rc) => rc.participantId === g.participantId)
                  : undefined;
              const roundOpen = newestRound?.state === 'open' && cycle?.state === 'active';
              // T-379 — when the completions were WITHHELD from this reader,
              // an empty list means "not yours to know", never "nobody has
              // finished" — so no live state is asserted from it.
              const showLiveState =
                roundOpen && (myConfirmedReviewer || isOwner) && !newestRound?.completionsWithheld;
              const isSelf = g.participantId === me.participantId;
              return (
              <PersonRow key={g.id} grant={g} organisationName={orgByParticipant.get(g.participantId)}>
                {completion ? (
                  <Badge tone="success">Review complete</Badge>
                ) : showLiveState && g.confirmedAt !== null ? (
                  <Badge tone="neutral">Reviewing</Badge>
                ) : null}
                {isSelf && myConfirmedReviewer && roundOpen && newestRound && (
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() =>
                      void act(() =>
                        completion
                          ? api.withdrawReviewComplete(newestRound.id)
                          : api.markReviewComplete(newestRound.id),
                      )
                    }
                  >
                    {completion ? 'Resume review' : 'Mark my review complete'}
                  </Button>
                )}
                {/* one badge per row: the lead's title subsumes "confirmed";
                    a proposed row states that plus the owner's act. T-372 adds
                    the third fact — the appointee's own answer, which only a
                    LEAD grant carries, because only a lead reviewer gives an
                    undertaking. Your own row reads differently from everyone
                    else's: "awaiting your acceptance", not "awaiting". */}
                {g.isLead && g.declinedAt !== null ? (
                  <Badge tone="danger">Declined</Badge>
                ) : g.confirmedAt !== null ? (
                  <>
                    {g.isLead ? (
                      <Badge tone="neutral">Lead reviewer</Badge>
                    ) : (
                      <Badge tone="success">Confirmed</Badge>
                    )}
                    {g.isLead && g.acceptedAt !== null && <Badge tone="success">Accepted</Badge>}
                    {g.isLead && g.acceptedAt === null && (
                      <Badge tone="warning">
                        {isSelf ? 'Awaiting your acceptance' : 'Awaiting acceptance'}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    {g.isLead && <Badge tone="neutral">Lead reviewer</Badge>}
                    <Badge tone="warning">Proposed</Badge>
                    {/* confirmation is the owner's act, and access follows
                        confirmation, never proposal (ADR-0033, T-133) */}
                    {isOwner && !isSelf && (
                      <Button size="sm" variant="quiet" onClick={() => void act(() => api.confirmReviewer(g.id))}>
                        Confirm
                      </Button>
                    )}
                  </>
                )}
                {/* remove, never on a standing lead's own row — a cycle cannot
                    run without its lead reviewer (ADR-0005/0008). A DECLINED
                    lead is not one, so its row is removable: that is how the
                    owner clears a refusal that has been answered by naming
                    someone else (T-372). */}
                {canManageReviewers && (!g.isLead || g.declinedAt !== null) && (
                  <Button size="sm" variant="quiet" onClick={() => void act(() => api.revokeReviewer(g.id))}>
                    Remove
                  </Button>
                )}
              </PersonRow>
              );
            })}
            {canManageReviewers && (
              <div style={{ marginTop: 10 }}>
                <SelectInput
                  value=""
                  placeholder={
                    addAsLead ? 'Name a lead reviewer from the roster…' : 'Add a reviewer from the roster…'
                  }
                  options={roster
                    .filter(
                      (r) =>
                        !liveReviewers.some(
                          (g) => g.participantId === r.participantId && g.declinedAt === null,
                        ),
                    )
                    .map((r) => ({ value: r.participantId, label: `${r.name} — ${r.organisationName}` }))}
                  onChange={(participantId) => {
                    if (participantId) {
                      void act(() => api.grantReviewer(containerId, participantId, addAsLead)).then(() =>
                        setAddAsLead(false),
                      );
                    }
                  }}
                />
                {/* Naming a LEAD is offered only where none stands — after a
                    decline, or on an internal QA container nobody has staffed
                    (T-355's residual, closed here). Swapping a live lead is the
                    promotion window's act (T-373), not this card's. */}
                {awaitingALead && (
                  <label
                    style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, margin: '8px 0 0', color: 'var(--text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={addAsLead}
                      onChange={(e) => setAddAsLead(e.target.checked)}
                    />
                    Name them lead reviewer
                    {!isInternalQa && ' — they accept the appointment themselves before the round opens'}
                  </label>
                )}
                {!isOwner && !isInternalQa && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    Your addition is a proposal — access follows the owner’s confirmation.
                  </p>
                )}
                {isInternalQa && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    An internal QA appointment confirms itself — the organisation is appointing its
                    own people and no wall is crossed. Freeze the draft again once a lead stands, and
                    the internal round opens.
                  </p>
                )}
              </div>
            )}
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
              <span style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>{row.documentReference ?? "Internal QA — no coded reference"}</span>
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
                  // T-392 — an accepted deliverable whose current revision is
                  // still the ROUND's P revision is the non-contractual case,
                  // and it must say so: rendering it as "round 2 issued" would
                  // read as still under review, and saying nothing would let the
                  // reader assume the C is simply missing.
                  if (inRound && cycle?.state === 'accepted')
                    return ` — round ${inRound.number}, retained on acceptance`;
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
            {/* T-392 (ADR-0003 as amended, ADR-0041) — an accepting code ends
                the cycle; only a CONTRACTUAL one issues the C revision, which is
                the 2021 National Annex's own S4/S5 split. The surface states
                WHICH of the two happened rather than leaving the reader to infer
                it from a revision prefix: "accepted" and "contractually issued"
                are different claims, and only the project's own scheme knows
                which its codes make. */}
            {cycle?.state === 'accepted' && row.deliverableCode && (
              <MetaRow k="On acceptance">
                {row.deliverableCode.isContractual
                  ? `Contractual — the C revision was issued from the accepted content.`
                  : `Not contractual — no C revision was issued, and the reviewed revision stands as the accepted content.`}
              </MetaRow>
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

export function TransmittalRow({ row }: { row: TransmittalHistoryRow }) {
  const kindLabel =
    row.kind === 'review'
      ? row.direction === 'return'
        ? 'Review — submitted'
        : 'Review — issued'
      : row.kind === 'external'
        ? 'Issued outside the project'
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

  // T-431 — the external kind on the same log, because "who has this been
  // issued to?" is one question. The receipt column says what actually happened
  // rather than borrowing the acknowledgement language: there IS no
  // acknowledgement to await (ADR-0055 §5), and a row reading "awaiting" would
  // claim a gate that does not exist.
  // T-436 — the first-open receipt, in the same cell as the link's expiry,
  // because both answer "what has become of it?". It is rendered for EVERY
  // external row, the recipient-withheld one included: the receipt says the
  // document was read, never who read it (ADR-0055 §5).
  const openReceipt =
    row.externalOpenedAt !== null ? (
      <Badge tone="success">Opened {formatDate(row.externalOpenedAt)}</Badge>
    ) : (
      <Badge tone="neutral">Not yet opened</Badge>
    );

  if (row.kind === 'external' && row.externalRecipient) {
    return (
      <tr>
        <td>{formatDate(row.issuedAt)}</td>
        <td>{kindLabel}</td>
        <td style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>{row.versionReference ?? '—'}</td>
        <td>{row.sender.name}</td>
        <td>
          {row.externalRecipient.name}{' '}
          <span style={{ color: 'var(--text-muted)' }}>({row.externalRecipient.email})</span>
        </td>
        <td>
          {openReceipt}{' '}
          <Badge tone="neutral">Link expires {formatDate(row.externalRecipient.expiresAt)}</Badge>
        </td>
      </tr>
    );
  }

  if (row.kind === 'review' || row.recipientsWithheld) {
    return (
      <tr>
        <td>{formatDate(row.issuedAt)}</td>
        <td>{kindLabel}</td>
        <td style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>{row.versionReference ?? '—'}</td>
        <td>{row.sender.name}</td>
        <td style={row.recipientsWithheld ? { color: 'var(--text-muted)' } : undefined}>
          {row.recipientsWithheld
            ? row.kind === 'external'
              ? 'Withheld — an external recipient of the owner’s'
              : 'Withheld — the owner’s distribution record'
            : recipientLabel}
        </td>
        <td>{row.kind === 'external' ? openReceipt : row.recipientsWithheld ? '—' : ackCell}</td>
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
