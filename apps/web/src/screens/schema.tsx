// T-156 — the naming-scheme surface + code-builder (ADR-0008 homed). The owner
// defines the project-wide scheme (ordered fields, allowed values, the serial);
// a producer previews a compliant reference through the code-builder and, where
// it needs a new value, proposes an addition the owner folds in.
import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { MeResponse, NamingProposal, NamingSchemeField } from '@infora/contracts';
import { Badge, Button, Field, SectionLabel, SelectInput, Table, TextInput } from '@infora/ui';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

const emptyField = (): NamingSchemeField => ({ key: '', label: '' });

export function SchemaScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';

  const [separator, setSeparator] = useState('-');
  const [fields, setFields] = useState<NamingSchemeField[]>([]);
  const [proposals, setProposals] = useState<NamingProposal[]>([]);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [previewSerial, setPreviewSerial] = useState<string | null>(null);
  const [proposalText, setProposalText] = useState('');
  const [saved, setSaved] = useState(false);

  const loadProposals = () => void api.namingProposals(projectId).then((r) => setProposals(r.items));
  useEffect(() => {
    void api.namingScheme(projectId).then((s) => {
      if (s) {
        setSeparator(s.separator);
        setFields(s.fields);
      }
    });
    loadProposals();
  }, [projectId]);

  async function save() {
    await api.putNamingScheme(projectId, { separator, fields });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const composedPreview = fields
    .map((f) => (f.isSerial ? '#'.repeat(f.width ?? 3) : previewValues[f.key] || `‹${f.label || f.key}›`))
    .join(separator);

  async function allocatePreview() {
    setPreviewSerial(null);
    try {
      const out = await api.generateReference(projectId, previewValues);
      setPreviewSerial(out.reference);
    } catch {
      setPreviewSerial('rejected — check values against the scheme');
    }
  }

  async function propose() {
    if (!proposalText.trim()) return;
    await api.proposeNaming(projectId, proposalText.trim());
    setProposalText('');
    loadProposals();
  }

  async function resolve(id: string, status: 'accepted' | 'declined') {
    await api.resolveNamingProposal(id, status);
    loadProposals();
  }

  const setField = (i: number, patch: Partial<NamingSchemeField>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="content">
      <h1 className="page">Coding scheme</h1>
      <p className="page-sub">
        Owner-defined and project-wide, but not fixed — a producer proposes an addition and the
        owner folds it in. <Link to={`/projects/${projectId}/plan`}>← Back to the plan</Link>
      </p>

      <SectionLabel>Fields</SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
              <th>Allowed values (comma-sep)</th>
              <th>Originator</th>
              <th>Serial</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i}>
                <td><input className="input mono" value={f.key} disabled={!isOwner} onChange={(e) => setField(i, { key: e.target.value })} /></td>
                <td><input className="input" value={f.label} disabled={!isOwner} onChange={(e) => setField(i, { label: e.target.value })} /></td>
                <td>
                  <input
                    className="input"
                    value={(f.allowedValues ?? []).join(', ')}
                    disabled={!isOwner}
                    onChange={(e) => setField(i, { allowedValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                </td>
                <td><input type="checkbox" checked={!!f.isOriginator} disabled={!isOwner} onChange={(e) => setField(i, { isOriginator: e.target.checked })} /></td>
                <td><input type="checkbox" checked={!!f.isSerial} disabled={!isOwner} onChange={(e) => setField(i, { isSerial: e.target.checked, width: e.target.checked ? (f.width ?? 3) : undefined })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Table>

      {isOwner && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button variant="quiet" onClick={() => setFields((fs) => [...fs, emptyField()])}>Add field</Button>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            Separator
            <input className="input mono" value={separator} onChange={(e) => setSeparator(e.target.value)} style={{ width: 40 }} />
          </label>
          <Button onClick={() => void save()}>Save scheme</Button>
          {saved && <Badge tone="success">Saved</Badge>}
        </div>
      )}

      {fields.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Try the code-builder</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {fields
              .filter((f) => !f.isSerial)
              .map((f) => (
                <Field key={f.key} label={f.label || f.key}>
                  {f.allowedValues && f.allowedValues.length > 0 ? (
                    <SelectInput
                      value={previewValues[f.key] ?? ''}
                      onChange={(v) => setPreviewValues((s) => ({ ...s, [f.key]: v }))}
                      placeholder="—"
                      options={f.allowedValues.map((v) => ({ value: v, label: v }))}
                    />
                  ) : (
                    <TextInput
                      value={previewValues[f.key] ?? ''}
                      onChange={(v) => setPreviewValues((s) => ({ ...s, [f.key]: v }))}
                      mono
                    />
                  )}
                </Field>
              ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span className="field-label">Preview</span>
            <span className="mono">{composedPreview}</span>
            <Button size="sm" variant="quiet" onClick={() => void allocatePreview()}>
              Allocate a serial
            </Button>
            {previewSerial && <span className="mono">→ {previewSerial}</span>}
          </div>
        </div>
      )}

      <SectionLabel>Scheme additions</SectionLabel>
      {!isOwner && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Propose an addition (e.g. discipline DRN)" value={proposalText} onChange={(e) => setProposalText(e.target.value)} style={{ minWidth: 320 }} />
          <Button onClick={() => void propose()}>Propose</Button>
        </div>
      )}
      <Table>
        <table>
          <thead>
            <tr><th>Proposal</th><th>Status</th>{isOwner && <th></th>}</tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td>{p.body}</td>
                <td><Badge tone={p.status === 'accepted' ? 'success' : p.status === 'declined' ? 'danger' : 'neutral'}>{p.status}</Badge></td>
                {isOwner && (
                  <td>
                    {p.status === 'pending' && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <Button variant="quiet" onClick={() => void resolve(p.id, 'accepted')}>Accept</Button>
                        <Button variant="quiet" onClick={() => void resolve(p.id, 'declined')}>Decline</Button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {proposals.length === 0 && (
              <tr><td colSpan={isOwner ? 3 : 2} style={{ color: 'var(--text-muted)' }}>No proposals.</td></tr>
            )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}
