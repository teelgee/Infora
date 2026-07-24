// T-155/T-164 — the deliverable register (TIDP builder, ADR-0008/0033). One
// substrate, two views: a member reads/writes its own organisation's rows (the
// TIDP); the owner reads every organisation's (the MIDP consolidation). "New
// deliverable" opens a proper modal — the code-builder as live field pickers
// composing a preview reference (no window.prompt, no wizard). A new row creates
// a planned container; status is event-driven. Grounded in the ISO-19650 CDE
// register pattern and the ProjectWise friction map (B1 no-wizard, B4 attributes
// surfaced without manual column config).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { MeResponse, NamingScheme, PlanRow } from '@infora/contracts';
import { FileCog, FileText, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, Field, Modal, SelectInput, Table, TextInput } from '@infora/ui';
import type { BadgeTone } from '@infora/ui';
import { api } from '../api';
import { MetadataModal } from '../metadata-modal';
import { useMe } from '../session';
import { statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

const stateTone = (state: PlanRow['state']): BadgeTone =>
  state === 'live' ? 'success' : state === 'rejected' ? 'danger' : 'neutral';

function previewReference(scheme: NamingScheme, values: Record<string, string>): string {
  return scheme.fields
    .map((f) => (f.isSerial ? '#'.repeat(f.width ?? 3) : values[f.key] || `‹${f.label}›`))
    .join(scheme.separator);
}

function NewDeliverableModal(props: {
  projectId: string;
  scheme: NamingScheme | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [manualRef, setManualRef] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scheme = props.scheme;
  const nonSerial = scheme?.fields.filter((f) => !f.isSerial) ?? [];
  const preview = scheme ? previewReference(scheme, values) : manualRef || 'WA-BB-GEO-004';
  const setValue = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      let reference = manualRef.trim();
      if (scheme) reference = (await api.generateReference(props.projectId, values)).reference;
      if (!reference) {
        setError('A reference is required.');
        setBusy(false);
        return;
      }
      const metadata: Record<string, string> = {};
      if (discipline.trim()) metadata['discipline'] = discipline.trim();
      await api.createPlanRow(props.projectId, reference, title.trim(), metadata);
      props.onCreated();
    } catch {
      setError('Could not create — check the reference is unique and scheme-compliant.');
      setBusy(false);
    }
  }

  const canCreate =
    !busy && title.trim() !== '' && (scheme ? nonSerial.every((f) => values[f.key]) : manualRef.trim() !== '');

  return (
    <Modal
      open
      onClose={props.onClose}
      title="New deliverable"
      size="md"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={!canCreate}>
            Create deliverable
          </Button>
        </>
      }
    >
      <Field label="Title">
        <TextInput value={title} onChange={setTitle} placeholder="e.g. EIA Scoping Method Statement" autoFocus />
      </Field>

      {scheme ? (
        <div>
          <span className="field-label">Coded reference</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))',
              gap: 8,
              marginTop: 4,
            }}
          >
            {nonSerial.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.allowedValues && f.allowedValues.length > 0 ? (
                  <SelectInput
                    value={values[f.key] ?? ''}
                    onChange={(v) => setValue(f.key, v)}
                    placeholder="—"
                    options={f.allowedValues.map((v) => ({ value: v, label: v }))}
                  />
                ) : (
                  <TextInput value={values[f.key] ?? ''} onChange={(v) => setValue(f.key, v)} mono />
                )}
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="field-label">Preview</span>
            <span className="mono">{preview}</span>
            <span className="field-hint">the serial is allocated on create</span>
          </div>
        </div>
      ) : (
        <Field
          label="Reference"
          hint="No coding scheme defined yet — enter a reference by hand, or define a scheme first"
        >
          <TextInput value={manualRef} onChange={setManualRef} placeholder="WA-BB-GEO-004" mono />
        </Field>
      )}

      <Field label="Discipline (optional)">
        <TextInput value={discipline} onChange={setDiscipline} placeholder="e.g. Geotechnical" />
      </Field>

      {error !== null && <div className="field-error">{error}</div>}
    </Modal>
  );
}

const IDENTITY_KEYS = new Set(['discipline']);
const AUTHORING_FIELDS = [
  { key: 'revision', label: 'Revision' },
  { key: 'suitability', label: 'Suitability' },
  { key: 'classification', label: 'Classification' },
];

