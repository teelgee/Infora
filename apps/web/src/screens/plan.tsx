// T-155/T-164 — the deliverable register (TIDP builder, ADR-0008/0033). One
// substrate, two views: a member reads/writes its own organisation's rows (the
// TIDP); the owner reads every organisation's (the MIDP consolidation). "New
// deliverable" opens a proper modal — the code-builder as live field pickers
// composing a preview reference (no window.prompt, no wizard). A new row creates
// a planned container; status is event-driven. Grounded in the ISO-19650 CDE
// register pattern and the ProjectWise friction map (B1 no-wizard, B4 attributes
// surfaced without manual column config).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router';
import type {
  AppointmentGrant,
  MeResponse,
  NamingScheme,
  PlanImportError,
  PlanImportFailure,
  PlanImportResult,
  PlanQuery,
  PlanRow,
  RosterEntry,
} from '@infora/contracts';
import { isCodeField, isColumnableField, optionLabel } from '@infora/contracts';
import { Columns3, FileCog, FileText, FileUp, Plus, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, Combobox, DropdownMenuItem, Field, Modal, Register, SelectInput, Table, TextArea, TextInput } from '@infora/ui';
import type { RegisterColumn, RegisterFilterChip, RegisterSort } from '@infora/ui';
import { SavedViewsMenu } from '../saved-views-menu';
import { api, RequestError } from '../api';
import { MetadataModal } from '../metadata-modal';
import { OntologyPanel } from '../ontology-panel';
import { VisibilityPanel } from '../visibility-panel';
import type { Viewer } from '../visibility-panel';
import { useMe } from '../session';
import { contextStateBadge, formatDate, lifecycleBadgeOf } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

