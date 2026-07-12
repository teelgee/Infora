// The Review surface, pre-Slice-A (T-103, owner feedback 2026-07-12): the
// project's work items ARE the review cycle's subjects, so this page pulls
// them through with their live status. What it deliberately does not show
// yet: rounds, transmittals, frozen snapshots and the DRR — the ADR-0005–0014
// machinery that arrives with the document-management slice. Review is a
// human reviewing a human-produced document; agent assistance happens
// upstream, in the sandbox.
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { MeResponse, WorkItem } from '@infora/contracts';
import { Badge, Card, SectionLabel } from '@infora/ui';
import { api } from '../api';
import { statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function ReviewScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const [items, setItems] = useState<WorkItem[] | null>(null);

  useEffect(() => {
    void api.workItems(participant.projectId).then((res) => setItems(res.items));
  }, [participant.projectId]);

  return (
    <div className="content">
      <h1 className="page">Review</h1>
      <p className="page-sub">
        The deliverables moving through the project&apos;s review cycle — a human reviewing a
        human-produced document. Rounds, transmittals and the decision-and-response register
        arrive with the document-management slice.
      </p>

      <SectionLabel>Deliverables in the cycle</SectionLabel>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Deliverable</th>
              <th>Workflow</th>
              <th>Status</th>
              <th>Round</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => {
              const status = statusBadge(item.status);
              return (
                <tr key={item.id}>
                  <td>
                    <div className="title">{item.title}</div>
                  </td>
                  <td>{item.type.replaceAll('_', ' ')}</td>
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>— arrives with the review drawer</td>
                </tr>
              );
            })}
            {items !== null && items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)' }}>
                  No deliverables in the cycle yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
