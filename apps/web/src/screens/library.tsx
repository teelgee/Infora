// The Documents tab (T-086), extended for Slice A2 (T-161): the receiving org's
// acknowledgement inbox (ADR-0035 §4 — the gate withholds the deliverable until
// its transmittal is acknowledged) and the owner's transmit action. The main
// list is the API's access-resolved slice: exactly what grounding admits.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LibraryItem, MeResponse, PendingTransmittal, RosterEntry } from '@infora/contracts';
import { FileText, Inbox, Send } from 'lucide-react';
import { Badge, Button, Combobox, Field, Modal, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';

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

export function LibraryScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const me = useMe();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [pending, setPending] = useState<PendingTransmittal[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [transmitItem, setTransmitItem] = useState<LibraryItem | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void api.library(projectId).then((res) => setItems(res.items));
    void api.pendingTransmittals(projectId).then((res) => setPending(res.items));
  }, [projectId]);
  useEffect(load, [load]);
  useEffect(() => {
    if (isOwner) void api.participants(projectId).then((r) => setRoster(r.items));
  }, [isOwner, projectId]);

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
              <th>State</th>
              {isOwner && <th style={{ textAlign: 'right' }}></th>}
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.containerId}>
                <td>
                  <span className="ficon"><FileText size={14} strokeWidth={2} /></span>
                  <span className="mono">{item.documentReference}</span>
                </td>
                <td><Badge tone="success">Live</Badge></td>
                {isOwner && (
                  <td style={{ textAlign: 'right' }}>
                    <Button size="sm" variant="quiet" onClick={() => setTransmitItem(item)}>
                      <Send size={13} strokeWidth={2} /> Transmit
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {items !== null && items.length === 0 && (
              <tr>
                <td colSpan={isOwner ? 3 : 2} style={{ color: 'var(--text-muted)' }}>
                  No live deliverables in this project&apos;s library.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}
