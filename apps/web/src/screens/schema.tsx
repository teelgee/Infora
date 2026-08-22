// T-156 / T-188 — the deliverable-plan (TIDP) schema surface. The owner
// super-user defines the project-wide schema: one unified field list where each
// field can be part of the coded reference, a metadata attribute, and/or an
// appointment role slot. A default Infora schema preloads and is fully editable
// (change fields, add fields). A guest super-user proposes additions; everyone
// else views. The code-builder previews a compliant reference from the code fields.
import { Fragment, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import type { MeResponse, NamingProposal, NamingSchemeField, SchemaFieldRole, SchemaFieldType } from '@infora/contracts';
import { defaultDeliverableSchema, isCodeField, optionLabel } from '@infora/contracts';
import { Badge, Button, Field, Modal, SectionLabel, SelectInput, Table, TextInput } from '@infora/ui';
import { Info, Plus, X } from 'lucide-react';
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

// A header cell carrying a hover explainer: the label plus a small info icon.
// The explainer is a JS-positioned fixed popover (not a native `title`, which is
// slow and gets clipped by the table's scroll container) so the detail actually
// shows on hover.
function HeaderHint({ label, hintKey }: { label: string; hintKey?: string }) {
  const hint = COLUMN_HINTS[hintKey ?? label];
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (!hint) return <th>{label}</th>;
  return (
    <th style={{ cursor: 'help', overflow: 'visible' }}>
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: Math.min(r.left, window.innerWidth - 340), y: r.bottom + 6 });
        }}
        onMouseLeave={() => setPos(null)}
      >
        {label}
        <Info size={13} aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </span>
      {pos && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 1000,
            maxWidth: 320,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.45,
            textTransform: 'none',
            letterSpacing: 'normal',
            whiteSpace: 'normal',
            color: 'var(--text-primary)',
            background: 'var(--surface-pane)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)',
            pointerEvents: 'none',
          }}
        >
          {hint}
        </div>
      )}
    </th>
  );
}

const emptyField = (): NamingSchemeField => ({ key: '', label: '', type: 'text' });

