// T-156 / T-188 — the deliverable-plan (TIDP) schema surface. The owner
// super-user defines the project-wide schema: one unified field list where each
// field can be part of the coded reference, a metadata attribute, and/or an
// appointment role slot. A default Infora schema preloads and is fully editable
// (change fields, add fields). A guest super-user proposes additions; everyone
// else views. The code-builder previews a compliant reference from the code fields.
import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { MeResponse, NamingProposal, NamingSchemeField, SchemaFieldRole, SchemaFieldType } from '@infora/contracts';
import { defaultDeliverableSchema, isCodeField } from '@infora/contracts';
import { Badge, Button, Field, SectionLabel, SelectInput, Table, TextInput } from '@infora/ui';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

const emptyField = (): NamingSchemeField => ({ key: '', label: '', type: 'text' });

const TYPE_OPTIONS: { value: SchemaFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'select', label: 'Select (options)' },
  { value: 'date', label: 'Date' },
  { value: 'person', label: 'Person (one)' },
  { value: 'people', label: 'People (many)' },
  { value: 'serial', label: 'Serial (auto)' },
];
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'author', label: 'Author(s)' },
  { value: 'document_owner', label: 'Document owner' },
  { value: 'reviewer', label: 'Reviewer(s)' },
  { value: 'lead_reviewer', label: 'Lead reviewer' },
];

export function SchemaScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const canEdit = participant.membershipRole === 'owner' && participant.elevated;
  const canPropose = participant.membershipRole === 'member' && participant.elevated;

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

  const codeFields = fields.filter(isCodeField);
  const composedPreview = codeFields
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
  const removeField = (i: number) => setFields((fs) => fs.filter((_, j) => j !== i));
  const moveField = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const next = [...fs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h1 className="page">Deliverable schema</h1>
        <Badge tone={canEdit ? 'success' : canPropose ? 'info' : 'neutral'}>
          {canEdit ? 'You can edit' : canPropose ? 'You can propose' : 'View only'}
        </Badge>
      </div>
      <p className="page-sub">
        The project-wide TIDP schema — what a deliverable is coded and described by, and its roles.{' '}
        {canEdit
          ? 'A default preloads; change the fields and save.'
          : canPropose
            ? 'Propose an addition below and the owner folds it in.'
            : 'The owner super-user maintains it.'}{' '}
        <Link to={`/projects/${projectId}/plan`}>← Back to the plan</Link>
      </p>

      <SectionLabel>Fields</SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Key</th>
              <th>Type</th>
              <th>Options (comma-sep)</th>
              <th>Required</th>
              <th>In code</th>
              <th>Role</th>
              <th>Originator</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const code = isCodeField(f);
              return (
                <tr key={i}>
                  <td><input className="field-input" value={f.label} disabled={!canEdit} onChange={(e) => setField(i, { label: e.target.value })} /></td>
                  <td><input className="field-input mono" value={f.key} disabled={!canEdit} onChange={(e) => setField(i, { key: e.target.value })} /></td>
                  <td>
                    <SelectInput
                      value={f.type ?? 'text'}
                      onChange={(v) => setField(i, { type: v as SchemaFieldType, isSerial: v === 'serial' ? true : undefined, width: v === 'serial' ? (f.width ?? 6) : undefined })}
                      options={TYPE_OPTIONS}
                    />
                  </td>
                  <td>
                    <input
                      className="field-input"
                      value={(f.allowedValues ?? []).join(', ')}
                      disabled={!canEdit || f.type !== 'select'}
                      onChange={(e) => setField(i, { allowedValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                    />
                  </td>
                  <td><input type="checkbox" checked={!!f.required} disabled={!canEdit} onChange={(e) => setField(i, { required: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={code} disabled={!canEdit} onChange={(e) => setField(i, { inCode: e.target.checked })} /></td>
                  <td>
                    <SelectInput
                      value={f.role ?? ''}
                      onChange={(v) => setField(i, { role: (v || undefined) as SchemaFieldRole | undefined })}
                      options={ROLE_OPTIONS}
                    />
                  </td>
                  <td><input type="checkbox" checked={!!f.isOriginator} disabled={!canEdit || !code} onChange={(e) => setField(i, { isOriginator: e.target.checked })} /></td>
                  {canEdit && (
                    <td>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button className="fb-btn" title="Move up" onClick={() => moveField(i, -1)}>↑</button>
                        <button className="fb-btn" title="Move down" onClick={() => moveField(i, 1)}>↓</button>
                        <button className="fb-btn" title="Remove field" onClick={() => removeField(i)}>✕</button>
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Table>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="quiet" onClick={() => setFields((fs) => [...fs, emptyField()])}>Add field</Button>
          <Button
            variant="quiet"
            onClick={() => {
              const d = defaultDeliverableSchema();
              setSeparator(d.separator);
              setFields(d.fields);
            }}
          >
            Reset to Infora default
          </Button>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            Separator
            <input className="field-input mono" value={separator} onChange={(e) => setSeparator(e.target.value)} style={{ width: 40 }} />
          </label>
          <Button onClick={() => void save()}>Save schema</Button>
          {saved && <Badge tone="success">Saved</Badge>}
        </div>
      )}

      {codeFields.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Try the code-builder</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {codeFields
              .filter((f) => !f.isSerial)
              .map((f) => (
                <Field key={f.key} label={f.label || f.key}>
                  {f.type === 'select' && f.allowedValues && f.allowedValues.length > 0 ? (
                    <SelectInput
                      value={previewValues[f.key] ?? ''}
                      onChange={(v) => setPreviewValues((s) => ({ ...s, [f.key]: v }))}
                      placeholder="—"
                      options={f.allowedValues.map((v) => ({ value: v, label: v }))}
                    />
                  ) : (
                    <TextInput value={previewValues[f.key] ?? ''} onChange={(v) => setPreviewValues((s) => ({ ...s, [f.key]: v }))} mono />
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
      {canPropose && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="field-input" placeholder="Propose an addition (e.g. discipline DRN)" value={proposalText} onChange={(e) => setProposalText(e.target.value)} style={{ minWidth: 320 }} />
          <Button onClick={() => void propose()}>Propose</Button>
        </div>
      )}
      <Table>
        <table>
          <thead>
            <tr><th>Proposal</th><th>Status</th>{canEdit && <th></th>}</tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td>{p.body}</td>
                <td><Badge tone={p.status === 'accepted' ? 'success' : p.status === 'declined' ? 'danger' : 'neutral'}>{p.status}</Badge></td>
                {canEdit && (
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
              <tr><td colSpan={canEdit ? 3 : 2} style={{ color: 'var(--text-muted)' }}>No proposals.</td></tr>
            )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}
