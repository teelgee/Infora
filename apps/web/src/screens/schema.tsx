// T-156 / T-188 — the deliverable-plan (TIDP) schema surface. The owner
// super-user defines the project-wide schema: one unified field list where each
// field can be part of the coded reference, a metadata attribute, and/or an
// appointment role slot. A default Infora schema preloads and is fully editable
// (change fields, add fields). A guest super-user proposes additions; everyone
// else views. The code-builder previews a compliant reference from the code fields.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import type {
  AcceptanceCodeRow,
  ExternalIssueSettings,
  ListAcceptanceCodesResponse,
  MeResponse,
  NamingProposal,
  NamingSchemeDiff,
  NamingSchemeField,
  SchemaFieldRole,
  SchemaFieldType,
} from '@infora/contracts';
import {
  applyNamingSchemeImport,
  defaultDeliverableSchema,
  diffNamingSchemeFields,
  isCodeField,
  optionLabel,
} from '@infora/contracts';
import {
  Badge,
  Button,
  Field,
  Modal,
  SectionLabel,
  SelectInput,
  Table,
  TextArea,
  TextInput,
} from '@infora/ui';
import { Info, Plus, Upload, X } from 'lucide-react';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';

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
  projectId: string;
  field: NamingSchemeField;
  onSave: (patch: Pick<NamingSchemeField, 'allowedValues' | 'allowedValueLabels'>) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ code: string; desc: string }[]>(() =>
    (props.field.allowedValues ?? []).map((c) => ({ code: c, desc: props.field.allowedValueLabels?.[c] ?? '' })),
  );
  // T-337 — the firm already has this list in a spreadsheet, and typing it back
  // in is the highest-friction moment in the product. The import lands the rows
  // here, in the editor, rather than saving: they are CANDIDATES, and Done is
  // still what commits them.
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportNote(null);
    try {
      const result = await api.importSchema(props.projectId, file);
      // one field imported → its codes; several → the one whose label best
      // matches this field, else the first. The owner is looking at ONE field's
      // options, so landing another field's codes silently would be worse than
      // asking; matching on the label is the cheap honest middle.
      const label = (props.field.label || props.field.key).toLowerCase();
      const chosen =
        result.fields.find((f) => f.label.toLowerCase() === label) ?? result.fields[0]!;
      setRows(
        (chosen.allowedValues ?? []).map((code) => ({
          code,
          desc: chosen.allowedValueLabels?.[code] ?? '',
        })),
      );
      const skipped =
        result.skipped.length === 0
          ? ''
          : ` ${result.skipped.length} row${result.skipped.length === 1 ? '' : 's'} skipped: ${result.skipped
              .slice(0, 5)
              .map((s) => `row ${s.row} (${s.reason})`)
              .join('; ')}${result.skipped.length > 5 ? '…' : ''}`;
      const other =
        result.fields.length > 1
          ? ` The sheet also held ${result.fields.length - 1} other field${result.fields.length > 2 ? 's' : ''} — import them from their own rows.`
          : '';
      setImportNote({
        text: `Loaded ${chosen.allowedValues?.length ?? 0} codes from “${chosen.label}”. Nothing is saved until you press Done.${skipped}${other}`,
        tone: result.skipped.length > 0 ? 'error' : 'info',
      });
    } catch (error) {
      const code = errorCode(error);
      const hint = error instanceof RequestError ? error.body?.hint : undefined;
      setImportNote({
        text: `${describeApiError(code)}${hint ? ` (${hint})` : ''}`,
        tone: 'error',
      });
    } finally {
      setImporting(false);
    }
  };
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
      {/* T-337 — the list already exists in a spreadsheet somewhere in the firm */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button variant="quiet" size="sm" disabled={importing} onClick={() => importInput.current?.click()}>
          <Upload size={14} aria-hidden /> {importing ? 'Reading…' : 'Import from spreadsheet'}
        </Button>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          .csv or .xlsx with a code column and a description column
        </span>
        <input
          ref={importInput}
          type="file"
          accept=".csv,.xlsx"
          hidden
          onChange={(e) => {
            void onImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {importNote !== null && (
        <div className={`banner banner--${importNote.tone}`} style={{ marginBottom: 8 }}>
          {importNote.text}
        </div>
      )}
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

// T-390 — the acceptance-code editor, and the reason every write asks for one.
// The change alters what "accepted" means on this project and, through
// `grounds`, what the AI may rely on across the whole of it — silently, because
// every citation that already exists still resolves. ADR-0003 requires it
// audited like a rails change (ADR-0030), not saved like a preference, and
// "who and when" a timestamp already gives: the why is the half only the person
// making the change holds.
function CodeChangeModal(props: {
  title: string;
  /** what the change will do, in the sentence the owner should read before saving */
  consequence: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      size="sm"
      title={props.title}
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || reason.trim() === ''}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(reason.trim());
            }}
          >
            Save change
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, lineHeight: 1.5 }}>
        {props.consequence}
      </p>
      <Field label="Why" hint="Recorded with your name against this code, permanently.">
        <TextInput value={reason} onChange={setReason} placeholder="e.g. A3 is design-stage only on this scheme" />
      </Field>
    </Modal>
  );
}


