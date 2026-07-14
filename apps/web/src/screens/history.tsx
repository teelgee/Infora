// T-108 — History: the log of your own prompted turns on this project,
// newest first — Ask chats and agent use in a document alike. An Ask turn
// reopens its conversation in Ask; a document turn opens the document on the
// Editor canvas. Self-scoped: only what you prompted, never a colleague's
// record (the record itself stays producer-private background data, T-104).
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { HistoryEntry, MeResponse } from '@infora/contracts';
import { Badge, Card, SectionLabel } from '@infora/ui';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

export function HistoryScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    setItems(null);
    void api.history(participant.projectId).then((res) => setItems(res.items));
  }, [participant.projectId]);

  const base = `/projects/${participant.projectId}`;
  const open = (entry: HistoryEntry) =>
    void navigate(
      entry.sandboxDocument === null
        ? `${base}/ask?conversation=${entry.conversationId}`
        : `${base}/editor/${entry.sandboxDocument.id}`,
    );

  return (
    <div className="content">
      <h1 className="page">History</h1>
      <p className="page-sub">
        Your turns with the agent on this project — Ask conversations and document drafting.
        Open one to pick the conversation back up, or to return to the document.
      </p>

      <SectionLabel>Your turns</SectionLabel>
      <Card>
        <table>
          <thead>
            <tr>
              <th>You asked</th>
              <th>Where</th>
              <th>State</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((entry) => (
              <tr key={entry.runId} onClick={() => open(entry)} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="title">
                    {entry.request.length > 90 ? `${entry.request.slice(0, 87)}…` : entry.request}
                  </div>
                </td>
                <td>
                  {entry.sandboxDocument === null ? (
                    <>✦ Ask</>
                  ) : (
                    <>✎ {entry.sandboxDocument.title}</>
                  )}
                </td>
                <td>
                  <Badge tone={entry.state === 'failed' ? 'red' : entry.state === 'running' ? 'grey' : 'green'}>
                    {entry.state}
                  </Badge>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(entry.startedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {items !== null && items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)' }}>
                  Nothing yet — your Ask conversations and document turns will log here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
