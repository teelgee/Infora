// The Documents tab (T-086), extended for Slice A2 (T-161): the receiving org's
// acknowledgement inbox (ADR-0035 §4 — the gate withholds the deliverable until
// its transmittal is acknowledged) and the owner's transmit action. The main
// list is the API's access-resolved slice: exactly what grounding admits.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router';
import { currencyWords } from '@infora/contracts';
import type {
  BulkClassifyBody,
  BulkFailure,
  ClassificationSchemeResponse,
  ExternalIssue,
  ExternalIssueSettings,
  GetLibrarySearchResponse,
  LibraryItem,
  LibrarySearchItem,
  LibrarySearchQuery,
  MeResponse,
  PendingTransmittal,
  RosterEntry,
} from '@infora/contracts';
import { BookOpen, FileText, Inbox, MoreHorizontal, Plus, Send, Share2 } from 'lucide-react';
import {
  Badge,
  Button,
  Combobox,
  DropdownMenu,
  DropdownMenuItem,
  Field,
  Modal,
  PageIntro,
  Register,
  SectionLabel,
  SegmentedControl,
  SelectInput,
  Table,
  TextArea,
  TextInput,
  useToast,
} from '@infora/ui';
import type { RegisterColumn, RegisterFilterChip, RegisterSort } from '@infora/ui';
import { lifecycleBadge } from '@infora/ui';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { NOT_CITABLE_LABEL, describeTextStatus, uploadSentence } from '../reference-intake-words';
import type { UploadProgress } from '../reference-intake-words';
import { SavedViewsMenu } from '../saved-views-menu';
import { useMe } from '../session';
import { contextStateBadge, formatDate } from './shared';

// the coded reference is the primary identifier — prominent monospace, not the
// muted 12px .mono treatment used for incidental codes
const refStyle = {
  fontFamily: 'var(--primitive-font-family-mono)',
  fontSize: 13,
  color: 'var(--text-primary)',
} as const;

type ShellContext = { participant: MeResponse['participants'][number] };

// T-461 — every dialog here takes the rows it acts on, one or many: the bulk
// bar and the row menu open the same door, and the title says how many.
const countOf = (items: LibraryItem[]) => (items.length === 1 ? items[0]!.documentReference : `${items.length} documents`);

