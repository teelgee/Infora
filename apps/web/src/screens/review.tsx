// The Review surface, Slice A (T-118/T-119; was the T-103 work-item list).
// The deliverable plan and the live status tracker are the same object
// (ADR-0008): a member sees its own organisation's plan (the TIDP) and adds
// rows to it; the owner sees every organisation's rows — the MIDP
// consolidation. A row opens the deliverable's STATUS page (T-348), where
// reviewer confirmation now lives — the schedule shows proposal state but
// no longer carries the act (T-349). Restyled onto the @infora/ui
// primitives in the same pass: the raw inputs and retired token names were
// the last pre-kit styling on a review screen.
//
// T-357 — THE INLINE "+ Plan a deliverable" FORM IS GONE, and the deletion is
// the ticket. It predated the Plan screen and had quietly become a second
// creation path with none of the first one's rules: it bypassed the naming
// scheme (ADR-0008's reference is GENERATED, never typed), it carried no
// elevated-tier gate where `plan.tsx` enforces one, and it mapped EVERY failure
// — the API's `403 super_user_required` included — to "That document reference
// already exists on this project", which is a wrong answer told confidently.
// One creation path now; this schedule links to it.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { MeResponse, PlanRow } from '@infora/contracts';
import { Badge, Button, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { lifecycleBadgeOf } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function ReviewScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const isOwner = participant.membershipRole === 'owner';
  const [rows, setRows] = useState<PlanRow[] | null>(null);

  const reload = useCallback(async () => {
    setRows((await api.plan(participant.projectId)).items);
  }, [participant.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const liveNames = (grants: PlanRow['reviewers'] | PlanRow['authors']) =>
    grants
      .filter((g) => g.revokedAt === null)
      .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}`)
      .join(', ');

  return (
    <div className="content">
      <h1 className="page">Review</h1>
      <p className="page-sub">
        {isOwner
          ? 'Every organisation’s deliverable plan, consolidated — the live MIDP view. A deliverable opens on its status page; proposed reviewers are confirmed there.'
          : 'Your organisation’s deliverable plan — the schedule of deliverables you will produce, each a waiting container with its work item.'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel>{isOwner ? 'All deliverables' : 'Your deliverables'}</SectionLabel>
        <span style={{ flex: 1 }} />
        {/* T-357 — a LINK, not a form. Planning a deliverable generates its
            reference from the scheme and is gated on the elevated tier; both
            live on the Plan screen, and a second entry point here could only
            ever be a worse copy of them. */}
        <Button
          size="sm"
          variant="primary"
          onClick={() => void navigate(`/projects/${participant.projectId}/plan`)}
        >
          + Plan a deliverable
        </Button>
      </div>

      <Table>
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
              const status = lifecycleBadgeOf(row);
              const proposed = row.reviewers.filter(
                (g) => g.revokedAt === null && g.confirmedAt === null,
              );
              return (
                <tr
                  key={row.containerId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void navigate(`/projects/${participant.projectId}/review/${row.containerId}`)}
                >
                  <td style={{ fontFamily: 'var(--primitive-font-family-mono)', fontSize: 12 }}>
                    {row.documentReference}
                  </td>
                  <td>
                    <div className="title">{row.workItem?.title ?? '(reference material)'}</div>
                  </td>
                  {isOwner && <td>{row.producingOrganisationName}</td>}
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {row.currentVersion?.versionReference ?? 'not produced'}
                  </td>
                  <td>{row.deliverableCode?.code ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{liveNames(row.authors) || '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {liveNames(row.reviewers.filter((g) => g.confirmedAt !== null)) || '—'}
                    {/* proposal state reads here; the confirm act lives on the
                        status page (T-348) — access follows confirmation,
                        never proposal (ADR-0033) */}
                    {proposed.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {proposed.map((g) => (
                          <Badge key={g.id} tone="warning">
                            proposed: {g.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={isOwner ? 8 : 7} style={{ color: 'var(--text-muted)' }}>
                  Nothing planned yet — add the first deliverable to the plan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>
      <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Appointments are made per deliverable from the project roster; reviewer proposals confer no
        access until the owner confirms — on the deliverable’s status page.
      </p>
    </div>
  );
}
