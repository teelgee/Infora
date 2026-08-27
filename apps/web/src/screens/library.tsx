// The Documents tab (T-086), extended for Slice A2 (T-161): the receiving org's
// acknowledgement inbox (ADR-0035 §4 — the gate withholds the deliverable until
// its transmittal is acknowledged) and the owner's transmit action. The main
// list is the API's access-resolved slice: exactly what grounding admits.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import type { LibraryItem, MeResponse, PendingTransmittal, Rendition, RosterEntry } from '@infora/contracts';
import { BookOpen, Download, FileText, Inbox, Send } from 'lucide-react';
import { Badge, Button, Combobox, Field, Modal, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';
import { formatDate } from './shared';

// the coded reference is the primary identifier — prominent monospace, not the
// muted 12px .mono treatment used for incidental codes
const refStyle = {
  fontFamily: 'var(--primitive-font-family-mono)',
  fontSize: 13,
  color: 'var(--text-primary)',
} as const;
const linkStyle = { fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' } as const;

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

// Opening a published deliverable shows the actual document — the PDF rendition
// inline, the native file to download — not the raw source text. Both the owner
// and the producer see the same file (the /renditions/:id/file endpoint is
// access-resolved like the list). Seeded/legacy rows without renditions fall
// back to their source text so nothing is a dead click.
function DocumentModal(props: { item: LibraryItem; onClose: () => void }) {
  const { item } = props;
  const [renditions, setRenditions] = useState<Rendition[] | null>(null);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    setRenditions(null);
    setContent(null);
    void api.renditions(item.currentVersionId).then(
      (r) => setRenditions(r.items),
      () => setRenditions([]),
    );
  }, [item.currentVersionId]);

  const noRenditions = renditions !== null && renditions.length === 0;
  useEffect(() => {
    if (noRenditions && content === null) {
      void api.version(item.currentVersionId).then(
        (v) => setContent(v.content),
        () => setContent(''),
      );
    }
  }, [noRenditions, content, item.currentVersionId]);

  const pdf = renditions?.find((r) => r.kind === 'pdf') ?? null;
  const native = renditions?.find((r) => r.kind === 'native') ?? null;
  const fileUrl = (id: string) => `/renditions/${id}/file`;

  return (
    <Modal
      open
      onClose={props.onClose}
      size="lg"
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={refStyle}>{item.documentReference}</span>
          <span className="mono">{item.revision}</span>
          <Badge tone="success">Live</Badge>
        </span>
      }
      footer={
        <>
          {native && (
            <a href={fileUrl(native.id)} style={linkStyle}>
              <Download size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              Download native .{native.format}
            </a>
          )}
          {pdf && (
            <a href={fileUrl(pdf.id)} target="_blank" rel="noreferrer" style={linkStyle}>
              <Download size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              PDF in new tab
            </a>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="quiet" onClick={props.onClose}>Close</Button>
        </>
      }
    >
      {renditions === null ? (
        <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
      ) : pdf ? (
        <object
          data={fileUrl(pdf.id)}
          type="application/pdf"
          style={{ width: '100%', height: '64vh', border: '1px solid var(--border-default)', borderRadius: 6 }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            Your browser can’t preview the PDF — <a href={fileUrl(pdf.id)}>download it</a>.
          </p>
        </object>
      ) : native ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          The native file <span className="mono">.{native.format}</span> is ready — download it below.
        </p>
      ) : (
        <div>
          <p className="field-hint" style={{ marginTop: 0 }}>
            No rendered file for this document — showing its source text.
          </p>
          <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6 }}>
            {content ?? 'Loading…'}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function LibraryScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const me = useMe();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [pending, setPending] = useState<PendingTransmittal[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [transmitItem, setTransmitItem] = useState<LibraryItem | null>(null);
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void api.library(projectId).then((res) => setItems(res.items));
    void api.pendingTransmittals(projectId).then((res) => setPending(res.items));
  }, [projectId]);
  useEffect(load, [load]);
  useEffect(() => {
    if (isOwner) void api.participants(projectId).then((r) => setRoster(r.items));
  }, [isOwner, projectId]);

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
        The governed corpus — what the AI grounds on. Superseded and withdrawn documents leave this
        list and the grounded corpus together.
      </p>
      {note && <p style={{ color: 'var(--text-muted)' }}>{note}</p>}
      {openItem && <DocumentModal item={openItem} onClose={() => setOpenItem(null)} />}
      {transmitItem && (
        <TransmitModal
          item={transmitItem}
          orgs={otherOrgs}
          onClose={() => setTransmitItem(null)}
          onSubmit={(orgId) => transmit(transmitItem, orgId)}
        />
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
              <th>Suitability</th>
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
                onClick={() => setOpenItem(item)}
                style={{ cursor: 'pointer' }}
                title="Open the current revision"
              >
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={refStyle}>{item.documentReference}</span>
                  </span>
                </td>
                <td>{item.title ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td><span className="mono">{item.revision}</span></td>
                <td>{item.suitability ? <Badge tone="info">{item.suitability}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td>{item.discipline ? <span className="mono">{item.discipline}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td>{item.producerName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.issuedAt)}</td>
                <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="quiet" onClick={() => setOpenItem(item)}>
                      Open
                    </Button>
                    {isOwner && (
                      <Button size="sm" variant="quiet" onClick={() => setTransmitItem(item)}>
                        <Send size={13} strokeWidth={2} /> Transmit
                      </Button>
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
                    onClick={() => setOpenItem(item)}
                    style={{ cursor: 'pointer' }}
                    title="Open this document"
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
                      <Button size="sm" variant="quiet" onClick={() => setOpenItem(item)}>
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