/**
 * T-338 — the schema screen's own import, and the **diff** that stops it being
 * a silent replace.
 *
 * T-337 built the parse and put it behind ONE field's option editor, where it
 * lands a code list. This is the other half: a sheet describing the whole schema
 * — Field / Code / Description — landing as fields in the editing table.
 *
 * **Nothing is auto-applied, and the guarantee comes free** (ADR-0048 §3's
 * principle arriving without new machinery): the owner already holds the write
 * and the table is already an editor, so the import gains **no write path the
 * owner did not already have**. `Save schema` is still what commits.
 *
 * **Why the diff exists, in the ticket's own words:** `Reset to Infora default`
 * already sits beside this button, and an import that quietly wiped a schema in
 * progress is the same accident with a worse cause. So the panel states what the
 * import would add, change and drop before anything moves.
 *
 * The diff itself lives in `@infora/contracts`
 * (`diffNamingSchemeFields` / `applyNamingSchemeImport`), where it can be
 * pinned by tests — this screen renders it and owns nothing about it but the
 * words on the page.
 */
function SchemaImportPanel(props: {
  projectId: string;
  fields: NamingSchemeField[];
  onApply: (next: NamingSchemeField[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<{
    diff: NamingSchemeDiff;
    skipped: Array<{ row: number; reason: string }>;
  } | null>(null);
  const [dropMissing, setDropMissing] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setStaged(null);
    setDropMissing(false);
    try {
      const result = await api.importSchema(props.projectId, file);
      setStaged({ diff: diffNamingSchemeFields(props.fields, result.fields), skipped: result.skipped });
    } catch (err) {
      const code = errorCode(err);
      const hint = err instanceof RequestError ? err.body?.hint : undefined;
      setError(`${describeApiError(code)}${hint ? ` (${hint})` : ''}`);
    } finally {
      setImporting(false);
    }
  };

  const diff = staged?.diff;
  const nothingToDo =
    diff !== undefined && diff.add.length === 0 && diff.change.length === 0;

  return (
    <>
      <Button variant="quiet" disabled={importing} onClick={() => input.current?.click()}>
        <Upload size={14} aria-hidden /> {importing ? 'Reading…' : 'Import fields from spreadsheet'}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error !== null && (
        <div className="banner banner--error" style={{ flexBasis: '100%' }}>
          {error}
        </div>
      )}
      {staged && diff && (
        <div className="card" style={{ flexBasis: '100%', padding: '10px 12px', marginTop: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
            What this import would do
          </div>
          {nothingToDo ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.55 }}>
              Nothing to add or change — the sheet matches the schema you already have.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 4, fontSize: 12, lineHeight: 1.5 }}>
              {diff.add.map((f) => (
                <div key={`a-${f.key}`}>
                  <Badge tone="success">Add</Badge>{' '}
                  <b>{f.label}</b>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    ({f.allowedValues?.length ?? 0} option
                    {(f.allowedValues?.length ?? 0) === 1 ? '' : 's'})
                  </span>
                </div>
              ))}
              {diff.change.map((c) => (
                <div key={`c-${c.current.key}`}>
                  <Badge tone="warning">Change</Badge>{' '}
                  <b>{c.current.label}</b>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>{c.what.join('; ')}</span>
                </div>
              ))}
            </div>
          )}
          {diff.drop.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={dropMissing}
                  onChange={(e) => setDropMissing(e.currentTarget.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Also drop the {diff.drop.length} field
                  {diff.drop.length === 1 ? '' : 's'} the sheet does not mention —{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    {diff.drop.map((f) => f.label).join(', ')}
                  </span>
                </span>
              </label>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                Off by default: most sheets cover one part of a schema, so not being mentioned is
                weak evidence that a field should go.
              </p>
            </div>
          )}
          {staged.skipped.length > 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
              {staged.skipped.length} row{staged.skipped.length === 1 ? '' : 's'} skipped:{' '}
              {staged.skipped
                .slice(0, 5)
                .map((s) => `row ${s.row} (${s.reason})`)
                .join('; ')}
              {staged.skipped.length > 5 ? '…' : ''}
            </p>
          )}
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
            A matched field keeps its <b>in code</b>, <b>required</b>, <b>role</b> and{' '}
            <b>originator</b> settings — a spreadsheet of codes has no view on those, and an import
            that flattened them would unmake the coded reference. Applying changes the table only;
            nothing is stored until you press <b>Save schema</b>.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button
              size="sm"
              disabled={nothingToDo && !(dropMissing && diff.drop.length > 0)}
              onClick={() => {
                props.onApply(applyNamingSchemeImport(props.fields, diff, dropMissing));
                setStaged(null);
              }}
            >
              Apply to the table
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setStaged(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** T-475 — the one checkbox of the "Exported documents" section. Disabled until
 * the project's current setting has been read (so it never shows a default it
 * was not told), and for anyone who is not the owner's super user. */
export function AuthorshipAppendixToggle(props: {
  enabled: boolean | null;
  canEdit: boolean;
  saved: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, marginBottom: 4 }}>
      <input
        type="checkbox"
        checked={props.enabled === true}
        disabled={!props.canEdit || props.enabled === null}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>End exported documents with a list of machine-drafted passages</span>
      {props.saved && <Badge tone="success">Saved</Badge>}
    </label>
  );
}

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
  // T-475 — whether exported documents end with the authorship appendix; null
  // until the read answers, so the box never shows a default it has not been told
  const [appendixOn, setAppendixOn] = useState<boolean | null>(null);
  const [appendixSaved, setAppendixSaved] = useState(false);
  // T-390 — the acceptance-code scheme, its own section like the review period
  const [codes, setCodes] = useState<AcceptanceCodeRow[] | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{
    title: string;
    consequence: string;
    apply: (reason: string) => Promise<ListAcceptanceCodesResponse>;
  } | null>(null);
  const [addingCode, setAddingCode] = useState<{ code: string; description: string } | null>(null);
  // T-431 — the owner organisation's standard message, carried on every
  // external issue this project sends (ADR-0055 §6). Whole-project
  // configuration on the same tier as the two settings above, applied rather
  // than invented.
  const [externalSettings, setExternalSettings] = useState<ExternalIssueSettings | null>(null);
  const [standardMessage, setStandardMessage] = useState('');
  const [externalSaved, setExternalSaved] = useState(false);

  // T-378 — the editor holds three states, exactly as T-376 gave the plan
  // screen: loading / ready / failed. Without it, a failed read left an EMPTY
  // field table wearing the costume of the project's configuration — and Save
  // would have written that emptiness back, wiping the real scheme.
  const [schemeState, setSchemeState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const loadProposals = () => void api.namingProposals(projectId).then((r) => setProposals(r.items));
  useEffect(() => {
    // T-376 — no null branch: a SUCCESSFUL read always returns a scheme (the
    // Infora default when none has been saved, T-188); only failure is special
    api
      .namingScheme(projectId)
      .then((s) => {
        setSeparator(s.separator);
        setFields(s.fields);
        setSchemeState('ready');
      })
      .catch(() => setSchemeState('failed'));
    void api.reviewPeriod(projectId).then((r) => {
      setSavedPeriod(r.defaultDays);
      setReviewPeriodDays(String(r.defaultDays));
    });
    void api.exportAuthorshipAppendix(projectId).then(
      (r) => setAppendixOn(r.enabled),
      () => setAppendixOn(null),
    );
    void api.acceptanceCodes(projectId).then(
      (r) => setCodes(r.items),
      // the same three-state discipline the scheme read learned in T-378: a
      // failed read must not render as an empty scheme wearing the costume of
      // configuration, because the next click would write that emptiness back
      () => setCodeError('Could not load the acceptance codes — reload before changing anything.'),
    );
    void api.externalIssueSettings(projectId).then((r) => {
      setExternalSettings(r);
      setStandardMessage(r.standardMessage ?? '');
    });
    loadProposals();
  }, [projectId]);

  // T-390 — every code write goes through the reason modal, so there is one
  // path and no way to add a save that skips the audit.
  function askThen(
    title: string,
    consequence: string,
    apply: (reason: string) => Promise<ListAcceptanceCodesResponse>,
  ) {
    setPendingChange({ title, consequence, apply });
  }

  async function save() {
    // saving is refused, not degraded, until the real scheme has arrived —
    // writing the initial empty state would destroy the project's scheme
    if (schemeState !== 'ready') return;
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

  async function saveAppendix(enabled: boolean) {
    const next = await api.setExportAuthorshipAppendix(projectId, enabled);
    setAppendixOn(next.enabled);
    setAppendixSaved(true);
    setTimeout(() => setAppendixSaved(false), 1500);
  }

  async function saveExternalSettings(patch: {
    standardMessage?: string | null;
    permission?: ExternalIssueSettings['permission'];
  }) {
    const next = await api.setExternalIssueSettings(projectId, patch);
    setExternalSettings(next);
    setStandardMessage(next.standardMessage ?? '');
    setExternalSaved(true);
    setTimeout(() => setExternalSaved(false), 1500);
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
          {/* T-338 — the import, beside Reset deliberately: they are the two
              controls that can change the whole table at once, and the diff is
              what makes this one the safer of the pair. Scoped to `canEdit` by
              the block it sits in — a guest super-user's import would have to
              become a NamingProposal, whose body is free text and cannot carry
              a field list. That is a recorded scope cut, not an oversight. */}
          <SchemaImportPanel
            projectId={projectId}
            fields={fields}
            onApply={(next) => setFields(next)}
          />
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            Separator
            <input className="field-input mono" value={separator} onChange={(e) => setSeparator(e.target.value)} style={{ width: 40 }} />
          </label>
          <Button onClick={() => void save()} disabled={schemeState !== 'ready'}>
            Save schema
          </Button>
          {saved && <Badge tone="success">Saved</Badge>}
          {schemeState === 'failed' && (
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              The scheme could not be loaded — reload the page before editing. Saving is disabled so
              the stored scheme cannot be overwritten with this empty view.
            </span>
          )}
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

      {/* T-475 — the authorship appendix: whether a document leaves the project
          with a list of the passages the AI drafted and who accepted each. Its
          own section beside the review period, for the same reason: a project
          setting, on the owner super user's tier, and nothing to do with a
          deliverable's coded reference. Off unless somebody turns it on. */}
      <SectionLabel>Exported documents</SectionLabel>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px', maxWidth: 640, lineHeight: 1.5 }}>
        When this is on, each document issued from the project ends with a section,{' '}
        <strong>Machine-drafted passages</strong>, listing every paragraph the AI drafted, the run
        that drafted it and who accepted it. The names of the people who accepted are printed in the
        file. Off by default; nothing changes until it is turned on.
      </p>
      <AuthorshipAppendixToggle
        enabled={appendixOn}
        canEdit={canEdit}
        saved={appendixSaved}
        onChange={(next) => void saveAppendix(next)}
      />

      {/* T-431 (ADR-0055 §6) — the standing note that goes out with every
          document this project sends outside itself. Its own section beside the
          review period for the same reason: whole-project configuration, on the
          owner super user's tier, and nothing to do with a deliverable's
          coded reference. */}
      <SectionLabel>External issue</SectionLabel>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px', maxWidth: 700, lineHeight: 1.5 }}>
        A finished document can be sent to somebody with no Infora account — a landowner, a
        consultee — as a link that reaches that one revision and expires. The sender writes why
        they are sending it and a message to go with it; what you set here is the{' '}
        <strong>standard message</strong> carried under every one of them, for this project.
      </p>
      {/* T-432 (ADR-0055 §7) — who may send a document out of the project.
          Three levels, and nobody below the chosen one is shut out: they ask,
          and somebody above it answers. On the strictest level that answer
          comes from the client, which is what the level is for. */}
      <div style={{ maxWidth: 420, marginBottom: 12 }}>
        <Field
          label="Who may issue outside the project"
          hint="Everyone below the line can still request one, for somebody above it to approve or decline."
        >
          <SelectInput
            value={externalSettings?.permission ?? 'owner_super_user'}
            onChange={(v) =>
              void saveExternalSettings({ permission: v as ExternalIssueSettings['permission'] })
            }
            disabled={!externalSettings?.mayConfigure}
            options={[
              { value: 'any_member', label: 'Anyone on the project' },
              { value: 'any_super_user', label: 'Any organisation’s super user' },
              { value: 'owner_super_user', label: 'Only this organisation’s super users' },
            ]}
          />
        </Field>
      </div>
      <div style={{ maxWidth: 700, marginBottom: 4 }}>
        <Field label="Standard message" hint="Left empty, nothing is added.">
          <TextArea
            value={standardMessage}
            onChange={setStandardMessage}
            rows={3}
            placeholder="e.g. This document is issued for information. Please direct any queries to the project team."
          />
        </Field>
        {externalSettings?.mayConfigure && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              size="sm"
              disabled={standardMessage.trim() === (externalSettings.standardMessage ?? '')}
              onClick={() =>
                void saveExternalSettings({
                  standardMessage: standardMessage.trim() === '' ? null : standardMessage.trim(),
                })
              }
            >
              Save
            </Button>
            {externalSaved && <Badge tone="success">Saved</Badge>}
          </div>
        )}
      </div>

      {/* T-390 (ADR-0003 as amended 2026-08-27) — the acceptance-code scheme.
          Its own section beside the review period, and for the same reason: it
          is project configuration, not an attribute of a deliverable. There was
          no write path at all before this, so a pilot firm could not represent
          its own coding scheme — a gap that has nothing to do with AI, and the
          reason this screen is worth building independently of the grounding
          column that made it urgent. */}
      <SectionLabel>Acceptance codes</SectionLabel>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px', maxWidth: 700, lineHeight: 1.5 }}>
        What a reviewer's verdict can say on this project, seeded from ISO 19650's 2021 National
        Annex and copied at project creation — nothing here touches another project.{' '}
        <strong>Accepting</strong> ends the review cycle; <strong>contractual</strong> is what issues
        the C revision, the difference between <em>we have agreed this</em> and <em>we have agreed
        most of this, with comments</em>; <strong>grounds</strong> is whether a deliverable accepted
        under the code enters the AI's reach. A code that has been used is never redefined — retire
        it and add its replacement, so a deliverable coded last year still reads as what it meant
        last year.
      </p>
      {codeError && <p style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{codeError}</p>}
      {codes !== null && (
        <Table>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
                <th>Accepting</th>
                <th>Contractual</th>
                <th>Grounds</th>
                <th>Live deliverables</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} style={{ opacity: code.retiredAt ? 0.55 : 1 }}>
                  <td className="mono">{code.code}</td>
                  <td style={{ minWidth: 320 }}>
                    {canEdit && !code.retiredAt ? (
                      <TextInput
                        value={code.description}
                        onChange={(v) =>
                          setCodes((rows) =>
                            (rows ?? []).map((r) => (r.id === code.id ? { ...r, description: v } : r)),
                          )
                        }
                        onEnter={() =>
                          askThen(
                            `Rename ${code.code}`,
                            'The word changes and nothing else does: the state underneath is fixed, and everything downstream keys on what happened rather than on what it is called.',
                            (reason) => api.updateAcceptanceCode(code.id, { description: code.description, reason }),
                          )
                        }
                      />
                    ) : (
                      code.description
                    )}
                  </td>
                  <td>{code.isAccepting ? <Badge tone="success">Yes</Badge> : '—'}</td>
                  <td>{code.isContractual ? <Badge tone="info">Yes</Badge> : '—'}</td>
                  <td>
                    {code.grounds ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}
                  </td>
                  {/* THE BLAST RADIUS — what makes this screen safe rather than
                      dangerous. It is a promise about the NEXT query, honest
                      only because retrieval reads the flag live (T-387). */}
                  <td>{code.liveDeliverables}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!code.retiredAt && (
                        <>
                          <Button
                            size="sm"
                            variant="quiet"
                            onClick={() =>
                              askThen(
                                `${code.grounds ? 'Stop' : 'Start'} grounding on ${code.code}`,
                                code.grounds
                                  ? `This will exclude ${code.liveDeliverables} live deliverable${code.liveDeliverables === 1 ? '' : 's'} from AI answers, from the next question asked. They stay in the library and stay readable; the agent stops reaching for them.`
                                  : `This will admit ${code.liveDeliverables} live deliverable${code.liveDeliverables === 1 ? '' : 's'} to AI answers, from the next question asked.`,
                                (reason) => api.updateAcceptanceCode(code.id, { grounds: !code.grounds, reason }),
                              )
                            }
                          >
                            {code.grounds ? 'Stop grounding' : 'Ground on it'}
                          </Button>
                          <Button
                            size="sm"
                            variant="quiet"
                            onClick={() =>
                              askThen(
                                `Retire ${code.code}`,
                                'A retired code cannot be chosen on a new round. Every round already coded with it is untouched and still reads as what it meant — which is exactly why retiring is the way to change a code that has been used.',
                                (reason) => api.updateAcceptanceCode(code.id, { retired: true, reason }),
                              )
                            }
                          >
                            Retire
                          </Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Table>
      )}
      {canEdit && (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" onClick={() => setAddingCode({ code: '', description: '' })}>
            <Plus size={13} strokeWidth={2} /> Add a code
          </Button>
        </div>
      )}
      {addingCode && (
        <Modal
          open
          onClose={() => setAddingCode(null)}
          size="sm"
          title="Add an acceptance code"
          footer={
            <>
              <Button variant="quiet" onClick={() => setAddingCode(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={addingCode.code.trim() === '' || addingCode.description.trim() === ''}
                onClick={() => {
                  const draft = addingCode;
                  setAddingCode(null);
                  askThen(
                    `Add ${draft.code.trim()}`,
                    'The new code is available on the next round. It grounds nothing until you say so — the standard leaves each published code’s meaning to this project’s information standard, so nothing about the letter tells us the answer.',
                    (reason) =>
                      api.createAcceptanceCode(projectId, {
                        code: draft.code.trim(),
                        description: draft.description.trim(),
                        level: 'both',
                        isAccepting: false,
                        isContractual: false,
                        grounds: false,
                        reason,
                      }),
                  );
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          <Field label="Code" hint="The letter, as the project's information standard writes it — e.g. A4.">
            <TextInput value={addingCode.code} onChange={(v) => setAddingCode({ ...addingCode, code: v })} mono />
          </Field>
          <Field label="Label">
            <TextInput
              value={addingCode.description}
              onChange={(v) => setAddingCode({ ...addingCode, description: v })}
              placeholder="e.g. Published — authorized and accepted for construction"
            />
          </Field>
        </Modal>
      )}
      {pendingChange && (
        <CodeChangeModal
          title={pendingChange.title}
          consequence={pendingChange.consequence}
          onClose={() => setPendingChange(null)}
          onSubmit={async (reason) => {
            try {
              setCodes((await pendingChange.apply(reason)).items);
              setCodeError(null);
            } catch (error) {
              setCodeError(describeApiError(errorCode(error)));
            }
            setPendingChange(null);
          }}
        />
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

      {editingOptions !== null && fields[editingOptions] && (
        <OptionsEditor
          projectId={projectId}
          field={fields[editingOptions]}
          onSave={(patch) => setField(editingOptions, patch)}
          onClose={() => setEditingOptions(null)}
        />
      )}
    </div>
  );
}
