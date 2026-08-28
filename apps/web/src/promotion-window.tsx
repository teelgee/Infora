// T-373 — the promotion window (ADR-0008 addendum, 2026-08-22). Drawn first as
// docs/design/mockups/promotion-window.html and ruled there; that drawing was
// deleted when this screen was photographed into the walkthrough, which is what
// a mockup is for — the capture is the record and the reasoning is in the ADR.
//
// Promotion was one click and no form at all, which was ADR-0008's deliberate
// design: a form filled in the moment is a form filled wrong. The walk kept the
// principle and added the surface. THIS WINDOW RECONFIRMS; IT DOES NOT COMPOSE.
// That is what survives the original objection, and it is enforced by the split
// of the fields rather than by tone:
//
//   Read-only  — the plan-owned identity metadata (ADR-0038 §2) and WHICH
//                VERSION IS PROMOTING: with the QA gate on there is exactly one
//                legal source, and the window names it and who accepted it,
//                because the whole point of the gate is that the client receives
//                the version that was checked.
//   Editable   — authoring metadata (already yours to edit in the sandbox), the
//                review group INCLUDING which reviewer is lead (new — no rule
//                previously let the producing side touch is_lead), and the
//                review period from T-371.
//
// So a thoughtless confirm produces exactly the plan's state, and the
// click-through risk ADR-0008 named does not return.
//
// EVERY REVIEWER CONTROL WRITES A PROPOSAL. Confirmation stays owner-side, where
// ADR-0015's share-first invariant bites, so a producing organisation still
// cannot open the wall from this window: naming a reviewer in another
// organisation proposes them and nothing more.
//
// The reviewer edits are STAGED rather than fired on each click. Not for
// tidiness — it is what lets the window state the consequence of a lead swap
// BEFORE it is committed, which is the ruling, and it is what makes Undo mean
// "never happened" rather than "revoked, then re-proposed and now unconfirmed".
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  NamingScheme,
  NamingSchemeField,
  PlanRow,
  PromotionPreflight,
  PromotionResult,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
} from '@infora/contracts';
import { isCodeField, optionLabel } from '@infora/contracts';
import { Badge, Button, Field, Modal, SectionLabel, SelectInput, Skeleton, TextInput } from '@infora/ui';
import { api, RequestError } from './api';
import { describeApiError, errorCode } from './api-errors';
import { formatDate, initialsOf } from './screens/shared';

/** A reviewer change the window is holding, not yet written. */
type StagedRemoval = { grantId: string };
type StagedAddition = { participantId: string; name: string; organisationName: string; isLead: boolean };

