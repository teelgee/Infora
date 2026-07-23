// T-159 — the attached-source working set (ADR-0022 refined). One or several
// sources (sandbox / upload / web) pinned to the conversation and persisting
// across its turns, badged user-supplied — never a grounded citation. Sits
// under the editor chat beside the shared (multiplayer) thread (T-160).
import { useCallback, useEffect, useState } from 'react';
import type { AttachedSource } from '@infora/contracts';
import { Paperclip, X } from 'lucide-react';
import { Chip } from '@infora/ui';
import { api } from './api';

export function WorkingSet(props: { conversationId: string | null }) {
  const [sources, setSources] = useState<AttachedSource[]>([]);

  const load = useCallback(() => {
    if (!props.conversationId) return;
    void api.attachedSources(props.conversationId).then((r) => setSources(r.items));
  }, [props.conversationId]);
  useEffect(load, [load]);

  async function pin() {
    if (!props.conversationId) return;
    const kind = (window.prompt('Source kind: sandbox / upload / web', 'web') ?? '') as AttachedSource['kind'];
    if (!['sandbox', 'upload', 'web'].includes(kind)) return;
    const ref = window.prompt(
      kind === 'web' ? 'URL or search query' : kind === 'upload' ? 'File reference' : 'Sandbox document id',
    );
    if (!ref?.trim()) return;
    await api.pinAttachedSource(props.conversationId, { kind, ref: ref.trim() });
    load();
  }

  async function unpin(id: string) {
    await api.unpinAttachedSource(id);
    load();
  }

  if (!props.conversationId) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0' }}>
      <Chip onClick={() => void pin()}>
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
            border: '1px dashed var(--border, #ccc)',
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
