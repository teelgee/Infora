// T-166 — the metadata editor (ADR-0038, ProjectWise "file/metadata separation"
// + B4 "attributes surfaced without manual column config"). Two sections:
// identity (read-only — plan-owned, inherited via binding) and authoring
// (editable — accrues in the sandbox / on the container). Well-known fields are
// surfaced up front; custom key/value pairs are supported. A real dialog, never
// window.prompt.
import { useMemo, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Modal, SelectInput, TextInput } from '@infora/ui';

// a suggested field may be schema-driven: a select with a fixed option set (T-192)
type SuggestedField = { key: string; label: string; type?: 'text' | 'select'; allowedValues?: string[] };
type Pair = { key: string; label: string; value: string; custom: boolean; type?: 'text' | 'select'; options?: string[] };

export function MetadataModal(props: {
  title: string;
  identity: Array<{ label: string; value: ReactNode }>;
  metadata: Record<string, unknown>;
  suggestedFields?: SuggestedField[];
  editable: boolean;
  onSave: (metadata: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const initial = useMemo<Pair[]>(() => {
    const suggested = props.suggestedFields ?? [];
    const known = new Set(suggested.map((f) => f.key));
    const fromSuggested = suggested.map((f) => ({
      key: f.key,
      label: f.label,
      value: props.metadata[f.key] === undefined ? '' : String(props.metadata[f.key]),
      custom: false,
      type: f.type,
      options: f.allowedValues,
    }));
    const fromCustom = Object.entries(props.metadata)
      .filter(([k]) => !known.has(k))
      .map(([k, v]) => ({ key: k, label: k, value: String(v ?? ''), custom: true }));
    return [...fromSuggested, ...fromCustom];
  }, [props.metadata, props.suggestedFields]);

  const [pairs, setPairs] = useState<Pair[]>(initial);
  const [busy, setBusy] = useState(false);

  const setValue = (i: number, value: string) =>
    setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, value } : p)));
  const setKey = (i: number, key: string) =>
    setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, key, label: key } : p)));
  const remove = (i: number) => setPairs((ps) => ps.filter((_, j) => j !== i));
  const addField = () => setPairs((ps) => [...ps, { key: '', label: '', value: '', custom: true }]);

  async function save() {
    setBusy(true);
    const metadata: Record<string, string> = {};
    for (const p of pairs) if (p.key.trim() && p.value.trim()) metadata[p.key.trim()] = p.value.trim();
    await props.onSave(metadata);
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title}
      size="md"
      footer={
        props.editable ? (
          <>
            <Button variant="quiet" onClick={props.onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              Save metadata
            </Button>
          </>
        ) : (
          <Button variant="quiet" onClick={props.onClose}>
            Close
          </Button>
        )
      }
    >
      <div>
        <span className="field-label">Identity — plan-owned, read-only</span>
        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {props.identity.map((row) => (
            <div key={row.label} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
        <span className="field-label">
          Authoring metadata{props.editable ? '' : ' — read-only'}
        </span>
        <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
          {pairs.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              {p.custom ? (
                <div style={{ flex: '0 0 160px' }}>
                  <TextInput value={p.key} onChange={(v) => setKey(i, v)} placeholder="Field name" disabled={!props.editable} />
                </div>
              ) : (
                <span style={{ flex: '0 0 160px', color: 'var(--text-secondary)', fontSize: 12, paddingBottom: 8 }}>
                  {p.label}
                </span>
              )}
              <div style={{ flex: 1 }}>
                {p.type === 'select' && p.options && p.options.length > 0 ? (
                  <SelectInput
                    value={p.value}
                    onChange={(v) => setValue(i, v)}
                    placeholder="—"
                    disabled={!props.editable}
                    options={p.options.map((o) => ({ value: o, label: o }))}
                  />
                ) : (
                  <TextInput value={p.value} onChange={(v) => setValue(i, v)} disabled={!props.editable} />
                )}
              </div>
              {props.editable && p.custom && (
                <Button size="sm" variant="quiet" onClick={() => remove(i)}>
                  <X size={13} strokeWidth={2} />
                </Button>
              )}
            </div>
          ))}
          {pairs.length === 0 && <span className="field-hint">No authoring metadata yet.</span>}
        </div>
        {props.editable && (
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="quiet" onClick={addField}>
              <Plus size={13} strokeWidth={2} /> Add field
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
