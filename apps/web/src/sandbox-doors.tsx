// T-456 — doors for what the sandbox API already did with no screen: a
// document's working-version history with restore (T-128, ADR-0032's ambient
// history; T-477 made it a panel, asks before restoring and names frozen versions), delete to the bin and restore from it (T-128), and, for an
// organisation's admin, erasure with its record (T-340, ADR-0050 §§5–6).
//
// *In plain terms: every working version of a draft is listed, with who saved
// it and when, and any of them can be brought back as the next version.
// Deleting a draft moves it to "Deleted documents", from where it can be
// restored. An organisation's admin can erase a deleted draft for good by
// typing its title, and can read the record of what was erased.*
//
// Nothing here resolves a permission: the API answers 404 to a person the act
// is not for, and the screens render what came back. The one role check in
// this file — `isOrgAdmin` — decides only whether the erase controls are drawn
// at all, because a control that will be refused is clutter (principle 4).
import { useEffect, useState } from 'react';
import type { PurgeRecord, SandboxDocument, SandboxDocumentVersion } from '@infora/contracts';
import { Badge, Button, Drawer, Field, Modal, SectionLabel, Skeleton, TextInput } from '@infora/ui';
import { api, RequestError } from './api';
import { formatDateTime } from './screens/shared';

type Note = (text: string, tone?: 'success' | 'error') => void;

/** The words for a version's freeze marks (T-477): "Frozen", or which P revision it was issued as. */
export function frozenWords(v: SandboxDocumentVersion): string | null {
  if (!v.frozen || v.frozen.length === 0) return null;
  return v.frozen
    .map((f) => (f.issuedForReview ? `Frozen — issued as ${f.frozenAs} for internal QA` : 'Frozen'))
    .join('; ');
}

/**
 * The working versions of one document, newest first: who saved each and when,
 * which were frozen, and Restore — which asks first (T-477). One component for
 * both doors: the sandbox row's menu and the editor's top bar.
 *
 * *In plain terms: a side panel listing every saved version of a draft. Pressing
 * Restore on an old one asks "Restore v0.2? It becomes v0.5; nothing in the
 * history is rewritten." — and only then adds the old text as the newest
 * version. The older versions are left exactly as they were.*
 */
