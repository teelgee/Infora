// T-105 — clicking a source opens the source panel: the named version
// rendered in a right-hand column beside the chat, reading like the document
// it is rather than raw text. Superseded and withdrawn sources render with
// their state badged, same as the modal (T-094) — the record's citations
// stay resolvable after the library moves on. Since T-468 the exact recorded
// passage is shown and marked (the chunk-provenance theme, Q-022).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { GetVersionResponse } from '@infora/contracts';
import { LifecycleBadge, Markdown } from '@infora/ui';
import { api } from './api';
import { passageLocation } from './open-citation';
import { citedPosition, SourceCardBody } from './source-card';

export function SourcePanel(props: { versionId: string; chunkId?: string | undefined; onClose: () => void }) {
  const [version, setVersion] = useState<GetVersionResponse | null>(null);
  // T-457 — the source view opens the document page; the project is the route's
  const { projectId } = useParams();
  const navigate = useNavigate();

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

  const position = version === null ? null : citedPosition(version);

  return (
    <div className="source-panel">
      <div className="panel-header">
        <span className="mono" style={{ fontSize: 12.5 }}>
          {version === null ? 'Loading…' : `${version.documentReference} · ${version.versionReference}`}
        </span>
        {position !== null && <LifecycleBadge position={position} />}
        {version !== null && projectId !== undefined && (
          <button
            className="linklike"
            style={{ marginLeft: 8, fontSize: 12 }}
            onClick={() => void navigate(passageLocation(projectId, version.containerId, props.versionId, props.chunkId))}
          >
            Open the document page
          </button>
        )}
        <span className="close" onClick={props.onClose} title="Close">
          ✕
        </span>
      </div>
      <div className="panel-body">
        {props.chunkId !== undefined && (
          <div style={{ marginBottom: 12 }}>
            <SourceCardBody versionId={props.versionId} chunkId={props.chunkId} />
          </div>
        )}
        {version !== null && <Markdown>{version.content}</Markdown>}
      </div>
    </div>
  );
}