function TransmitModal(props: {
  items: LibraryItem[];
  orgs: Array<{ value: string; label: string }>;
  onSubmit: (organisationId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [org, setOrg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Transmit ${countOf(props.items)}`}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || org === null}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(org!);
            }}
          >
            Transmit
          </Button>
        </>
      }
    >
      <Field
        label="Issue to organisation"
        hint="A non-review transmittal — the receiving organisation must acknowledge before it grounds (ADR-0035)"
      >
        <Combobox value={org} onChange={setOrg} placeholder="Search organisations" options={props.orgs} />
      </Field>
    </Modal>
  );
}

// T-457 — the document modal that opened here retired: a row lands on the
// document page, whose Versions tab shows the same rendition inline.

// T-431 — ISSUING OUTSIDE THE PROJECT (ADR-0055). The door is here, on the
// deliverable, and not in a tool: issuing a document is something you do to a
// document you are already looking at, and a tool would make you find it twice.
//
// THE WARNING IS ON THE SCREEN AND NOT ONLY IN THE RECORD. ADR-0055 §5 is blunt
// that there is no identity behind the name — anyone holding the link is the
// recipient — and the ADR requires that the product not read as though the
// record were stronger than the email it replaces.
function ExternalIssueModal(props: {
  items: LibraryItem[];
  /** T-432 — the verb the project's setting leaves this person: issue, or ask */
  mode: 'issue' | 'request';
  onClose: () => void;
  onSubmit: (body: {
    recipientName: string;
    recipientEmail: string;
    reason: string;
    message: string;
    expiresInDays: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const expiry = Number.parseInt(days, 10);
  const ready =
    name.trim() !== '' &&
    /.+@.+\..+/.test(email.trim()) &&
    reason.trim() !== '' &&
    message.trim() !== '' &&
    expiry >= 1;
  return (
    <Modal
      open
      onClose={props.onClose}
      size="md"
      title={
        props.mode === 'issue'
          ? `Issue ${countOf(props.items)} outside the project`
          : `Request that ${countOf(props.items)} ${props.items.length === 1 ? 'is' : 'are'} issued outside the project`
      }
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit({
                recipientName: name.trim(),
                recipientEmail: email.trim(),
                reason: reason.trim(),
                message: message.trim(),
                expiresInDays: expiry,
              });
            }}
          >
            {props.mode === 'issue' ? 'Issue' : 'Send request'}
          </Button>
        </>
      }
    >
      {props.mode === 'request' && (
        <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          This project has decided who may send documents outside it, and it is not you — so this
          goes as a <strong>request</strong>. Everything you write here is what the approver sees
          and, if they agree, exactly what is sent: nobody retypes it.
        </p>
      )}
      <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        The recipient gets a link to <strong>this revision of {props.items.length === 1 ? 'this document' : 'each of these documents'} and nothing else</strong>
        — no project, no other documents, no list of people. They need no Infora account.{' '}
        <strong>Anyone holding the link can open it</strong>, so the record says what was sent and
        to which address, never who read it. A later revision does not replace what they hold.
      </p>
      <Field label="Recipient name">
        <TextInput value={name} onChange={setName} placeholder="e.g. Mrs A Patel" />
      </Field>
      <Field label="Email address" hint="Where the link goes. It is not an account.">
        <TextInput value={email} onChange={setEmail} placeholder="name@example.com" />
      </Field>
      <Field label="Why it is being sent" hint="Kept on the project record beside the issue.">
        <TextInput value={reason} onChange={setReason} placeholder="e.g. Statutory consultation response" />
      </Field>
      <Field label="Message to the recipient" hint="Shown with the document. The project's standard message is added under it if one is set.">
        <TextArea value={message} onChange={setMessage} rows={4} />
      </Field>
      <Field label="Link expires after (days)">
        <TextInput value={days} onChange={setDays} />
      </Field>
    </Modal>
  );
}

// The link, handed back to the sender. There is no mail transport yet (T-323
// and T-330 carry it, and wait on external lead time), so this is how the link
// actually reaches the recipient today — and even once mail lands, the sender
// seeing what they sent is not a workaround.
function ExternalIssuedModal(props: { issue: ExternalIssue; onClose: () => void }) {
  const link = `${window.location.origin}/external/${props.issue.linkToken}`;
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      size="sm"
      title="Issued"
      footer={
        <Button variant="primary" onClick={props.onClose}>
          Done
        </Button>
      }
    >
      <p style={{ marginTop: 0 }}>
        {props.issue.documentReference} {props.issue.versionReference} is issued to{' '}
        <strong>{props.issue.recipientName}</strong> ({props.issue.recipientEmail}). Send them this
        link — it expires{' '}
        {props.issue.expiresAt ? formatDate(props.issue.expiresAt) : 'on the date set'}.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span
          className="mono"
          style={{
            flex: 1,
            fontSize: 12,
            overflowWrap: 'anywhere',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: '6px 8px',
          }}
        >
          {link}
        </span>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </Modal>
  );
}

// T-432 — a decline is ANSWERED, not merely refused. The reason is mandatory
// for the reason every other refusal in this record carries one: the person who
// asked reads it, and "no" with nothing after it is not an answer.
function DeclineRequestModal(props: {
  request: ExternalIssue;
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
      title={`Decline the request to issue ${props.request.documentReference}`}
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || reason.trim() === ''}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(reason.trim());
            }}
          >
            Decline
          </Button>
        </>
      }
    >
      <Field label="Why" hint={`Read by ${props.request.requestedBy.name}, who asked.`}>
        <TextArea value={reason} onChange={setReason} rows={3} />
      </Field>
    </Modal>
  );
}

// T-389 — ENDING A DELIVERABLE, on the screen where deliverables are read.
// Until now there was no button for this anywhere: `superseded` was set by
// nothing in the codebase, and withdrawal existed only as T-189's remove-from-
// the-plan act, which is a different act that shares a word (ADR-0013's
// amendment). Two acts, and which one you get is decided by the publication
// boundary rather than by who you are (ADR-0013 §2) — the owner ends a
// published deliverable, the producing organisation asks the owner to.
//
// The REASON IS MANDATORY, and it is mandatory because of who reads it: its
// visibility follows the container (ADR-0013 §4), so the producing organisation
// whose work this is reads why its deliverable was ended. "No longer required"
// typed under duress is a poor answer; no answer at all is not an answer.
function EndDeliverableModal(props: {
  item: LibraryItem;
  /** the owner ends it outright; the producing organisation proposes */
  mode: 'withdraw' | 'propose';
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const withdrawing = props.mode === 'withdraw';
  return (
    <Modal
      open
      onClose={props.onClose}
      size="sm"
      title={`${withdrawing ? 'Withdraw' : 'Propose withdrawing'} ${props.item.documentReference}`}
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
            {withdrawing ? 'Withdraw' : 'Propose withdrawal'}
          </Button>
        </>
      }
    >
      <Field
        label="Why"
        hint={
          withdrawing
            ? 'Read by everyone who can see this deliverable, including the organisation that produced it (ADR-0013). The document stays in the record and stops being used for AI answers.'
            : 'Sent to the project owner, who decides. Nothing changes until they accept — the deliverable stays live and keeps grounding until then.'
        }
      >
        <TextArea value={reason} onChange={setReason} rows={3} placeholder="e.g. Superseded by the revised alignment" />
      </Field>
    </Modal>
  );
}

// T-389 — the owner's supersede act. Supersession is an EDGE and not a state
// (ADR-0013 §3): the case it exists for is a DIFFERENT document — not a newer
// revision — becoming the authoritative one, so it has a second endpoint and
// has to name it. Confirming the edge is what sets the target's record state
// (ADR-0045 as amended §1), which is why this modal picks a replacement rather
// than offering a bare "mark superseded".
function SupersedeModal(props: {
  items: LibraryItem[];
  candidates: LibraryItem[];
  /** the owner proposes AND confirms; the producer only proposes */
  mode: 'confirm' | 'propose';
  onClose: () => void;
  onSubmit: (replacementContainerId: string) => Promise<void>;
}) {
  const [replacement, setReplacement] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      size="sm"
      title={`Supersede ${countOf(props.items)}`}
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || replacement === null}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(replacement!);
            }}
          >
            {props.mode === 'confirm' ? 'Supersede' : 'Propose'}
          </Button>
        </>
      }
    >
      <Field
        label={props.items.length === 1 ? 'Which deliverable replaces it' : 'Which deliverable replaces them all'}
        hint={
          props.mode === 'confirm'
            ? 'The replacement supersedes this one. It stays in the record and stops being used for AI answers; retiring the relationship is the way back.'
            : 'Proposed to the project owner, who confirms. Nothing changes until they do.'
        }
      >
        <Combobox
          value={replacement}
          onChange={setReplacement}
          placeholder="Search deliverables"
          options={props.candidates.map((c) => ({
            value: c.containerId,
            label: `${c.documentReference}${c.title ? ` — ${c.title}` : ''}`,
          }))}
        />
      </Field>
    </Modal>
  );
}

// T-461 — classify a selection under one facet (ADR-0045), with the choice
// said out loud: fill only the rows with nothing set yet, or replace what is.
function BulkClassifyModal(props: {
  projectId: string;
  items: LibraryItem[];
  onClose: () => void;
  onSubmit: (body: Omit<BulkClassifyBody, 'containerIds'>) => Promise<void>;
}) {
  const [scheme, setScheme] = useState<ClassificationSchemeResponse | null>(null);
  const [facetId, setFacetId] = useState('');
  const [termId, setTermId] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api.classificationScheme(props.projectId).then(setScheme, () => setScheme({ facets: [] }));
  }, [props.projectId]);
  const facet = scheme?.facets.find((f) => f.id === facetId) ?? null;
  return (
    <Modal
      open
      onClose={props.onClose}
      size="sm"
      title={`Classify ${countOf(props.items)}`}
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || facetId === '' || termId === ''}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit({ facetId, termId, mode });
            }}
          >
            Classify
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <Field label="Facet">
          <SelectInput
            value={facetId}
            onChange={(v) => {
              setFacetId(v);
              setTermId('');
            }}
            placeholder={scheme === null ? 'Loading…' : scheme.facets.length === 0 ? 'No classification scheme on this project' : 'Choose a facet'}
            options={(scheme?.facets ?? []).map((f) => ({ value: f.id, label: f.name }))}
          />
        </Field>
        <Field label="Term">
          <SelectInput
            value={termId}
            onChange={setTermId}
            disabled={facet === null}
            placeholder="Choose a term"
            options={(facet?.terms ?? []).filter((t) => t.retiredAt === null).map((t) => ({ value: t.id, label: `${t.code} — ${t.label}` }))}
          />
        </Field>
        <Field label="Where a document already has a term under this facet" hint="Append fills only the gaps and leaves what somebody set; replace sets every selected document to this term.">
          <SegmentedControl<'append' | 'replace'>
            label="Append or replace"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'append', label: 'Keep it (append)' },
              { value: 'replace', label: 'Replace it' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** the sentence a refused batch leaves on screen: nothing happened, and why, row by row */
function refusalNote(verb: string, error: unknown): string {
  const failures = error instanceof RequestError ? (error.body as { failures?: BulkFailure[] } | null)?.failures : undefined;
  if (!failures || failures.length === 0) return `Could not ${verb} — nothing was changed.`;
  const named = failures.slice(0, 3).map((f) => `${f.documentReference ?? 'a document'}: ${f.problem}`);
  return `Nothing was ${verb === 'transmit' ? 'transmitted' : verb === 'classify' ? 'classified' : verb === 'supersede' ? 'superseded' : 'issued'} — ${named.join('; ')}${failures.length > 3 ? ` and ${failures.length - 3} more` : ''}.`;
}

export function LibraryScreen() {
  const toast = useToast();
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const navigate = useNavigate();
  const isOwner = participant.membershipRole === 'owner';
  const me = useMe();
  // T-460 — the register's query lives in the address, so a filtered view
  // survives a reload and can be handed to a colleague as a link; a saved view
  // is the same query under a name
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readQuery(params), [params]);
  const [result, setResult] = useState<GetLibrarySearchResponse | null>(null);
  const items = result?.items ?? null;
  const [pending, setPending] = useState<PendingTransmittal[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [transmitItems, setTransmitItems] = useState<LibraryItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // T-389 — the two lifecycle acts, each open on at most one row at a time
  const [endingItem, setEndingItem] = useState<LibraryItem | null>(null);
  const [supersedingItems, setSupersedingItems] = useState<LibraryItem[] | null>(null);
  // T-461 — the register's selection (never in the URL: a selection is a moment, not a view) and the classify door
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [classifyItems, setClassifyItems] = useState<LibraryItem[] | null>(null);
  // T-431 — external issue. The settings read carries `mayIssue`, computed
  // server-side, so the action set is assembled rather than a disabled button
  // (T-269): a person who may not issue is offered nothing here yet, and T-432
  // gives them the request in its place.
  const [externalSettings, setExternalSettings] = useState<ExternalIssueSettings | null>(null);
  const [externalItems, setExternalItems] = useState<LibraryItem[] | null>(null);
  const [issued, setIssued] = useState<ExternalIssue | null>(null);
  // T-432 — the request queue. A queue on this screen and NOT a notification:
  // ADR-0055's notification set gains nothing, so a pending request is found
  // where the door is rather than chasing anybody into a tray.
  const [requests, setRequests] = useState<ExternalIssue[]>([]);
  const [declining, setDeclining] = useState<ExternalIssue | null>(null);
  // T-472 — adding reference material: the owner's super user only. Files go up
  // one request at a time, and the count line is fed from each request's own
  // answer (server state, no timers — the progress-rail doctrine).
  const mayAddReference = isOwner && participant.elevated;
  const fileInput = useRef<HTMLInputElement>(null);
  const [intakeWaiting, setIntakeWaiting] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const loadIntakeCount = useCallback(() => {
    if (mayAddReference) {
      void api.referenceIntake(projectId, { pageSize: 1 }).then((r) => setIntakeWaiting(r.total), () => setIntakeWaiting(null));
    }
  }, [mayAddReference, projectId]);
  useEffect(loadIntakeCount, [loadIntakeCount]);
  async function addReference(files: File[]) {
    if (files.length === 0) return;
    const state: UploadProgress = { total: files.length, uploaded: 0, scanned: 0, failed: [], finished: false };
    setUpload({ ...state });
    for (const file of files) {
      try {
        const { item } = await api.uploadReferenceFile(projectId, file);
        state.uploaded += 1;
        if (!item.readable) state.scanned += 1;
      } catch (error) {
        state.failed.push(`${file.name}: ${describeApiError(errorCode(error))}`);
      }
      setUpload({ ...state, failed: [...state.failed] });
    }
    state.finished = true;
    setUpload({ ...state, failed: [...state.failed] });
    loadIntakeCount();
  }

  // responses may land out of order — a ranked search is slower than the plain
  // list it replaces — so only the latest request's answer is kept, or a
  // stale list would overwrite the filtered one a moment after it appeared
  const requestSeq = useRef(0);
  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    const keep = (r: GetLibrarySearchResponse) => {
      if (seq === requestSeq.current) setResult(r);
    };
    void api
      .librarySearch(projectId, {
        q: query.q,
        state: query.state,
        kind: query.kind,
        discipline: query.discipline,
        ...(query.currency !== undefined && { currency: query.currency }),
        sort: query.sort,
        direction: query.direction,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
      .then(keep, () => keep({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, q: null }));
    void api.pendingTransmittals(projectId).then((res) => setPending(res.items));
  }, [projectId, query]);
  useEffect(load, [load]);
  const setQuery = (next: Partial<LibraryQuery>, resetPage = true) => {
    const merged: LibraryQuery = { ...query, ...next, ...(resetPage && !('page' in next) && { page: 1 }) };
    setParams(writeQuery(merged));
  };
  useEffect(() => {
    if (isOwner) void api.participants(projectId).then((r) => setRoster(r.items));
  }, [isOwner, projectId]);
  const loadExternal = useCallback(() => {
    void api.externalIssueSettings(projectId).then(setExternalSettings, () => setExternalSettings(null));
    void api.projectExternalIssues(projectId).then(
      // (review, 2026-09-02) declined rows stay listed for the parties who may
      // read the reason — as first built they vanished the moment they were
      // answered, so the person who asked could never read why they were
      // refused, anywhere in the product
      (r) =>
        setRequests(
          r.items.filter(
            (i) => i.state === 'requested' || (i.state === 'declined' && i.declineReason !== null),
          ),
        ),
      () => setRequests([]),
    );
  }, [projectId]);
  useEffect(loadExternal, [loadExternal]);

  // the rows this screen may act on through its single-row dialogs: live ones
  const liveItems = useMemo(
    () => (items ?? []).filter((r) => r.state === 'live').map((r): LibraryItem => ({ ...r, state: 'live' })),
    [items],
  );
  const toItem = (r: LibrarySearchItem): LibraryItem => ({ ...r, state: 'live' });

  // T-460 — the register's columns: the coded reference first (never hideable),
  // the lifecycle pair, then the facts a controller sorts and hides by
  const columns: RegisterColumn<LibrarySearchItem>[] = [
    {
      key: 'reference',
      label: 'Reference',
      sortable: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {r.kind === 'reference' ? (
            <BookOpen size={14} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          ) : (
            <FileText size={14} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )}
          <span style={refStyle}>{r.documentReference}</span>
          {r.match === 'content' && <Badge tone="neutral">matches the text</Badge>}
        </span>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (r) => (
        <>
          {r.title ?? (r.kind === 'reference' ? <span style={{ color: 'var(--text-muted)' }}>Reference material</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>)}
          {/* T-472 — held in the library, openable, and never read by a run */}
          {r.notCitable && (
            <div style={{ marginTop: 6, fontSize: 12.5 }}>
              <Badge tone="warning">{NOT_CITABLE_LABEL}</Badge>
              {r.notCitableReason && (
                <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{describeTextStatus(r.notCitableReason)}</span>
              )}
            </div>
          )}
          {/* T-473 — a reference document nobody has confirmed current, or whose re-check is overdue */}
          {currencyWords(r.currency) !== null && (
            <div style={{ marginTop: 6, fontSize: 12.5 }} data-currency={r.currency!.state}>
              <Badge tone="warning">{r.currency!.state === 'overdue' ? 'Re-check overdue' : 'Not confirmed current'}</Badge>
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{currencyWords(r.currency)}</span>
            </div>
          )}
          {/* T-389 — a standing proposal, and the owner's answer to it, on the row the decision is about */}
          {r.withdrawalProposal && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }} onClick={(e) => e.stopPropagation()}>
              Withdrawal proposed by {r.withdrawalProposal.name} — {r.withdrawalProposal.reason}
              {isOwner && (
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                  <Button size="sm" variant="quiet" onClick={() => void resolveProposal(toItem(r), true)}>
                    Withdraw it
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => void resolveProposal(toItem(r), false)}>
                    Decline
                  </Button>
                </span>
              )}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'state',
      label: 'State',
      render: (r) => {
        // T-455 — the lifecycle pair: where it is, and whether the AI may use it
        const lc = lifecycleBadge(r.state !== 'live' ? r.state : r.kind === 'reference' ? 'reference' : 'accepted', r.revision);
        const ctx = contextStateBadge(r.contextState);
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
            <Badge tone={lc.tone}>{lc.label}</Badge>
            {ctx && <Badge tone={ctx.tone}>{ctx.label}</Badge>}
          </span>
        );
      },
    },
    { key: 'revision', label: 'Revision', hideable: true, render: (r) => <span className="mono">{r.revision}</span> },
    {
      key: 'statusCode',
      label: 'Status code',
      hideable: true,
      render: (r) => (r.suitability ? <Badge tone="info">{r.suitability}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>),
    },
    {
      key: 'discipline',
      label: 'Discipline',
      hideable: true,
      render: (r) => (r.discipline ? <span className="mono">{r.discipline}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>),
    },
    { key: 'producer', label: 'Producer', sortable: true, hideable: true, render: (r) => r.producerName },
    { key: 'issued', label: 'Issued', sortable: true, hideable: true, render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{formatDate(r.issuedAt)}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            align="end"
            fixed
            trigger={(toggle) => (
              <Button size="sm" variant="quiet" onClick={toggle} aria-label={`Actions for ${r.documentReference}`} title="Actions">
                <MoreHorizontal size={15} strokeWidth={2} />
              </Button>
            )}
          >
            <DropdownMenuItem onClick={() => void navigate(`/projects/${projectId}/documents/${r.containerId}`)}>Open</DropdownMenuItem>
            {isOwner && r.state === 'live' && (
              <DropdownMenuItem onClick={() => setTransmitItems([toItem(r)])}>
                <Send size={13} strokeWidth={2} /> Transmit…
              </DropdownMenuItem>
            )}
            {/* T-431 — the door out of the project (ADR-0055 §2); T-432 puts the REQUEST here for everybody else */}
            {externalSettings !== null && r.state === 'live' && (
              <DropdownMenuItem onClick={() => setExternalItems([toItem(r)])}>
                <Share2 size={13} strokeWidth={2} /> {externalSettings.mayIssue ? 'Issue externally…' : 'Request external issue…'}
              </DropdownMenuItem>
            )}
            {/* T-389 — the owner ends a published deliverable, the producing organisation asks */}
            {(isOwner || r.producingOrganisationId === me.organisationId) && r.withdrawalProposal === null && r.state === 'live' && (
              <>
                <DropdownMenuItem onClick={() => setSupersedingItems([toItem(r)])}>Supersede…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEndingItem(toItem(r))}>{isOwner ? 'Withdraw…' : 'Propose withdrawal…'}</DropdownMenuItem>
              </>
            )}
          </DropdownMenu>
        </span>
      ),
    },
  ];
  const activeFilters: RegisterFilterChip[] = [
    ...(query.state !== 'live'
      ? [{ key: 'state', label: query.state === 'any' ? 'Including superseded and withdrawn' : query.state[0]!.toUpperCase() + query.state.slice(1) }]
      : []),
    ...(query.kind !== 'any' ? [{ key: 'kind', label: query.kind === 'reference' ? 'Reference material' : 'Deliverables' }] : []),
    ...(query.discipline ? [{ key: 'discipline', label: `Discipline ${query.discipline}` }] : []),
    ...(query.currency === 'needs_confirming' ? [{ key: 'currency', label: 'Needs confirming' }] : []),
  ];
  const disciplines = useMemo(
    () => [...new Set((items ?? []).map((r) => r.discipline).filter((d): d is string => d !== null))].sort(),
    [items],
  );

  // distinct organisations on the project, excluding the owner's own
  const otherOrgs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of roster) {
      if (r.organisationId !== me.organisationId && !seen.has(r.organisationId)) {
        seen.set(r.organisationId, r.organisationName);
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [roster, me.organisationId]);

  async function acknowledge(containerId: string) {
    try {
      await api.acknowledgeDeliverable(containerId);
      setNote('Acknowledged — the deliverable is now visible and grounds for your organisation.');
      load();
    } catch {
      setNote('Could not acknowledge (in controller mode, only the document controller may).');
    }
  }

  // T-389 — the same endpoint for both sides, because the boundary decides the
  // act, not the caller (ADR-0013 §2). What differs is what the screen then
  // says, and it must not overstate: a proposal changes nothing at all yet.
  async function endDeliverable(item: LibraryItem, reason: string) {
    const mine = item.producingOrganisationId === me.organisationId;
    try {
      await api.withdrawDeliverable(item.containerId, reason);
      if (isOwner) {
        // T-465 — reversible for as long as it is: restoration is the reverse act, and both stay on the record
        toast({
          text: mine
            ? `${item.documentReference} withdrawn.`
            : `${item.documentReference} withdrawn — it stands as a record on the plan and no longer grounds.`,
          tone: 'success',
          undo: async () => {
            await api.restoreDeliverable(item.containerId);
            load();
          },
        });
        setNote(null);
      } else {
        setNote(`Withdrawal proposed for ${item.documentReference}. It stays live and keeps grounding until the owner accepts.`);
      }
      load();
    } catch {
      setNote('Could not withdraw — the elevated capability is required for this act.');
    }
    setEndingItem(null);
  }

  async function resolveProposal(item: LibraryItem, accept: boolean) {
    try {
      await api.resolveWithdrawalProposal(item.containerId, accept);
      setNote(
        accept
          ? `${item.documentReference} withdrawn under the producing organisation's own reason.`
          : `Proposal declined — ${item.documentReference} is unchanged.`,
      );
      load();
    } catch {
      setNote('Could not answer the proposal — the elevated capability is required.');
    }
  }

  // Propose the edge, and — where the caller is the owner, who is also the only
  // party that may confirm one into a library container (T-386) — confirm it in
  // the same act. Two calls rather than one, deliberately: the record then reads
  // proposed-then-confirmed, which is what actually happened, instead of
  // inventing a third kind of write that skips the propose/confirm shape
  // ADR-0045 built.
  async function supersede(items: LibraryItem[], replacementContainerId: string) {
    try {
      if (items.length === 1) {
        const item = items[0]!;
        const edge = await api.proposeRelationship(replacementContainerId, item.containerId, 'supersedes');
        if (isOwner) {
          await api.confirmRelationship(edge.id);
          setNote(`${item.documentReference} superseded — it no longer grounds.`);
        } else {
          setNote(`Supersession proposed for ${item.documentReference}. The owner confirms it.`);
        }
      } else {
        // T-461 — many rows, one replacement, one act (bulk-acts.ts)
        const result = await api.bulkSupersede(projectId, { containerIds: items.map((i) => i.containerId), replacementContainerId });
        setNote(
          result.state === 'confirmed'
            ? `${items.length} documents superseded — they no longer ground.`
            : `Supersession proposed for ${items.length} documents. The owner confirms it.`,
        );
        setSelected(new Set());
      }
      load();
    } catch (error) {
      setNote(items.length === 1 ? 'Could not record that — check the replacement is a deliverable you can both see.' : refusalNote('supersede', error));
    }
    setSupersedingItems(null);
  }

  // T-461 — classify a selection: a producing-organisation act, append or replace
  async function classify(items: LibraryItem[], body: Omit<BulkClassifyBody, 'containerIds'>) {
    try {
      const result = await api.bulkClassify(projectId, { ...body, containerIds: items.map((i) => i.containerId) });
      setNote(
        result.kept > 0
          ? `Classified ${result.set} — ${result.kept} already had a term under that facet and ${result.kept === 1 ? 'was' : 'were'} left as set.`
          : `Classified ${result.set} ${result.set === 1 ? 'document' : 'documents'}.`,
      );
      setSelected(new Set());
    } catch (error) {
      setNote(refusalNote('classify', error));
    }
    setClassifyItems(null);
  }

  async function issueExternally(
    items: LibraryItem[],
    body: {
      recipientName: string;
      recipientEmail: string;
      reason: string;
      message: string;
      expiresInDays: number;
    },
  ) {
    try {
      if (items.length === 1) {
        const item = items[0]!;
        const issue = await api.issueExternally(item.containerId, body);
        if (issue.state === 'issued') {
          setIssued(issue);
          setNote(null);
        } else {
          // the act the setting left this person. It must not read as a send.
          setNote(
            `Requested — ${item.documentReference} is not issued yet. Somebody who may issue outside the project will approve or decline it.`,
          );
        }
      } else {
        // T-461 — one recipient, many documents, each its own link (ADR-0055)
        const result = await api.bulkIssueExternally(projectId, { ...body, containerIds: items.map((i) => i.containerId) });
        setNote(
          result.state === 'issued'
            ? `Issued ${items.length} documents to ${body.recipientName} — each link is listed on its document page.`
            : `Requested — ${items.length} documents are not issued yet. Somebody who may issue outside the project will approve or decline each.`,
        );
        setSelected(new Set());
      }
      loadExternal();
    } catch (error) {
      setNote(items.length === 1 ? 'Could not issue outside the project — check the deliverable has a current revision.' : refusalNote('issue', error));
    }
    setExternalItems(null);
  }

  async function answerRequest(request: ExternalIssue, approve: boolean, declineReason?: string) {
    try {
      const answered = await api.answerExternalRequest(request.id, {
        approve,
        ...(declineReason !== undefined && { declineReason }),
      });
      if (approve && answered.state === 'issued') {
        setIssued(answered);
        setNote(null);
      } else {
        setNote(`Declined — ${request.documentReference} has not left the project.`);
      }
      loadExternal();
    } catch {
      setNote('Could not answer that request — it may already have been answered.');
    }
    setDeclining(null);
  }

  async function transmit(items: LibraryItem[], organisationId: string) {
    try {
      if (items.length === 1) {
        await api.issueTransmittal(items[0]!.containerId, [organisationId]);
        setNote('Transmitted — the receiving organisation must acknowledge before it grounds.');
      } else {
        // T-461 — twenty rows, one dialog, one act (bulk-acts.ts)
        const result = await api.bulkTransmit(projectId, { containerIds: items.map((i) => i.containerId), organisationIds: [organisationId] });
        setNote(`Transmitted ${result.issued} documents — the receiving organisation must acknowledge each before it grounds.`);
        setSelected(new Set());
      }
    } catch (error) {
      setNote(items.length === 1 ? 'Transmittal failed — check a current version exists and the organisation is a member.' : refusalNote('transmit', error));
    }
    setTransmitItems(null);
  }

  // T-461 — the selection as rows this screen may act on (live ones), and the bar
  const selectedLive = (ids: string[]) => liveItems.filter((i) => ids.includes(i.containerId));
  const bulkBar = (ids: string[]) => {
    const rows = selectedLive(ids);
    const mine = rows.length > 0 && rows.every((r) => r.producingOrganisationId === me.organisationId);
    const ends = rows.length > 0 && rows.every((r) => r.withdrawalProposal === null && (isOwner || r.producingOrganisationId === me.organisationId));
    return (
      <>
        {isOwner && rows.length > 0 && (
          <Button size="sm" variant="quiet" onClick={() => setTransmitItems(rows)}>
            <Send size={13} strokeWidth={2} /> Transmit…
          </Button>
        )}
        {externalSettings !== null && rows.length > 0 && (
          <Button size="sm" variant="quiet" onClick={() => setExternalItems(rows)}>
            <Share2 size={13} strokeWidth={2} /> {externalSettings.mayIssue ? 'Issue externally…' : 'Request external issue…'}
          </Button>
        )}
        {ends && (
          <Button size="sm" variant="quiet" onClick={() => setSupersedingItems(rows)}>
            Supersede…
          </Button>
        )}
        {mine && (
          <Button size="sm" variant="quiet" onClick={() => setClassifyItems(rows)}>
            Classify…
          </Button>
        )}
        <Button
          size="sm"
          variant="quiet"
          onClick={() => void api.exportPlanRows(projectId, ids).catch(() => setNote('Could not export — try again.'))}
        >
          Export to Excel
        </Button>
      </>
    );
  };

  return (
    <div className="content">
      <h1 className="page">Project library</h1>
      <PageIntro
        line="Every document the project relies on, searchable by code, title or what it says."
        more="Superseded and withdrawn documents leave this list and stand as records on the plan. What the AI grounds on is narrower still: a deliverable accepted under a code this project does not rely on stays here, badged, and out of the AI’s reach. Tick rows to act on several at once; save the way you have set the list up as a view."
      />
      {note && <p style={{ color: 'var(--text-muted)' }}>{note}</p>}
      {upload && (
        <div role="status" aria-label="Reference material upload" style={{ color: 'var(--text-muted)' }}>
          <p style={{ margin: 0 }}>{uploadSentence(upload)}</p>
          {upload.failed.slice(0, 3).map((f) => (
            <p key={f} style={{ margin: 0, fontSize: 12.5 }}>{f}</p>
          ))}
        </div>
      )}
      {endingItem && (
        <EndDeliverableModal
          item={endingItem}
          mode={isOwner ? 'withdraw' : 'propose'}
          onClose={() => setEndingItem(null)}
          onSubmit={(reason) => endDeliverable(endingItem, reason)}
        />
      )}
      {supersedingItems && (
        <SupersedeModal
          items={supersedingItems}
          mode={isOwner ? 'confirm' : 'propose'}
          candidates={liveItems.filter((d) => !supersedingItems.some((i) => i.containerId === d.containerId))}
          onClose={() => setSupersedingItems(null)}
          onSubmit={(replacement) => supersede(supersedingItems, replacement)}
        />
      )}
      {externalItems && (
        <ExternalIssueModal
          items={externalItems}
          mode={externalSettings?.mayIssue ? 'issue' : 'request'}
          onClose={() => setExternalItems(null)}
          onSubmit={(body) => issueExternally(externalItems, body)}
        />
      )}
      {classifyItems && (
        <BulkClassifyModal
          projectId={projectId}
          items={classifyItems}
          onClose={() => setClassifyItems(null)}
          onSubmit={(body) => classify(classifyItems, body)}
        />
      )}
      {issued && <ExternalIssuedModal issue={issued} onClose={() => setIssued(null)} />}
      {declining && (
        <DeclineRequestModal
          request={declining}
          onClose={() => setDeclining(null)}
          onSubmit={(reason) => answerRequest(declining, false, reason)}
        />
      )}
      {transmitItems && (
        <TransmitModal
          items={transmitItems}
          orgs={otherOrgs}
          onClose={() => setTransmitItems(null)}
          onSubmit={(orgId) => transmit(transmitItems, orgId)}
        />
      )}

      {requests.length > 0 && (
        <>
          <SectionLabel>
            <Share2 size={13} strokeWidth={2} /> Requests to issue outside the project
          </SectionLabel>
          <p className="page-sub" style={{ marginTop: -4 }}>
            {externalSettings?.mayApprove
              ? 'Approving sends exactly what was asked for — the same revision, recipient, reason and message.'
              : 'Waiting on somebody who may issue outside this project.'}
          </p>
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Revision</th>
                  <th>Recipient</th>
                  <th>Why</th>
                  <th>Asked by</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td style={refStyle}>{r.documentReference}</td>
                    <td><span className="mono">{r.versionReference}</span></td>
                    <td>
                      {r.recipientName || <span style={{ color: 'var(--text-muted)' }}>Withheld</span>}
                      {r.recipientEmail && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.recipientEmail}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{r.reason}</td>
                    <td>{r.requestedBy.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.state === 'declined' ? (
                        // the answer the asker came back for: who declined, and why
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                          Declined{r.declinedBy ? ` by ${r.declinedBy.name}` : ''}
                          {r.declineReason ? ` — “${r.declineReason}”` : ''}
                        </span>
                      ) : (
                        externalSettings?.mayApprove && (
                          <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button size="sm" onClick={() => void answerRequest(r, true)}>
                              Approve and issue
                            </Button>
                            <Button size="sm" variant="quiet" onClick={() => setDeclining(r)}>
                              Decline…
                            </Button>
                          </span>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        </>
      )}

      {pending.length > 0 && (
        <>
          <SectionLabel>
            <Inbox size={13} strokeWidth={2} /> Awaiting your acknowledgement
          </SectionLabel>
          <Table>
            <table>
              <thead>
                <tr><th>Reference</th><th>Version</th><th style={{ textAlign: 'right' }}></th></tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.containerId}>
                    <td className="mono">{p.documentReference}</td>
                    <td className="mono">{p.versionReference}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" onClick={() => void acknowledge(p.containerId)}>Acknowledge receipt</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        </>
      )}

      <SectionLabel>Documents</SectionLabel>
      <Register<LibrarySearchItem>
        label="Project library"
        columns={columns}
        rows={items}
        rowKey={(r) => r.containerId}
        rowLabel={(r) => r.documentReference}
        selection={{ selected, onChange: setSelected, bar: bulkBar }}
        onRowClick={(r) => void navigate(`/projects/${projectId}/documents/${r.containerId}`)}
        search={{
          value: query.q ?? '',
          onChange: (q) => setQuery({ q: q === '' ? undefined : q }),
          placeholder: 'Search by code, title or what it says',
        }}
        filters={{
          active: activeFilters,
          onRemove: (key) =>
            setQuery(
              key === 'state' ? { state: 'live' } : key === 'kind' ? { kind: 'any' } : key === 'discipline' ? { discipline: undefined } : key === 'currency' ? { currency: undefined } : {},
            ),
          menu: (
            <>
              <DropdownMenuItem onClick={() => setQuery({ kind: 'deliverable' })}>Deliverables only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ kind: 'reference' })}>Reference material only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ currency: 'needs_confirming' })}>Needs confirming</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ state: 'any' })}>Include superseded and withdrawn</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ state: 'superseded' })}>Superseded only</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQuery({ state: 'withdrawn' })}>Withdrawn only</DropdownMenuItem>
              {disciplines.map((d) => (
                <DropdownMenuItem key={d} onClick={() => setQuery({ discipline: d })}>
                  Discipline {d}
                </DropdownMenuItem>
              ))}
            </>
          ),
        }}
        sort={{
          value: query.sort === 'relevance' ? null : { key: query.sort, direction: query.direction },
          onChange: (sort: RegisterSort | null) =>
            setQuery(sort === null ? { sort: 'relevance', direction: 'asc' } : { sort: sort.key as LibraryQuery['sort'], direction: sort.direction }),
        }}
        hiddenColumns={{ value: query.cols, onChange: (cols) => setQuery({ cols }, false) }}
        actions={
          mayAddReference ? (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept=".pdf,.docx,.xlsx,.pptx"
                aria-label="Reference material files"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = '';
                  void addReference(files);
                }}
              />
              <Button size="sm" variant="quiet" onClick={() => fileInput.current?.click()}>
                <Plus size={13} strokeWidth={2} /> Add reference material
              </Button>
              <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${projectId}/library/intake`)}>
                Intake{intakeWaiting !== null && intakeWaiting > 0 ? ` (${intakeWaiting})` : ''}
              </Button>
            </>
          ) : undefined
        }
        page={
          result
            ? { page: result.page, pageSize: result.pageSize, total: result.total, onPage: (page) => setQuery({ page }, false) }
            : undefined
        }
        views={
          <SavedViewsMenu
            projectId={projectId}
            register="library"
            current={savedShape(query)}
            activeName={query.view ?? null}
            onApply={(filter) => setParams(writeQuery({ ...readQuery(new URLSearchParams()), ...fromSaved(filter) }))}
          />
        }
        empty={
          query.q || activeFilters.length > 0
            ? 'Nothing in this library matches. Clear a filter, or search by a different word.'
            : 'No documents in this project’s library yet.'
        }
      />
    </div>
  );
}

const PAGE_SIZE = 50;

/** the register's query, as the address carries it */
type LibraryQuery = {
  q?: string | undefined;
  state: NonNullable<LibrarySearchQuery['state']>;
  kind: NonNullable<LibrarySearchQuery['kind']>;
  discipline?: string | undefined;
  /** T-473 — reference documents not confirmed current, or overdue for a re-check */
  currency?: 'needs_confirming' | undefined;
  sort: NonNullable<LibrarySearchQuery['sort']>;
  direction: NonNullable<LibrarySearchQuery['direction']>;
  page: number;
  /** hidden columns */
  cols: string[];
  /** the saved view this query came from, for the menu's label */
  view?: string | undefined;
};

function readQuery(params: URLSearchParams): LibraryQuery {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = params.get(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };
  const page = Number(params.get('page') ?? '1');
  return {
    q: params.get('q') ?? undefined,
    state: pick('state', ['live', 'superseded', 'withdrawn', 'rejected', 'any'] as const, 'live'),
    kind: pick('kind', ['deliverable', 'reference', 'any'] as const, 'any'),
    discipline: params.get('discipline') ?? undefined,
    currency: params.get('currency') === 'needs_confirming' ? 'needs_confirming' : undefined,
    sort: pick('sort', ['relevance', 'reference', 'title', 'issued', 'producer'] as const, 'relevance'),
    direction: pick('direction', ['asc', 'desc'] as const, 'asc'),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    cols: (params.get('cols') ?? '').split(',').filter(Boolean),
    view: params.get('view') ?? undefined,
  };
}

function writeQuery(q: LibraryQuery): URLSearchParams {
  const out = new URLSearchParams();
  if (q.q) out.set('q', q.q);
  if (q.state !== 'live') out.set('state', q.state);
  if (q.kind !== 'any') out.set('kind', q.kind);
  if (q.discipline) out.set('discipline', q.discipline);
  if (q.currency) out.set('currency', q.currency);
  if (q.sort !== 'relevance') out.set('sort', q.sort);
  if (q.direction !== 'asc') out.set('direction', q.direction);
  if (q.page > 1) out.set('page', String(q.page));
  if (q.cols.length > 0) out.set('cols', q.cols.join(','));
  if (q.view) out.set('view', q.view);
  return out;
}

/** what a saved view keeps of the query — never the page, never the view's own name */
function savedShape(q: LibraryQuery): Record<string, unknown> {
  const { page: _page, view: _view, ...rest } = q;
  void _page;
  void _view;
  return rest;
}

/** a saved view's stored query, read back defensively: a stale key renders nothing */
function fromSaved(filter: Record<string, unknown>): Partial<LibraryQuery> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (k === 'cols' && Array.isArray(v)) params.set('cols', v.filter((x): x is string => typeof x === 'string').join(','));
    else if (typeof v === 'string' || typeof v === 'number') params.set(k, String(v));
  }
  const read = readQuery(params);
  return { ...read, view: typeof filter['view'] === 'string' ? filter['view'] : undefined };
}
