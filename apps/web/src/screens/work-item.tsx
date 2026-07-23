// The work-item page (T-104, owner-ruled 2026-07-12): a reflection of the
// review cycle — the deliverable's live status and what the reader needs to
// do — never the agent's internals. The run record beneath is retained,
// producing-organisation-private background data (the consultant carries the
// professional liability for the work product; the client reviews the
// document through the review cycle). Rounds, transmittals and the DRR
// arrive with the document-management slice. This replaces M5's owner audit
// screen, which was skeleton scaffolding proving the record.
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { GetWorkItemResponse, MeResponse, ReviewCycle, SandboxDocument } from '@infora/contracts';
import { Badge, Button, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function WorkItemScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const { workItemId } = useParams();
  const navigate = useNavigate();
  const [workItem, setWorkItem] = useState<GetWorkItemResponse | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [draft, setDraft] = useState<SandboxDocument | null>(null);

  useEffect(() => {
    if (workItemId === undefined) return;
    void api.workItem(workItemId).then(async (item) => {
      setWorkItem(item);
      if (item.containerId) {
        const [cycleRead, docs] = await Promise.all([
          api.cycle(item.containerId).catch(() => null),
          api.sandboxDocuments(participant.projectId).catch(() => ({ items: [] as SandboxDocument[] })),
        ]);
        setCycle(cycleRead);
        setDraft(docs.items.find((d) => d.containerId === item.containerId) ?? null);
      }
    });
  }, [workItemId, participant.projectId]);

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
            · <Badge tone="info">Assigned to you</Badge>
          </>
        )}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {workItem.containerId && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void navigate(`/projects/${participant.projectId}/review/${workItem.containerId}`)}
          >
            Open the review
          </Button>
        )}
        {draft && (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => void navigate(`/projects/${participant.projectId}/editor/${draft.id}`)}
          >
            Open the draft in the Editor
          </Button>
        )}
      </div>

      <SectionLabel>Review cycle</SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Version</th>
              <th>State</th>
              <th>Verdict</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {cycle &&
              [...cycle.rounds].reverse().map((round) => {
                const roundState = statusBadge(round.state);
                return (
                  <tr key={round.id}>
                    <td>Round {round.number}</td>
                    <td>{round.versionReference}</td>
                    <td>
                      <Badge tone={roundState.tone}>{roundState.label}</Badge>
                    </td>
                    <td>{round.deliverableCode?.code ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {round.comments.length > 0
                        ? `${round.comments.length} on the record`
                        : round.state === 'open'
                          ? 'open to the review group'
                          : '—'}
                    </td>
                  </tr>
                );
              })}
            {!cycle && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
                  Not yet promoted — production is upstream in the sandbox; the cycle launches when
                  the lead author promotes the first version.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>
      {cycle && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          The pen is with {cycle.editLockHolder === 'reviewing' ? 'the review group' : 'the authoring team'} ·
          the full decision-and-response register is on the review page.
        </p>
      )}
    </div>
  );
}