// live appointment names, lead + proposed marked — for the read-only team display
const liveNames = (
  grants: Array<{ name: string; isLead: boolean; revokedAt: string | null; confirmedAt?: string | null }>,
): string =>
  grants
    .filter((g) => g.revokedAt === null)
    .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}${g.confirmedAt === null ? ' · proposed' : ''}`)
    .join(', ') || '—';

function previewReference(scheme: NamingScheme, values: Record<string, string>): string {
  // only the code fields compose the reference (T-188)
  return scheme.fields
    .filter(isCodeField)
    .map((f) => (f.isSerial ? '#'.repeat(f.width ?? 3) : values[f.key] || `‹${f.label}›`))
    .join(scheme.separator);
}

/** T-376 — the scheme is REQUIRED, not nullable. This modal used to take
 * `NamingScheme | null` and render a hand-typed reference field for the null
 * case, which had no reachable state: the read always returns a scheme, so null
 * only ever meant "not loaded yet" or "the read failed". Both of those are the
 * screen's business, and the screen now refuses to open this at all until it
 * holds one — because the alternative was offering to invent a reference, which
 * is precisely what ADR-0008's generated-never-invented rule exists to stop. */
function NewDeliverableModal(props: {
  projectId: string;
  scheme: NamingScheme;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scheme = props.scheme;
  // the code inputs: the code fields, minus the auto-serial (T-188)
  const nonSerial = scheme.fields.filter((f) => isCodeField(f) && !f.isSerial);
  // schema-driven metadata: fields that are neither code nor role slots (T-189)
  const metaFields = scheme.fields.filter((f) => !isCodeField(f) && !f.role);
  const preview = previewReference(scheme, values);
  const setValue = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));
  const setMeta = (key: string, v: string) => setMetaValues((s) => ({ ...s, [key]: v }));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      // the reference is generated from the scheme, always (ADR-0008)
      const reference = (await api.generateReference(props.projectId, values)).reference;
      const metadata: Record<string, string> = {};
      // the schema's metadata fields (T-189)
      for (const [k, v] of Object.entries(metaValues)) if (v) metadata[k] = v;
      // discipline is a code field but also surfaced at-a-glance (T-178)
      const disc = values['discipline'];
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
    nonSerial.every((f) => values[f.key]) &&
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
  /** whether the Lead checkbox is offered — lead (re)assignment can be a
   * narrower right than adding members (T-362) */
  allowLead?: boolean;
  /** per-grant removal right — a delegated editor may add but not remove a
   * lead row (T-362) */
  canRemoveGrant?: (grant: Grant) => boolean;
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
          {props.canEdit && (props.canRemoveGrant?.(g) ?? true) && (
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
            {(props.allowLead ?? true) && (
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /> Lead
              </label>
            )}
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

export function DeliverableDetail(props: {
  row: PlanRow;
  projectId: string;
  roster: RosterEntry[];
  canEdit: boolean; // producing super-user: everything, incl. remove + lead reassignment
  // T-362 (ADR-0033 addendum) — the row's live lead author: title, metadata,
  // other authors, reviewer proposals. NOT withdraw, NOT lead reassignment,
  // NOT the document owner.
  isLeadAuthor: boolean;
  isOwnerSuper: boolean; // owner super-user: appoints/confirms reviewers directly
  // T-456 — who is looking: decides which visibility doors are drawn
  viewer: Viewer;
  onChanged: (updated: PlanRow) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const canEditDelegated = props.canEdit || props.isLeadAuthor;
  const [row, setRow] = useState<PlanRow>(props.row);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState(props.row.workItem?.title ?? '');
  const authors = row.authors.filter((a) => a.revokedAt === null);
  const reviewers = row.reviewers.filter((r) => r.revokedAt === null);
  const isWithdrawn = row.state === 'withdrawn';
  // T-389 — `withdrawn` is TWO ACTS THAT SHARE A WORD (ADR-0013's amendment):
  // before publication it is the producing organisation removing a row from its
  // own plan (T-189), after it is the owner stopping a published deliverable
  // being relied on. Calling both "removed from the plan" asserted the wrong
  // one half the time, and the two have different authors and different undos.
  // T-455 — one lifecycle vocabulary: the same words this row shows in the
  // table, the library and the review screens
  const st = lifecycleBadgeOf(row);
  const contextBadge = contextStateBadge(row.contextState);

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
    // T-361 (S4) — the row's detail is the design system's modal-card
    // treatment, as the plan's metadata view already is; drawers stay for
    // genuinely lateral context elsewhere.
    <Modal
      open
      onClose={props.onClose}
      title={row.documentReference ?? 'Deliverable'}
      size="lg"
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
          {row.inLibrary
            ? 'Withdrawn from the project library'
            : 'Removed from the plan'}
          {row.withdrawnReason ? ` — ${row.withdrawnReason}` : ''}.{' '}
          {row.inLibrary
            ? 'It stands as a record and no longer grounds.'
            : 'The container is kept as a record.'}
          {row.withdrawnBy && ` Withdrawn by ${row.withdrawnBy.name}.`}
        </div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {canEditDelegated && row.workItem ? (
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, rowGap: 6 }}>
          <DetailRow label="Producer">{row.producingOrganisationName}</DetailRow>
          <DetailRow label="Discipline">{String(row.metadata['discipline'] ?? '—')}</DetailRow>
          <DetailRow label="Status">
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
              <Badge tone={st.tone}>{st.label}</Badge>
              {/* T-388 — context state beside record state, never instead of it:
                  they answer different questions, and a row can be perfectly
                  live and still outside the AI's reach. */}
              {contextBadge && <Badge tone={contextBadge.tone}>{contextBadge.label}</Badge>}
            </span>
          </DetailRow>
          <DetailRow label="Revision">{row.currentVersion?.versionReference ?? '—'}</DetailRow>
          <DetailRow label="Issued">
            {row.currentVersion ? formatDate(row.currentVersion.createdAt) : '—'}
          </DetailRow>
        </div>
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
        canEdit={canEditDelegated}
        // lead reassignment stays the super user's act (T-362): a lead author
        // may neither crown a lead nor remove one
        allowLead={props.canEdit}
        canRemoveGrant={(g) => props.canEdit || !g.isLead}
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
        // may confirm a proposal — either can set the reviewer up (ADR-0033,
        // T-193). The row's lead author proposes too (T-362), never confirms.
        canEdit={canEditDelegated || props.isOwnerSuper}
        canRemoveGrant={() => props.canEdit || props.isOwnerSuper}
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

      {/* T-456 — who can see this, and the share and narrowing doors */}
      <VisibilityPanel row={row} roster={props.roster} viewer={props.viewer} onChanged={() => void reload()} />

      {/* T-243 — the project ontology: classification + typed relationships
          (ADR-0045). Read-only for non-producers; editable when canEdit. */}
      <OntologyPanel containerId={row.containerId} projectId={props.projectId} editable={canEditDelegated} />

      {/* T-456 — erase a wrongly-loaded reference document from the library
          (ADR-0050 §7): the owner organisation's admin, only once withdrawn,
          only reference material, only with the reference typed */}
      {props.viewer.isOwner && props.viewer.isOrgAdmin && isWithdrawn && row.inLibrary && row.workItem === null && (
        <LibraryRemovalControl
          row={row}
          projectId={props.projectId}
          onRemoved={() => {
            props.onChanged(row);
            props.onClose();
          }}
        />
      )}

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
    </Modal>
  );
}

// T-456 — the second step after withdrawal, and it cannot be the first
// (ADR-0050 §7): erase a withdrawn reference document from the owner's
// library. The typed reference is checked on the server; this control only
// carries what the person typed, and says plainly that there is no undo.
function LibraryRemovalControl(props: { row: PlanRow; projectId: string; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reference = props.row.documentReference ?? '';
  return (
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
      <span className="field-label">Library</span>
      {open ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <Field
            label="Type the reference to confirm"
            hint="Erases every version, index entry and stored file of this reference document. The record of the erasure is kept. There is no undo."
          >
            <TextInput value={confirmation} onChange={setConfirmation} placeholder={reference} />
          </Field>
          {error && <span className="field-hint" style={{ color: 'var(--danger-text, inherit)' }}>{error}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="quiet" onClick={() => { setOpen(false); setConfirmation(''); setError(null); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy || confirmation.trim() === ''}
              onClick={() => {
                setBusy(true);
                setError(null);
                void api
                  .removeLibraryContainer(props.projectId, { containerId: props.row.containerId, confirmation })
                  .then(() => props.onRemoved())
                  .catch((e: unknown) =>
                    setError(
                      e instanceof RequestError && e.body?.detail === 'confirmation_mismatch'
                        ? 'The reference typed does not match — type it exactly as shown.'
                        : e instanceof RequestError && e.status === 409
                          ? `Refused — ${e.body?.detail ?? 'the document cannot be removed in its current state'}.`
                          : 'Refused.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Erase {reference} from the library
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="quiet" onClick={() => setOpen(true)}>
            Erase from the library permanently…
          </Button>
        </div>
      )}
    </div>
  );
}

// T-360 (S3) — the org-standard plan columns: which schema fields ride the plan
// table as extra columns for EVERY member of this organisation. Locked by
// design — there is no personal override, which is why the control is
// super-user-only and the copy says who it binds.
function PlanColumnsModal(props: {
  projectId: string;
  scheme: NamingScheme | null;
  current: string[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const available = props.scheme?.fields.filter(isColumnableField) ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set(props.current ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(columns: string[] | null) {
    setBusy(true);
    setError(null);
    try {
      await api.setPlanColumns(props.projectId, columns);
      props.onSaved();
    } catch {
      setError('Could not save the columns — the schema may have changed; reload and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      title="Plan columns — organisation standard"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => void save(null)}>
            Reset to default
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              // scheme order, not click order — the table reads like the schema
              const columns = available.filter((f) => selected.has(f.key)).map((f) => f.key);
              void save(columns.length > 0 ? columns : null);
            }}
          >
            Save for the organisation
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
        Extra columns shown to everyone in your organisation on this project — the standard is set
        here and applies to all members; there are no personal overrides.
      </p>
      {available.map((f) => (
        <label key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
          <input
            type="checkbox"
            checked={selected.has(f.key)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(f.key);
              else next.delete(f.key);
              setSelected(next);
            }}
          />
          <span>{f.label}</span>
          <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 12 }}>
            {f.key}
          </span>
        </label>
      ))}
      {available.length === 0 && <p>No schema fields available to show.</p>}
      {error && <p style={{ color: 'var(--danger, #b3261e)', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

// T-462 — THE PLAN ON THE REGISTER, and the review list folded into it as a
// view. *In plain terms: the plan, the review list and the library now look
// and work the same way — one search box that finds a document by its code,
// its title or what it says, filter chips, a Columns chooser, sort, pages,
// saved views, and tick boxes with an Export. "Review" is the same list seen
// for reviewing: its rows open the review status page and it shows who is
// writing and who is reviewing each deliverable.*
//
// The organisation-standard columns stay exactly as T-360 ruled them: set by
// the organisation's super user for everyone in it, and never hideable from
// a personal view — a personal view may hide the platform's own columns and
// may not add one. The query lives in the address so a filtered view survives
// reload, and a saved view keeps it under a name (T-460).
export function PlanScreen(props: { view?: 'plan' | 'review' } = {}) {
  const view = props.view ?? 'plan';
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const isSuper = participant.elevated; // owner-super or guest-super may edit the plan (T-176)
  const navigate = useNavigate();

  // T-362 (ADR-0033 addendum) — row-scoped delegation: the row's live lead
  // author edits its metadata alongside the producing org's super users
  const isRowLeadAuthor = (r: PlanRow) =>
    r.producingOrganisationId === me.organisationId &&
    r.authors.some(
      (a) => a.isLead && a.revokedAt === null && a.participantId === participant.participantId,
    );
  const canEditRow = (r: PlanRow) =>
    (isSuper && r.producingOrganisationId === me.organisationId) || isRowLeadAuthor(r);

  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readPlanQuery(params), [params]);
  const [result, setResult] = useState<{ items: PlanRow[]; total: number; page: number; pageSize: number } | null>(null);
  const rows = result?.items ?? null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheme, setScheme] = useState<NamingScheme | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [metaRow, setMetaRow] = useState<PlanRow | null>(null);
  const [detailRow, setDetailRow] = useState<PlanRow | null>(null);
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

  // T-360 — the org-standard extra columns (schema field keys; null = default)
  const [planColumns, setPlanColumns] = useState<string[] | null>(null);
  const [editingColumns, setEditingColumns] = useState(false);

  // responses may land out of order (a ranked search is slower than the plain
  // page it replaces), so only the latest request's answer is kept
  const requestSeq = useRef(0);
  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    void api
      .planPage(projectId, {
        q: query.q,
        sort: query.sort,
        direction: query.direction,
        state: query.state,
        kind: query.kind,
        producerId: query.producerId,
        page: query.page,
        pageSize: PLAN_PAGE_SIZE,
      })
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setResult({ items: res.items, total: res.total ?? res.items.length, page: res.page ?? 1, pageSize: res.pageSize ?? PLAN_PAGE_SIZE });
        setPlanColumns(res.planColumns);
      });
  }, [projectId, query]);
  useEffect(load, [load]);
  const setQuery = (next: Partial<PlanScreenQuery>, resetPage = true) => {
    setParams(writePlanQuery({ ...query, ...next, ...(resetPage && !('page' in next) && { page: 1 }) }));
  };
  // T-376 — the read never returns null, so the three states are the CLIENT's:
  // not yet arrived, arrived, and failed. They used to collapse into one `null`,
  // and the New-deliverable modal read that null as "this project has no coding
  // scheme" and offered to hand-type a reference — which meant a slow read
  // flashed a control that then vanished, and a FAILED read silently reopened
  // inventing references (ADR-0008's generated-never-invented rule). Creation
  // now waits, and refuses rather than degrades.
  const [schemeFailed, setSchemeFailed] = useState(false);
  useEffect(() => {
    setSchemeFailed(false);
    void api.namingScheme(projectId).then(setScheme, () => setSchemeFailed(true));
  }, [projectId]);
  useEffect(() => void api.participants(projectId).then((r) => setRoster(r.items)), [projectId]);

  // the extra columns the org standard names, resolved against the schema —
  // an unknown key (schema edited since) renders nothing rather than breaking
  const liveNamesOf = (grants: PlanRow['reviewers'] | PlanRow['authors']) =>
    grants
      .filter((g) => g.revokedAt === null)
      .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}`)
      .join(', ');
  const producers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of roster) if (!seen.has(r.organisationId)) seen.set(r.organisationId, r.organisationName);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [roster]);
  const activeFilters: RegisterFilterChip[] = [
    ...(query.state !== 'any' ? [{ key: 'state', label: query.state[0]!.toUpperCase() + query.state.slice(1) }] : []),
    ...(query.kind !== 'any' ? [{ key: 'kind', label: query.kind === 'reference' ? 'Reference material' : 'Deliverables' }] : []),
    ...(query.producerId ? [{ key: 'producer', label: `Produced by ${producers.find((p) => p.value === query.producerId)?.label ?? '…'}` }] : []),
  ];
  const extraFields = useMemo(
    () =>
      (planColumns ?? []).flatMap((key) => {
        const field = scheme?.fields.find((f) => f.key === key);
        return field ? [field] : [];
      }),
    [planColumns, scheme],
  );

  // the columns: the reference (never hideable), the title, the organisation's
  // standard columns (locked — T-360), then the platform's own, which a
  // personal view may hide; the review view adds who writes and who reviews
  const columns: RegisterColumn<PlanRow>[] = [
    {
      key: 'reference',
      label: 'Reference',
      sortable: true,
      render: (r) => (
        <>
          <span className="ficon">
            <FileText size={14} strokeWidth={2} />
          </span>
          {view === 'review' ? (
            // T-457 — the reference is the door to the document page; the row stays the door to the review
            <button
              className="linklike mono"
              onClick={(e) => {
                e.stopPropagation();
                void navigate(`/projects/${projectId}/documents/${r.containerId}`);
              }}
              title="Open the document page"
            >
              {r.documentReference}
            </button>
          ) : (
            <span className="mono">{r.documentReference}</span>
          )}
        </>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (r) => r.title ?? <span style={{ color: 'var(--text-muted)' }}>Reference material</span>,
    },
    ...extraFields.map(
      (f): RegisterColumn<PlanRow> => ({
        key: `field:${f.key}`,
        label: f.label,
        render: (r) => {
          const raw = r.metadata[f.key];
          const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
          return <span title={value !== null ? optionLabel(value, f.allowedValueLabels) : undefined}>{value ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}</span>;
        },
      }),
    ),
    ...(isOwner
      ? [{ key: 'producer', label: 'Producer', hideable: true, render: (r: PlanRow) => <span style={{ color: 'var(--text-muted)' }}>{r.producingOrganisationName}</span> }]
      : []),
    {
      key: 'state',
      label: 'Status',
      sortable: true,
      render: (r) => {
        const st = lifecycleBadgeOf(r);
        return <Badge tone={st.tone}>{st.label}</Badge>;
      },
    },
    { key: 'revision', label: 'Revision', hideable: true, render: (r) => <span className="mono">{r.currentVersion?.versionReference ?? '—'}</span> },
    {
      key: 'verdict',
      label: 'Verdict',
      hideable: true,
      render: (r) => (r.deliverableCode ? (view === 'review' ? r.deliverableCode.code : `${r.deliverableCode.code} · ${r.deliverableCode.description}`) : '—'),
    },
    ...(view === 'review'
      ? [
          { key: 'authors', label: 'Authors', hideable: true, render: (r: PlanRow) => <span style={{ fontSize: 12 }}>{liveNamesOf(r.authors) || '—'}</span> },
          {
            key: 'reviewers',
            label: 'Reviewers',
            hideable: true,
            render: (r: PlanRow) => {
              const proposed = r.reviewers.filter((g) => g.revokedAt === null && g.confirmedAt === null);
              return (
                <span style={{ fontSize: 12 }}>
                  {liveNamesOf(r.reviewers.filter((g) => g.confirmedAt !== null)) || '—'}
                  {/* proposal state reads here; the confirm act lives on the status page (T-348) — access follows confirmation, never proposal (ADR-0033) */}
                  {proposed.length > 0 && (
                    <span style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {proposed.map((g) => (
                        <Badge key={g.id} tone="warning">
                          proposed: {g.name}
                        </Badge>
                      ))}
                    </span>
                  )}
                </span>
              );
            },
          },
        ]
      : [
          {
            key: 'actions',
            label: '',
            align: 'right' as const,
            render: (r: PlanRow) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="quiet" onClick={() => setMetaRow(r)}>
                  <FileCog size={13} strokeWidth={2} /> Metadata
                </Button>
              </span>
            ),
          },
        ]),
  ];

  return (
    <div className="content">
      {creating && scheme && (
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
          editable={canEditRow(metaRow)}
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
          // T-405 — the document's own description, edited where its metadata
          // already is, by the same person under the same permission
          description={metaRow.description}
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
          onSave={async (authoring, description) => {
            const merged: Record<string, unknown> = { ...authoring };
            if (metaRow.metadata['discipline'] !== undefined) merged['discipline'] = metaRow.metadata['discipline'];
            await api.setContainerMetadata(metaRow.containerId, merged, description);
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
          isLeadAuthor={isRowLeadAuthor(detailRow)}
          isOwnerSuper={isSuper && isOwner}
          viewer={{
            organisationId: me.organisationId,
            organisationName: me.organisationName,
            isOwner,
            isOrgAdmin: me.orgRole === 'admin',
            ownerOrganisationName: participant.ownerOrganisationName,
          }}
          onChanged={() => load()}
          onClose={() => setDetailRow(null)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="page">{view === 'review' ? 'Review' : isOwner ? 'Project schedule' : 'Deliverable plan'}</h1>
        <Badge tone="neutral">{isOwner ? 'MIDP' : 'TIDP'}</Badge>
      </div>
      <p className="page-sub">
        {view === 'review'
          ? isOwner
            ? 'Every organisation’s deliverables, seen for reviewing: who is writing each, who is reviewing it, and where it stands. A row opens its status page; proposed reviewers are confirmed there.'
            : 'Your organisation’s deliverables, seen for reviewing: who is writing each, who is reviewing it, and where it stands. A row opens its status page.'
          : isOwner
            ? 'Every organisation’s planned deliverables, consolidated. Each row is a container; status is event-driven.'
            : 'Your organisation’s planned deliverables. Add a deliverable to reserve a coded container; draft it in the sandbox, then bind and promote.'}
      </p>

      {schemeFailed && (
        <div className="banner banner--error">
          The project’s coding scheme could not be read, so no deliverable can be planned right now —
          every reference is generated from it, never typed by hand. Reload the page; if it persists,
          the scheme read is failing rather than the scheme being missing.
        </div>
      )}

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
      {editingColumns && (
        <PlanColumnsModal
          projectId={projectId}
          scheme={scheme}
          current={planColumns}
          onClose={() => setEditingColumns(false)}
          onSaved={() => {
            setEditingColumns(false);
            load();
          }}
        />
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

      <Register<PlanRow>
        label={view === 'review' ? 'Review list' : 'Deliverables plan'}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.containerId}
        rowLabel={(r) => r.documentReference ?? r.containerId}
        selection={{
          selected,
          onChange: setSelected,
          bar: (ids) => (
            <Button size="sm" variant="quiet" onClick={() => void api.exportPlanRows(projectId, ids).catch(() => setImportProblem('Could not export — try again.'))}>
              Export to Excel
            </Button>
          ),
        }}
        // T-457 — a plan row lands on the document page; a review row on the status page
        onRowClick={(r) =>
          void navigate(view === 'review' ? `/projects/${projectId}/review/${r.containerId}` : `/projects/${projectId}/documents/${r.containerId}`)
        }
        search={{
          value: query.q ?? '',
          onChange: (q) => setQuery({ q: q === '' ? undefined : q }),
          placeholder: 'Search by code, title or what it says',
        }}
        filters={{
          active: activeFilters,
          onRemove: (key) =>
            setQuery(key === 'state' ? { state: 'any' } : key === 'kind' ? { kind: 'any' } : key === 'producer' ? { producerId: undefined } : {}),
          menu: (
            <>
              <DropdownMenuItem onClick={() => setQuery({ state: 'live' })}>Live only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ state: 'superseded' })}>Superseded only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ state: 'withdrawn' })}>Withdrawn only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ kind: 'deliverable' })}>Deliverables only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ kind: 'reference' })}>Reference material only</DropdownMenuItem>
              {isOwner &&
                producers.map((p) => (
                  <DropdownMenuItem key={p.value} onClick={() => setQuery({ producerId: p.value })}>
                    Produced by {p.label}
                  </DropdownMenuItem>
                ))}
            </>
          ),
        }}
        sort={{
          value: query.sort === 'relevance' ? null : { key: query.sort, direction: query.direction },
          onChange: (sort: RegisterSort | null) =>
            setQuery(sort === null ? { sort: 'relevance', direction: 'asc' } : { sort: sort.key as PlanScreenQuery['sort'], direction: sort.direction }),
        }}
        hiddenColumns={{ value: query.cols, onChange: (cols) => setQuery({ cols }, false) }}
        page={result ? { page: result.page, pageSize: result.pageSize, total: result.total, onPage: (page) => setQuery({ page }, false) } : undefined}
        views={
          <SavedViewsMenu
            projectId={projectId}
            register={view === 'review' ? 'review' : 'plan'}
            current={savedPlanShape(query)}
            activeName={query.view ?? null}
            onApply={(filter) => setParams(writePlanQuery({ ...readPlanQuery(new URLSearchParams()), ...fromSavedPlan(filter) }))}
          />
        }
        actions={
          <>
            <Button variant="quiet" size="sm" onClick={() => navigate(`/projects/${projectId}/plan/scheme`)}>
              <SlidersHorizontal size={14} strokeWidth={2} /> Coding scheme
            </Button>
            {isSuper && (
              <Button variant="quiet" size="sm" onClick={() => setEditingColumns(true)} aria-label="Organisation-standard columns">
                <Columns3 size={14} strokeWidth={2} /> Standard columns
              </Button>
            )}
            {isSuper && view === 'plan' && (
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
                <Button variant="quiet" size="sm" disabled={importing} onClick={() => importInput.current?.click()}>
                  <FileUp size={14} strokeWidth={2} /> {importing ? 'Importing…' : 'Import from Excel'}
                </Button>
                {/* fails CLOSED: with no scheme in hand there is no compliant
                    reference to generate, and the honest answer is "not yet" or
                    "not until this loads" — never a text box (T-376) */}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={scheme === null}
                  title={
                    schemeFailed
                      ? 'The project’s coding scheme could not be read — a deliverable cannot be planned without it.'
                      : scheme === null
                        ? 'Loading the project’s coding scheme…'
                        : undefined
                  }
                  onClick={() => setCreating(true)}
                >
                  <Plus size={14} strokeWidth={2} /> New deliverable
                </Button>
              </>
            )}
            {view === 'review' && (
              // T-357 — a LINK, not a form: planning lives on the Plan screen
              <Button size="sm" variant="primary" onClick={() => void navigate(`/projects/${projectId}/plan`)}>
                + Plan a deliverable
              </Button>
            )}
          </>
        }
        empty={
          query.q || activeFilters.length > 0
            ? 'Nothing on this plan matches. Clear a filter, or search by a different word.'
            : isSuper
              ? 'No deliverables planned yet — add the first one.'
              : 'Nothing planned yet.'
        }
      />
      {view === 'review' && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Appointments are made per deliverable from the project roster; reviewer proposals confer no
          access until the owner confirms — on the deliverable’s status page.
        </p>
      )}
    </div>
  );
}

