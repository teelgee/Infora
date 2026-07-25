// The Review surface, Slice A (T-118/T-119; was the T-103 work-item list).
// The deliverable plan and the live status tracker are the same object
// (ADR-0008): a member sees its own organisation's plan (the TIDP) and adds
// rows to it; the owner sees every organisation's rows — the MIDP
// consolidation — and confirms proposed reviewers (ADR-0033). Rounds and the
// DRR open from each row as the cycle tickets land (T-123+).
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { MeResponse, PlanRow, ReviewerGrant, RosterEntry } from '@infora/contracts';
import { Badge, Button, Card, SectionLabel } from '@infora/ui';
import { api } from '../api';
import { statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function ReviewScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const isOwner = participant.membershipRole === 'owner';
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRows((await api.plan(participant.projectId)).items);
  }, [participant.projectId]);

  useEffect(() => {
    void reload();
    void api.participants(participant.projectId).then((res) => setRoster(res.items));
  }, [participant.projectId, reload]);

  async function addRow(event: FormEvent) {
    event.preventDefault();
    if (!reference.trim() || !title.trim()) return;
    setError(null);
    try {
      await api.createPlanRow(participant.projectId, reference.trim(), title.trim());
      setReference('');
      setTitle('');
      setAdding(false);
      await reload();
    } catch {
      setError('That document reference already exists on this project.');
    }
  }

  async function confirmReviewer(grant: ReviewerGrant) {
    await api.confirmReviewer(grant.id);
    await reload();
  }

  const liveNames = (grants: ReviewerGrant[] | PlanRow['authors']) =>
    grants
      .filter((g) => g.revokedAt === null)
      .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}`)
      .join(', ');

  return (
    <div className="content">
      <h1 className="page">Review</h1>
      <p className="page-sub">
        {isOwner
          ? 'Every organisation’s deliverable plan, consolidated — the live MIDP view. Confirm proposed reviewers here; access follows confirmation, never proposal.'
          : 'Your organisation’s deliverable plan — the schedule of deliverables you will produce, each a waiting container with its work item.'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel>{isOwner ? 'All deliverables' : 'Your deliverables'}</SectionLabel>
        <span style={{ flex: 1 }} />
        {!adding && (
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            + Plan a deliverable
          </Button>
        )}
      </div>

      {adding && (
        <Card>
          <form onSubmit={addRow} style={{ padding: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Document reference (e.g. WA-ENV-ECO-001)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              style={fieldStyle}
            />
            <input
              placeholder="Deliverable title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <Button size="sm" variant="primary" type="submit">
              Add to the plan
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            {error && <Badge tone="danger">{error}</Badge>}
          </form>
        </Card>
      )}

      <Card>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Deliverable</th>
              {isOwner && <th>Produced by</th>}
              <th>Status</th>
              <th>Revision</th>
              <th>Verdict</th>
              <th>Authors</th>
              <th>Reviewers</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => {
              const status = statusBadge(row.workItem?.status ?? row.state);
              const proposed = row.reviewers.filter(
                (g) => g.revokedAt === null && g.confirmedAt === null,
              );
              return (
                <tr
                  key={row.containerId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void navigate(`/projects/${participant.projectId}/review/${row.containerId}`)}
                >
                  <td style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }}>
                    {row.documentReference}
                  </td>
                  <td>
                    <div className="title">{row.workItem?.title ?? '(reference material)'}</div>
                  </td>
                  {isOwner && <td>{row.producingOrganisationName}</td>}
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {row.currentVersion?.versionReference ?? 'not produced'}
                  </td>
                  <td>{row.deliverableCode?.code ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{liveNames(row.authors) || '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {liveNames(row.reviewers.filter((g) => g.confirmedAt !== null)) || '—'}
                    {proposed.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {proposed.map((g) => (
                          <span key={g.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <Badge tone="warning">proposed: {g.name}</Badge>
                            {isOwner && (
                              <span onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="quiet" onClick={() => void confirmReviewer(g)}>
                                  Confirm
                                </Button>
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={isOwner ? 8 : 7} style={{ color: 'var(--muted)' }}>
                  Nothing planned yet — add the first deliverable to the plan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        {roster.length > 0 &&
          'Appointments are made per deliverable from the project roster; reviewer proposals confer no access until the owner confirms.'}
      </p>
    </div>
  );
}

const fieldStyle = {
  font: 'inherit',
  fontSize: 13,
  border: '1px solid var(--hairline)',
  borderRadius: 6,
  padding: '7px 10px',
  background: 'var(--panel)',
  color: 'var(--ink)',
} as const;