export function PlanScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const navigate = useNavigate();

  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [scheme, setScheme] = useState<NamingScheme | null>(null);
  const [creating, setCreating] = useState(false);
  const [metaRow, setMetaRow] = useState<PlanRow | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => void api.plan(projectId).then((res) => setRows(res.items)), [projectId]);
  useEffect(load, [load]);
  useEffect(() => void api.namingScheme(projectId).then(setScheme), [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows ?? [];
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.documentReference ?? '').toLowerCase().includes(q) ||
        (r.workItem?.title ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="content">
      {creating && (
        <NewDeliverableModal
          projectId={projectId}
          scheme={scheme}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {metaRow && (
        <MetadataModal
          title={`Metadata — ${metaRow.documentReference ?? 'deliverable'}`}
          editable={metaRow.producingOrganisationId === me.organisationId}
          identity={[
            { label: 'Reference', value: <span className="mono">{metaRow.documentReference}</span> },
            { label: 'Producer', value: metaRow.producingOrganisationName },
            { label: 'Discipline', value: String(metaRow.metadata['discipline'] ?? '—') },
            { label: 'State', value: metaRow.state },
          ]}
          metadata={Object.fromEntries(
            Object.entries(metaRow.metadata).filter(([k]) => !IDENTITY_KEYS.has(k)),
          )}
          suggestedFields={AUTHORING_FIELDS}
          onClose={() => setMetaRow(null)}
          onSave={async (authoring) => {
            const merged: Record<string, unknown> = { ...authoring };
            if (metaRow.metadata['discipline'] !== undefined) merged['discipline'] = metaRow.metadata['discipline'];
            await api.setContainerMetadata(metaRow.containerId, merged);
            setMetaRow(null);
            load();
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="page">{isOwner ? 'Project schedule' : 'Deliverable plan'}</h1>
        <Badge tone="neutral">{isOwner ? 'MIDP' : 'TIDP'}</Badge>
      </div>
      <p className="page-sub">
        {isOwner
          ? 'Every organisation’s planned deliverables, consolidated. Each row is a container; status is event-driven.'
          : 'Your organisation’s planned deliverables. Add a deliverable to reserve a coded container; draft it in the sandbox, then bind and promote.'}{' '}
        <Link to={`/projects/${projectId}/plan/scheme`}>
          <SlidersHorizontal size={12} strokeWidth={2} style={{ verticalAlign: -2 }} /> Coding scheme
        </Link>
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '12px 0' }}>
        <div className="field-input combobox-control" style={{ maxWidth: 280 }}>
          <Search size={13} strokeWidth={2} className="combobox-icon" />
          <input
            className="combobox-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference or title"
          />
        </div>
        <span style={{ marginLeft: 'auto' }} />
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2} /> New deliverable
        </Button>
      </div>

      <Table>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Title</th>
              {isOwner && <th>Producer</th>}
              <th>Status</th>
              <th>Revision</th>
              <th>Verdict</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.containerId}
                onClick={() => r.workItem && navigate(`/projects/${projectId}/work-items/${r.workItem.id}`)}
                style={{ cursor: r.workItem ? 'pointer' : 'default' }}
              >
                <td>
                  <span className="ficon">
                    <FileText size={14} strokeWidth={2} />
                  </span>
                  <span className="mono">{r.documentReference}</span>
                </td>
                <td>{r.workItem?.title ?? <span style={{ color: 'var(--text-muted)' }}>Reference material</span>}</td>
                {isOwner && <td style={{ color: 'var(--text-muted)' }}>{r.producingOrganisationName}</td>}
                <td>
                  {(() => {
                    const st = r.workItem
                      ? statusBadge(r.workItem.status)
                      : { tone: stateTone(r.state), label: r.state.replace(/^./, (ch) => ch.toUpperCase()) };
                    return <Badge tone={st.tone}>{st.label}</Badge>;
                  })()}
                </td>
                <td className="mono">{r.currentVersion?.versionReference ?? '—'}</td>
                <td>{r.deliverableCode ? `${r.deliverableCode.code} · ${r.deliverableCode.description}` : '—'}</td>
                <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="quiet" onClick={() => setMetaRow(r)}>
                    <FileCog size={13} strokeWidth={2} /> Metadata
                  </Button>
                </td>
              </tr>
            ))}
            {rows !== null && filtered.length === 0 && (
              <tr>
                <td colSpan={isOwner ? 7 : 6} style={{ color: 'var(--text-muted)' }}>
                  {rows.length === 0 ? 'No deliverables planned yet — add the first one.' : 'No matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}
