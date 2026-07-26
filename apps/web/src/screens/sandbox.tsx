// T-157/T-158/T-165/T-179 — the sandbox drawer (ADR-0036/0038). A file-explorer
// surface: sandboxes with their participant scope, and a SharePoint-shaped folder
// tree — folders nest and documents live *inside* their folder, navigable by a
// breadcrumb and expand/collapse. Documents carry a bound/unbound state that is
// itself navigable — a bound document shows its coded reference and links to the
// deliverable. A document or folder moves by drag-and-drop, or by the Move dialog
// (the keyboard-accessible path; the /move endpoints re-parent within one sandbox,
// never changing access — ADR-0036). Every action is a real in-app dialog (Modal +
// form controls), never window.prompt. No AI grounds on anything here (ADR-0011).
import { useCallback, useEffect, useMemo, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type {
  MeResponse,
  PlanRow,
  RosterEntry,
  Sandbox,
  SandboxDocument,
  SandboxFolder,
  SandboxScopeGrantView,
} from '@infora/contracts';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileCog,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Link2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Settings,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Combobox,
  DropdownMenu,
  DropdownMenuItem,
  Field,
  Modal,
  SectionLabel,
  SelectInput,
  Table,
  TextInput,
} from '@infora/ui';
import { api } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { MetadataModal } from '../metadata-modal';
import { useMe } from '../session';

type ShellContext = { participant: MeResponse['participants'][number] };

// Free-form authoring annotations only. Revision is system-derived (the review
// cycle / versioning, ADR-0041) and suitability is a schema-defined deliverable
// attribute — neither is hand-entered here; both are shown read-only (T-191).
const AUTHORING_FIELDS = [{ key: 'classification', label: 'Classification' }];

// live appointment names, lead marked — for the read-only team display
const liveNames = (
  grants: Array<{ name: string; isLead: boolean; revokedAt: string | null; confirmedAt?: string | null }>,
): string =>
  grants
    .filter((g) => g.revokedAt === null)
    .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}${g.confirmedAt === null ? ' · proposed' : ''}`)
    .join(', ') || '—';

// the row's at-a-glance facts (T-220): the canonical format and when it last
// changed. Uploaded docs carry their native family; authored docs are Infora text.
const formatLabel: Record<SandboxDocument['format'], string> = {
  infora_text: 'Infora text',
  docx: 'DOCX',
  xlsx: 'XLSX',
  pptx: 'PPTX',
};
// the accept filter for replace — the same family only (ADR-0034), so a docx is
// replaced by a docx, never silently across formats
const acceptFor: Record<SandboxDocument['format'], string> = {
  infora_text: '',
  docx: '.docx',
  xlsx: '.xlsx',
  pptx: '.pptx',
};
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

const scopeLabel: Record<Sandbox['scope'], string> = {
  single_org: 'Single organisation',
  multi_org: 'Shared (multi-organisation)',
  team: 'Team',
  named_user: 'Named users',
};

// A dragged item — a document or a folder — while a drag is in flight.
type DragItem = { type: 'doc' | 'folder'; id: string };

// ── A single-text modal (new document / new folder) ─────────────────────────
function TextModal(props: {
  title: string;
  label: string;
  placeholder?: string;
  hint?: string;
  cta: string;
  initialValue?: string;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.initialValue ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || value.trim() === ''}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(value.trim());
            }}
          >
            {props.cta}
          </Button>
        </>
      }
    >
      <Field label={props.label} hint={props.hint}>
        <TextInput value={value} onChange={setValue} placeholder={props.placeholder} autoFocus onEnter={() => value.trim() && void props.onSubmit(value.trim())} />
      </Field>
    </Modal>
  );
}

// ── Create sandbox ──────────────────────────────────────────────────────────
// A togglable pick row (organisation or person) for the wizard.
function PickRow(props: { checked: boolean; onToggle: () => void; label: string; sub?: string }) {
  return (
    <label className="pick-row">
      <input type="checkbox" checked={props.checked} onChange={props.onToggle} />
      <span className="pick-name">{props.label}</span>
      {props.sub && <span className="pick-sub">{props.sub}</span>}
    </label>
  );
}

// ── New sandbox: a short wizard — access (private/shared) → organisations (if
// shared) → people (T-187). Only a super-user reaches it (ADR-0042); the owner-
// super additionally gets the shared option, since cross-org is the owner's act.
type CreateSandboxInput = {
  name: string;
  scope: Sandbox['scope'];
  organisationIds?: string[];
  participantIds?: string[];
};
function CreateSandboxModal(props: {
  isOwner: boolean;
  ownOrganisationId: string;
  roster: RosterEntry[];
  onSubmit: (body: CreateSandboxInput) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'private' | 'shared'>('private');
  const [orgIds, setOrgIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'everyone' | 'specific'>('everyone');
  const [personIds, setPersonIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const isShared = props.isOwner && access === 'shared';

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of props.roster) {
      if (r.organisationId !== props.ownOrganisationId && !m.has(r.organisationId)) {
        m.set(r.organisationId, r.organisationName);
      }
    }
    return [...m.entries()].map(([id, nm]) => ({ id, name: nm }));
  }, [props.roster, props.ownOrganisationId]);
  const eligibleOrgs = new Set([props.ownOrganisationId, ...(isShared ? [...orgIds] : [])]);
  const people = props.roster.filter((r) => eligibleOrgs.has(r.organisationId));

  const totalSteps = isShared ? 3 : 2;
  const shownStep = step === 3 && !isShared ? 2 : step;
  const goNext = () => setStep(step === 1 ? (isShared ? 2 : 3) : 3);
  const goBack = () => setStep(step === 3 ? (isShared ? 2 : 1) : 1);
  const isLast = step === 3;
  const nextDisabled =
    (step === 1 && name.trim() === '') || (step === 2 && orgIds.size === 0);
  const createDisabled = busy || name.trim() === '' || (mode === 'specific' && personIds.size === 0);

  const submit = async () => {
    const scope: Sandbox['scope'] = isShared
      ? 'multi_org'
      : mode === 'specific'
        ? 'named_user'
        : 'single_org';
    setBusy(true);
    await props.onSubmit({
      name: name.trim(),
      scope,
      organisationIds: isShared && mode === 'everyone' ? [...orgIds] : [],
      participantIds: mode === 'specific' ? [...personIds] : [],
    });
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title="New sandbox"
      size="md"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          {step !== 1 && (
            <Button variant="quiet" onClick={goBack}>
              Back
            </Button>
          )}
          {isLast ? (
            <Button variant="primary" disabled={createDisabled} onClick={submit}>
              Create sandbox
            </Button>
          ) : (
            <Button variant="primary" disabled={nextDisabled} onClick={goNext}>
              Next
            </Button>
          )}
        </>
      }
    >
      <div className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Step {shownStep} of {totalSteps}
      </div>

      {step === 1 && (
        <>
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="e.g. Ecology working area" autoFocus />
          </Field>
          <Field
            label="Access"
            hint={
              isShared
                ? 'Shared across organisations — you choose which, then who'
                : 'Private to your organisation'
            }
          >
            <SelectInput
              value={access}
              onChange={(v) => setAccess(v as 'private' | 'shared')}
              options={[
                { value: 'private', label: 'Private — my organisation' },
                ...(props.isOwner ? [{ value: 'shared', label: 'Shared — across organisations' }] : []),
              ]}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <Field label="Organisations" hint="Which organisations share this sandbox (yours is always included)">
          <div className="pick-list">
            {orgs.length === 0 ? (
              <div className="field-hint">No other organisations are on this project yet.</div>
            ) : (
              orgs.map((o) => (
                <PickRow
                  key={o.id}
                  checked={orgIds.has(o.id)}
                  onToggle={() => setOrgIds((s) => toggle(s, o.id))}
                  label={o.name}
                />
              ))
            )}
          </div>
        </Field>
      )}

      {step === 3 && (
        <>
          <Field label="Who has access">
            <SelectInput
              value={mode}
              onChange={(v) => setMode(v as 'everyone' | 'specific')}
              options={[
                { value: 'everyone', label: isShared ? 'Everyone in the chosen organisations' : 'Everyone in my organisation' },
                { value: 'specific', label: 'Only specific people' },
              ]}
            />
          </Field>
          {mode === 'specific' && (
            <Field label="People" hint="Admit specific participants; you are always included">
              <div className="pick-list">
                {people.length === 0 ? (
                  <div className="field-hint">No people to choose from yet.</div>
                ) : (
                  people.map((p) => (
                    <PickRow
                      key={p.participantId}
                      checked={personIds.has(p.participantId)}
                      onToggle={() => setPersonIds((s) => toggle(s, p.participantId))}
                      label={p.name}
                      sub={p.organisationName}
                    />
                  ))
                )}
              </div>
            </Field>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Move: a folder picker (the keyboard-accessible twin of drag-and-drop) ─────
function MoveModal(props: {
  itemName: string;
  destinations: { value: string; label: string; sub?: string }[];
  onSubmit: (folderId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string>('__root__');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Move “${props.itemName}”`}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(choice === '__root__' ? null : choice);
            }}
          >
            Move here
          </Button>
        </>
      }
    >
      <Field label="Destination" hint="Moving re-files the item within this sandbox — it never changes who can see it.">
        <SelectInput
          value={choice}
          onChange={setChoice}
          options={[{ value: '__root__', label: 'Sandbox root' }, ...props.destinations]}
        />
      </Field>
    </Modal>
  );
}

