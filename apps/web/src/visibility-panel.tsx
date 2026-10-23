// T-456 — "who can see this", on every deliverable, and the two doors that
// change it: the owner's share with an organisation (ADR-0016; T-119's route)
// and a receiving organisation's narrowing to named people (ADR-0035 §3;
// T-137's routes). Both existed in the API with no screen.
//
// *In plain terms: the panel says plainly which organisations can see a
// deliverable — the firm that produced it, the project owner, and anyone the
// owner has shared it with — and, inside your own firm, whether everyone can
// see it or only named people. The owner can share it with another
// organisation here, or take that back. An admin of a firm it was shared with
// can limit it to named colleagues, or lift that limit.*
//
// 🔒 **Assembled, not filtered.** The list a viewer sees is what the API gave
// them: an owner reads the shares (`sharedWith` is `[]` for anyone else, by
// contract); a receiving organisation reads its own narrowing, and gets
// absence where it holds no share. Nothing here reveals a share to a firm that
// is not party to it, and no control is drawn disabled — a door that will be
// refused is not drawn (principle 4).
import { useEffect, useMemo, useState } from 'react';
import type { ParticipantGrant, PlanRow, RosterEntry } from '@infora/contracts';
import { Badge, Button, Combobox } from '@infora/ui';
import { api } from './api';

export type Viewer = {
  organisationId: string;
  organisationName: string;
  isOwner: boolean;
  isOrgAdmin: boolean;
  ownerOrganisationName: string;
};

export function VisibilityPanel(props: {
  row: PlanRow;
  roster: RosterEntry[];
  viewer: Viewer;
  /** re-read the row after a share changed (the plan read carries the shares) */
  onChanged: () => void;
}) {
  const { row, viewer } = props;
  const isProducer = row.producingOrganisationId === viewer.organisationId;
  const [busy, setBusy] = useState(false);

  // the owner's share door
  const [shareOrg, setShareOrg] = useState<string | null>(null);
  const shareable = useMemo(() => {
    const seen = new Set<string>([row.producingOrganisationId, ...row.sharedWith.map((s) => s.organisationId)]);
    const out: Array<{ value: string; label: string }> = [];
    for (const p of props.roster) {
      if (p.removedAt !== null || p.membershipRole === 'owner' || seen.has(p.organisationId)) continue;
      seen.add(p.organisationId);
      out.push({ value: p.organisationId, label: p.organisationName });
    }
    return out;
  }, [props.roster, row.producingOrganisationId, row.sharedWith]);

  // the receiving organisation's narrowing: null = not readable here (no share)
  const narrowable = !viewer.isOwner && !isProducer;
  const [grants, setGrants] = useState<ParticipantGrant[] | null>(null);
  const [grantee, setGrantee] = useState<string | null>(null);
  const loadGrants = () => {
    if (!narrowable) return;
    void api
      .participantGrants(row.containerId)
      .then((r) => setGrants(r.items))
      .catch(() => setGrants(null));
  };
  useEffect(() => {
    loadGrants();
  }, [row.containerId, narrowable]);
  const colleagues = useMemo(
    () =>
      props.roster
        .filter((p) => p.removedAt === null && p.organisationId === viewer.organisationId)
        .filter((p) => !(grants ?? []).some((g) => g.participantId === p.participantId))
        .map((p) => ({ value: p.participantId, label: p.name })),
    [props.roster, viewer.organisationId, grants],
  );

  const act = (p: Promise<unknown>, then: () => void) => {
    setBusy(true);
    void p.then(then).finally(() => setBusy(false));
  };

  return (
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
      <span className="field-label">Who can see this</span>
      <ul className="shelf-rows" aria-label="Who can see this">
        <li>
          <span className="shelf-row-title">{row.producingOrganisationName}</span>
          <span className="shelf-row-note">{isProducer ? 'Your organisation produced it — everyone here may see it.' : 'Produced it.'}</span>
        </li>
        {row.producingOrganisationName !== viewer.ownerOrganisationName && (
          <li>
            <span className="shelf-row-title">{viewer.ownerOrganisationName}</span>
            <span className="shelf-row-note">The project owner — holds the library it was published into.</span>
          </li>
        )}
        {row.sharedWith.map((sh) => (
          <li key={sh.shareId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1 }}>
              <span className="shelf-row-title">{sh.organisationName}</span>
              <span className="shelf-row-note">Shared by the owner.</span>
            </span>
            {viewer.isOwner && (
              <Button
                size="sm"
                variant="quiet"
                disabled={busy}
                onClick={() => act(api.revokeShare(sh.shareId), props.onChanged)}
                aria-label={`Stop sharing with ${sh.organisationName}`}
              >
                Stop sharing
              </Button>
            )}
          </li>
        ))}
        {narrowable && grants !== null && (
          <li style={{ display: 'grid', gap: 6 }}>
            <span>
              <span className="shelf-row-title">{viewer.organisationName}</span>
              <span className="shelf-row-note">
                {grants.length === 0
                  ? 'Shared with your organisation — everyone here may see it.'
                  : 'Shared with your organisation, limited to named people:'}
              </span>
            </span>
            {grants.length > 0 && (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {grants.map((g) => (
                  <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Badge tone="neutral">{g.name}</Badge>
                    {viewer.isOrgAdmin && (
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={busy}
                        onClick={() => act(api.revokeParticipantGrant(g.id), loadGrants)}
                        aria-label={`Remove ${g.name} from the named people`}
                      >
                        ×
                      </Button>
                    )}
                  </span>
                ))}
              </span>
            )}
            {viewer.isOrgAdmin && colleagues.length > 0 && (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  <Combobox
                    value={grantee}
                    onChange={setGrantee}
                    options={colleagues}
                    placeholder={grants.length === 0 ? 'Limit to a named person…' : 'Add a named person…'}
                  />
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={busy || grantee === null}
                  onClick={() => {
                    if (grantee === null) return;
                    act(api.grantParticipant(row.containerId, grantee), () => {
                      setGrantee(null);
                      loadGrants();
                    });
                  }}
                >
                  Limit
                </Button>
              </span>
            )}
          </li>
        )}
      </ul>
      {viewer.isOwner && shareable.length > 0 && (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>
            <Combobox value={shareOrg} onChange={setShareOrg} options={shareable} placeholder="Share with an organisation…" />
          </span>
          <Button
            size="sm"
            variant="quiet"
            disabled={busy || shareOrg === null}
            onClick={() => {
              if (shareOrg === null) return;
              act(api.shareDeliverable(row.containerId, shareOrg), () => {
                setShareOrg(null);
                props.onChanged();
              });
            }}
          >
            Share
          </Button>
        </span>
      )}
      {viewer.isOwner && (
        <span className="field-hint">
          Sharing opens the deliverable to everyone at that organisation; its admin may then limit it to named people. Issuing it as a transmittal does the same and records the issue.
        </span>
      )}
    </div>
  );
}
