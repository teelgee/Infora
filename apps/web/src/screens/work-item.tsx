// The work-item page (T-104, owner-ruled 2026-07-12): a reflection of the
// review cycle — the deliverable's live status and what the reader needs to
// do — never the agent's internals. The run record beneath is retained,
// producing-organisation-private background data (the consultant carries the
// professional liability for the work product; the client reviews the
// document through the review cycle). Rounds, transmittals and the DRR
// arrive with the document-management slice. This replaces M5's owner audit
// screen, which was skeleton scaffolding proving the record.
import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import type { GetWorkItemResponse, MeResponse } from '@infora/contracts';
import { Badge, Card, SectionLabel } from '@infora/ui';
import { api } from '../api';
import { statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function WorkItemScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const { workItemId } = useParams();
  const [workItem, setWorkItem] = useState<GetWorkItemResponse | null>(null);

  useEffect(() => {
    if (workItemId === undefined) return;
    void api.workItem(workItemId).then(setWorkItem);
  }, [workItemId]);

  if (workItem === null) return null;
  const status = statusBadge(workItem.status);
  const assignedToMe = workItem.assigneeParticipantId === participant.participantId;

  return (
    <div className="content">
      <h1 className="page">{workItem.title}</h1>
      <p className="page-sub">
        Work item · {workItem.type.replaceAll('_', ' ')} ·{' '}
        <Badge tone={status.tone}>{status.label}</Badge>
        {assignedToMe && (
          <>
            {' '}
            · <Badge tone="slate">Assigned to you</Badge>
          </>
        )}
      </p>

      <SectionLabel>Review cycle</SectionLabel>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>With</th>
              <th>Due</th>
              <th>Your action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} style={{ color: 'var(--muted)' }}>
                Rounds, transmittals and the decision-and-response register arrive with the
                document-management slice — this page will show where the deliverable sits in the
                cycle and whether a document is waiting on your review.
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
