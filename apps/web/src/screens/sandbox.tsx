// T-157/T-158/T-165/T-179 — the sandbox drawer (ADR-0036/0038). A file-explorer
// surface: sandboxes with their participant scope, and a SharePoint-shaped folder
// tree — folders nest and documents live *inside* their folder, navigable by a
// breadcrumb and expand/collapse. Documents carry a bound/unbound state that is
// itself navigable — a bound document shows its coded reference and links to the
// deliverable. A document or folder moves by drag-and-drop, or by the Move dialog
// (the keyboard-accessible path; the /move endpoints re-parent within one sandbox,
// never changing access — ADR-0036). Every action is a real in-app dialog (Modal +
// form controls), never window.prompt. No AI grounds on anything here (ADR-0011).
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type {
  FolderStructureNode,
  MeResponse,
  NamingScheme,
  PlanRow,
  RosterEntry,
  Sandbox,
  SandboxDocument,
  SandboxDocumentActivity,
  SandboxFolder,
  SandboxScopeGrantView,
} from '@infora/contracts';
import { optionLabel } from '@infora/contracts';
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
  History as HistoryGlyph,
  Link2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  PenLine,
  Plus,
  Send,
  Settings,
  Snowflake,
  Sparkles,
  Trash2,
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
  Register,
  PageIntro,
  useToast,
} from '@infora/ui';
import { api, RequestError } from '../api';
import { useAiFeaturesOff } from '../ai-features';
import { describeApiError, errorCode } from '../api-errors';
import { MetadataModal } from '../metadata-modal';
import { PromotionWindow } from '../promotion-window';
import { useMe } from '../session';
import { formatDate, sandboxLifecycleBadge } from './shared';
import { BinModal, DeleteModal, HistoryPanel, RequestReviewModal } from '../sandbox-doors';
import { PresenceAvatars } from '../presence';

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
  pdf: 'PDF',
};
// the accept filter for replace — the same family only (ADR-0034), so a docx is
// replaced by a docx, never silently across formats
const acceptFor: Record<SandboxDocument['format'], string> = {
  infora_text: '',
  docx: '.docx',
  xlsx: '.xlsx',
  pptx: '.pptx',
  pdf: '.pdf',
};

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
// T-365 (S7) adds the third folder mode — plan-locked: the tree is derived from
// the owning org's own plan rows. The member toggle survives inside it: within
// a deliverable's working folder, allowMemberFolderCreate still governs (the
// two settings compose — ADR-0040 addendum).
function SettingsModal(props: {
  sandbox: Sandbox;
  onSave: (body: {
    allowMemberFolderCreate: boolean;
    planLocked: boolean;
    promotionRequiresQa: boolean;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [allow, setAllow] = useState(props.sandbox.allowMemberFolderCreate);
  const [planLocked, setPlanLocked] = useState(props.sandbox.planLocked);
  const [requireQa, setRequireQa] = useState(props.sandbox.promotionRequiresQa);
  const [busy, setBusy] = useState(false);
  const mode = planLocked ? 'plan' : allow ? 'anyone' : 'super';
  const dirty =
    allow !== props.sandbox.allowMemberFolderCreate ||
    planLocked !== props.sandbox.planLocked ||
    requireQa !== props.sandbox.promotionRequiresQa;
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
            disabled={busy || !dirty}
            onClick={async () => {
              setBusy(true);
              await props.onSave({
                allowMemberFolderCreate: allow,
                planLocked,
                promotionRequiresQa: requireQa,
              });
            }}
          >
            Save settings
          </Button>
        </>
      }
    >
      <Field
        label="Folder creation"
        hint={
          mode === 'plan'
            ? 'The tree is derived from this organisation’s deliverables plan — a folder per discipline, a working folder per deliverable, appearing as rows are created and renaming as they do. Those levels are system-owned.'
            : 'When members work within the structure, only a super-user of this sandbox may add or nest folders.'
        }
      >
        <SelectInput
          value={mode}
          onChange={(v) => {
            setPlanLocked(v === 'plan');
            if (v !== 'plan') setAllow(v === 'anyone');
          }}
          options={[
            { value: 'anyone', label: 'Anyone in the sandbox may create folders' },
            { value: 'super', label: 'Members work within the existing structure' },
            { value: 'plan', label: 'Locked to the plan — the tree follows the deliverables' },
          ]}
        />
      </Field>
      {mode === 'plan' && (
        <Field
          label="Inside a deliverable’s folder"
          hint="The one place hand-made folders live in this mode."
        >
          <SelectInput
            value={allow ? 'anyone' : 'super'}
            onChange={(v) => setAllow(v === 'anyone')}
            options={[
              { value: 'anyone', label: 'Anyone may create folders there' },
              { value: 'super', label: 'Only a super-user may' },
            ]}
          />
        </Field>
      )}
      <Field
        label="Promotion"
        hint={
          requireQa
            ? 'What promotes is the QA-accepted frozen version — never the head as it has drifted since QA (ADR-0032). Turning this off is a deliberate, visible governance act.'
            : 'The gate is off: promotion may snapshot the live head with no internal QA. The default for project sandboxes is on.'
        }
      >
        <SelectInput
          value={requireQa ? 'qa' : 'head'}
          onChange={(v) => setRequireQa(v === 'qa')}
          options={[
            { value: 'qa', label: 'Promotion requires QA acceptance' },
            { value: 'head', label: 'Promotion may take the live head' },
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
  /** T-363 (S6) — the no-model seed: candidate root folders derived from the
   * owning org's plan-row disciplines. Prefills the builder for the super user
   * to edit and confirm; the existing deterministic endpoint executes. */
  planSeed?: string[];
  /** T-364 (S6) — the agent half: a free-form ask proposes a candidate tree
   * into this same builder. Propose-confirm (ADR-0027) — nothing is created
   * until the super user confirms below. */
  sandboxId?: string;
  /** T-463 — the project switched the structure builder off: no ask box */
  agentOff?: boolean;
  onSubmit: (nodes: StructureNode[]) => Promise<void>;
  onClose: () => void;
}) {
  const [nodes, setNodes] = useState<BuilderNode[]>([blankNode()]);
  const [focusId, setFocusId] = useState<string | null>(nodes[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [agentNote, setAgentNote] = useState<string | null>(null);

  const proposeFromPlan = () => {
    if (!props.planSeed || props.planSeed.length === 0) return;
    setNodes(props.planSeed.map((name) => ({ id: crypto.randomUUID(), name, children: [] })));
    setFocusId(null);
  };

  // the agent proposes into the builder; it never creates a folder
  const toBuilder = (proposed: FolderStructureNode[]): BuilderNode[] =>
    proposed.map((n) => ({
      id: crypto.randomUUID(),
      name: n.name,
      children: toBuilder(n.children ?? []),
    }));
  async function askAgent() {
    if (!props.sandboxId || ask.trim() === '' || asking) return;
    setAsking(true);
    setAgentNote(null);
    try {
      const proposal = await api.proposeFolderStructure(props.sandboxId, ask.trim());
      if (proposal.nodes.length > 0) {
        setNodes(toBuilder(proposal.nodes));
        setFocusId(null);
        setAgentNote(
          proposal.followUp ?? 'A proposal — edit anything before creating; nothing exists yet.',
        );
      } else {
        setAgentNote(proposal.followUp ?? 'No structure proposed — try naming the disciplines.');
      }
    } catch {
      setAgentNote('The assistant could not answer just now — lay the structure out by hand.');
    } finally {
      setAsking(false);
    }
  }

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

      {/* T-364 — ask for a structure; the answer fills the builder below for
          you to edit. Nothing is created until you confirm (ADR-0027). */}
      {props.sandboxId && !props.agentOff && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '0 0 10px' }}>
          <div style={{ flex: 1 }}>
            <TextInput
              value={ask}
              onChange={setAsk}
              placeholder="Describe the structure you want — e.g. one area per discipline, with survey and reporting inside each"
              onEnter={() => void askAgent()}
            />
          </div>
          <Button size="sm" variant="quiet" disabled={asking || ask.trim() === ''} onClick={() => void askAgent()}>
            {asking ? 'Proposing…' : 'Propose'}
          </Button>
        </div>
      )}
      {agentNote && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          {agentNote}
        </p>
      )}
      <div className="folder-builder">{rows(nodes, 0)}</div>
      <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="quiet" onClick={addRoot}>
          <Plus size={13} strokeWidth={2} /> Add folder
        </Button>
        {props.planSeed && props.planSeed.length > 0 && (
          <Button
            size="sm"
            variant="quiet"
            title="Replace the builder with one folder per discipline on the owning organisation’s plan — edit before creating"
            onClick={proposeFromPlan}
          >
            <FolderTree size={13} strokeWidth={2} /> Propose from the plan’s disciplines
          </Button>
        )}
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
// T-366 (S8, ADR-0038 addendum) — bind is a CONFIRMATION CARD: it shows what
// the draft is about to wear (reference, the row's title, its schema metadata,
// the appointments) and states the consequence before an explicit confirm.
// When the draft sits in a plan-locked deliverable folder, that container
// arrives pre-selected — never silently bound.
function BindModal(props: {
  document: SandboxDocument;
  candidates: PlanRow[];
  preselectContainerId?: string | null;
  scheme: NamingScheme | null;
  onSubmit: (containerId: string) => Promise<void>;
  onClose: () => void;
}) {
  const labelFor = (key: string) => props.scheme?.fields.find((f) => f.key === key)?.label ?? key;
  const preselected =
    props.preselectContainerId != null &&
    props.candidates.some((p) => p.containerId === props.preselectContainerId)
      ? props.preselectContainerId
      : null;
  const [choice, setChoice] = useState<string | null>(preselected);
  const [busy, setBusy] = useState(false);
  const chosen = props.candidates.find((p) => p.containerId === choice) ?? null;
  const names = (grants: Array<{ name: string; isLead: boolean; revokedAt: string | null }>) =>
    grants
      .filter((g) => g.revokedAt === null)
      .map((g) => `${g.name}${g.isLead ? ' (lead)' : ''}`)
      .join(', ') || '—';
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
            {chosen ? `Bind to ${chosen.documentReference}` : 'Bind deliverable'}
          </Button>
        </>
      }
    >
      <Field
        label="Planned deliverable"
        hint={
          preselected
            ? 'Pre-selected from the deliverable folder this draft sits in — confirm it, or pick another.'
            : 'Binding is one-way — the document takes on this deliverable’s coded reference and identity'
        }
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
      {chosen && (
        <div
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 10,
            display: 'grid',
            gap: 4,
            fontSize: 13,
          }}
        >
          <div>
            <span className="mono" style={{ fontWeight: 600 }}>{chosen.documentReference}</span>
            {'  '}
            <span>{chosen.workItem?.title ?? ''}</span>
          </div>
          {Object.entries(chosen.metadata)
            .filter(([, v]) => typeof v === 'string' && v !== '')
            .map(([k, v]) => (
              <div key={k} style={{ color: 'var(--text-muted)' }}>
                {labelFor(k)}: {String(v)}
              </div>
            ))}
          <div style={{ color: 'var(--text-muted)' }}>Authors: {names(chosen.authors)}</div>
          <div style={{ color: 'var(--text-muted)' }}>Reviewers: {names(chosen.reviewers)}</div>
          <div style={{ marginTop: 4 }}>
            On bind, this draft becomes the deliverable’s working draft: it wears the reference and
            shows the plan row’s title and metadata by reference — the title is then edited on the
            plan row, not here. Binding is one-way; promotion is a later, separate act.
          </div>
        </div>
      )}
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