// A structured editor for a Select field's options — two columns (code +
// description) with add/remove, in a modal. No free-text parsing: each input is
// independently controlled, so spaces and mid-edit typing behave normally, and
// it scales to the long routewide code lists.
function OptionsEditor(props: {
  field: NamingSchemeField;
  onSave: (patch: Pick<NamingSchemeField, 'allowedValues' | 'allowedValueLabels'>) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ code: string; desc: string }[]>(() =>
    (props.field.allowedValues ?? []).map((c) => ({ code: c, desc: props.field.allowedValueLabels?.[c] ?? '' })),
  );
  const set = (i: number, patch: Partial<{ code: string; desc: string }>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { code: '', desc: '' }]);
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const save = () => {
    const allowedValues: string[] = [];
    const labels: Record<string, string> = {};
    for (const r of rows) {
      const code = r.code.trim();
      if (!code) continue;
      allowedValues.push(code);
      const desc = r.desc.trim();
      if (desc) labels[code] = desc;
    }
    props.onSave({ allowedValues, allowedValueLabels: Object.keys(labels).length ? labels : undefined });
    props.onClose();
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Options — ${props.field.label || props.field.key || 'field'}`}
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>Cancel</Button>
          <Button onClick={save}>Done</Button>
        </>
      }
    >
      <p className="page-sub" style={{ marginTop: 0 }}>
        The code is stored and used in the reference; the description is shown alongside it in dropdowns.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '52vh', overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 32px', gap: 8 }}>
          <SectionLabel>Code</SectionLabel>
          <SectionLabel>Description</SectionLabel>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 32px', gap: 8, alignItems: 'center' }}>
            <TextInput value={r.code} onChange={(v) => set(i, { code: v })} placeholder="ECV" mono />
            <TextInput value={r.desc} onChange={(v) => set(i, { desc: v })} placeholder="Engineering – Civils" />
            <button className="fb-btn" title="Remove option" onClick={() => remove(i)}>
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        {rows.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No options yet.</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <Button variant="quiet" size="sm" onClick={add}>
          <Plus size={14} aria-hidden /> Add option
        </Button>
      </div>
    </Modal>
  );
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
  const [editingOptions, setEditingOptions] = useState<number | null>(null);
  // T-371 — the review period's project default, in working days. Its own
  // section below, deliberately NOT a row in the field table above.
  const [reviewPeriodDays, setReviewPeriodDays] = useState('');
  const [savedPeriod, setSavedPeriod] = useState<number | null>(null);
  const [periodSaved, setPeriodSaved] = useState(false);

  const loadProposals = () => void api.namingProposals(projectId).then((r) => setProposals(r.items));
  useEffect(() => {
    // T-376 — no null branch: the read always returns a scheme (the Infora
    // default when none has been saved, T-188)
    void api.namingScheme(projectId).then((s) => {
      setSeparator(s.separator);
      setFields(s.fields);
    });
    void api.reviewPeriod(projectId).then((r) => {
      setSavedPeriod(r.defaultDays);
      setReviewPeriodDays(String(r.defaultDays));
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

  async function saveReviewPeriod() {
    const days = Number.parseInt(reviewPeriodDays, 10);
    if (!Number.isFinite(days) || days < 1) return;
    const saved = await api.setReviewPeriod(projectId, days);
    setSavedPeriod(saved.defaultDays);
    setReviewPeriodDays(String(saved.defaultDays));
    setPeriodSaved(true);
    setTimeout(() => setPeriodSaved(false), 1500);
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
          {f.type === 'select' ? (
            canEdit ? (
              <Button variant="quiet" size="sm" onClick={() => setEditingOptions(i)}>
                {(f.allowedValues?.length ?? 0) > 0
                  ? `${f.allowedValues!.length} option${f.allowedValues!.length === 1 ? '' : 's'} · Edit`
                  : 'Add options'}
              </Button>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {(f.allowedValues?.length ?? 0)} option{(f.allowedValues?.length ?? 0) === 1 ? '' : 's'}
              </span>
            )
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>—</span>
          )}
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

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 10px' }}>
        <Button variant="quiet" size="sm" onClick={() => void api.downloadPlanTemplate(projectId)}>
          Download Excel template
        </Button>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          One column per field below — teams draft the deliverables list in Excel; references are
          generated when the plan imports it, never in the sheet.
        </span>
      </div>

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

      {/* T-371 (ADR-0005 addendum, 2026-08-22) — the review period's project
          default. Its OWN section and deliberately not a field in the table
          above: the schema's fields are the header row of the fillable
          deliverables template (T-337/T-359), so a review period modelled as one
          would arrive as a column nobody should be filling in. */}
      <SectionLabel>Review period</SectionLabel>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px', maxWidth: 640, lineHeight: 1.5 }}>
        How long a review round is expected to take, in working days — Monday to Friday, with no
        holiday calendar. Each round’s target date is computed from it when the deliverable is
        promoted, and the lead author may adjust it for a single submission. It chases the review
        group and marks a round overdue; it never closes a round, which stays the lead reviewer’s
        act. Project configuration, not a schema attribute.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 4 }}>
        <div style={{ width: 160 }}>
          <Field label="Default per round">
            <TextInput
              value={reviewPeriodDays}
              onChange={setReviewPeriodDays}
              disabled={!canEdit}
              placeholder="10"
              onEnter={() => void saveReviewPeriod()}
            />
          </Field>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingBottom: 10 }}>working days</span>
        {canEdit && (
          <>
            <Button
              size="sm"
              disabled={
                reviewPeriodDays.trim() === '' ||
                Number.parseInt(reviewPeriodDays, 10) === savedPeriod ||
                !(Number.parseInt(reviewPeriodDays, 10) >= 1)
              }
              onClick={() => void saveReviewPeriod()}
            >
              Save
            </Button>
            {periodSaved && <Badge tone="success">Saved</Badge>}
          </>
        )}
      </div>

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

      {editingOptions !== null && fields[editingOptions] && (
        <OptionsEditor
          field={fields[editingOptions]}
          onSave={(patch) => setField(editingOptions, patch)}
          onClose={() => setEditingOptions(null)}
        />
      )}
    </div>
  );
}
