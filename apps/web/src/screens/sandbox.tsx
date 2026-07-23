// The Sandbox surface (T-051) per docs/design/mockups-legacy/sandbox.html
// (historical build reference — superseded by design-tokens.json/design-rules.md): list,
// create, open — flat in the skeleton (folders, the shared-sandbox switcher
// and attach-to-generation are post-skeleton). No document controls by
// design; the AI never grounds on anything here (ADR-0011).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { MeResponse, SandboxDocument } from '@infora/contracts';
import { FileText } from 'lucide-react';
import { Badge, Button, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';

type ShellContext = { participant: MeResponse['participants'][number] };

export function SandboxScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<SandboxDocument[] | null>(null);

  const load = useCallback(
    () => api.sandboxDocuments(participant.projectId).then((res) => setDocs(res.items)),
    [participant.projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const title = window.prompt('Document title');
    if (title === null || title.trim() === '') return;
    await api.createSandboxDocument(participant.projectId, title.trim());
    await load();
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="page">Sandbox</h1>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button size="sm" onClick={() => void create()}>
            ＋ New document
          </Button>
          <Badge tone="neutral">No document controls</Badge>
        </span>
      </div>
      <p className="page-sub">
        Work in progress, no versioning ceremony, no locking; the AI never grounds on anything
        here.
      </p>

      <SectionLabel>{me.organisationName} — private project sandbox</SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Modified</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(docs ?? []).map((doc) => (
              <tr key={doc.id}>
                <td>
                  <span className="ficon"><FileText size={14} strokeWidth={2} /></span>
                  {doc.title}
                </td>
                <td>{new Date(doc.updatedAt).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() =>
                      void navigate(`/projects/${participant.projectId}/editor/${doc.id}`)
                    }
                  >
                    Open in Editor
                  </Button>
                </td>
              </tr>
            ))}
            {docs !== null && docs.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: 'var(--text-muted)' }}>
                  Nothing here yet — create a document or accept a draft from Ask.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}
