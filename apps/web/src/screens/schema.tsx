// T-156 / T-188 — the deliverable-plan (TIDP) schema surface. The owner
// super-user defines the project-wide schema: one unified field list where each
// field can be part of the coded reference, a metadata attribute, and/or an
// appointment role slot. A default Infora schema preloads and is fully editable
// (change fields, add fields). A guest super-user proposes additions; everyone
// else views. The code-builder previews a compliant reference from the code fields.
import { Fragment, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { MeResponse, NamingProposal, NamingSchemeField, SchemaFieldRole, SchemaFieldType } from '@infora/contracts';
import { defaultDeliverableSchema, isCodeField, optionLabel } from '@infora/contracts';
import { Badge, Button, Field, SectionLabel, SelectInput, Table, TextInput } from '@infora/ui';
import { Info } from 'lucide-react';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

// A short plain-language explainer for each column, shown on hover (T-195). These
// terms are ISO-19650 shorthand that a first-time owner won't know cold.
const COLUMN_HINTS: Record<string, string> = {
  Label: 'The human name of this attribute, shown on the plan and metadata card.',
  Key: 'The stable machine name used in data and code — lower-case, no spaces. Rename with care.',
  Type: 'How the value is entered: free text, a fixed list of options, a date, a person/people picker, or an auto-allocated serial number.',
  Options: 'For a Select type only — the allowed values, one per line as "CODE = Description" (e.g. ECV = Engineering – Civils). The code is stored; the description is shown alongside it in dropdowns.',
  Required: 'When ticked, a deliverable cannot be planned without a value for this field.',
  'In code':
    'When ticked, this field forms part of the coded reference (e.g. WA-BB-GEO-000123). The order of the rows sets the order of the segments.',
  Role: 'Marks this field as an appointment slot — author(s), document owner, reviewer(s), or lead reviewer — rather than a plain attribute.',
  Originator:
    'The one code segment that carries cross-organisation uniqueness — the producing party’s code. Only one field should be the originator.',
};

// A header cell carrying a hover explainer: the label plus a small info icon, with
// the tooltip on the whole cell so hovering anywhere over it explains the column.
function HeaderHint({ label, hintKey }: { label: string; hintKey?: string }) {
  const hint = COLUMN_HINTS[hintKey ?? label];
  return (
    <th title={hint} style={hint ? { cursor: 'help' } : undefined}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {hint && <Info size={13} aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      </span>
    </th>
  );
}

const emptyField = (): NamingSchemeField => ({ key: '', label: '', type: 'text' });

// Options are edited one per line as "CODE = Description" (the description is
// optional). We parse that into the codes (allowedValues) and a code→description
// map (allowedValueLabels); a bare code with no "=" just carries no description.
// Commas are still tolerated as separators for quick bare-code entry.
function parseOptions(text: string): Pick<NamingSchemeField, 'allowedValues' | 'allowedValueLabels'> {
  const allowedValues: string[] = [];
  const labels: Record<string, string> = {};
  for (const raw of text.split(/[\n,]/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    const code = (eq === -1 ? line : line.slice(0, eq)).trim();
    const desc = eq === -1 ? '' : line.slice(eq + 1).trim();
    if (!code) continue;
    allowedValues.push(code);
    if (desc) labels[code] = desc;
  }
  return { allowedValues, allowedValueLabels: Object.keys(labels).length ? labels : undefined };
}
function serializeOptions(f: NamingSchemeField): string {
  return (f.allowedValues ?? [])
    .map((v) => (f.allowedValueLabels?.[v] ? `${v} = ${f.allowedValueLabels[v]}` : v))
    .join('\n');
}

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

  // one field row, rendered against its global index so reorder/remove/edit act
  // on the flat scheme even though the table is grouped into sections (T-198)
  const fieldRow = (f: NamingSchemeField, i: number) => {
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
          <textarea
            className="field-input"
            rows={Math.min(6, Math.max(1, f.allowedValues?.length ?? 1))}
            placeholder="CODE = Description (one per line)"
            value={serializeOptions(f)}
            disabled={!canEdit || f.type !== 'select'}
            onChange={(e) => setField(i, parseOptions(e.target.value))}
            style={{ resize: 'vertical', minWidth: 220, fontFamily: 'inherit' }}
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
  };

  // three sections so it reads clearly: what forms the document number, what is
  // described alongside it, and who is appointed (T-198). Category follows the
  // field's flags, not its position.
  const sections: { title: string; hint: string; test: (f: NamingSchemeField) => boolean }[] = [
    { title: 'Coded reference', hint: 'these fields, in order, form the document number', test: (f) => isCodeField(f) },
    { title: 'Metadata', hint: 'described on the deliverable — never part of the number', test: (f) => !isCodeField(f) && !f.role },
    { title: 'Roles', hint: 'appointment slots, filled per deliverable on the plan', test: (f) => !!f.role },
  ];
  const colCount = canEdit ? 9 : 8;

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
              <HeaderHint label="Label" />
              <HeaderHint label="Key" />
              <HeaderHint label="Type" />
              <HeaderHint label="Options (code = description)" hintKey="Options" />
              <HeaderHint label="Required" />
              <HeaderHint label="In code" />
              <HeaderHint label="Role" />
              <HeaderHint label="Originator" />
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const rows = fields.map((f, i) => [f, i] as const).filter(([f]) => sec.test(f));
              if (rows.length === 0) return null;
              return (
                <Fragment key={sec.title}>
                  <tr>
                    <td colSpan={colCount} style={{ background: 'var(--surface-muted)', borderTop: '2px solid var(--border-default)' }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{sec.title}</span>{' '}
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>— {sec.hint}</span>
                    </td>
                  </tr>
                  {rows.map(([f, i]) => fieldRow(f, i))}
                </Fragment>
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
                      options={f.allowedValues.map((v) => ({ value: v, label: optionLabel(v, f.allowedValueLabels) }))}
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
