// T-157 / T-158 — the sandbox drawer (ADR-0036/0038). A file-explorer surface:
// sandboxes with their participant scope, folders (create/nest), documents with
// a bound/unbound badge, and per-document actions from the folder view — open,
// bind (to a planned container), freeze / start internal review, promote. No
// document controls; the AI never grounds on anything here (ADR-0011).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type {
  MeResponse,
  PlanRow,
  Sandbox,
  SandboxDocument,
  SandboxFolder,
  SandboxScopeGrantView,
} from '@infora/contracts';
import { FileText, FolderPlus, Link2, Lock, Send } from 'lucide-react';
import { Badge, Button, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';

type ShellContext = { participant: MeResponse['participants'][number] };

export function SandboxScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const navigate = useNavigate();

  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [grants, setGrants] = useState<SandboxScopeGrantView[]>([]);
  const [folders, setFolders] = useState<SandboxFolder[]>([]);
  const [docs, setDocs] = useState<SandboxDocument[]>([]);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const loadSandboxes = useCallback(
    () => api.sandboxes(projectId).then((r) => setSandboxes(r.items)),
    [projectId],
  );
  const loadDocs = useCallback(
    () => api.sandboxDocuments(projectId).then((r) => setDocs(r.items)),
    [projectId],
  );
  useEffect(() => {
    void loadSandboxes();
    void loadDocs();
    void api.plan(projectId).then((r) => setPlan(r.items));
  }, [loadSandboxes, loadDocs, projectId]);

  const loadSandbox = useCallback((id: string) => {
    void api.sandbox(id).then((s) => setGrants(s.grants));
    void api.folders(id).then((r) => setFolders(r.items));
  }, []);
  useEffect(() => {
    if (selected) loadSandbox(selected);
  }, [selected, loadSandbox]);

  // documents shown: filtered to the selected sandbox, else all the org's docs
  const shown = useMemo(
    () => (selected ? docs.filter((d) => d.sandboxId === selected) : docs),
    [docs, selected],
  );
  const unboundPlan = useMemo(
    () => plan.filter((p) => p.workItem && p.currentVersion === null),
    [plan],
  );

  async function createSandbox() {
    const name = window.prompt('Sandbox name');
    if (!name?.trim()) return;
    const scope = (window.prompt('Scope: single_org / team / named_user / multi_org', 'single_org') ??
      '') as Sandbox['scope'];
    if (!['single_org', 'team', 'named_user', 'multi_org'].includes(scope)) return;
    try {
      const sb = await api.createSandbox(projectId, name.trim(), scope);
      await loadSandboxes();
      setSelected(sb.id);
    } catch {
      setNote('Could not create that sandbox (a multi-org sandbox is owner-only).');
    }
  }

  async function addFolder() {
    if (!selected) return;
    const name = window.prompt('Folder name');
    if (!name?.trim()) return;
    await api.createFolder(selected, name.trim());
    loadSandbox(selected);
  }

  async function newDocument() {
    const title = window.prompt('Document title');
    if (!title?.trim()) return;
    await api.createSandboxDocument(projectId, title.trim(), selected ?? undefined);
    await loadDocs();
  }

  async function bind(doc: SandboxDocument) {
    if (unboundPlan.length === 0) {
      setNote('No unbound plan rows to bind to — add one on the Plan page first.');
      return;
    }
    const choices = unboundPlan.map((p, i) => `${i + 1}. ${p.documentReference} — ${p.workItem?.title}`).join('\n');
    const pick = window.prompt(`Bind "${doc.title}" to which deliverable?\n${choices}`, '1');
    const idx = Number(pick) - 1;
    const target = unboundPlan[idx];
    if (!target) return;
    try {
      await api.bindDocument(doc.id, target.containerId);
      await loadDocs();
      setNote(`Bound to ${target.documentReference}.`);
    } catch {
      setNote('Bind failed — a document binds once, to its own organisation’s plan row.');
    }
  }

  async function freeze(doc: SandboxDocument) {
    try {
      await api.freezeDocument(doc.id);
      await loadDocs();
      setNote('Frozen for internal review — the head is locked while the round is open.');
    } catch {
      setNote('Freeze failed.');
    }
  }

  async function promote(doc: SandboxDocument) {
    try {
      await api.promoteDocument(doc.id);
      await loadDocs();
      setNote('Promoted into the container — the project review cycle is open.');
    } catch {
      setNote('Promote failed — the document must be bound to a plan row first.');
    }
  }

  const folderName = (id: string | null) =>
    id === null ? 'Sandbox root' : folders.find((f) => f.id === id)?.name ?? 'Folder';

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="page">Sandbox</h1>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Button size="sm" onClick={() => void newDocument()}>＋ New document</Button>
          <Button size="sm" variant="quiet" onClick={() => void createSandbox()}>＋ Sandbox</Button>
          <Badge tone="neutral">No document controls</Badge>
        </span>
      </div>
      <p className="page-sub">
        Work in progress across your sandboxes. Separation is by a narrower sandbox, never a wall
        inside a shared one; the AI never grounds on anything here.
      </p>
      {note && <p style={{ color: 'var(--text-muted)' }}>{note}</p>}

      <SectionLabel>Sandboxes</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {sandboxes.map((sb) => (
          <Button
            key={sb.id}
            size="sm"
            variant={selected === sb.id ? 'primary' : 'quiet'}
            onClick={() => setSelected(sb.id)}
          >
            {sb.name} · {sb.scope.replace('_', '-')}
          </Button>
        ))}
        {sandboxes.length === 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            {me.organisationName} has no sandboxes yet — create one to start.
          </span>
        )}
      </div>

      {selected && (
        <>
          <SectionLabel>
            Participant scope{' '}
            <Button size="sm" variant="quiet" onClick={() => void newDocument()}>＋ Document</Button>{' '}
            <Button size="sm" variant="quiet" onClick={() => void addFolder()}>
              <FolderPlus size={13} strokeWidth={2} /> Folder
            </Button>
          </SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {grants.map((g) => (
              <Badge key={g.id} tone="neutral">
                {g.granteeType === 'organisation' ? 'org' : 'user'}:{(g.organisationId ?? g.participantId ?? '').slice(0, 8)}
              </Badge>
            ))}
            {isOwner && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                (owner adds another organisation to open cross-org collaboration)
              </span>
            )}
          </div>
        </>
      )}

      <SectionLabel>
        {selected ? 'Documents in this sandbox' : `${me.organisationName} — all documents`}
      </SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Folder</th>
              <th>Binding</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
                {shown.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <span className="ficon"><FileText size={14} strokeWidth={2} /></span>
                      {doc.title}
                      {doc.headLocked && <Lock size={12} strokeWidth={2} style={{ marginLeft: 6 }} />}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{folderName(doc.folderId)}</td>
                    <td>
                      {doc.containerId ? (
                        <Badge tone="success">Bound</Badge>
                      ) : (
                        <Badge tone="neutral">Unbound</Badge>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${projectId}/editor/${doc.id}`)}>Open in Editor</Button>
                      {!doc.containerId && (
                        <Button size="sm" variant="quiet" onClick={() => void bind(doc)}>
                          <Link2 size={13} strokeWidth={2} /> Bind
                        </Button>
                      )}
                      <Button size="sm" variant="quiet" onClick={() => void freeze(doc)}>Freeze</Button>
                      {doc.containerId && (
                        <Button size="sm" variant="quiet" onClick={() => void promote(doc)}>
                          <Send size={13} strokeWidth={2} /> Promote
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                      {selected ? 'No documents in this sandbox yet.' : 'Nothing here yet — create a document or accept a draft from Ask.'}
                    </td>
                  </tr>
                )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}
