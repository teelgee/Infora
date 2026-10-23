// The Documents tab (T-086), extended for Slice A2 (T-161): the receiving org's
// acknowledgement inbox (ADR-0035 §4 — the gate withholds the deliverable until
// its transmittal is acknowledged) and the owner's transmit action. The main
// list is the API's access-resolved slice: exactly what grounding admits.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router';
import type {
  ExternalIssue,
  ExternalIssueSettings,
  LibraryItem,
  MeResponse,
  PendingTransmittal,
  RosterEntry,
} from '@infora/contracts';
import { BookOpen, FileText, Inbox, Send, Share2 } from 'lucide-react';
import {
  Badge,
  Button,
  Combobox,
  Field,
  Modal,
  SectionLabel,
  Table,
  TextArea,
  TextInput,
} from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';
import { contextStateBadge, formatDate, libraryLifecycleBadge } from './shared';

// the coded reference is the primary identifier — prominent monospace, not the
// muted 12px .mono treatment used for incidental codes
const refStyle = {
  fontFamily: 'var(--primitive-font-family-mono)',
  fontSize: 13,
  color: 'var(--text-primary)',
} as const;

type ShellContext = { participant: MeResponse['participants'][number] };

function TransmitModal(props: {
  item: LibraryItem;
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
      title={`Transmit ${props.item.documentReference}`}
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
  item: LibraryItem;
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
          ? `Issue ${props.item.documentReference} outside the project`
          : `Request that ${props.item.documentReference} is issued outside the project`
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
        The recipient gets a link to <strong>this revision of this document and nothing else</strong>
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
  item: LibraryItem;
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
      title={`Supersede ${props.item.documentReference}`}
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
        label="Which deliverable replaces it"
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

export function LibraryScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const navigate = useNavigate();
  const isOwner = participant.membershipRole === 'owner';
  const me = useMe();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [pending, setPending] = useState<PendingTransmittal[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [transmitItem, setTransmitItem] = useState<LibraryItem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // T-389 — the two lifecycle acts, each open on at most one row at a time
  const [endingItem, setEndingItem] = useState<LibraryItem | null>(null);
  const [supersedingItem, setSupersedingItem] = useState<LibraryItem | null>(null);
  // T-431 — external issue. The settings read carries `mayIssue`, computed
  // server-side, so the action set is assembled rather than a disabled button
  // (T-269): a person who may not issue is offered nothing here yet, and T-432
  // gives them the request in its place.
  const [externalSettings, setExternalSettings] = useState<ExternalIssueSettings | null>(null);
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  const [issued, setIssued] = useState<ExternalIssue | null>(null);
  // T-432 — the request queue. A queue on this screen and NOT a notification:
  // ADR-0055's notification set gains nothing, so a pending request is found
  // where the door is rather than chasing anybody into a tray.
  const [requests, setRequests] = useState<ExternalIssue[]>([]);
  const [declining, setDeclining] = useState<ExternalIssue | null>(null);

  const load = useCallback(() => {
    void api.library(projectId).then((res) => setItems(res.items));
    void api.pendingTransmittals(projectId).then((res) => setPending(res.items));
  }, [projectId]);
  useEffect(load, [load]);
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

  // T-304 — the produced record and the material this project received are two
  // lists, split on the server's derived `kind` rather than on anything this
  // screen infers. Kept null-vs-empty apart so "still loading" and "none" stay
  // distinguishable, which is what lets the reference section be absent
  // entirely on a project that has loaded none.
  const deliverables = useMemo(
    () => items?.filter((item) => item.kind === 'deliverable') ?? null,
    [items],
  );
  const reference = useMemo(() => items?.filter((item) => item.kind === 'reference') ?? null, [items]);

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
      setNote(
        isOwner && !mine
          ? `${item.documentReference} withdrawn — it stands as a record on the plan and no longer grounds.`
          : isOwner
            ? `${item.documentReference} withdrawn.`
            : `Withdrawal proposed for ${item.documentReference}. It stays live and keeps grounding until the owner accepts.`,
      );
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
  async function supersede(item: LibraryItem, replacementContainerId: string) {
    try {
      const edge = await api.proposeRelationship(replacementContainerId, item.containerId, 'supersedes');
      if (isOwner) {
        await api.confirmRelationship(edge.id);
        setNote(`${item.documentReference} superseded — it no longer grounds.`);
      } else {
        setNote(`Supersession proposed for ${item.documentReference}. The owner confirms it.`);
      }
      load();
    } catch {
      setNote('Could not record that — check the replacement is a deliverable you can both see.');
    }
    setSupersedingItem(null);
  }

  async function issueExternally(
    item: LibraryItem,
    body: {
      recipientName: string;
      recipientEmail: string;
      reason: string;
      message: string;
      expiresInDays: number;
    },
  ) {
    try {
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
      loadExternal();
    } catch {
      setNote('Could not issue outside the project — check the deliverable has a current revision.');
    }
    setExternalItem(null);
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

  async function transmit(item: LibraryItem, organisationId: string) {
    try {
      await api.issueTransmittal(item.containerId, [organisationId]);
      setNote('Transmitted — the receiving organisation must acknowledge before it grounds.');
    } catch {
      setNote('Transmittal failed — check a current version exists and the organisation is a member.');
    }
    setTransmitItem(null);
  }

  return (
    <div className="content">
      <h1 className="page">Project library</h1>
      <p className="page-sub">
        The governed corpus. Superseded and withdrawn documents leave this list and stand as
        records on the plan. What the AI grounds on is narrower still: a deliverable accepted
        under a code this project does not rely on stays here, badged, and out of reach.
      </p>
      {note && <p style={{ color: 'var(--text-muted)' }}>{note}</p>}
      {endingItem && (
        <EndDeliverableModal
          item={endingItem}
          mode={isOwner ? 'withdraw' : 'propose'}
          onClose={() => setEndingItem(null)}
          onSubmit={(reason) => endDeliverable(endingItem, reason)}
        />
      )}
      {supersedingItem && (
        <SupersedeModal
          item={supersedingItem}
          mode={isOwner ? 'confirm' : 'propose'}
          candidates={(deliverables ?? []).filter((d) => d.containerId !== supersedingItem.containerId)}
          onClose={() => setSupersedingItem(null)}
          onSubmit={(replacement) => supersede(supersedingItem, replacement)}
        />
      )}
      {externalItem && (
        <ExternalIssueModal
          item={externalItem}
          mode={externalSettings?.mayIssue ? 'issue' : 'request'}
          onClose={() => setExternalItem(null)}
          onSubmit={(body) => issueExternally(externalItem, body)}
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
      {transmitItem && (
        <TransmitModal
          item={transmitItem}
          orgs={otherOrgs}
          onClose={() => setTransmitItem(null)}
          onSubmit={(orgId) => transmit(transmitItem, orgId)}
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

      <SectionLabel>Live deliverables</SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Title</th>
              <th>Revision</th>
              <th>State</th>
              <th>Status code</th>
              <th>Discipline</th>
              <th>Producer</th>
              <th>Issued</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {(deliverables ?? []).map((item) => (
              <tr
                key={item.containerId}
                onClick={() => void navigate(`/projects/${projectId}/documents/${item.containerId}`)}
                style={{ cursor: 'pointer' }}
                title="Open the document page"
              >
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={refStyle}>{item.documentReference}</span>
                  </span>
                </td>
                <td>
                  {item.title ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  {/* T-388 — a live deliverable can be in the library and out of
                      the AI's reach, when the code that admitted it is one this
                      project does not ground on. Nothing on this screen said so
                      before, and the failure is invisible from the answer end:
                      the citations it does return all resolve. */}
                  {contextStateBadge(item.contextState) && (
                    <div style={{ marginTop: 4 }}>
                      <Badge tone={contextStateBadge(item.contextState)!.tone}>
                        {contextStateBadge(item.contextState)!.label}
                      </Badge>
                    </div>
                  )}
                  {/* T-389 — a standing proposal, and the owner's answer to it.
                      It sits on the row rather than in a separate queue because
                      the thing being decided is this deliverable, and the row
                      is where its reason, its producer and its state already
                      are. Both sides see the proposal; only the owner answers. */}
                  {item.withdrawalProposal && (
                    <div
                      style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Withdrawal proposed by {item.withdrawalProposal.name} —{' '}
                      {item.withdrawalProposal.reason}
                      {isOwner && (
                        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                          <Button size="sm" variant="quiet" onClick={() => void resolveProposal(item, true)}>
                            Withdraw it
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => void resolveProposal(item, false)}>
                            Decline
                          </Button>
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  {/* T-455 — the lifecycle badge, the same words as the plan and the review screens */}
                  <Badge tone={libraryLifecycleBadge(item).tone}>{libraryLifecycleBadge(item).label}</Badge>
                </td>
                <td>{item.suitability ? <Badge tone="info">{item.suitability}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td>{item.discipline ? <span className="mono">{item.discipline}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td>{item.producerName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.issuedAt)}</td>
                <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${projectId}/documents/${item.containerId}`)}>
                      Open
                    </Button>
                    {isOwner && (
                      <Button size="sm" variant="quiet" onClick={() => setTransmitItem(item)}>
                        <Send size={13} strokeWidth={2} /> Transmit
                      </Button>
                    )}
                    {/* T-431 — the door out of the project (ADR-0055 §2), on
                        the deliverable and beside the transmittal that stays
                        inside it. Offered only to somebody the project's
                        who-may-issue setting admits; T-432 puts the REQUEST
                        action here for everybody else. */}
                    {externalSettings !== null && (
                      <Button size="sm" variant="quiet" onClick={() => setExternalItem(item)}>
                        <Share2 size={13} strokeWidth={2} />{' '}
                        {externalSettings.mayIssue ? 'Issue externally…' : 'Request external issue…'}
                      </Button>
                    )}
                    {/* T-389 — the acts that did not exist. Offered to the two
                        sides the record belongs to and to nobody else: the
                        owner ends a published deliverable, the producing
                        organisation asks. A member organisation that neither
                        owns the library nor produced this row sees neither. */}
                    {(isOwner || item.producingOrganisationId === me.organisationId) &&
                      item.withdrawalProposal === null && (
                        <>
                          <Button size="sm" variant="quiet" onClick={() => setSupersedingItem(item)}>
                            Supersede…
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => setEndingItem(item)}>
                            {isOwner ? 'Withdraw…' : 'Propose withdrawal…'}
                          </Button>
                        </>
                      )}
                  </span>
                </td>
              </tr>
            ))}
            {deliverables !== null && deliverables.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                  No live deliverables in this project&apos;s library.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>

      {/* T-304 — reference material is listed APART from the produced record,
          not merely badged inside it. Both ground and both are cited the same
          way; the difference is that nobody here produced these, and a
          consultee response sitting in a table headed "Live deliverables"
          is the corpus laundering itself into the record it is supposed to
          support. The columns differ for the same reason: there is no
          Suitability, no Discipline and no Transmit for a document this
          project received, and "Producer" would be a lie — the organisation
          named is the one that HOLDS it. */}
      {reference !== null && reference.length > 0 && (
        <>
          <SectionLabel>Reference material</SectionLabel>
          <p className="page-sub" style={{ marginTop: -4 }}>
            Received, not produced here — loaded into the library so the AI can ground and cite on
            it. These carry no plan row and no review history.
          </p>
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Revision</th>
                  <th>Held by</th>
                  <th>Loaded</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {reference.map((item) => (
                  <tr
                    key={item.containerId}
                    onClick={() => void navigate(`/projects/${projectId}/documents/${item.containerId}`)}
                    style={{ cursor: 'pointer' }}
                    title="Open the document page"
                  >
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <BookOpen
                          size={14}
                          strokeWidth={2}
                          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                        />
                        <span style={refStyle}>{item.documentReference}</span>
                        <Badge tone="neutral">Reference</Badge>
                      </span>
                    </td>
                    <td><span className="mono">{item.revision}</span></td>
                    <td>{item.producerName}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.issuedAt)}</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${projectId}/documents/${item.containerId}`)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        </>
      )}
    </div>
  );
}