export function HistoryPanel(props: {
  doc: SandboxDocument;
  onClose: () => void;
  /** called after a restore lands, with the document as it now stands */
  onRestored: (doc: SandboxDocument) => Promise<unknown> | void;
  setNote: Note;
}) {
  const [items, setItems] = useState<SandboxDocumentVersion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    void api
      .sandboxDocumentHistory(props.doc.id)
      .then((r) => setItems(r.items)) // the API already answers newest first (ADR-0041's v0.x counts from the oldest)
      .catch(() => setItems([]));
  }, [props.doc.id]);

  const restore = (v: SandboxDocumentVersion) => {
    setBusy(true);
    void api
      .restoreSandboxVersion(props.doc.id, v.id)
      .then((d) => {
        props.setNote(`Restored ${v.versionReference} as ${d.workingRevision ?? 'the next working version'} — nothing in the history was rewritten.`);
        props.onClose();
        return props.onRestored(d);
      })
      .catch((e: unknown) =>
        props.setNote(
          e instanceof RequestError && e.status === 409
            ? 'Restore refused — the document is checked out. Release it first.'
            : 'Restore refused.',
          'error',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Drawer open onClose={props.onClose} title={`History — ${props.doc.title}`}>
      <p className="page-sub" style={{ marginTop: 0 }}>
        Every working version, newest first. Restoring one writes it as the next version; the history itself never changes.
      </p>
      {props.doc.headLocked && (
        <p className="page-sub">This document is checked out, so it cannot be restored until it is released.</p>
      )}
      {items === null ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <p className="page-sub">No saved versions yet.</p>
      ) : (
        <ul className="shelf-rows" aria-label="Working versions">
          {items.map((v, i) => {
            const frozen = frozenWords(v);
            return (
              <li key={v.id} style={{ display: 'grid', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ minWidth: 48 }}>
                    {v.versionReference}
                  </span>
                  <span style={{ flex: 1 }}>
                    {v.createdBy.name} · {formatDateTime(v.createdAt)}
                    {i === 0 && (
                      <>
                        {' '}
                        <Badge tone="neutral">current</Badge>
                      </>
                    )}
                    {frozen !== null && (
                      <>
                        {' '}
                        <Badge tone="info">{frozen}</Badge>
                      </>
                    )}
                  </span>
                  {i > 0 && !props.doc.headLocked && asking !== v.id && (
                    <Button size="sm" variant="quiet" disabled={busy} onClick={() => setAsking(v.id)}>
                      Restore
                    </Button>
                  )}
                </span>
                {asking === v.id && (
                  <div className="history-confirm" role="group" aria-label={`Confirm restoring ${v.versionReference}`}>
                    <span>
                      Restore {v.versionReference}? It becomes v0.{items.length + 1}; nothing in the history is rewritten.
                    </span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <Button size="sm" variant="quiet" disabled={busy} onClick={() => setAsking(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => restore(v)}>
                        Restore {v.versionReference}
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

/** Delete to the bin — a reversible act, said so in the dialog. */
export function DeleteModal(props: {
  doc: SandboxDocument;
  onClose: () => void;
  reload: () => Promise<unknown>;
  setNote: Note;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Delete “${props.doc.title}”?`}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api
                .deleteSandboxDocument(props.doc.id)
                .then(() => {
                  props.setNote(`Deleted “${props.doc.title}” — it is in Deleted documents and can be restored from there.`);
                  props.onClose();
                  return props.reload();
                })
                .catch((e: unknown) =>
                  props.setNote(
                    e instanceof RequestError && e.status === 409
                      ? 'Delete refused — the document is checked out. Release it first.'
                      : 'Delete refused.',
                    'error',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <p className="page-sub" style={{ margin: 0 }}>
        It moves to Deleted documents, where anyone in this sandbox can restore it. Nothing is erased.
      </p>
    </Modal>
  );
}

/**
 * The bin: deleted documents with restore, and — for an organisation's admin —
 * erase-for-good with its typed confirmation, and the record of erasures.
 */
export function BinModal(props: {
  projectId: string;
  isOrgAdmin: boolean;
  onClose: () => void;
  reload: () => Promise<unknown>;
  setNote: Note;
}) {
  const [items, setItems] = useState<SandboxDocument[] | null>(null);
  const [purges, setPurges] = useState<PurgeRecord[] | null>(null);
  const [erasing, setErasing] = useState<SandboxDocument | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    void api
      .deletedSandboxDocuments(props.projectId)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
    if (props.isOrgAdmin) {
      void api
        .purges(props.projectId)
        .then((r) => setPurges(r.items))
        .catch(() => setPurges(null));
    }
  };
  useEffect(() => {
    load();
    // the reads are keyed on the project and the viewer's tier; `load` is stable per render of those
  }, [props.projectId, props.isOrgAdmin]);

  const restore = (doc: SandboxDocument) => {
    setBusy(true);
    void api
      .undeleteSandboxDocument(doc.id)
      .then(() => {
        props.setNote(`Restored “${doc.title}”.`);
        load();
        return props.reload();
      })
      .catch(() => props.setNote('Restore refused.', 'error'))
      .finally(() => setBusy(false));
  };

  const erase = () => {
    if (!erasing) return;
    setBusy(true);
    void api
      .purgeSandboxDocument(props.projectId, { sandboxDocumentId: erasing.id, confirmation })
      .then((r) => {
        const reached = r.reached;
        props.setNote(
          `Erased “${erasing.title}” — ${reached.ambientVersions} working versions, ${reached.chunks} indexed passages and ${reached.blobs} stored files are gone. The record of this erasure is kept.`,
        );
        setErasing(null);
        setConfirmation('');
        load();
      })
      .catch((e: unknown) =>
        props.setNote(
          e instanceof RequestError && e.body?.detail === 'confirmation_mismatch'
            ? 'The title typed does not match — type it exactly as the row shows it.'
            : 'Erase refused.',
          'error',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Modal open onClose={props.onClose} title="Deleted documents" size="md">
      <p className="page-sub" style={{ marginTop: 0 }}>
        Deleted drafts in your organisation’s sandboxes. Restore brings one back where it was.
        {props.isOrgAdmin && ' Erase is permanent and reaches every copy, index and file; it needs the title typed.'}
      </p>
      {items === null ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <p className="page-sub">Nothing deleted.</p>
      ) : (
        <ul className="shelf-rows" aria-label="Deleted documents">
          {items.map((doc) => (
            <li key={doc.id} style={{ display: 'grid', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1 }}>
                  {doc.title}
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>{formatDateTime(doc.updatedAt)}</span>
                </span>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => restore(doc)}>
                  Restore
                </Button>
                {props.isOrgAdmin && erasing?.id !== doc.id && (
                  <Button size="sm" variant="quiet" disabled={busy} onClick={() => { setErasing(doc); setConfirmation(''); }}>
                    Erase permanently…
                  </Button>
                )}
              </span>
              {props.isOrgAdmin && erasing?.id === doc.id && (
                <div style={{ display: 'grid', gap: 6, paddingLeft: 8, borderLeft: '2px solid var(--border-default)' }}>
                  <Field label="Type the title to confirm" hint="Checked on the server, exactly as the row shows it. There is no undo.">
                    <TextInput value={confirmation} onChange={setConfirmation} placeholder={doc.title} />
                  </Field>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <Button variant="quiet" size="sm" onClick={() => setErasing(null)}>
                      Cancel
                    </Button>
                    <Button variant="danger" size="sm" disabled={busy || confirmation.trim() === ''} onClick={erase}>
                      Erase “{doc.title}”
                    </Button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {props.isOrgAdmin && purges !== null && purges.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Erased — the record</SectionLabel>
          <ul className="shelf-rows" aria-label="Erasures">
            {purges.map((p) => (
              <li key={p.id}>
                <span className="shelf-row-title">{p.subjectTitle}</span>
                <span className="shelf-row-note">
                  Erased by {p.purgedByName} · {formatDateTime(p.purgedAt)} · {p.reached.ambientVersions} versions, {p.reached.chunks} passages, {p.reached.blobs} files
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
