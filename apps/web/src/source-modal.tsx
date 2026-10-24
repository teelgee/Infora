// T-094 — a citation chip opens the version it names, in place. Superseded
// and withdrawn sources render with their state badged: the record's
// citations stay resolvable even after the library moves on. Since T-468 the
// exact recorded passage is shown and marked (the chunk-provenance theme, Q-022).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { GetPassageResponse, GetVersionResponse } from '@infora/contracts';
import { LifecycleBadge } from '@infora/ui';
import { api } from './api';
import { passageLocation } from './open-citation';
import { citedPosition, loadPassage, PassageText, SourceCardBody } from './source-card';

export function SourceModal(props: { versionId: string; chunkId?: string | undefined; onClose: () => void }) {
  const [version, setVersion] = useState<GetVersionResponse | null>(null);
  const [recorded, setRecorded] = useState<GetPassageResponse | null>(null);
  // T-457 — a way through to the document page from a cited version
  const { projectId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    setVersion(null);
    void api.version(props.versionId).then(setVersion);
  }, [props.versionId]);

  // T-468 — the cited passage, marked in the text when the citation recorded one
  useEffect(() => {
    setRecorded(null);
    if (props.chunkId !== undefined) void loadPassage(props.versionId, props.chunkId).then(setRecorded, () => setRecorded(null));
  }, [props.versionId, props.chunkId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const position = version === null ? null : citedPosition(version);

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
          {position !== null && <LifecycleBadge position={position} />}
        {version !== null && projectId !== undefined && (
          <button
            className="linklike"
            style={{ marginLeft: 8, fontSize: 12 }}
            onClick={(e) => {
              e.stopPropagation();
              void navigate(passageLocation(projectId, version.containerId, props.versionId, props.chunkId));
            }}
          >
            Open the document page
          </button>
        )}
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
          {props.chunkId !== undefined && (
            <div style={{ marginBottom: 12, whiteSpace: 'normal' }}>
              <SourceCardBody versionId={props.versionId} chunkId={props.chunkId} />
            </div>
          )}
          {version !== null && recorded?.passage ? (
            <PassageText content={version.content} passage={recorded.passage} />
          ) : (
            version?.content
          )}
        </div>
      </div>
    </div>
  );
}