export function PromotionWindow(props: {
  document: SandboxDocument;
  projectId: string;
  onClose: () => void;
  onPromoted: (result: PromotionResult) => void;
}) {
  const { document: doc } = props;
  const [row, setRow] = useState<PlanRow | null>(null);
  const [scheme, setScheme] = useState<NamingScheme | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [preflight, setPreflight] = useState<PromotionPreflight | null>(null);
  const [ownerOrganisationName, setOwnerOrganisationName] = useState('the owner organisation');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── what the window is holding, un-written ────────────────────────────────
  const [authoring, setAuthoring] = useState<Record<string, string>>({});
  const [removals, setRemovals] = useState<StagedRemoval[]>([]);
  const [additions, setAdditions] = useState<StagedAddition[]>([]);
  const [periodDays, setPeriodDays] = useState('');
  const [addingReviewer, setAddingReviewer] = useState(false);
  const [changingLead, setChangingLead] = useState(false);
  // T-332 (ADR-0049 §8) — the elevated force, and it is a deliberate act rather
  // than a property of holding the tier: an elevated lead author who has not
  // looked at the open items is stopped exactly as an ordinary one is, and then
  // decides. Reset by nothing, because the window closes on success.
  const [forcing, setForcing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [plan, schemeRead, rosterRead, pre] = await Promise.all([
        api.plan(props.projectId),
        api.namingScheme(props.projectId),
        api.participants(props.projectId),
        api.promotionPreflight(doc.id),
      ]);
      const planRow = plan.items.find((r) => r.containerId === doc.containerId) ?? null;
      setRow(planRow);
      setScheme(schemeRead);
      setRoster(rosterRead.items.filter((r) => r.removedAt === null));
      setPreflight(pre);
      setPeriodDays(String(pre.reviewPeriodDefaultDays));
      setAuthoring(
        Object.fromEntries(
          Object.entries(doc.authoringMetadata).map(([k, v]) => [k, String(v ?? '')]),
        ),
      );
    } catch (err) {
      setLoadError(
        err instanceof RequestError ? describeApiError(errorCode(err)) : 'Could not open the promotion window.',
      );
    }
  }, [doc.id, doc.authoringMetadata, props.projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // the roster carries every participant's organisation — the wall hides work,
  // never presence (ADR-0033), which is what lets the window say "sits outside
  // <org>" without any extra read
  const orgOf = useMemo(
    () => new Map(roster.map((r) => [r.participantId, r.organisationName])),
    [roster],
  );

  useEffect(() => {
    // the owner organisation, named in the copy because "access begins when X
    // confirms" is meaningless without X. Read off the current lead reviewer's
    // own project role rather than a new endpoint.
    const owner = roster.find((r) => r.membershipRole === 'owner');
    if (owner) setOwnerOrganisationName(owner.organisationName);
  }, [roster]);

  // ── the review group as this window would leave it ────────────────────────
  const liveReviewers = useMemo(
    () => (row?.reviewers ?? []).filter((g) => g.revokedAt === null && g.declinedAt === null),
    [row],
  );
  const removed = (g: ReviewerGrant) => removals.some((r) => r.grantId === g.id);
  const standingLead = liveReviewers.find((g) => g.isLead) ?? null;
  const leadIsBeingReplaced = standingLead !== null && removed(standingLead);
  const stagedLead = additions.find((a) => a.isLead) ?? null;
  const resultingReviewerCount =
    liveReviewers.filter((g) => !removed(g)).length + additions.length;
  const awaitingConfirmation =
    liveReviewers.filter((g) => !removed(g) && g.confirmedAt === null).length + additions.length;

  // ── the consequence of a lead swap, stated BEFORE it is committed ─────────
  // The system does not refuse the change — it is a legitimate act — but it
  // will not let it be made blind. The cheaper alternative is named.
  const leadSwapWarning = (() => {
    if (!stagedLead) return null;
    const outsideOwner = stagedLead.organisationName !== ownerOrganisationName;
    const keeping = standingLead ? standingLead.name : null;
    return {
      outsideOwner,
      text: outsideOwner
        ? `${stagedLead.name} sits outside ${ownerOrganisationName}, so ${ownerOrganisationName} must confirm them before they have access, and they must then accept the appointment themselves. Until both happen the submission sits with ${ownerOrganisationName} unacknowledged and no reviewer can comment.`
        : `${stagedLead.name} must accept the appointment themselves before the round opens. Until they do, the submission sits with ${ownerOrganisationName} unacknowledged and no reviewer can comment.`,
      alternative: keeping ? `Leaving ${keeping} as lead reviewer avoids the wait.` : null,
    };
  })();

  // ── the two field groups (ADR-0038 §2's split, drawn from the scheme) ─────
  const identityFields: Array<{ label: string; value: string }> = useMemo(() => {
    if (!row) return [];
    const meta = row.metadata;
    const fromScheme = (scheme?.fields ?? [])
      .filter((f) => !f.role && f.key !== 'title' && meta[f.key] !== undefined && meta[f.key] !== '')
      .map((f) => ({ label: f.label, value: String(meta[f.key]) }));
    return [
      { label: 'Reference', value: row.documentReference ?? '—' },
      { label: 'Title', value: row.workItem?.title ?? doc.title },
      ...fromScheme,
      { label: 'Producing organisation', value: row.producingOrganisationName },
    ];
  }, [row, scheme, doc.title]);

  // Authoring metadata rides along on the version and is the lead author's to
  // set. Only the scheme's non-code, non-role fields are offered — a code field
  // is plan-owned identity, and is locked above.
  const authoringFields: NamingSchemeField[] = useMemo(
    () => (scheme?.fields ?? []).filter((f) => !f.role && !isCodeField(f) && f.key !== 'title'),
    [scheme],
  );

  const targetPreview = useMemo(() => {
    const days = Number.parseInt(periodDays, 10);
    if (!Number.isFinite(days) || days < 1) return null;
    // display math only — the server computes and stores the authoritative
    // target at round creation (ADR-0005: a guide, never a timer driving state).
    // T-381: the walk MUST be in UTC, mirroring addWorkingDays exactly — a
    // local-time walk shows a different calendar day than the server will
    // store whenever the local clock and UTC disagree on what day it is.
    const at = new Date();
    let remaining = days;
    while (remaining > 0) {
      at.setUTCDate(at.getUTCDate() + 1);
      const weekday = at.getUTCDay();
      if (weekday !== 0 && weekday !== 6) remaining -= 1;
    }
    return at.toISOString();
  }, [periodDays]);

  const periodChanged =
    preflight !== null && Number.parseInt(periodDays, 10) !== preflight.reviewPeriodDefaultDays;

  // The one blocker the window itself can clear: "no lead reviewer" plus a
  // staged lead means the swap act below will create one before the promotion
  // runs. Every other blocker stays a disabled Promote (T-373/T-377).
  const promoteEnabled =
    preflight !== null &&
    (preflight.blocker === null ||
      (preflight.blocker === 'no_lead_reviewer' && stagedLead !== null) ||
      // T-332 — the second blocker the window can clear, and only for someone
      // who holds the tier AND has ticked the box. `canOverrideOpenItems` comes
      // off the server's own resolution of this requester, so the control is
      // absent rather than offered-and-refused.
      (preflight.blocker === 'open_items' && preflight.canOverrideOpenItems && forcing));

  async function promote() {
    if (!preflight || !promoteEnabled) return;
    if (leadIsBeingReplaced && !stagedLead) {
      setError('Name the replacement lead reviewer before promoting.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // T-377 — the lead swap is ONE transactional act on the server, never a
      // revoke followed by a grant: fired separately, a failure between the two
      // strands the deliverable with no lead at all. The other edits stay their
      // own audited acts, so the window still sequences rather than composes.
      for (const r of removals.filter((x) => x.grantId !== standingLead?.id)) {
        await api.revokeReviewer(r.grantId);
      }
      if (stagedLead) await api.nameLeadReviewer(doc.containerId!, stagedLead.participantId);
      for (const a of additions.filter((x) => !x.isLead)) {
        await api.grantReviewer(doc.containerId!, a.participantId, false);
      }
      await api.setSandboxMetadata(doc.id, authoring);
      const days = Number.parseInt(periodDays, 10);
      const result = await api.promoteDocument(
        doc.id,
        periodChanged && Number.isFinite(days) && days >= 1 ? days : undefined,
        // T-382 — promote exactly what this window said would promote, or refuse
        preflight.sourceVersionReference,
        preflight.blocker === 'open_items' && forcing ? true : undefined,
      );
      props.onPromoted(result);
    } catch (err) {
      setError(describeApiError(errorCode(err)));
      setBusy(false);
      // reload: some of the staged acts may have landed before the failure, and
      // a window still showing them as pending would be lying about the state
      void load();
      setRemovals([]);
      setAdditions([]);
    }
  }

  const reference = row?.documentReference ?? doc.title;

  return (
    <Modal
      open
      onClose={props.onClose}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
          Promote to review
          <span
            style={{
              fontFamily: 'var(--primitive-font-family-mono)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-muted)',
            }}
          >
            {reference}
            {preflight && preflight.roundNumber > 1 ? ` · round ${preflight.roundNumber}` : ''}
          </span>
        </span>
      }
      size="lg"
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>
            {resultingReviewerCount === 0
              ? 'No reviewers'
              : `${resultingReviewerCount} reviewer${resultingReviewerCount === 1 ? '' : 's'}${
                  awaitingConfirmation > 0
                    ? ` · ${awaitingConfirmation} awaiting confirmation`
                    : ', all confirmed'
                }`}
          </span>
          <Button variant="quiet" disabled={busy} onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !promoteEnabled}
            onClick={() => void promote()}
          >
            {busy ? 'Promoting…' : 'Promote'}
          </Button>
        </>
      }
    >
      {/* .modal-body is a grid, and a `.card` (which clips its own overflow) as
          a grid item gets squeezed rather than sized by its content in a
          height-constrained modal. One flow-root child sidesteps that: the
          window lays itself out in ordinary block flow and the body scrolls. */}
      <div style={{ display: 'flow-root' }}>
      {loadError && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{loadError}</p>}
      {!loadError && !preflight && (
        <div style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={16} width="80%" />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      )}

      {preflight && (
        <>
          {/* T-380 — a refused preflight carries no real source decision (the
              API fills source: 'head' as a placeholder), so the window must not
              assert which version promotes or whether the QA gate is on. State
              the refusal; say nothing the refusal makes unknowable. */}
          {preflight.blocker === null ? (
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 4px', color: 'var(--text-secondary)' }}>
              Promoting freezes {preflight.versionReference}
              {preflight.source === 'qa_accepted_frozen'
                ? ' from the version internal QA accepted'
                : ' from the live head'}
              , renders the PDF the review runs on, and submits it to {ownerOrganisationName}.{' '}
              <b>
                The round opens when the lead reviewer accepts the appointment and acknowledges the
                submission — not on this click.
              </b>
            </p>
          ) : (
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 4px', color: 'var(--text-secondary)' }}>
              Promotion would issue {preflight.versionReference}, but it is currently refused — the
              reason is stated below.
            </p>
          )}

          {error && <div className="banner banner--error">{error}</div>}
          {preflight.blocker && (
            <div className="banner banner--error">{describeApiError(preflight.blocker)}</div>
          )}

          {/* ── Open items (T-332, ADR-0049 §7/§8) ──────────────────────────
              Shown only when they BLOCK. A permanent "0 open items" row would
              be one more thing to stop reading, and the ruling's whole point is
              that this is a stop rather than a status. The two lists are
              counted separately although the gate treats them identically —
              they are two lists, and one total leaves the reader unable to tell
              which to go and clear — but they are never RANKED, so the surface
              never implies one matters more. */}
          {preflight.blocker === 'open_items' && (
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                What is still open
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.55, margin: '0 0 8px', color: 'var(--text-secondary)' }}>
                {[
                  preflight.openItems.threads > 0
                    ? `${preflight.openItems.threads} open comment thread${preflight.openItems.threads === 1 ? '' : 's'}`
                    : null,
                  preflight.openItems.findings.open > 0
                    ? `${preflight.openItems.findings.open} open finding${preflight.openItems.findings.open === 1 ? '' : 's'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}
                . Nothing reaches the controlled library with loose ends.
              </p>
              {preflight.canOverrideOpenItems ? (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={forcing}
                      onChange={(e) => setForcing(e.currentTarget.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      Promote anyway. <b>This is recorded against your name</b>, with what was open
                      at the time.
                    </span>
                  </label>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                    The override exists for the items that cannot be cleared — a finding against a
                    paragraph a later draft deleted, a thread whose author has left the project.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Resolve them in the editor, or ask a super user with the elevated tier.
                </p>
              )}
            </div>
          )}

          {/* ── What promotes ───────────────────────────────────────────── */}
          {preflight.blocker === null && (
            <>
              <SectionLabel>What promotes</SectionLabel>
              <div className="card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {preflight.source === 'qa_accepted_frozen'
                    ? `Source version ${preflight.sourceVersionReference ?? ''} — accepted by internal QA`
                    : 'The live head, as it stands in the sandbox'}
                </div>
                {preflight.qaAcceptedBy && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {`Accepted by ${preflight.qaAcceptedBy.name}`}
                    {orgOf.get(preflight.qaAcceptedBy.participantId)
                      ? `, ${orgOf.get(preflight.qaAcceptedBy.participantId)}`
                      : ''}
                    {preflight.qaAcceptedAt ? ` · ${formatDate(preflight.qaAcceptedAt)}` : ''}
                  </div>
                )}
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {preflight.source === 'qa_accepted_frozen'
                    ? 'The gate is on for this sandbox, so promotion takes the version QA accepted — never the head as it has drifted since.'
                    : 'The QA gate is off for this sandbox, so promotion takes the head as it stands. Nothing has assured this revision internally.'}
                </p>
              </div>
            </>
          )}

          {/* ── From the plan · locked (ADR-0038 §2) ────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <SectionLabel>From the plan</SectionLabel>
            <Badge tone="neutral">Locked</Badge>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            {identityFields.map((f) => (
              <div
                key={f.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '5px 0',
                  fontSize: 12.5,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                <span style={{ textAlign: 'right' }}>{f.value}</span>
              </div>
            ))}
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
              These belong to the plan row and cannot change here. Change them on the plan and the
              draft follows.
            </p>
          </div>

          {/* ── This revision · authoring metadata ──────────────────────── */}
          {authoringFields.length > 0 && (
            <>
              <SectionLabel>This revision</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {authoringFields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    {f.type === 'select' && f.allowedValues && f.allowedValues.length > 0 ? (
                      <SelectInput
                        value={authoring[f.key] ?? ''}
                        onChange={(v) => setAuthoring((s) => ({ ...s, [f.key]: v }))}
                        placeholder="—"
                        options={f.allowedValues.map((o) => ({
                          value: o,
                          label: optionLabel(o, f.allowedValueLabels),
                        }))}
                      />
                    ) : (
                      <TextInput
                        value={authoring[f.key] ?? ''}
                        onChange={(v) => setAuthoring((s) => ({ ...s, [f.key]: v }))}
                      />
                    )}
                  </Field>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.5 }}>
                Authoring metadata. It rides along on the version and is yours to set.
              </p>
            </>
          )}

          {/* ── Review group ────────────────────────────────────────────── */}
          <SectionLabel>Review group</SectionLabel>
          <div className="card" style={{ padding: '4px 12px 10px' }}>
            {liveReviewers.map((g) => {
              const gone = removed(g);
              return (
                <ReviewerRow
                  key={g.id}
                  name={g.name}
                  organisationName={orgOf.get(g.participantId)}
                  role={g.isLead ? 'Lead reviewer' : 'Reviewer'}
                  struck={gone}
                >
                  {gone ? (
                    <>
                      <Badge tone="danger">Removed</Badge>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => {
                          setRemovals((rs) => rs.filter((r) => r.grantId !== g.id));
                          if (g.isLead) setAdditions((as) => as.filter((a) => !a.isLead));
                        }}
                      >
                        Undo
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge tone={g.confirmedAt !== null ? 'success' : 'warning'}>
                        {g.confirmedAt !== null ? 'Confirmed' : 'Proposed'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => {
                          setRemovals((rs) => [...rs, { grantId: g.id }]);
                          if (g.isLead) setChangingLead(true);
                        }}
                      >
                        {g.isLead ? 'Change' : 'Remove'}
                      </Button>
                    </>
                  )}
                </ReviewerRow>
              );
            })}
            {additions.map((a) => (
              <ReviewerRow
                key={a.participantId}
                name={a.name}
                organisationName={a.organisationName}
                role={a.isLead ? 'Lead reviewer' : 'Reviewer'}
              >
                <Badge tone="warning">Proposed</Badge>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setAdditions((as) => as.filter((x) => x.participantId !== a.participantId))}
                >
                  Undo
                </Button>
              </ReviewerRow>
            ))}

            {/* naming a LEAD is offered exactly while one is being replaced or
                none stands — a second live lead is not a state the model has */}
            {(changingLead || leadIsBeingReplaced || standingLead === null) && !stagedLead && (
              <div style={{ marginTop: 10 }}>
                <SelectInput
                  value=""
                  placeholder="Name the lead reviewer…"
                  options={rosterOptions(roster, liveReviewers, additions)}
                  onChange={(participantId) => {
                    const person = roster.find((r) => r.participantId === participantId);
                    if (!person) return;
                    setAdditions((as) => [
                      ...as,
                      {
                        participantId,
                        name: person.name,
                        organisationName: person.organisationName,
                        isLead: true,
                      },
                    ]);
                    setChangingLead(false);
                  }}
                />
              </div>
            )}

            {addingReviewer ? (
              <div style={{ marginTop: 10 }}>
                <SelectInput
                  value=""
                  placeholder="Propose a reviewer from the roster…"
                  options={rosterOptions(roster, liveReviewers, additions)}
                  onChange={(participantId) => {
                    const person = roster.find((r) => r.participantId === participantId);
                    if (!person) return;
                    setAdditions((as) => [
                      ...as,
                      {
                        participantId,
                        name: person.name,
                        organisationName: person.organisationName,
                        isLead: false,
                      },
                    ]);
                    setAddingReviewer(false);
                  }}
                />
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <Button size="sm" variant="quiet" onClick={() => setAddingReviewer(true)}>
                  + Propose a reviewer
                </Button>
              </div>
            )}

            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Naming someone proposes them. Access begins when {ownerOrganisationName} confirms — a
              proposal on its own confers nothing.
            </p>
          </div>

          {leadSwapWarning && (
            <div className="card" style={{ padding: '10px 12px', borderLeft: '3px solid var(--feedback-warning-text, var(--text-primary))' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                {preflight.roundNumber > 1 ? `Round ${preflight.roundNumber} will wait` : 'This round will wait'}
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0, color: 'var(--text-secondary)' }}>
                {leadSwapWarning.text}
                {leadSwapWarning.alternative ? ` ${leadSwapWarning.alternative}` : ''}
              </p>
            </div>
          )}

          {/* ── Review period (T-371) ───────────────────────────────────── */}
          <SectionLabel>Review period</SectionLabel>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ width: 90 }}>
              <TextInput value={periodDays} onChange={setPeriodDays} />
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingBottom: 8 }}>
              working days
            </span>
            {targetPreview && (
              <span style={{ fontSize: 12.5, paddingBottom: 8 }}>
                Target <b>{formatDate(targetPreview)}</b>
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.5 }}>
            {periodChanged
              ? `Changed from the project default of ${preflight.reviewPeriodDefaultDays} for this submission only.`
              : 'The project default.'}{' '}
            It chases the review group and flags the round overdue; it never closes a round.
          </p>
        </>
      )}
      </div>
    </Modal>
  );
}

/** Everyone on the roster who is not already in the group or staged into it. */
function rosterOptions(
  roster: RosterEntry[],
  liveReviewers: ReviewerGrant[],
  additions: StagedAddition[],
) {
  return roster
    .filter(
      (r) =>
        !liveReviewers.some((g) => g.participantId === r.participantId) &&
        !additions.some((a) => a.participantId === r.participantId),
    )
    .map((r) => ({ value: r.participantId, label: `${r.name} — ${r.organisationName}` }));
}

function ReviewerRow(props: {
  name: string;
  organisationName?: string;
  role: string;
  struck?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        borderBottom: '1px solid var(--border-subtle)',
        opacity: props.struck ? 0.6 : 1,
      }}
    >
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
        {initialsOf(props.name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: props.struck ? 'line-through' : 'none',
          }}
        >
          {props.name}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
          {props.organisationName ? `${props.organisationName} · ` : ''}
          {props.role}
        </span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {props.children}
      </span>
    </div>
  );
}
