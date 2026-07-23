// T-094 — a citation chip opens the version it names, in place. Superseded
// and withdrawn sources render with their state badged: the record's
// citations stay resolvable even after the library moves on. Hover-rendering
// of the exact retrieved chunk waits on the chunk-provenance theme (tracker).
import { useEffect, useState } from 'react';
import type { GetVersionResponse } from '@infora/contracts';
import { Badge } from '@infora/ui';
import { api } from './api';

export function SourceModal(props: { versionId: string; onClose: () => void }) {
  const [version, setVersion] = useState<GetVersionResponse | null>(null);

  useEffect(() => {
    setVersion(null);
    void api.version(props.versionId).then(setVersion);
  }, [props.versionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const state =
    version === null
      ? null
      : version.containerState === 'withdrawn'
        ? { tone: 'danger' as const, label: 'Withdrawn' }
        : version.containerState === 'superseded' || !version.isCurrent
          ? { tone: 'neutral' as const, label: 'Superseded' }
          : { tone: 'success' as const, label: 'Live' };

  return (
    <div
      onClick={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 19, 15, .45)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-pane)',
          border: 'none',
          borderRadius: 'var(--primitive-radius-md)',
          boxShadow: 'var(--level4-overlay)',
          maxWidth: 680,
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <span className="mono" style={{ fontSize: 13 }}>
            {version === null ? 'Loading…' : `${version.documentReference} · ${version.versionReference}`}
          </span>
          {state !== null && <Badge tone={state.tone}>{state.label}</Badge>}
          <span
            onClick={props.onClose}
            style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
            title="Close"
          >
            ✕
          </span>
        </div>
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            fontSize: 13.5,
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
          }}
        >
          {version?.content}
        </div>
      </div>
    </div>
  );
}
