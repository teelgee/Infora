// T-454 — the editing pane: an uploaded Word, Excel or PowerPoint file, open
// for editing in the browser, beside the working versions its saves land as.
//
// *In plain terms: click "Edit in browser" on an uploaded file in the sandbox
// and it opens here, editable, and several people can have it open at once.
// Every save becomes a new working version (v0.2, v0.3…), listed on the right
// for everyone who has it open.*
//
// The editor itself is the editing engine's page in a frame — Collabora today,
// Microsoft Office for the web once CSPP is approved (ADR-0043's dated note) —
// and the engine reaches Infora ONLY through the WOPI host: this screen never
// hands it the file, only a pass for one file and this sign-in, posted into the
// frame (WOPI's own convention, so the pass is never in a URL or the history).
//
// Two things keep running while the pane is open: the version list refreshes,
// so a co-editor's save appears without a reload; and a presence heartbeat,
// which is also what keeps this person's sign-in from idling out — the WOPI
// host deliberately does not slide the idle clock on the engine's behalf.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import type { EditingSession, MeResponse, SandboxDocument, SandboxDocumentVersion } from '@infora/contracts';
import { ArrowLeft, History } from 'lucide-react';
import { Badge, Button, SectionLabel, WithheldNotice } from '@infora/ui';
import { api } from '../api';
import { formatDateTime } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

const formatLabel: Partial<Record<SandboxDocument['format'], string>> = {
  docx: 'DOCX',
  xlsx: 'XLSX',
  pptx: 'PPTX',
};

const REFRESH_MS = 4000;
const HEARTBEAT_MS = 20_000;

export function EditingPaneScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const { documentId = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<SandboxDocument | null>(null);
  const [session, setSession] = useState<EditingSession | null>(null);
  const [versions, setVersions] = useState<SandboxDocumentVersion[]>([]);
  // 'unavailable' covers "does not exist" and "not yours" alike — the API
  // answers both 404, and so does this screen (contracts principle 4)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const form = useRef<HTMLFormElement>(null);
  const frameName = `infora-editor-${documentId}`;
  const back = `/projects/${participant.projectId}/sandbox`;

  useEffect(() => {
    let live = true;
    setState('loading');
    void Promise.all([api.sandboxDocument(documentId), api.editingSession(documentId)])
      .then(([d, s]) => {
        if (!live) return;
        setDoc(d);
        setSession(s);
        setState('ready');
      })
      .catch(() => live && setState('unavailable'));
    return () => {
      live = false;
    };
  }, [documentId]);

  // the pass goes to the engine by form POST into the frame, never in the URL
  useEffect(() => {
    if (session?.editorUrl) form.current?.submit();
  }, [session]);

  useEffect(() => {
    if (state !== 'ready') return;
    const refresh = () =>
      void api
        .sandboxDocumentHistory(documentId)
        .then((r) => setVersions(r.items))
        .catch(() => undefined);
    const beat = () => void api.heartbeatPresence(documentId).catch(() => undefined);
    refresh();
    beat();
    const r = setInterval(refresh, REFRESH_MS);
    const h = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(r);
      clearInterval(h);
    };
  }, [state, documentId]);

  if (state === 'unavailable') {
    return (
      <div className="content">
        <h1 className="page">Edit in browser</h1>
        <WithheldNotice>
          This file isn’t available to you. It may have been removed, or your access to its sandbox may have
          ended.
        </WithheldNotice>
        <div style={{ marginTop: 12 }}>
          <Button variant="quiet" onClick={() => void navigate(back)}>
            <ArrowLeft size={13} strokeWidth={2} /> Back to the sandbox
          </Button>
        </div>
      </div>
    );
  }

  const current = versions[0]?.versionReference;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <Button size="sm" variant="quiet" onClick={() => void navigate(back)} aria-label="Back to the sandbox">
          <ArrowLeft size={13} strokeWidth={2} /> Sandbox
        </Button>
        <h1 className="page" style={{ margin: 0, fontSize: 16, flex: 1 }}>
          {doc?.title ?? ' '}
        </h1>
        {doc && <Badge tone="neutral">{formatLabel[doc.format] ?? doc.format}</Badge>}
        {current && (
          <Badge tone="info">{current}</Badge>
        )}
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          {state === 'ready' && session && session.editorUrl === null && (
            <div className="content">
              <WithheldNotice>
                In-browser editing isn’t set up on this server — there is no editing engine to open the file in.
                Whoever runs Infora can start one; until then the file can still be replaced with a new upload.
              </WithheldNotice>
            </div>
          )}
          {session?.editorUrl && (
            <>
              <form ref={form} method="post" action={session.editorUrl} target={frameName} style={{ display: 'none' }}>
                <input type="hidden" name="access_token" value={session.accessToken} />
                <input type="hidden" name="access_token_ttl" value={String(session.accessTokenTtl)} />
              </form>
              <iframe
                name={frameName}
                title={`Editor — ${doc?.title ?? 'document'}`}
                style={{ flex: 1, border: 0, minHeight: 480 }}
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </>
          )}
        </div>
        <aside
          aria-label="Working versions"
          style={{
            width: 240,
            flexShrink: 0,
            borderLeft: '1px solid var(--border-default)',
            padding: '12px 14px',
            overflowY: 'auto',
          }}
        >
          <SectionLabel>
            <History size={12} strokeWidth={2} style={{ verticalAlign: -1, marginRight: 4 }} />
            Working versions
          </SectionLabel>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 10px' }}>
            Every save — yours or a co-editor’s — lands here as a new working version.
          </p>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {versions.map((v) => (
              <li key={v.id} data-testid="working-version">
                <div style={{ fontWeight: 600 }}>{v.versionReference}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {v.createdBy.name} · {formatDateTime(v.createdAt)}
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
