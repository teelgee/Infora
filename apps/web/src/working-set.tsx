// T-159/T-167 — the attached-source working set (ADR-0022 refined). One or
// several sources (sandbox / upload / web) pinned to the conversation and
// persisting across its turns, badged user-supplied — never a grounded citation.
// Pinning is a real dialog (Modal + form controls), not window.prompt.
import { useCallback, useEffect, useState } from 'react';
import type { AttachedSource } from '@infora/contracts';
import { Paperclip, X } from 'lucide-react';
import { Button, Chip, Field, Modal, SelectInput, TextInput } from '@infora/ui';
import { api } from './api';

const KIND_LABEL: Record<AttachedSource['kind'], string> = {
  sandbox: 'Sandbox document',
  upload: 'Uploaded file',
  web: 'Web search / URL',
};

function PinModal(props: { onSubmit: (kind: AttachedSource['kind'], ref: string) => Promise<void>; onClose: () => void }) {
  const [kind, setKind] = useState<AttachedSource['kind']>('web');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const placeholder =
    kind === 'web' ? 'URL or search query' : kind === 'upload' ? 'File reference' : 'Sandbox document id';
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Attach a source"
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || ref.trim() === ''}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(kind, ref.trim());
            }}
          >
            Attach
          </Button>
        </>
      }
    >
      <Field label="Kind" hint="User-supplied — steers this session, never grounds or cites (ADR-0022)">
        <SelectInput
          value={kind}
          onChange={(v) => setKind(v as AttachedSource['kind'])}
          options={(['sandbox', 'upload', 'web'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
      </Field>
      <Field label="Reference">
        <TextInput value={ref} onChange={setRef} placeholder={placeholder} autoFocus />
      </Field>
    </Modal>
  );
}

export function WorkingSet(props: { conversationId: string | null }) {
  const [sources, setSources] = useState<AttachedSource[]>([]);
  const [pinning, setPinning] = useState(false);

  const load = useCallback(() => {
    if (!props.conversationId) return;
    void api.attachedSources(props.conversationId).then((r) => setSources(r.items));
  }, [props.conversationId]);
  useEffect(load, [load]);

  async function unpin(id: string) {
    await api.unpinAttachedSource(id);
    load();
  }

  if (!props.conversationId) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0' }}>
      {pinning && (
        <PinModal
          onClose={() => setPinning(false)}
          onSubmit={async (kind, ref) => {
            await api.pinAttachedSource(props.conversationId!, { kind, ref });
            setPinning(false);
            load();
          }}
        />
      )}
      <Chip onClick={() => setPinning(true)}>
        <Paperclip size={12} strokeWidth={2} /> Attach source
      </Chip>
      {sources.map((s) => (
        <span
          key={s.id}
          title="User-supplied — steers this session, never grounds or cites (ADR-0022)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 999,
            border: '1px dashed var(--border-default)',
            color: 'var(--text-muted)',
          }}
        >
          {s.kind}:{(s.label ?? s.ref).slice(0, 28)}
          <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => void unpin(s.id)} />
        </span>
      ))}
    </div>
  );
}