// ── T-477: what a row says about the people around it ───────────────────────
// Who else has the document open now, and a dot when a teammate has saved since
// you last opened it. Both come from the screen's one batched read.
function DocSignals(props: { activity: SandboxDocumentActivity | undefined }) {
  const a = props.activity;
  if (!a || (a.present.length === 0 && !a.changedSinceYouLooked)) return null;
  return (
    <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <PresenceAvatars people={a.present} />
      {a.changedSinceYouLooked && (
        <span className="changed-dot" role="img" aria-label="Changed since you last opened it" title="Changed since you last opened it" />
      )}
    </span>
  );
}

// ── T-477: inline rename ────────────────────────────────────────────────────
// The title turns into an input where it stands. Enter saves, Escape cancels,
// leaving the box saves. The screen does the optimistic write and the rollback;
// this only reports what the person decided, once.
function InlineRename(props: {
  initial: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  const settled = useRef(false);
  const settle = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    const next = value.trim();
    if (save && next !== '' && next !== props.initial) props.onSave(next);
    else props.onCancel();
  };
  return (
    <input
      className="field-input tree-name-input"
      aria-label="Document name"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          settle(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          settle(false);
        }
      }}
      onBlur={() => settle(true)}
    />
  );
}

// ── T-477: the upload progress list ─────────────────────────────────────────
type UploadLine = {
  key: number;
  name: string;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  reason?: string;
  docId?: string;
};
const uploadStateWords: Record<UploadLine['state'], string> = {
  waiting: 'Waiting',
  uploading: 'Uploading…',
  done: 'Uploaded',
  failed: 'Not uploaded',
};
function UploadList(props: {
  lines: UploadLine[];
  where: string;
  busy: boolean;
  onOpen: (docId: string) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <SectionLabel>Uploading to {props.where}</SectionLabel>
        {!props.busy && (
          <span style={{ marginLeft: 'auto' }}>
            <Button size="sm" variant="quiet" onClick={props.onClear}>
              Clear list
            </Button>
          </span>
        )}
      </div>
      <ul className="upload-list" aria-label="Uploads">
        {props.lines.map((l) => (
          <li key={l.key}>
            <span className="upload-name" title={l.name}>
              {l.state === 'done' && l.docId ? (
                <button type="button" className="linklike" onClick={() => props.onOpen(l.docId!)}>
                  {l.name}
                </button>
              ) : (
                l.name
              )}
            </span>
            <Badge tone={l.state === 'done' ? 'success' : l.state === 'failed' ? 'danger' : 'neutral'}>
              {uploadStateWords[l.state]}
            </Badge>
            {l.state === 'failed' && l.reason && <span style={{ color: 'var(--text-secondary)' }}>{l.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── The per-document action cluster, shared by the tree and the flat view ────
function DocActions(props: {
  doc: SandboxDocument;
  projectId: string;
  /** T-366 — what the row visibly says: a bound doc's plan-row title, so the
   * accessible names match the name on screen */
  displayTitle?: string;
  onMetadata: (d: SandboxDocument) => void;
  onBind: (d: SandboxDocument) => void;
  onPromote: (d: SandboxDocument) => void;
  onMove: (d: SandboxDocument) => void;
  onRename: (d: SandboxDocument) => void;
  onReplace: (d: SandboxDocument) => void;
  // T-456 — the doors: history with restore, and delete to the bin
  onHistory: (d: SandboxDocument) => void;
  // T-478 - freeze, name the QA reviewer and open the round, in one window
  onRequestReview: (d: SandboxDocument) => void;
  onDelete: (d: SandboxDocument) => void;
  reload: () => Promise<unknown>;
  setNote: (text: string, tone?: 'success' | 'error') => void;
}) {
  const navigate = useNavigate();
  const { doc } = props;
  const title = props.displayTitle ?? doc.title;
  // Two visible quick actions (freeze/release + promote) and a kebab for the
  // rest (T-227) — so every row is one line and the action column aligns
  // regardless of the document's state.
  return (
    <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
      {doc.headLocked ? (
        <Button size="sm" variant="quiet" onClick={() => void release(doc, props.reload, props.setNote)} aria-label={`Release ${title}`}>
          <LockOpen size={13} strokeWidth={2} /> Release
        </Button>
      ) : (
        <Button size="sm" variant="quiet" onClick={() => void freeze(doc, props.reload, props.setNote)} aria-label={`Freeze ${title}`}>
          <Lock size={13} strokeWidth={2} /> Freeze
        </Button>
      )}
      {/* T-373 — Promote opens the reconfirming window (ADR-0008 addendum); it
          is no longer a bare act, and it reopens at EVERY promotion */}
      {doc.containerId && (
        <Button size="sm" variant="quiet" onClick={() => props.onPromote(doc)} aria-label={`Promote ${title}`}>
          <Send size={13} strokeWidth={2} /> Promote
        </Button>
      )}
      <DropdownMenu
        align="end"
        fixed
        closeOnSelect
        trigger={(toggle) => (
          <Button size="sm" variant="quiet" onClick={toggle} aria-label={`More actions for ${title}`} title="More actions">
            <MoreHorizontal size={15} strokeWidth={2} />
          </Button>
        )}
      >
        <DropdownMenuItem onClick={() => navigate(`/projects/${props.projectId}/editor/${doc.id}`)}>
          <FileText size={13} strokeWidth={2} /> Open in Editor
        </DropdownMenuItem>
        {/* T-355 — the org-private internal QA cycle, reachable at last: staff
            it and run the round from the same status/cycle screens the project
            review uses; the wall is untouched (the container is org-private) */}
        {doc.freezeContainerId && (
          <DropdownMenuItem
            onClick={() => navigate(`/projects/${props.projectId}/review/${doc.freezeContainerId}`)}
          >
            <Snowflake size={13} strokeWidth={2} /> Internal QA…
          </DropdownMenuItem>
        )}
        {/* T-478 - where Freeze is offered: freeze + name the QA reviewer + a note */}
        {!doc.headLocked && (
          <DropdownMenuItem onClick={() => props.onRequestReview(doc)}>
            <Snowflake size={13} strokeWidth={2} /> Request internal review…
          </DropdownMenuItem>
        )}
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
            <Pencil size={13} strokeWidth={2} /> Rename
          </DropdownMenuItem>
        )}
        {/* T-454 — edit an uploaded Office file in the browser (ADR-0043);
            a PDF is the record rendition and never an editing surface */}
        {doc.origin === 'uploaded' && doc.format !== 'pdf' && (
          <DropdownMenuItem onClick={() => navigate(`/projects/${props.projectId}/sandbox/edit/${doc.id}`)}>
            <PenLine size={13} strokeWidth={2} /> Edit in browser
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
        {/* T-456 — the ambient history (ADR-0032) and the bin (T-128), reachable
            at last; a checked-out document cannot be deleted, so the door is
            not drawn while it is frozen */}
        <DropdownMenuItem onClick={() => props.onHistory(doc)}>
          <HistoryGlyph size={13} strokeWidth={2} /> History…
        </DropdownMenuItem>
        {!doc.headLocked && (
          <DropdownMenuItem onClick={() => props.onDelete(doc)}>
            <Trash2 size={13} strokeWidth={2} /> Delete…
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
  const [scheme, setScheme] = useState<NamingScheme | null>(null);
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
  // T-373 — the document whose promotion window is open (ADR-0008 addendum)
  const [promoteDoc, setPromoteDoc] = useState<SandboxDocument | null>(null);
  // T-477 — the document whose title is being edited in place
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<SandboxDocument | null>(null);
  // T-456 — the doors: a document's history, the delete confirmation, the bin
  const [historyDoc, setHistoryDoc] = useState<SandboxDocument | null>(null);
  const [reviewDoc, setReviewDoc] = useState<SandboxDocument | null>(null); // T-478
  const [deleteDoc, setDeleteDoc] = useState<SandboxDocument | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<DragItem & { name: string } | null>(null);

  const loadSandboxes = useCallback(() => api.sandboxes(projectId).then((r) => setSandboxes(r.items)), [projectId]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const aiOff = useAiFeaturesOff(projectId);
  const toast = useToast();
  const loadDocs = useCallback(
    () =>
      api.sandboxDocuments(projectId).then((r) => {
        setDocs(r.items);
        setDocsLoaded(true);
      }),
    [projectId],
  );

  // Upload the native Office file as canonical (T-122). T-477: it lands where the
  // person was — the sandbox and folder they have selected — and a list shows each
  // file's progress. With no sandbox selected (the all-documents overview) it
  // goes to the organisation's default sandbox, as before.
  const uploadInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLines, setUploadLines] = useState<UploadLine[]>([]);
  const [uploadWhere, setUploadWhere] = useState('');
  const uploadKey = useRef(0);
  // T-305 — one verdict PER FILE, and the batch runs to the end. v1.md requires
  // an unsupported document to fail loudly and per-document, and the failure it
  // is guarding against is a selection of five hundred where the fortieth is a
  // scan: stopping at it loses the other 460, and reporting "upload failed"
  // without naming the file leaves nobody able to find the forty. So each file
  // is reported by name, with what was wrong with it — one line each, one at a time.
  const onUploadFiles = useCallback(
    async (files: FileList | null, where: { sandboxId: string | null; folderId: string | null; label: string }) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setUploadWhere(where.label);
      const batch = Array.from(files).map((file) => ({ file, key: ++uploadKey.current }));
      setUploadLines(batch.map(({ file, key }) => ({ key, name: file.name, state: 'waiting' as const })));
      const mark = (key: number, patch: Partial<UploadLine>) =>
        setUploadLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
      for (const { file, key } of batch) {
        mark(key, { state: 'uploading' });
        try {
          const doc = await api.uploadSandboxFile(projectId, file, {
            ...(where.sandboxId && { sandboxId: where.sandboxId }),
            folderId: where.folderId,
          });
          mark(key, { state: 'done', docId: doc.id });
        } catch (error) {
          mark(key, { state: 'failed', reason: describeApiError(errorCode(error)) });
          continue;
        }
        // a failed refresh must never turn an uploaded file into a failed one
        await loadDocs().catch(() => {});
      }
      setUploading(false);
    },
    [projectId, loadDocs],
  );

  // T-477 — inline rename. Optimistic (T-465): the row shows the new name at once,
  // rolls back with a toast if the server refuses, and the toast offers Undo.
  const renameInline = useCallback(
    async (doc: SandboxDocument, title: string) => {
      const before = doc.title;
      setRenamingId(null);
      setDocs((ds) => ds.map((d) => (d.id === doc.id ? { ...d, title } : d)));
      try {
        await api.renameSandboxDocument(doc.id, title);
        await loadDocs();
        toast({
          text: `Renamed to “${title}”.`,
          tone: 'success',
          undo: async () => {
            await api.renameSandboxDocument(doc.id, before);
            await loadDocs();
          },
        });
      } catch (error) {
        setDocs((ds) => ds.map((d) => (d.id === doc.id ? { ...d, title: before } : d)));
        toast({
          text:
            error instanceof RequestError && error.status === 409
              ? 'Rename refused — a bound draft shows its plan row’s title; retitle it on the Plan page.'
              : `Could not rename “${before}” — it keeps its name.`,
          tone: 'error',
        });
      }
    },
    [loadDocs, toast],
  );

  // T-477 — presence on the rows and the "changed since you looked" dot: ONE read
  // for the whole screen, polled every 20 s while it is open, so a teammate's
  // save shows well inside a minute. A failed poll leaves the last answer.
  const [activity, setActivity] = useState<Map<string, SandboxDocumentActivity>>(new Map());
  useEffect(() => {
    let alive = true;
    const poll = () =>
      void api
        .sandboxActivity(projectId)
        .then((r) => alive && setActivity(new Map(r.items.map((a) => [a.sandboxDocumentId, a]))))
        .catch(() => {});
    poll();
    const timer = window.setInterval(poll, 20000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => {
    void loadSandboxes();
    void loadDocs();
    void api.plan(projectId).then((r) => setPlan(r.items));
    void api.participants(projectId).then((r) => setRoster(r.items));
    // T-363 — discipline labels for the seed; cosmetic here, so a failed read
    // just leaves raw codes (the fallback the labels already have) — T-378
    void api.namingScheme(projectId).then(setScheme).catch(() => {});
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
  // T-462 — the overview's search box: a working document's shown name, its
  // own title, and the reference of the row it is bound to
  const [overviewQuery, setOverviewQuery] = useState('');
  // bind candidates (T-366): live rows only (a withdrawn row is not a target —
  // and must never arrive pre-selected), not yet promoted, and not already
  // carrying a bound draft (one working draft per deliverable)
  const unboundPlan = useMemo(() => {
    const alreadyBound = new Set(docs.map((d) => d.containerId).filter(Boolean));
    return plan.filter(
      (p) =>
        p.workItem && p.state === 'live' && p.currentVersion === null && !alreadyBound.has(p.containerId),
    );
  }, [plan, docs]);
  const planByContainer = useMemo(() => new Map(plan.map((p) => [p.containerId, p])), [plan]);
  const overviewRows = useMemo(() => {
    const q = overviewQuery.trim().toLowerCase();
    if (!q) return shown;
    return shown.filter((doc) => {
      const row = doc.containerId ? planByContainer.get(doc.containerId) : undefined;
      return [doc.title, row?.title ?? '', row?.documentReference ?? ''].some((t) => (t ?? '').toLowerCase().includes(q));
    });
  }, [shown, overviewQuery, planByContainer]);
  // T-366 (ADR-0038 addendum) — one naming rule for every surface on this
  // screen: a bound document reads its plan row's title through the link
  const displayTitleOf = useCallback(
    (d: SandboxDocument): string =>
      (d.containerId ? planByContainer.get(d.containerId)?.workItem?.title : undefined) ?? d.title,
    [planByContainer],
  );
  const selectedSandbox = sandboxes.find((s) => s.id === selected) ?? null;

  // T-363 (S6) — the no-model plan seed: the owning org's live plan rows'
  // distinct disciplines, labelled off the scheme, as candidate root folders
  const planSeed = useMemo(() => {
    if (!selectedSandbox) return [];
    const disciplineField = scheme?.fields.find((f) => f.key === 'discipline');
    const codes = new Set<string>();
    for (const r of plan) {
      if (r.producingOrganisationId !== selectedSandbox.owningOrganisationId) continue;
      if (r.state !== 'live' || !r.workItem) continue;
      const code = r.metadata['discipline'];
      if (typeof code === 'string' && code.trim() !== '') codes.add(code.trim());
    }
    return [...codes].sort().map((code) => optionLabel(code, disciplineField?.allowedValueLabels));
  }, [plan, selectedSandbox, scheme]);
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
    for (const arr of m.values()) arr.sort((a, b) => displayTitleOf(a).localeCompare(displayTitleOf(b)));
    return m;
  }, [shown, displayTitleOf]);

  // T-366 (ADR-0038/0040 addenda) — the container whose working folder holds
  // this doc: filing a draft in a deliverable's folder pre-selects the bind
  // target wherever binding is offered; nothing ever binds silently
  const nearestDeliverableContainer = useCallback(
    (folderId: string | null): string | null => {
      let cursor = folderId;
      for (let depth = 0; cursor !== null && depth < 50; depth++) {
        const folder = folderById.get(cursor);
        if (!folder) return null;
        if (folder.kind === 'deliverable' && folder.containerId) return folder.containerId;
        cursor = folder.parentFolderId;
      }
      return null;
    },
    [folderById],
  );

  // T-365 — is this folder inside (or itself) a deliverable's working folder?
  // The plan-locked mode's boundary for hand-made folders.
  const inDeliverableSubtree = useCallback(
    (folderId: string | null): boolean => {
      let cursor = folderId;
      for (let depth = 0; cursor !== null && depth < 50; depth++) {
        const folder = folderById.get(cursor);
        if (!folder) return false;
        if (folder.kind === 'deliverable') return true;
        cursor = folder.parentFolderId;
      }
      return false;
    },
    [folderById],
  );

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
      try {
        if (item.type === 'folder') {
          if (item.id === targetFolderId) return;
          if (targetFolderId && descendantsOf(item.id).has(targetFolderId)) {
            setNote('A folder can’t be moved inside one of its own subfolders.', 'error');
            return;
          }
          await api.moveFolder(item.id, targetFolderId);
          if (selected) loadSandbox(selected);
        } else {
          // T-465 — optimistic: the row moves at once and comes back on refusal; Undo moves it home
          const before = docs.find((d) => d.id === item.id)?.folderId ?? null;
          setDocs((ds) => ds.map((d) => (d.id === item.id ? { ...d, folderId: targetFolderId } : d)));
          try {
            await api.moveDocument(item.id, targetFolderId);
          } catch (error) {
            setDocs((ds) => ds.map((d) => (d.id === item.id ? { ...d, folderId: before } : d)));
            throw error;
          }
          await loadDocs();
          toast({
            text: `Moved “${docs.find((d) => d.id === item.id)?.title ?? 'the document'}”.`,
            tone: 'success',
            undo: async () => {
              await api.moveDocument(item.id, before);
              await loadDocs();
            },
          });
        }
      } catch {
        // T-365: in a plan-locked sandbox the derived levels refuse moves —
        // say so instead of failing silently
        setNote('That move was refused — the plan-locked levels are set by the plan.', 'error');
      }
    },
    [descendantsOf, docs, loadDocs, loadSandbox, selected, setNote, toast],
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
      // T-365 — a derived (plan-owned) folder neither drags nor moves; a
      // deliverable folder whose row left the plan is badged, never deleted
      const systemFolder = folder.kind !== 'manual';
      const offPlan =
        folder.kind === 'deliverable' &&
        folder.containerId !== null &&
        planByContainer.get(folder.containerId)?.state === 'withdrawn';
      rows.push(
        <tr
          key={`f-${folder.id}`}
          draggable={!systemFolder}
          onDragStart={() => !systemFolder && setDrag({ type: 'folder', id: folder.id })}
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
              {offPlan && <Badge tone="neutral">Off plan</Badge>}
            </span>
          </td>
          <td style={{ textAlign: 'right' }}>
            {!systemFolder && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setMoveItem({ type: 'folder', id: folder.id, name: folder.name })}
                aria-label={`Move ${folder.name}`}
              >
                <FolderInput size={13} strokeWidth={2} /> Move
              </Button>
            )}
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
    // T-366 (ADR-0038 addendum): a bound document READS THE ROW THROUGH — it
    // displays its plan row's title over the container_id link, never a copy;
    // the working title stays dormant beneath the binding
    const displayTitle = displayTitleOf(doc);
    return (
      <tr
        key={`d-${doc.id}`}
        draggable={renamingId !== doc.id}
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
            {renamingId === doc.id ? (
              <InlineRename initial={doc.title} onSave={(title) => void renameInline(doc, title)} onCancel={() => setRenamingId(null)} />
            ) : (
              <button
                type="button"
                className="tree-name"
                onClick={() => navigate(`/projects/${projectId}/editor/${doc.id}`)}
                title="Open in the Editor"
              >
                {displayTitle}
              </button>
            )}
            <DocSignals activity={activity.get(doc.id)} />
            <span style={{ marginLeft: 8 }}>
              {/* T-455 — the lifecycle badge: Working v0.x, or Frozen v0.x once checked out */}
              <Badge tone={sandboxLifecycleBadge(doc).tone}>{sandboxLifecycleBadge(doc).label}</Badge>
            </span>
            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>
              {formatLabel[doc.format]} · {formatDate(doc.updatedAt)}
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
            displayTitle={displayTitle}
            onMetadata={setMetaDoc}
            onBind={setBindDoc}
            onPromote={setPromoteDoc}
            onMove={(d) => setMoveItem({ type: 'doc', id: d.id, name: displayTitleOf(d) })}
            onRename={(d) => setRenamingId(d.id)}
            onReplace={setReplaceDoc}
            onHistory={setHistoryDoc}
            onRequestReview={setReviewDoc}
            onDelete={setDeleteDoc}
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
          planSeed={planSeed}
          sandboxId={selected}
          agentOff={aiOff.has('structure_builder')}
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
                  (d) =>
                    d.value !== moveItem.id &&
                    !descendantsOf(moveItem.id).has(d.value) &&
                    // T-365: in a plan-locked sandbox a hand-made folder only
                    // lives inside a deliverable's working folder
                    (!selectedSandbox?.planLocked || inDeliverableSubtree(d.value)),
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
      {/* T-456 — the doors */}
      {reviewDoc && (
        <RequestReviewModal
          doc={reviewDoc}
          onClose={() => setReviewDoc(null)}
          onOpened={async (r) => {
            await loadDocs();
            setNote(`Internal round opened — ${r.versionReference} with ${r.reviewerName}.`);
          }}
        />
      )}
      {historyDoc && <HistoryPanel doc={historyDoc} onClose={() => setHistoryDoc(null)} onRestored={() => loadDocs()} setNote={setNote} />}
      {deleteDoc && <DeleteModal doc={deleteDoc} onClose={() => setDeleteDoc(null)} reload={loadDocs} setNote={setNote} />}
      {binOpen && (
        <BinModal
          projectId={projectId}
          isOrgAdmin={me.orgRole === 'admin'}
          onClose={() => setBinOpen(false)}
          reload={loadDocs}
          setNote={setNote}
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
          preselectContainerId={nearestDeliverableContainer(bindDoc.folderId)}
          scheme={scheme}
          onClose={() => setBindDoc(null)}
          onSubmit={async (containerId) => {
            try {
              await api.bindDocument(bindDoc.id, containerId);
              await loadDocs();
              // T-465 — a bind has no reverse act (a document binds once, ADR-0038), so the toast says so rather than offering one
              toast({ text: `Bound to ${planByContainer.get(containerId)?.documentReference ?? 'the deliverable'} — a document binds once; there is no undo.`, tone: 'success' });
            } catch {
              setNote('Bind failed — a document binds once, to its own organisation’s plan row.', 'error');
            }
            setBindDoc(null);
          }}
        />
      )}
      {/* T-373 — promotion reconfirms rather than composes, and the window
          reopens at EVERY promotion: six months and a staffing change later,
          the alternative is silently inheriting a review group named at
          planning and never looked at since (ADR-0008 addendum). */}
      {promoteDoc && (
        <PromotionWindow
          document={promoteDoc}
          projectId={projectId}
          onClose={() => setPromoteDoc(null)}
          onPromoted={(result) => {
            setPromoteDoc(null);
            void loadDocs();
            setNote(
              result.source === 'qa_accepted_frozen'
                ? `Promoted the QA-accepted frozen version as ${result.versionReference} — later head edits stayed in the sandbox. The round opens when the lead reviewer accepts and acknowledges.`
                : `Promoted the live head as ${result.versionReference}. The round opens when the lead reviewer accepts and acknowledges.`,
            );
          }}
        />
      )}

      {metaDoc &&
        (() => {
          const boundRow = metaDoc.containerId ? planByContainer.get(metaDoc.containerId) : undefined;
          const issued = boundRow?.currentVersion?.versionReference;
          return (
            <MetadataModal
              title={`Metadata — ${displayTitleOf(metaDoc)}`}
              editable
              identity={[
                { label: 'Title', value: displayTitleOf(metaDoc) },
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
          {/* T-413 (ADR-0053 addendum A4) — the creator's OTHER front door, and
              the only one besides Tools. *In plain terms: start the document
              creator from the working area you are standing in, and the
              document is created there.*

              🔒 It carries the sandbox and **nothing else**. The owner's
              ruling cut the plan→creator link rather than deciding what may
              cross it, so a doorway that helpfully passed along a deliverable,
              a title or a reference would be re-opening by the back door the
              thing that was closed at the front. One parameter, and it names a
              place to write to. */}
          {selected !== null && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                navigate(`/projects/${projectId}/tools/document-creation?sandboxId=${selected}`)
              }
            >
              <Sparkles size={14} strokeWidth={2} /> Create with AI
            </Button>
          )}
          {/* upload a native Office file, kept canonical (T-122 wired to the
              surface); the hidden input is the file picker the button opens */}
          <Button size="sm" variant="quiet" disabled={uploading} onClick={() => uploadInput.current?.click()}>
            <Upload size={14} strokeWidth={2} /> {uploading ? 'Uploading…' : 'Upload file'}
          </Button>
          <input
            ref={uploadInput}
            type="file"
            accept=".docx,.xlsx,.pptx,.pdf"
            multiple
            hidden
            onChange={(e) => {
              void onUploadFiles(e.target.files, {
                sandboxId: selected,
                folderId: selected ? currentFolderId : null,
                label: selectedSandbox
                  ? [selectedSandbox.name, ...crumbs.map((f) => f.name)].join(' / ')
                  : `${me.organisationName} — working area`,
              });
              e.target.value = ''; // let the same file be picked again
            }}
          />
          {/* T-456 — the bin: deleted documents, restorable; erasable by an
              organisation's admin with the title typed (ADR-0050 §§5–6) */}
          <Button size="sm" variant="quiet" onClick={() => setBinOpen(true)}>
            <Trash2 size={14} strokeWidth={2} /> Deleted
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
      <PageIntro
        line="Your organisation’s work in progress, in the sandboxes you are part of."
        more="Separation is by a narrower sandbox, never a wall inside a shared one. Nothing here is formally controlled and the AI never grounds on it, though you may attach a working file to one draft. Every document keeps a version history; freeze one for an internal check before promoting it."
      />
      {note !== null && (
        <div className={`banner banner--${note.tone}`} style={{ marginBottom: 8 }}>
          {note.text}
          <button className="modal-x" aria-label="Dismiss" onClick={() => setNoteState(null)} style={{ marginLeft: 'auto' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {uploadLines.length > 0 && (
        <UploadList
          lines={uploadLines}
          where={uploadWhere}
          busy={uploading}
          onOpen={(docId) => navigate(`/projects/${projectId}/editor/${docId}`)}
          onClear={() => setUploadLines([])}
        />
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
          {(selectedSandbox.allowMemberFolderCreate || selectedSandbox.canConfigure) &&
            // in plan-locked mode hand-made folders live only inside a
            // deliverable's working folder (T-365) — everyone, supers included
            (!selectedSandbox.planLocked || inDeliverableSubtree(currentFolderId)) && (
              <Button size="sm" variant="quiet" onClick={() => setModal('folder')}>
                <FolderPlus size={13} strokeWidth={2} /> New folder
              </Button>
            )}
          {selectedSandbox.canConfigure && !selectedSandbox.planLocked && (
            <Button size="sm" variant="quiet" onClick={() => setModal('structure')}>
              <FolderTree size={13} strokeWidth={2} /> Folder structure
            </Button>
          )}
          {selectedSandbox.canConfigure && (
            <Button size="sm" variant="quiet" onClick={() => setModal('settings')}>
              <Settings size={13} strokeWidth={2} /> Settings
            </Button>
          )}
          {selectedSandbox.planLocked ? (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Locked to the plan — the tree follows the deliverables
            </span>
          ) : (
            !selectedSandbox.allowMemberFolderCreate && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Locked structure — folders are set by a super-user
              </span>
            )
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
          {/* T-462 — the overview on the register: one search box over the
              organisation's working documents (their names and the rows they
              are bound to — a draft is not in the retrieval index, so this box
              finds by name and code, not by meaning), the same grammar as the
              plan and the library. */}
          <Register<SandboxDocument>
            label="All documents"
            columns={[
              {
                key: 'document',
                label: 'Document',
                render: (doc) => {
                  const row = doc.containerId ? planByContainer.get(doc.containerId) : undefined;
                  return (
                    <>
                      <span className="ficon">
                        <FileText size={14} strokeWidth={2} />
                      </span>
                      {renamingId === doc.id ? (
                        <span onClick={(e) => e.stopPropagation()}>
                          <InlineRename initial={doc.title} onSave={(title) => void renameInline(doc, title)} onCancel={() => setRenamingId(null)} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="tree-name"
                          onClick={() => navigate(`/projects/${projectId}/editor/${doc.id}`)}
                          title="Open in the Editor"
                        >
                          {/* T-366 — a bound doc reads its row's title through */}
                          {row?.workItem?.title ?? doc.title}
                        </button>
                      )}
                      <DocSignals activity={activity.get(doc.id)} />
                      <span style={{ marginLeft: 8 }}>
                        <Badge tone={sandboxLifecycleBadge(doc).tone}>{sandboxLifecycleBadge(doc).label}</Badge>
                      </span>
                      <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                        {formatLabel[doc.format]} · {formatDate(doc.updatedAt)}
                      </span>
                    </>
                  );
                },
              },
              {
                key: 'deliverable',
                label: 'Deliverable',
                render: (doc) => {
                  const row = doc.containerId ? planByContainer.get(doc.containerId) : undefined;
                  return (
                    <>
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
                    </>
                  );
                },
              },
              {
                key: 'actions',
                label: 'Actions',
                align: 'right',
                render: (doc) => {
                  const row = doc.containerId ? planByContainer.get(doc.containerId) : undefined;
                  return (
                    <span onClick={(e) => e.stopPropagation()}>
                      <DocActions
                        doc={doc}
                        projectId={projectId}
                        displayTitle={row?.workItem?.title ?? doc.title}
                        onMetadata={setMetaDoc}
                        onBind={setBindDoc}
                        onPromote={setPromoteDoc}
                        onMove={(d) => setMoveItem({ type: 'doc', id: d.id, name: displayTitleOf(d) })}
                        onRename={(d) => setRenamingId(d.id)}
                        onReplace={setReplaceDoc}
                        onHistory={setHistoryDoc}
                        onRequestReview={setReviewDoc}
                        onDelete={setDeleteDoc}
                        reload={loadDocs}
                        setNote={setNote}
                      />
                    </span>
                  );
                },
              },
            ]}
            rows={docsLoaded ? overviewRows : null}
            rowKey={(doc) => doc.id}
            search={{ value: overviewQuery, onChange: setOverviewQuery, placeholder: 'Search by name or code' }}
            empty={
              overviewQuery.trim() !== ''
                ? 'No working document matches that name or code.'
                : 'No documents yet — create one, or upload a file.'
            }
          />
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