// ── Settings: the super-user's per-sandbox configuration (ADR-0040) ──────────
function SettingsModal(props: {
  sandbox: Sandbox;
  onSave: (body: { allowMemberFolderCreate: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [allow, setAllow] = useState(props.sandbox.allowMemberFolderCreate);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Settings — ${props.sandbox.name}`}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || allow === props.sandbox.allowMemberFolderCreate}
            onClick={async () => {
              setBusy(true);
              await props.onSave({ allowMemberFolderCreate: allow });
            }}
          >
            Save settings
          </Button>
        </>
      }
    >
      <Field
        label="Folder creation"
        hint="When members work within the structure, only a super-user of this sandbox may add or nest folders."
      >
        <SelectInput
          value={allow ? 'anyone' : 'super'}
          onChange={(v) => setAllow(v === 'anyone')}
          options={[
            { value: 'anyone', label: 'Anyone in the sandbox may create folders' },
            { value: 'super', label: 'Members work within the existing structure' },
          ]}
        />
      </Field>
    </Modal>
  );
}

// ── Create folder structure: an interactive tree builder ─────────────────────
// A super-user lays out a nested tree without managing whitespace: type a name,
// press Enter for the next folder at the same level, or click the subfolder
// button to nest one inside. The API takes the nested node spec (name + children).
type BuilderNode = { id: string; name: string; children: BuilderNode[] };
type StructureNode = { name: string; children: StructureNode[] };

const blankNode = (): BuilderNode => ({ id: crypto.randomUUID(), name: '', children: [] });

const renameNode = (nodes: BuilderNode[], id: string, name: string): BuilderNode[] =>
  nodes.map((n) => (n.id === id ? { ...n, name } : { ...n, children: renameNode(n.children, id, name) }));
const removeNode = (nodes: BuilderNode[], id: string): BuilderNode[] =>
  nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: removeNode(n.children, id) }));
const addChild = (nodes: BuilderNode[], parentId: string, child: BuilderNode): BuilderNode[] =>
  nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, child] }
      : { ...n, children: addChild(n.children, parentId, child) },
  );
const addSiblingAfter = (nodes: BuilderNode[], afterId: string, sib: BuilderNode): BuilderNode[] => {
  const out: BuilderNode[] = [];
  for (const n of nodes) {
    out.push({ ...n, children: addSiblingAfter(n.children, afterId, sib) });
    if (n.id === afterId) out.push(sib);
  }
  return out;
};
const countBuilder = (nodes: BuilderNode[]): number =>
  nodes.reduce((n, x) => n + 1 + countBuilder(x.children), 0);
const anyBlank = (nodes: BuilderNode[]): boolean =>
  nodes.some((n) => n.name.trim() === '' || anyBlank(n.children));
const toStructure = (nodes: BuilderNode[]): StructureNode[] =>
  nodes.map((n) => ({ name: n.name.trim(), children: toStructure(n.children) }));

function FolderStructureModal(props: {
  intoName: string | null;
  onSubmit: (nodes: StructureNode[]) => Promise<void>;
  onClose: () => void;
}) {
  const [nodes, setNodes] = useState<BuilderNode[]>([blankNode()]);
  const [focusId, setFocusId] = useState<string | null>(nodes[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const total = countBuilder(nodes);
  const blank = anyBlank(nodes);

  const addChildOf = (parentId: string) => {
    const child = blankNode();
    setNodes((n) => addChild(n, parentId, child));
    setFocusId(child.id);
  };
  const addSiblingOf = (siblingId: string) => {
    const sib = blankNode();
    setNodes((n) => addSiblingAfter(n, siblingId, sib));
    setFocusId(sib.id);
  };
  const addRoot = () => {
    const root = blankNode();
    setNodes((n) => [...n, root]);
    setFocusId(root.id);
  };

  const rows = (list: BuilderNode[], depth: number): ReactNode[] =>
    list.flatMap((node) => [
      <div key={node.id} className="fb-row" style={{ paddingLeft: depth * 22 }}>
        <span className="ficon">
          <Folder size={15} strokeWidth={2} />
        </span>
        <span style={{ flex: 1 }}>
          <TextInput
            value={node.name}
            onChange={(v) => setNodes((n) => renameNode(n, node.id, v))}
            placeholder="Folder name"
            autoFocus={node.id === focusId}
            onEnter={() => addSiblingOf(node.id)}
          />
        </span>
        <button type="button" className="fb-btn" title="Add a subfolder inside" aria-label={`Add a subfolder inside ${node.name || 'this folder'}`} onClick={() => addChildOf(node.id)}>
          <FolderPlus size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="fb-btn"
          title="Remove this folder"
          aria-label={`Remove ${node.name || 'this folder'}`}
          onClick={() => setNodes((n) => (countBuilder(removeNode(n, node.id)) === 0 ? [blankNode()] : removeNode(n, node.id)))}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>,
      ...rows(node.children, depth + 1),
    ]);

  return (
    <Modal
      open
      onClose={props.onClose}
      title="Create folder structure"
      size="md"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || total === 0 || blank || total > 200}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(toStructure(nodes));
            }}
          >
            {total > 0 ? `Create ${total} folder${total === 1 ? '' : 's'}` : 'Create folders'}
          </Button>
        </>
      }
    >
      <p className="field-hint" style={{ marginTop: 0 }}>
        Press Enter for the next folder at the same level, or use the{' '}
        <FolderPlus size={12} strokeWidth={2} style={{ verticalAlign: -2 }} /> button to nest one inside.{' '}
        {props.intoName ? `Created inside ${props.intoName}.` : 'Created at the sandbox root.'}
      </p>
      <div className="folder-builder">{rows(nodes, 0)}</div>
      <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="quiet" onClick={addRoot}>
          <Plus size={13} strokeWidth={2} /> Add folder
        </Button>
        {blank && <span className="field-hint" style={{ marginLeft: 8 }}>Name every folder, or remove it.</span>}
        {total > 200 && (
          <span className="field-hint" style={{ marginLeft: 8, color: 'var(--feedback-danger-text)' }}>
            Keep the structure under 200 folders.
          </span>
        )}
      </div>
    </Modal>
  );
}

// ── Bind: a searchable picker of the accessible unbound deliverables ─────────
function BindModal(props: {
  document: SandboxDocument;
  candidates: PlanRow[];
  onSubmit: (containerId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Bind “${props.document.title}”`}
      size="md"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || choice === null}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(choice!);
            }}
          >
            Bind deliverable
          </Button>
        </>
      }
    >
      <Field
        label="Planned deliverable"
        hint="Binding is one-way — the document takes on this deliverable’s coded reference and identity"
      >
        {props.candidates.length === 0 ? (
          <div className="field-hint">
            No unbound deliverables on your plan — add one on the Plan page first.
          </div>
        ) : (
          <Combobox
            value={choice}
            onChange={setChoice}
            placeholder="Search your deliverables by code or title"
            emptyText="No matching deliverables"
            options={props.candidates.map((p) => ({
              value: p.containerId,
              label: p.documentReference ?? '(no reference)',
              sub: p.workItem?.title ?? '',
            }))}
          />
        )}
      </Field>
    </Modal>
  );
}

