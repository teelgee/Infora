// The Documents tab (T-086) per docs/design/mockups/library.html, flat in the
// skeleton: one row per live container — the ruled list unit (2026-07-06);
// folders, per-deliverable sharing badges and the container view with version
// history arrive with the document-management slice. The list is the API's
// access-resolved slice: exactly what grounding admits, nothing else.
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LibraryItem, MeResponse } from '@infora/contracts';
import { Badge, Card, SectionLabel } from '@infora/ui';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

export function LibraryScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const [items, setItems] = useState<LibraryItem[] | null>(null);

  useEffect(() => {
    void api.library(participant.projectId).then((res) => setItems(res.items));
  }, [participant.projectId]);

  return (
    <div className="content">
      <h1 className="page">Project library</h1>
      <p className="page-sub">
        The governed corpus — what the AI grounds on. Superseded and withdrawn documents leave
        this list and the grounded corpus together.
      </p>

      <SectionLabel>Live deliverables</SectionLabel>
      <Card className="tree">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.containerId}>
                <td>
                  <span className="ficon">📄</span>
                  <span className="mono">{item.documentReference}</span>
                </td>
                <td>
                  <Badge tone="green">Live</Badge>
                </td>
              </tr>
            ))}
            {items !== null && items.length === 0 && (
              <tr>
                <td colSpan={2} style={{ color: 'var(--muted)' }}>
                  No live deliverables in this project&apos;s library.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