const PLAN_PAGE_SIZE = 50;

/** the plan register's query, as the address carries it */
type PlanScreenQuery = {
  q?: string | undefined;
  sort: NonNullable<PlanQuery['sort']>;
  direction: NonNullable<PlanQuery['direction']>;
  state: NonNullable<PlanQuery['state']>;
  kind: NonNullable<PlanQuery['kind']>;
  producerId?: string | undefined;
  page: number;
  cols: string[];
  view?: string | undefined;
};

function readPlanQuery(params: URLSearchParams): PlanScreenQuery {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = params.get(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return {
    q: params.get('q') ?? undefined,
    sort: pick('sort', ['relevance', 'reference', 'title', 'state'] as const, 'relevance'),
    direction: pick('direction', ['asc', 'desc'] as const, 'asc'),
    state: pick('state', ['live', 'superseded', 'withdrawn', 'rejected', 'any'] as const, 'any'),
    kind: pick('kind', ['deliverable', 'reference', 'any'] as const, 'any'),
    producerId: params.get('producer') ?? undefined,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    cols: (params.get('cols') ?? '').split(',').filter((c) => c !== ''),
    view: params.get('view') ?? undefined,
  };
}
function writePlanQuery(q: PlanScreenQuery): URLSearchParams {
  const out = new URLSearchParams();
  if (q.q) out.set('q', q.q);
  if (q.sort !== 'relevance') out.set('sort', q.sort);
  if (q.direction !== 'asc') out.set('direction', q.direction);
  if (q.state !== 'any') out.set('state', q.state);
  if (q.kind !== 'any') out.set('kind', q.kind);
  if (q.producerId) out.set('producer', q.producerId);
  if (q.page > 1) out.set('page', String(q.page));
  if (q.cols.length > 0) out.set('cols', q.cols.join(','));
  if (q.view) out.set('view', q.view);
  return out;
}
function savedPlanShape(q: PlanScreenQuery): Record<string, unknown> {
  return { q: q.q ?? null, sort: q.sort, direction: q.direction, state: q.state, kind: q.kind, producerId: q.producerId ?? null, cols: q.cols };
}
function fromSavedPlan(filter: Record<string, unknown>): Partial<PlanScreenQuery> {
  const str = (k: string) => (typeof filter[k] === 'string' ? (filter[k] as string) : undefined);
  const cols = Array.isArray(filter['cols']) ? (filter['cols'] as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  return {
    q: str('q'),
    sort: (str('sort') as PlanScreenQuery['sort'] | undefined) ?? 'relevance',
    direction: (str('direction') as PlanScreenQuery['direction'] | undefined) ?? 'asc',
    state: (str('state') as PlanScreenQuery['state'] | undefined) ?? 'any',
    kind: (str('kind') as PlanScreenQuery['kind'] | undefined) ?? 'any',
    producerId: str('producerId'),
    cols,
    view: str('view'),
  };
}