// ── Replace the native file (T-220) — an uploaded document only ──────────────
// A file picker in the T-163 Modal (never a bare OS dialog): pick a new file of
// the same format family, which swaps the canonical bytes and bumps the working
// revision. A checked-out document is refused; the caller surfaces that cleanly.
function ReplaceFileModal(props: {
  document: SandboxDocument;
  onSubmit: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = acceptFor[props.document.format];
  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Replace file — ${props.document.title}`}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || file === null}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(file!);
            }}
          >
            Replace file
          </Button>
        </>
      }
    >
      <Field
        label={`New ${formatLabel[props.document.format]} file`}
        hint="The new file must be the same format — it replaces the canonical file and adds a working revision. The document’s name and links are kept."
      >
        <input
          type="file"
          accept={accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
    </Modal>
  );
}

// ── Manage access (scope grants) ────────────────────────────────────────────
function AccessModal(props: {
  sandbox: Sandbox;
  grants: SandboxScopeGrantView[];
  roster: RosterEntry[];
  onGrant: (body: { organisationId?: string; participantId?: string }) => Promise<void>;
  onRevoke: (grantId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<'organisation' | 'participant'>('participant');
  const [choice, setChoice] = useState<string | null>(null);
  const orgs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of props.roster) if (!seen.has(r.organisationId)) seen.set(r.organisationId, r.organisationName);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [props.roster]);
  const nameFor = (g: SandboxScopeGrantView) => {
    if (g.organisationId) return props.roster.find((r) => r.organisationId === g.organisationId)?.organisationName ?? 'Organisation';
    return props.roster.find((r) => r.participantId === g.participantId)?.name ?? 'Participant';
  };
  return (
    <Modal open onClose={props.onClose} title={`Access — ${props.sandbox.name}`} size="md">
      <div>
        <span className="field-label">Who is in this sandbox</span>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {props.grants.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge tone="neutral">{g.granteeType === 'organisation' ? 'org' : 'user'}</Badge>
              <span style={{ flex: 1 }}>{nameFor(g)}</span>
              <Button size="sm" variant="quiet" onClick={() => void props.onRevoke(g.id)}>
                <X size={13} strokeWidth={2} /> Remove
              </Button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
        <span className="field-label">Add access</span>
        <SelectInput
          value={kind}
          onChange={(v) => {
            setKind(v as 'organisation' | 'participant');
            setChoice(null);
          }}
          options={[
            { value: 'participant', label: 'A named user' },
            { value: 'organisation', label: 'An organisation (cross-org — owner only)' },
          ]}
        />
        <Combobox
          value={choice}
          onChange={setChoice}
          placeholder={kind === 'participant' ? 'Search people' : 'Search organisations'}
          options={
            kind === 'participant'
              ? props.roster.map((r) => ({ value: r.participantId, label: r.name, sub: r.organisationName }))
              : orgs.map((o) => ({ value: o.value, label: o.label }))
          }
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            size="sm"
            disabled={choice === null}
            onClick={() =>
              void props.onGrant(kind === 'participant' ? { participantId: choice! } : { organisationId: choice! })
            }
          >
            Grant access
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── The per-document action cluster, shared by the tree and the flat view ────
function DocActions(props: {
  doc: SandboxDocument;
  projectId: string;
  onMetadata: (d: SandboxDocument) => void;
  onBind: (d: SandboxDocument) => void;
  onMove: (d: SandboxDocument) => void;
  onRename: (d: SandboxDocument) => void;
  onReplace: (d: SandboxDocument) => void;
  reload: () => Promise<unknown>;
  setNote: (text: string, tone?: 'success' | 'error') => void;
}) {
  const navigate = useNavigate();
  const { doc } = props;
  // Two visible quick actions (freeze/release + promote) and a kebab for the
  // rest (T-227) — so every row is one line and the action column aligns
  // regardless of the document's state.
  return (
    <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
      {doc.headLocked ? (
        <Button size="sm" variant="quiet" onClick={() => void release(doc, props.reload, props.setNote)} aria-label={`Release ${doc.title}`}>
          <LockOpen size={13} strokeWidth={2} /> Release
        </Button>
      ) : (
        <Button size="sm" variant="quiet" onClick={() => void freeze(doc, props.reload, props.setNote)} aria-label={`Freeze ${doc.title}`}>
          <Lock size={13} strokeWidth={2} /> Freeze
        </Button>
      )}
      {doc.containerId && (
        <Button size="sm" variant="quiet" onClick={() => void promote(doc, props.reload, props.setNote)} aria-label={`Promote ${doc.title}`}>
          <Send size={13} strokeWidth={2} /> Promote
        </Button>
      )}
      <DropdownMenu
        align="end"
        fixed
        trigger={(toggle) => (
          <Button size="sm" variant="quiet" onClick={toggle} aria-label={`More actions for ${doc.title}`} title="More actions">
            <MoreHorizontal size={15} strokeWidth={2} />
          </Button>
        )}
      >
        <DropdownMenuItem onClick={() => navigate(`/projects/${props.projectId}/editor/${doc.id}`)}>
          <FileText size={13} strokeWidth={2} /> Open in Editor
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onMove(doc)}>
          <FolderInput size={13} strokeWidth={2} /> Move…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onMetadata(doc)}>
          <FileCog size={13} strokeWidth={2} /> Metadata…
        </DropdownMenuItem>
        {/* rename edits the display name — only on an unbound document; a bound
            one wears the container's plan-owned reference (ADR-0038) */}
        {!doc.containerId && (
          <DropdownMenuItem onClick={() => props.onRename(doc)}>
            <Pencil size={13} strokeWidth={2} /> Rename…
          </DropdownMenuItem>
        )}
        {/* replace swaps the canonical native file — uploaded documents only */}
        {doc.origin === 'uploaded' && (
          <DropdownMenuItem onClick={() => props.onReplace(doc)}>
            <Upload size={13} strokeWidth={2} /> Replace file…
          </DropdownMenuItem>
        )}
        {!doc.containerId && (
          <DropdownMenuItem onClick={() => props.onBind(doc)}>
            <Link2 size={13} strokeWidth={2} /> Bind…
          </DropdownMenuItem>
        )}
      </DropdownMenu>
    </span>
  );
}

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
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  // a toned, dismissible notice (T-228): success auto-dismisses, errors persist
  const [note, setNoteState] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const setNote = useCallback((text: string, tone: 'success' | 'error' = 'success') => setNoteState({ text, tone }), []);
  useEffect(() => {
    if (note?.tone !== 'success') return;
    const t = setTimeout(() => setNoteState(null), 5000);
    return () => clearTimeout(t);
  }, [note]);

  // tree navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null);

  // modal state
  const [modal, setModal] = useState<
    'sandbox' | 'doc' | 'folder' | 'structure' | 'access' | 'settings' | null
  >(null);
  const [bindDoc, setBindDoc] = useState<SandboxDocument | null>(null);
  const [metaDoc, setMetaDoc] = useState<SandboxDocument | null>(null);
  const [renameDoc, setRenameDoc] = useState<SandboxDocument | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<SandboxDocument | null>(null);
  const [moveItem, setMoveItem] = useState<DragItem & { name: string } | null>(null);

  const loadSandboxes = useCallback(() => api.sandboxes(projectId).then((r) => setSandboxes(r.items)), [projectId]);
  const loadDocs = useCallback(() => api.sandboxDocuments(projectId).then((r) => setDocs(r.items)), [projectId]);
  useEffect(() => {
    void loadSandboxes();
    void loadDocs();
    void api.plan(projectId).then((r) => setPlan(r.items));
    void api.participants(projectId).then((r) => setRoster(r.items));
  }, [loadSandboxes, loadDocs, projectId]);

  const loadSandbox = useCallback((id: string) => {
    void api.sandbox(id).then((s) => setGrants(s.grants));
    void api.folders(id).then((r) => setFolders(r.items));
  }, []);
  useEffect(() => {
    if (selected) loadSandbox(selected);
    setCurrentFolderId(null); // re-enter each sandbox at its root
    setExpanded(new Set());
  }, [selected, loadSandbox]);

  const shown = useMemo(
    () => (selected ? docs.filter((d) => d.sandboxId === selected) : docs),
    [docs, selected],
  );
  const unboundPlan = useMemo(() => plan.filter((p) => p.workItem && p.currentVersion === null), [plan]);
  const planByContainer = useMemo(() => new Map(plan.map((p) => [p.containerId, p])), [plan]);
  const selectedSandbox = sandboxes.find((s) => s.id === selected) ?? null;
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const orgNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster) if (!m.has(r.organisationId)) m.set(r.organisationId, r.organisationName);
    return m;
  }, [roster]);
  const orgName = (id: string) => orgNameById.get(id) ?? 'Organisation';

  // children indexes for the tree
  const foldersByParent = useMemo(() => {
    const m = new Map<string | null, SandboxFolder[]>();
    for (const f of folders) {
      const arr = m.get(f.parentFolderId) ?? [];
      arr.push(f);
      m.set(f.parentFolderId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [folders]);
  const docsByFolder = useMemo(() => {
    const m = new Map<string | null, SandboxDocument[]>();
    for (const d of shown) {
      const arr = m.get(d.folderId) ?? [];
      arr.push(d);
      m.set(d.folderId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.title.localeCompare(b.title));
    return m;
  }, [shown]);

  // the set of a folder's own descendants — a folder cannot move into its subtree
  const descendantsOf = useCallback(
    (folderId: string) => {
      const out = new Set<string>();
      const walk = (id: string) => {
        for (const c of foldersByParent.get(id) ?? []) {
          out.add(c.id);
          walk(c.id);
        }
      };
      walk(folderId);
      return out;
    },
    [foldersByParent],
  );

  // the breadcrumb path from the sandbox root to the current folder
  const crumbs = useMemo(() => {
    const path: SandboxFolder[] = [];
    let id = currentFolderId;
    while (id) {
      const f = folderById.get(id);
      if (!f) break;
      path.unshift(f);
      id = f.parentFolderId;
    }
    return path;
  }, [currentFolderId, folderById]);

  // every folder as a flat "Discipline / Geo" destination list for the Move dialog
  const folderDestinations = useMemo(() => {
    const pathOf = (f: SandboxFolder): string => {
      const parts = [f.name];
      let pid = f.parentFolderId;
      while (pid) {
        const p = folderById.get(pid);
        if (!p) break;
        parts.unshift(p.name);
        pid = p.parentFolderId;
      }
      return parts.join(' / ');
    };
    return folders
      .map((f) => ({ value: f.id, label: pathOf(f) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [folders, folderById]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const performMove = useCallback(
    async (item: DragItem, targetFolderId: string | null) => {
      if (item.type === 'folder') {
        if (item.id === targetFolderId) return;
        if (targetFolderId && descendantsOf(item.id).has(targetFolderId)) {
          setNote('A folder can’t be moved inside one of its own subfolders.', 'error');
          return;
        }
        await api.moveFolder(item.id, targetFolderId);
        if (selected) loadSandbox(selected);
      } else {
        await api.moveDocument(item.id, targetFolderId);
        await loadDocs();
      }
    },
    [descendantsOf, loadDocs, loadSandbox, selected],
  );

  const onDropInto = (targetFolderId: string | null, targetKey: string | 'root') => (e: ReactDragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const item = drag;
    setDrag(null);
    if (item) void performMove(item, targetFolderId);
    void targetKey;
  };
  const allowDrop = (targetKey: string | 'root', valid: boolean) => (e: ReactDragEvent) => {
    if (!valid) return;
    e.preventDefault();
    setDropTarget(targetKey);
  };

  // ── recursive tree render ──────────────────────────────────────────────────
  const renderRows = (parentId: string | null, depth: number): ReactNode[] => {
    const rows: ReactNode[] = [];
    for (const folder of foldersByParent.get(parentId) ?? []) {
      const isOpen = expanded.has(folder.id);
      const childFolders = foldersByParent.get(folder.id) ?? [];
      const childDocs = docsByFolder.get(folder.id) ?? [];
      const hasChildren = childFolders.length > 0 || childDocs.length > 0;
      // a folder is not a valid drop for itself, its descendants, or the dragged doc's move-to-self
      const validTarget =
        !drag || (drag.type === 'folder' ? drag.id !== folder.id && !descendantsOf(drag.id).has(folder.id) : true);
      rows.push(
        <tr
          key={`f-${folder.id}`}
          draggable
          onDragStart={() => setDrag({ type: 'folder', id: folder.id })}
          onDragEnd={() => {
            setDrag(null);
            setDropTarget(null);
          }}
          onDragOver={allowDrop(folder.id, validTarget)}
          onDragLeave={() => setDropTarget((t) => (t === folder.id ? null : t))}
          onDrop={onDropInto(folder.id, folder.id)}
          className={dropTarget === folder.id ? 'drop-target' : undefined}
        >
          <td colSpan={2}>
            <span className="tree-cell" style={{ paddingLeft: depth * 20 }}>
              <button
                type="button"
                className={`tree-toggle${hasChildren ? '' : ' leaf'}`}
                aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
                aria-expanded={hasChildren ? isOpen : undefined}
                onClick={() => hasChildren && toggle(folder.id)}
              >
                {isOpen ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
              </button>
              <span className="ficon">
                {isOpen ? <FolderOpen size={15} strokeWidth={2} /> : <Folder size={15} strokeWidth={2} />}
              </span>
              <button type="button" className="tree-name" onClick={() => setCurrentFolderId(folder.id)}>
                {folder.name}
              </button>
            </span>
          </td>
          <td style={{ textAlign: 'right' }}>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setMoveItem({ type: 'folder', id: folder.id, name: folder.name })}
              aria-label={`Move ${folder.name}`}
            >
              <FolderInput size={13} strokeWidth={2} /> Move
            </Button>
          </td>
        </tr>,
      );
      if (isOpen) {
        rows.push(...renderRows(folder.id, depth + 1));
        for (const doc of childDocs) rows.push(docRow(doc, depth + 1));
      }
    }
    return rows;
  };

  const docRow = (doc: SandboxDocument, depth: number) => {
    const row = doc.containerId ? planByContainer.get(doc.containerId) : undefined;
    return (
      <tr
        key={`d-${doc.id}`}
        draggable
        onDragStart={() => setDrag({ type: 'doc', id: doc.id })}
        onDragEnd={() => {
          setDrag(null);
          setDropTarget(null);
        }}
      >
        <td>
          <span className="tree-cell" style={{ paddingLeft: depth * 20 + 20 }}>
            <span className="ficon">
              <FileText size={14} strokeWidth={2} />
            </span>
            <button
              type="button"
              className="tree-name"
              onClick={() => navigate(`/projects/${projectId}/editor/${doc.id}`)}
              title="Open in the Editor"
            >
              {doc.title}
            </button>
            {doc.workingRevision && (
              <span className="mono" style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                {doc.workingRevision}
              </span>
            )}
            {doc.headLocked && <Lock size={12} strokeWidth={2} style={{ marginLeft: 6, verticalAlign: -1 }} />}
            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>
              {formatLabel[doc.format]} · {fmtWhen(doc.updatedAt)}
            </span>
          </span>
        </td>
        <td>
          {doc.containerId ? (
            <button
              className="linklike"
              onClick={() => row?.workItem && navigate(`/projects/${projectId}/work-items/${row.workItem.id}`)}
              title="Open the deliverable"
            >
              <Link2 size={12} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              <span className="mono">{row?.documentReference ?? 'bound'}</span>
            </button>
          ) : (
            <Badge tone="neutral">Unbound</Badge>
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          <DocActions
            doc={doc}
            projectId={projectId}
            onMetadata={setMetaDoc}
            onBind={setBindDoc}
            onMove={(d) => setMoveItem({ type: 'doc', id: d.id, name: d.title })}
            onRename={setRenameDoc}
            onReplace={setReplaceDoc}
            reload={loadDocs}
            setNote={setNote}
          />
        </td>
      </tr>
    );
  };

  // current-folder contents: subfolders, then this folder's own documents
  const currentRows = [
    ...renderRows(currentFolderId, 0),
    ...(docsByFolder.get(currentFolderId) ?? []).map((doc) => docRow(doc, 0)),
  ];

  return (
    <div className="content">
      {modal === 'sandbox' && (
        <CreateSandboxModal
          isOwner={isOwner}
          ownOrganisationId={me.organisationId}
          roster={roster}
          onClose={() => setModal(null)}
          onSubmit={async (body) => {
            try {
              const sb = await api.createSandbox(projectId, body);
              await loadSandboxes();
              setSelected(sb.id);
              setModal(null);
            } catch {
              setNote('Could not create that sandbox — a shared (cross-organisation) sandbox is the owner’s to make.', 'error');
              setModal(null);
            }
          }}
        />
      )}
      {modal === 'doc' && (
        <TextModal
          title="New document"
          label="Title"
          placeholder="e.g. Ecology draft"
          hint={currentFolderId ? `Created in ${crumbs.at(-1)?.name}` : undefined}
          cta="Create document"
          onClose={() => setModal(null)}
          onSubmit={async (title) => {
            await api.createSandboxDocument(projectId, title, selected ?? undefined, currentFolderId ?? undefined);
            await loadDocs();
            setModal(null);
          }}
        />
      )}
      {modal === 'folder' && selected && (
        <TextModal
          title="New folder"
          label="Folder name"
          placeholder="e.g. Ecology"
          hint={currentFolderId ? `Nested inside ${crumbs.at(-1)?.name}` : 'At the sandbox root'}
          cta="Create folder"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await api.createFolder(selected, name, currentFolderId ?? undefined);
            loadSandbox(selected);
            setModal(null);
          }}
        />
      )}
      {modal === 'structure' && selected && (
        <FolderStructureModal
          intoName={currentFolderId ? (crumbs.at(-1)?.name ?? null) : null}
          onClose={() => setModal(null)}
          onSubmit={async (nodes) => {
            try {
              const r = await api.createFolderStructure(selected, nodes, currentFolderId);
              loadSandbox(selected);
              setNote(`Created ${r.created} folder${r.created === 1 ? '' : 's'}.`);
            } catch {
              setNote('Could not create that structure — laying out folders is a super-user action.', 'error');
            }
            setModal(null);
          }}
        />
      )}
      {modal === 'access' && selectedSandbox && (
        <AccessModal
          sandbox={selectedSandbox}
          grants={grants}
          roster={roster}
          onClose={() => setModal(null)}
          onGrant={async (body) => {
            try {
              await api.grantSandboxScope(selectedSandbox.id, body);
              loadSandbox(selectedSandbox.id);
            } catch {
              setNote('Grant refused — a cross-organisation grant is the owner’s to make.', 'error');
            }
          }}
          onRevoke={async (grantId) => {
            await api.revokeSandboxScope(grantId);
            loadSandbox(selectedSandbox.id);
          }}
        />
      )}
      {modal === 'settings' && selectedSandbox && (
        <SettingsModal
          sandbox={selectedSandbox}
          onClose={() => setModal(null)}
          onSave={async (body) => {
            try {
              await api.updateSandboxSettings(selectedSandbox.id, body);
              await loadSandboxes(); // the setting rides on the sandbox list row
              setNote('Settings saved.');
            } catch {
              setNote('Settings refused — only a super-user of this sandbox may configure it.', 'error');
            }
            setModal(null);
          }}
        />
      )}
      {moveItem && (
        <MoveModal
          itemName={moveItem.name}
          destinations={
            moveItem.type === 'folder'
              ? folderDestinations.filter(
                  (d) => d.value !== moveItem.id && !descendantsOf(moveItem.id).has(d.value),
                )
              : folderDestinations
          }
          onClose={() => setMoveItem(null)}
          onSubmit={async (folderId) => {
            await performMove(moveItem, folderId);
            setMoveItem(null);
          }}
        />
      )}
      {renameDoc && (
        <TextModal
          title={`Rename “${renameDoc.title}”`}
          label="Name"
          cta="Rename"
          initialValue={renameDoc.title}
          onClose={() => setRenameDoc(null)}
          onSubmit={async (title) => {
            try {
              await api.renameSandboxDocument(renameDoc.id, title);
              await loadDocs();
            } catch {
              // the only refusal here is a bound document — its name is the
              // container's plan-owned reference (ADR-0038)
              setNote('Rename refused — a bound document keeps its deliverable’s reference.', 'error');
            }
            setRenameDoc(null);
          }}
        />
      )}
      {replaceDoc && (
        <ReplaceFileModal
          document={replaceDoc}
          onClose={() => setReplaceDoc(null)}
          onSubmit={async (file) => {
            try {
              await api.replaceSandboxFile(replaceDoc.id, file);
              await loadDocs();
              setNote('File replaced — a new working revision was recorded.');
            } catch (error) {
              const detail = errorCode(error);
              setNote(
                detail === 'format_mismatch'
                  ? `Replace refused — the new file must be a ${formatLabel[replaceDoc.format]} file.`
                  : `Replace refused — ${describeApiError(detail)}`,
                'error',
              );
            }
            setReplaceDoc(null);
          }}
        />
      )}
      {bindDoc && (
        <BindModal
          document={bindDoc}
          candidates={unboundPlan}
          onClose={() => setBindDoc(null)}
          onSubmit={async (containerId) => {
            try {
              await api.bindDocument(bindDoc.id, containerId);
              await loadDocs();
              setNote(`Bound to ${planByContainer.get(containerId)?.documentReference ?? 'the deliverable'}.`);
            } catch {
              setNote('Bind failed — a document binds once, to its own organisation’s plan row.', 'error');
            }
            setBindDoc(null);
          }}
        />
      )}
      {metaDoc &&
        (() => {
          const boundRow = metaDoc.containerId ? planByContainer.get(metaDoc.containerId) : undefined;
          const issued = boundRow?.currentVersion?.versionReference;
          return (
            <MetadataModal
              title={`Metadata — ${metaDoc.title}`}
              editable
              identity={[
                { label: 'Title', value: metaDoc.title },
                {
                  label: 'Deliverable',
                  value: boundRow ? (
                    <span className="mono">{boundRow.documentReference}</span>
                  ) : (
                    'Unbound'
                  ),
                },
                { label: 'Origin', value: metaDoc.origin },
                {
                  label: 'Revision',
                  value: (
                    <span className="mono">
                      {metaDoc.workingRevision ?? '—'}
                      {issued ? ` · issued ${issued}` : ''}
                    </span>
                  ),
                },
                ...(boundRow
                  ? [
                      { label: 'Author(s)', value: liveNames(boundRow.authors) },
                      { label: 'Reviewer(s)', value: liveNames(boundRow.reviewers) },
                      { label: 'Document owner', value: boundRow.documentOwner?.name ?? '—' },
                    ]
                  : []),
              ]}
              metadata={metaDoc.authoringMetadata}
              suggestedFields={AUTHORING_FIELDS}
              onClose={() => setMetaDoc(null)}
              onSave={async (authoring) => {
                await api.setSandboxMetadata(metaDoc.id, authoring);
                await loadDocs();
                setMetaDoc(null);
              }}
            />
          );
        })()}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="page">Sandbox</h1>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button size="sm" variant="primary" onClick={() => setModal('doc')}>
            <FilePlus2 size={14} strokeWidth={2} /> New document
          </Button>
          {/* creating a sandbox is a super-user act (T-186); an ordinary member
              works in their personal sandbox and any they are admitted to */}
          {participant.elevated && (
            <Button size="sm" variant="quiet" onClick={() => setModal('sandbox')}>
              <Plus size={14} strokeWidth={2} /> Sandbox
            </Button>
          )}
        </span>
      </div>
      <p className="page-sub">
        Work in progress across your sandboxes. Separation is by a narrower sandbox, never a wall
        inside a shared one; the AI never grounds on anything here.
      </p>
      {note !== null && (
        <div className={`banner banner--${note.tone}`} style={{ marginBottom: 8 }}>
          {note.text}
          <button className="modal-x" aria-label="Dismiss" onClick={() => setNoteState(null)} style={{ marginLeft: 'auto' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <SectionLabel>Sandboxes</SectionLabel>
      {sandboxes.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
          {me.organisationName} has no sandboxes yet — create one to start.
        </div>
      ) : (
        <div className="sandbox-cards">
          {[...sandboxes]
            .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name))
            .map((sb) => {
            const isShared = sb.scope === 'multi_org';
            const others = (sb.organisationIdsInScope ?? [])
              .filter((id) => id !== sb.owningOrganisationId)
              .map(orgName);
            return (
              <button
                key={sb.id}
                type="button"
                className={`sandbox-card${selected === sb.id ? ' selected' : ''}`}
                aria-pressed={selected === sb.id}
                onClick={() => setSelected(selected === sb.id ? null : sb.id)}
              >
                <span className="sandbox-card-name">{sb.name}</span>
                <span className="sandbox-card-meta">
                  <span className="ficon">
                    <Building2 size={13} strokeWidth={2} />
                  </span>
                  {orgName(sb.owningOrganisationId)}
                </span>
                <span className="sandbox-card-meta">
                  {sb.isPersonal ? (
                    <>
                      <span className="ficon">
                        <User size={13} strokeWidth={2} />
                      </span>
                      Personal
                    </>
                  ) : isShared ? (
                    <>
                      <span className="ficon">
                        <Users size={13} strokeWidth={2} />
                      </span>
                      Shared
                    </>
                  ) : (
                    <>
                      <span className="ficon">
                        <Lock size={13} strokeWidth={2} />
                      </span>
                      {scopeLabel[sb.scope]}
                    </>
                  )}
                </span>
                {isShared && others.length > 0 && (
                  <span className="sandbox-card-shared">with {others.join(', ')}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedSandbox && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{grants.length} in scope</span>
          <Button size="sm" variant="quiet" onClick={() => setModal('access')}>
            <Users size={13} strokeWidth={2} /> Manage access
          </Button>
          {(selectedSandbox.allowMemberFolderCreate || selectedSandbox.canConfigure) && (
            <Button size="sm" variant="quiet" onClick={() => setModal('folder')}>
              <FolderPlus size={13} strokeWidth={2} /> New folder
            </Button>
          )}
          {selectedSandbox.canConfigure && (
            <Button size="sm" variant="quiet" onClick={() => setModal('structure')}>
              <FolderTree size={13} strokeWidth={2} /> Folder structure
            </Button>
          )}
          {selectedSandbox.canConfigure && (
            <Button size="sm" variant="quiet" onClick={() => setModal('settings')}>
              <Settings size={13} strokeWidth={2} /> Settings
            </Button>
          )}
          {!selectedSandbox.allowMemberFolderCreate && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Locked structure — folders are set by a super-user
            </span>
          )}
        </div>
      )}

      {selectedSandbox ? (
        <>
          {/* breadcrumb — the current-folder location; each crumb is a drop target */}
          <nav className="breadcrumb" aria-label="Folder path">
            <button
              type="button"
              className={`crumb${currentFolderId === null ? ' current' : ''}${dropTarget === 'root' ? ' drop-target' : ''}`}
              onClick={() => setCurrentFolderId(null)}
              onDragOver={allowDrop('root', true)}
              onDragLeave={() => setDropTarget((t) => (t === 'root' ? null : t))}
              onDrop={onDropInto(null, 'root')}
            >
              {selectedSandbox.name}
            </button>
            {crumbs.map((f) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span className="crumb-sep" aria-hidden>
                  /
                </span>
                <button
                  type="button"
                  className={`crumb${currentFolderId === f.id ? ' current' : ''}${dropTarget === f.id ? ' drop-target' : ''}`}
                  onClick={() => setCurrentFolderId(f.id)}
                  onDragOver={allowDrop(f.id, !drag || drag.id !== f.id)}
                  onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                  onDrop={onDropInto(f.id, f.id)}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </nav>

          <Table>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Deliverable</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRows}
                {currentRows.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--text-muted)' }}>
                      {currentFolderId
                        ? 'This folder is empty — add a document or a subfolder.'
                        : 'No folders or documents yet — add a folder, or create a document.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Table>
        </>
      ) : (
        // no sandbox selected — a flat overview across every accessible sandbox
        <>
          <SectionLabel>{me.organisationName} — all documents</SectionLabel>
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Deliverable</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((doc) => {
                  const row = doc.containerId ? planByContainer.get(doc.containerId) : undefined;
                  return (
                    <tr key={doc.id}>
                      <td>
                        <span className="ficon">
                          <FileText size={14} strokeWidth={2} />
                        </span>
                        <button
                          type="button"
                          className="tree-name"
                          onClick={() => navigate(`/projects/${projectId}/editor/${doc.id}`)}
                          title="Open in the Editor"
                        >
                          {doc.title}
                        </button>
                        {doc.headLocked && <Lock size={12} strokeWidth={2} style={{ marginLeft: 6, verticalAlign: -1 }} />}
                        <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                          {formatLabel[doc.format]} · {fmtWhen(doc.updatedAt)}
                        </span>
                      </td>
                      <td>
                        {doc.containerId ? (
                          <button
                            className="linklike"
                            onClick={() => row?.workItem && navigate(`/projects/${projectId}/work-items/${row.workItem.id}`)}
                            title="Open the deliverable"
                          >
                            <Link2 size={12} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
                            <span className="mono">{row?.documentReference ?? 'bound'}</span>
                          </button>
                        ) : (
                          <Badge tone="neutral">Unbound</Badge>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <DocActions
                          doc={doc}
                          projectId={projectId}
                          onMetadata={setMetaDoc}
                          onBind={setBindDoc}
                          onMove={(d) => setMoveItem({ type: 'doc', id: d.id, name: d.title })}
                          onRename={setRenameDoc}
                          onReplace={setReplaceDoc}
                          reload={loadDocs}
                          setNote={setNote}
                        />
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--text-muted)' }}>
                      Nothing here yet — create a document or accept a draft from Ask.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Table>
        </>
      )}
    </div>
  );
}

async function freeze(
  doc: SandboxDocument,
  reload: () => Promise<unknown>,
  setNote: (text: string, tone?: 'success' | 'error') => void,
) {
  try {
    await api.freezeDocument(doc.id);
    await reload();
    setNote('Checked out — the head is frozen and locked. Release it to edit again.');
  } catch {
    setNote('Freeze failed — it may already be checked out.', 'error');
  }
}

async function release(
  doc: SandboxDocument,
  reload: () => Promise<unknown>,
  setNote: (text: string, tone?: 'success' | 'error') => void,
) {
  try {
    await api.releaseDocument(doc.id);
    await reload();
    setNote('Released — the document is editable again.');
  } catch {
    setNote('Release refused — an open review round, or a check-out that isn’t yours to release.', 'error');
  }
}

async function promote(
  doc: SandboxDocument,
  reload: () => Promise<unknown>,
  setNote: (text: string, tone?: 'success' | 'error') => void,
) {
  try {
    await api.promoteDocument(doc.id);
    await reload();
    setNote('Promoted into the container — the project review cycle is open.');
  } catch (error) {
    setNote(`Promote failed — ${describeApiError(errorCode(error))}`, 'error');
  }
}
