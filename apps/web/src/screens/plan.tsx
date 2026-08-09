// T-155/T-164 — the deliverable register (TIDP builder, ADR-0008/0033). One
// substrate, two views: a member reads/writes its own organisation's rows (the
// TIDP); the owner reads every organisation's (the MIDP consolidation). "New
// deliverable" opens a proper modal — the code-builder as live field pickers
// composing a preview reference (no window.prompt, no wizard). A new row creates
// a planned container; status is event-driven. Grounded in the ISO-19650 CDE
// register pattern and the ProjectWise friction map (B1 no-wizard, B4 attributes
// surfaced without manual column config).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type {
  AppointmentGrant,
  MeResponse,
  NamingScheme,
  PlanImportError,
  PlanImportFailure,
  PlanImportResult,
  PlanRow,
  RosterEntry,
} from '@infora/contracts';
import { isCodeField, optionLabel } from '@infora/contracts';
import { FileCog, FileText, FileUp, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, Combobox, Drawer, Field, Modal, SelectInput, Skeleton, Table, TextArea, TextInput } from '@infora/ui';
import type { BadgeTone } from '@infora/ui';
import { api, RequestError } from '../api';
import { MetadataModal } from '../metadata-modal';
import { OntologyPanel } from '../ontology-panel';
import { useMe } from '../session';
import { formatDate, statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

// live appointment names, lead + proposed marked — for the read-only team display
const liveNames = (
  grants: Array<{ name: string; isLead: boolean; revokedAt: string | null; confirmedAt?: string | null }>,
): string =>
  grants
    .filter((g) => g.revokedAt === null)
    .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}${g.confirmedAt === null ? ' · proposed' : ''}`)
    .join(', ') || '—';

const stateTone = (state: PlanRow['state']): BadgeTone =>
  state === 'live' ? 'success' : state === 'rejected' ? 'danger' : 'neutral';

function previewReference(scheme: NamingScheme, values: Record<string, string>): string {
  // only the code fields compose the reference (T-188)
  return scheme.fields
    .filter(isCodeField)
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
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [manualRef, setManualRef] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scheme = props.scheme;
  // the code inputs: the code fields, minus the auto-serial (T-188)
  const nonSerial = scheme?.fields.filter((f) => isCodeField(f) && !f.isSerial) ?? [];
  // schema-driven metadata: fields that are neither code nor role slots (T-189)
  const metaFields = scheme?.fields.filter((f) => !isCodeField(f) && !f.role) ?? [];
  const preview = scheme ? previewReference(scheme, values) : manualRef || 'WA-BB-GEO-004';
  const setValue = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));
  const setMeta = (key: string, v: string) => setMetaValues((s) => ({ ...s, [key]: v }));

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
      // the schema's metadata fields (T-189)
      for (const [k, v] of Object.entries(metaValues)) if (v) metadata[k] = v;
      // discipline is a code field but also surfaced at-a-glance (T-178)
      const disc = scheme ? values['discipline'] : undefined;
      if (disc) metadata['discipline'] = disc;
      await api.createPlanRow(props.projectId, reference, title.trim(), metadata);
      props.onCreated();
    } catch {
      setError('Could not create — check the reference is unique and scheme-compliant.');
      setBusy(false);
    }
  }

  const canCreate =
    !busy &&
    title.trim() !== '' &&
    (scheme ? nonSerial.every((f) => values[f.key]) : manualRef.trim() !== '') &&
    metaFields.every((f) => !f.required || (metaValues[f.key] ?? '') !== '');

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
                    options={f.allowedValues.map((v) => ({ value: v, label: optionLabel(v, f.allowedValueLabels) }))}
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

      {metaFields.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
          <span className="field-label">Details</span>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 4 }}
          >
            {metaFields.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? ' *' : '')}>
                {f.type === 'select' && f.allowedValues && f.allowedValues.length > 0 ? (
                  <SelectInput
                    value={metaValues[f.key] ?? ''}
                    onChange={(v) => setMeta(f.key, v)}
                    placeholder="—"
                    options={f.allowedValues.map((v) => ({ value: v, label: optionLabel(v, f.allowedValueLabels) }))}
                  />
                ) : f.type === 'date' ? (
                  <input
                    type="date"
                    className="field-input"
                    value={metaValues[f.key] ?? ''}
                    onChange={(e) => setMeta(f.key, e.target.value)}
                  />
                ) : (
                  <TextInput value={metaValues[f.key] ?? ''} onChange={(v) => setMeta(f.key, v)} />
                )}
              </Field>
            ))}
          </div>
          <span className="field-hint">Roles (authors, owner, reviewers) are set on the deliverable after it’s created.</span>
        </div>
      )}

      {error !== null && <div className="field-error">{error}</div>}
    </Modal>
  );
}

const IDENTITY_KEYS = new Set(['discipline']);
// revision is versioning-derived (ADR-0041) and suitability is a schema-defined
// deliverable attribute (set via the New-deliverable Details form) — neither is a
// free-text authoring field (T-191). Only genuine free-form annotations here.
const AUTHORING_FIELDS = [{ key: 'classification', label: 'Classification' }];

function DetailRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 96 }}>{props.label}</span>
      <span style={{ flex: 1 }}>{props.children}</span>
    </div>
  );
}

// Appoint / propose a team on a deliverable (T-190). Authors: the producing org
// appoints its own. Reviewers: the producing org proposes (the owner confirms in
// Review); the owner may appoint directly. One live lead per side.
type Grant = AppointmentGrant & { confirmedAt?: string | null };
function AppointmentEditor(props: {
  title: string;
  leadLabel: string;
  memberLabel: string;
  grants: Grant[];
  roster: RosterEntry[];
  showProposed?: boolean;
  canEdit: boolean;
  canConfirm?: boolean;
  onConfirm?: (grantId: string) => Promise<void>;
  onAdd: (participantId: string, isLead: boolean) => Promise<void>;
  onRemove: (grantId: string) => Promise<void>;
}) {
  const [pid, setPid] = useState<string | null>(null);
  const [lead, setLead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = props.grants.filter((g) => g.revokedAt === null);
  const appointed = new Set(live.map((g) => g.participantId));
  const candidates = props.roster.filter((r) => !appointed.has(r.participantId));
  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
      <span className="field-label">{props.title}</span>
      {live.length === 0 && <span className="field-hint">None appointed.</span>}
      {live.map((g) => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <span style={{ color: 'var(--text-muted)', minWidth: 96 }}>{g.isLead ? props.leadLabel : props.memberLabel}</span>
          <span style={{ flex: 1 }}>
            {g.name}
            {props.showProposed && g.confirmedAt == null && <span className="field-hint"> · proposed</span>}
          </span>
          {props.canConfirm && props.onConfirm && g.confirmedAt == null && (
            <button className="linklike" onClick={() => void props.onConfirm!(g.id)}>
              Confirm
            </button>
          )}
          {props.canEdit && (
            <button className="linklike" onClick={() => void props.onRemove(g.id)}>
              Remove
            </button>
          )}
        </div>
      ))}
      {props.canEdit && (
        <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          <Combobox
            value={pid}
            onChange={setPid}
            placeholder={`Add ${props.memberLabel.toLowerCase()}`}
            options={candidates.map((r) => ({ value: r.participantId, label: r.name, sub: r.organisationName }))}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /> Lead
            </label>
            <Button
              size="sm"
              variant="quiet"
              disabled={busy || pid === null}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await props.onAdd(pid!, lead);
                  setPid(null);
                  setLead(false);
                } catch {
                  setErr('Could not add — there may already be a lead.');
                }
                setBusy(false);
              }}
            >
              Add
            </Button>
            {err && <span className="field-hint" style={{ color: 'var(--feedback-danger-text)' }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverableDetail(props: {
  row: PlanRow;
  projectId: string;
  roster: RosterEntry[];
  canEdit: boolean; // producing super-user: authors, owner, metadata, remove
  isOwnerSuper: boolean; // owner super-user: appoints/confirms reviewers directly
  onChanged: (updated: PlanRow) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [row, setRow] = useState<PlanRow>(props.row);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState(props.row.workItem?.title ?? '');
  const authors = row.authors.filter((a) => a.revokedAt === null);
  const reviewers = row.reviewers.filter((r) => r.revokedAt === null);
  const isWithdrawn = row.state === 'withdrawn';
  const st = isWithdrawn
    ? { tone: 'neutral' as const, label: 'Removed from plan' }
    : row.workItem
      ? statusBadge(row.workItem.status)
      : { tone: stateTone(row.state), label: row.state.replace(/^./, (c) => c.toUpperCase()) };

  // producing-org participants for the document-owner picker
  const people = props.roster.filter((r) => r.organisationId === row.producingOrganisationId);
  const apply = (updated: PlanRow) => {
    setRow(updated);
    props.onChanged(updated);
  };
  // appointments return the grant, not the row — re-fetch the row to reflect them
  const reload = async () => {
    const res = await api.plan(props.projectId);
    const fresh = res.items.find((r) => r.containerId === row.containerId);
    if (fresh) apply(fresh);
  };
  const titleDirty = titleDraft.trim() !== '' && titleDraft.trim() !== (row.workItem?.title ?? '');
  const saveTitle = () => {
    if (!titleDirty) return;
    setBusy(true);
    void api
      .setPlanTitle(row.containerId, titleDraft.trim())
      .then(apply)
      .finally(() => setBusy(false));
  };

  return (
    <Drawer
      open
      onClose={props.onClose}
      title={row.documentReference ?? 'Deliverable'}
      footer={
        row.workItem && !isWithdrawn ? (
          <Button variant="primary" onClick={() => navigate(`/projects/${props.projectId}/work-items/${row.workItem!.id}`)}>
            Open work item
          </Button>
        ) : undefined
      }
    >
      {isWithdrawn && (
        <div className="banner" style={{ marginBottom: 10 }}>
          Removed from the plan{row.withdrawnReason ? ` — ${row.withdrawnReason}` : ''}. The container is kept as a record.
        </div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {props.canEdit && row.workItem ? (
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="field-label">Title</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <TextInput value={titleDraft} onChange={setTitleDraft} placeholder="Deliverable title" onEnter={saveTitle} />
              {titleDirty && (
                <Button size="sm" onClick={saveTitle} disabled={busy}>Save</Button>
              )}
            </div>
          </div>
        ) : (
          <DetailRow label="Title">{row.workItem?.title ?? 'Reference material'}</DetailRow>
        )}
        <DetailRow label="Producer">{row.producingOrganisationName}</DetailRow>
        <DetailRow label="Discipline">{String(row.metadata['discipline'] ?? '—')}</DetailRow>
        <DetailRow label="Status">
          <Badge tone={st.tone}>{st.label}</Badge>
        </DetailRow>
        <DetailRow label="Revision">{row.currentVersion?.versionReference ?? '—'}</DetailRow>
        <DetailRow label="Issued">
          {row.currentVersion ? formatDate(row.currentVersion.createdAt) : '—'}
        </DetailRow>
      </div>

      <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
        <span className="field-label">Document owner</span>
        {props.canEdit ? (
          <Combobox
            value={row.documentOwner?.participantId ?? null}
            onChange={(pid) => {
              setBusy(true);
              void api
                .setDocumentOwner(row.containerId, pid)
                .then(apply)
                .finally(() => setBusy(false));
            }}
            placeholder="Assign a document owner"
            options={people.map((p) => ({ value: p.participantId, label: p.name }))}
          />
        ) : (
          <DetailRow label="Owner">{row.documentOwner?.name ?? '—'}</DetailRow>
        )}
      </div>

      <AppointmentEditor
        title="Authoring team"
        leadLabel="Lead author"
        memberLabel="Author"
        grants={authors}
        roster={props.roster.filter((p) => p.organisationId === row.producingOrganisationId)}
        canEdit={props.canEdit}
        onAdd={(pid, lead) => api.grantAuthor(row.containerId, pid, lead).then(reload)}
        onRemove={(gid) => api.revokeAuthor(gid).then(reload)}
      />

      <AppointmentEditor
        title="Review group"
        leadLabel="Lead reviewer"
        memberLabel="Reviewer"
        grants={reviewers}
        roster={props.roster}
        showProposed
        // the producer proposes; the owner appoints directly (auto-confirmed) and
        // may confirm a proposal — either can set the reviewer up (ADR-0033, T-193)
        canEdit={props.canEdit || props.isOwnerSuper}
        canConfirm={props.isOwnerSuper}
        onConfirm={(gid) => api.confirmReviewer(gid).then(reload)}
        onAdd={(pid, lead) => api.grantReviewer(row.containerId, pid, lead).then(reload)}
        onRemove={(gid) => api.revokeReviewer(gid).then(reload)}
      />
      {reviewers.some((r) => r.confirmedAt === null) && (
        <span className="field-hint">
          {props.isOwnerSuper
            ? 'Confirm a proposed reviewer to give it effect, or appoint one directly.'
            : 'A proposed reviewer takes effect once the owner confirms it (owner, or in Review).'}
        </span>
      )}

      {row.sharedWith.length > 0 && (
        <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
          <span className="field-label">Shared with</span>
          {row.sharedWith.map((sh) => (
            <DetailRow key={sh.organisationId} label="Organisation">
              {sh.organisationName}
            </DetailRow>
          ))}
        </div>
      )}

      {/* T-243 — the project ontology: classification + typed relationships
          (ADR-0045). Read-only for non-producers; editable when canEdit. */}
      <OntologyPanel containerId={row.containerId} projectId={props.projectId} editable={props.canEdit} />

      {props.canEdit && (
        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12, marginTop: 4 }}>
          <span className="field-label">Plan</span>
          {isWithdrawn ? (
            <div>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void api
                    .restoreDeliverable(row.containerId)
                    .then(apply)
                    .finally(() => setBusy(false));
                }}
              >
                Restore to the plan
              </Button>
            </div>
          ) : removing ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <Field label="Reason for removal" hint="The container is kept as a record — say why it was removed.">
                <TextArea value={reason} onChange={setReason} rows={3} placeholder="e.g. Descoped — merged into WA-…-000123" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="quiet" onClick={() => { setRemoving(false); setReason(''); }}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={busy || reason.trim() === ''}
                  onClick={() => {
                    setBusy(true);
                    void api
                      .withdrawDeliverable(row.containerId, reason.trim())
                      .then((r) => { apply(r); setRemoving(false); })
                      .finally(() => setBusy(false));
                  }}
                >
                  Remove from plan
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button variant="quiet" onClick={() => setRemoving(true)}>
                Remove from plan…
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function PlanScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const isSuper = participant.elevated; // owner-super or guest-super may edit the plan (T-176)
  const navigate = useNavigate();

  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [scheme, setScheme] = useState<NamingScheme | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [metaRow, setMetaRow] = useState<PlanRow | null>(null);
  const [detailRow, setDetailRow] = useState<PlanRow | null>(null);
  const [query, setQuery] = useState('');
  // T-359 — the batch import off the T-358 template (create-only, whole-file verdict)
  const importInput = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PlanImportResult | null>(null);
  const [importFailures, setImportFailures] = useState<PlanImportFailure[] | null>(null);
  const [importProblem, setImportProblem] = useState<string | null>(null);

  async function importFile(file: File) {
    if (importing) return;
    setImporting(true);
    setImportResult(null);
    setImportFailures(null);
    setImportProblem(null);
    try {
      const result = await api.importPlan(projectId, file);
      setImportResult(result);
      load();
    } catch (e) {
      const body = e instanceof RequestError ? (e.body as PlanImportError | null) : null;
      if (body?.failures?.length) setImportFailures(body.failures);
      else if (body?.detail === 'title_column_required')
        setImportProblem('The file has no Title column — start from the schema’s Excel template.');
      else if (body?.detail === 'duplicate_columns')
        setImportProblem('Two columns map to the same field — remove the duplicate and try again.');
      else if (body?.detail === 'no_rows') setImportProblem('The file has no deliverable rows.');
      else if (body?.detail === 'reference_exists')
        setImportProblem('A composed reference already exists on this project — nothing was added.');
      else if (body?.detail === 'file_too_large') setImportProblem('The file is over 5 MB.');
      else if (e instanceof RequestError && e.status === 403)
        setImportProblem('Importing the plan is a super-user act.');
      else setImportProblem('That file could not be read as a plan spreadsheet.');
    } finally {
      setImporting(false);
    }
  }

  const load = useCallback(() => void api.plan(projectId).then((res) => setRows(res.items)), [projectId]);
  useEffect(load, [load]);
  useEffect(() => void api.namingScheme(projectId).then(setScheme), [projectId]);
  useEffect(() => void api.participants(projectId).then((r) => setRoster(r.items)), [projectId]);

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
          editable={isSuper && metaRow.producingOrganisationId === me.organisationId}
          identity={[
            { label: 'Reference', value: <span className="mono">{metaRow.documentReference}</span> },
            { label: 'Producer', value: metaRow.producingOrganisationName },
            { label: 'Discipline', value: String(metaRow.metadata['discipline'] ?? '—') },
            { label: 'State', value: metaRow.state },
            { label: 'Revision', value: <span className="mono">{metaRow.currentVersion?.versionReference ?? '—'}</span> },
            { label: 'Author(s)', value: liveNames(metaRow.authors) },
            { label: 'Reviewer(s)', value: liveNames(metaRow.reviewers) },
            { label: 'Document owner', value: metaRow.documentOwner?.name ?? '—' },
          ]}
          metadata={Object.fromEntries(
            Object.entries(metaRow.metadata).filter(([k]) => !IDENTITY_KEYS.has(k)),
          )}
          // schema-driven: the deliverable schema's metadata fields render as their
          // proper controls (selects with options), not raw custom text (T-192)
          suggestedFields={[
            ...(scheme?.fields
              .filter((f) => !isCodeField(f) && !f.role)
              .map((f) => ({
                key: f.key,
                label: f.label,
                type: f.type as 'text' | 'select' | undefined,
                allowedValues: f.allowedValues,
                allowedValueLabels: f.allowedValueLabels,
              })) ?? []),
            ...AUTHORING_FIELDS,
          ]}
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
      {detailRow && (
        <DeliverableDetail
          row={detailRow}
          projectId={projectId}
          roster={roster}
          canEdit={isSuper && detailRow.producingOrganisationId === me.organisationId}
          isOwnerSuper={isSuper && isOwner}
          onChanged={() => load()}
          onClose={() => setDetailRow(null)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="page">{isOwner ? 'Project schedule' : 'Deliverable plan'}</h1>
        <Badge tone="neutral">{isOwner ? 'MIDP' : 'TIDP'}</Badge>
      </div>
      <p className="page-sub">
        {isOwner
          ? 'Every organisation’s planned deliverables, consolidated. Each row is a container; status is event-driven.'
          : 'Your organisation’s planned deliverables. Add a deliverable to reserve a coded container; draft it in the sandbox, then bind and promote.'}
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
        <Button variant="quiet" size="sm" onClick={() => navigate(`/projects/${projectId}/plan/scheme`)}>
          <SlidersHorizontal size={14} strokeWidth={2} /> Coding scheme
        </Button>
        {isSuper && (
          <>
            <input
              ref={importInput}
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />
            <Button
              variant="quiet"
              size="sm"
              disabled={importing}
              onClick={() => importInput.current?.click()}
            >
              <FileUp size={14} strokeWidth={2} /> {importing ? 'Importing…' : 'Import from Excel'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} strokeWidth={2} /> New deliverable
            </Button>
          </>
        )}
      </div>

      {importResult && (
        <p className="page-sub" style={{ margin: '0 0 10px' }}>
          <Badge tone="success">Imported</Badge>{' '}
          {importResult.created} deliverable{importResult.created === 1 ? '' : 's'} added — references
          generated in file order.
          {importResult.ignoredColumns.length > 0 &&
            ` Ignored columns: ${importResult.ignoredColumns.join(', ')}.`}
        </p>
      )}
      {importProblem && (
        <p className="page-sub" style={{ margin: '0 0 10px' }}>
          <Badge tone="danger">Import refused</Badge> {importProblem}
        </p>
      )}
      {importFailures && (
        <Modal
          open
          onClose={() => setImportFailures(null)}
          title="Import refused — nothing was added"
          footer={<Button variant="primary" onClick={() => setImportFailures(null)}>Close</Button>}
        >
          <p style={{ marginTop: 0 }}>
            Every row must pass before any row is created. Fix these and import the file again:
          </p>
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {importFailures.map((f, i) => (
                  <tr key={i}>
                    <td className="mono">{f.row}</td>
                    <td>{f.problem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        </Modal>
      )}

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
            {rows === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={isOwner ? 7 : 6}>
                    <Skeleton height={18} />
                  </td>
                </tr>
              ))}
            {filtered.map((r) => (
              <tr
                key={r.containerId}
                onClick={() => setDetailRow(r)}
                style={{ cursor: 'pointer' }}
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
