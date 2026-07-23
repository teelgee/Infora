// T-105 — clicking a source opens the source panel: the named version
// rendered in a right-hand column beside the chat, reading like the document
// it is rather than raw text. Superseded and withdrawn sources render with
// their state badged, same as the modal (T-094) — the record's citations
// stay resolvable after the library moves on. Hover-rendering of the exact
// retrieved chunk still waits on the chunk-provenance theme (tracker).
import { useEffect, useState } from 'react';
import type { GetVersionResponse } from '@infora/contracts';
import { Badge, Markdown } from '@infora/ui';
import { api } from './api';

export function SourcePanel(props: { versionId: string; onClose: () => void }) {
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
    <div className="source-panel">
      <div className="panel-header">
        <span className="mono" style={{ fontSize: 12.5 }}>
          {version === null ? 'Loading…' : `${version.documentReference} · ${version.versionReference}`}
        </span>
        {state !== null && <Badge tone={state.tone}>{state.label}</Badge>}
        <span className="close" onClick={props.onClose} title="Close">
          ✕
        </span>
      </div>
      <div className="panel-body">
        {version !== null && <Markdown>{version.content}</Markdown>}
      </div>
    </div>
  );
}
