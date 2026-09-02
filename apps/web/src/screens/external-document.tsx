// T-431 — what the recipient sees (ADR-0055). The only screen in this
// application with no session behind it: whoever opens the link has no Infora
// account, no project, and no way to reach anything but this one document.
//
// It deliberately has NO shell — no rail, no project switcher, no navigation of
// any kind — because there is nothing else to navigate to. Everything on it is
// served by the token in the URL.
//
// An unknown link and an expired one land in the same place, and the page says
// so plainly rather than the server distinguishing them (principle 4): telling
// a guesser that a token existed is a leak, and telling a real recipient that
// their link may have expired costs nothing.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { ExternalDocumentResponse } from '@infora/contracts';
import { Badge, Button } from '@infora/ui';
import { api } from '../api';
import { formatDate } from './shared';

const page = {
  maxWidth: 860,
  margin: '0 auto',
  padding: '48px 24px 64px',
} as const;

export function ExternalDocumentScreen() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<ExternalDocumentResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    if (token === undefined) {
      setState('unavailable');
      return;
    }
    void api.externalDocument(token).then(
      (res) => {
        setDoc(res);
        setState('ready');
      },
      () => setState('unavailable'),
    );
  }, [token]);

  if (state === 'loading') return null;

  if (state === 'unavailable' || doc === null) {
    return (
      <div style={page}>
        <h1 className="page">This link is not available</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 560, lineHeight: 1.6 }}>
          It may have expired, or the address may be incomplete. Links to a document expire on a
          date set when it was sent. If you still need the document, reply to the person who sent
          it and ask for a new link.
        </p>
      </div>
    );
  }

  return <ExternalDocumentView doc={doc} token={token!} />;
}

/**
 * The page a recipient with no account reads — pure over its inputs, and
 * exported so the render suite can hold it (review, 2026-09-02: this branch
 * renders outside the session gate and previously had no test of any kind).
 */
export function ExternalDocumentView({ doc, token }: { doc: ExternalDocumentResponse; token: string }) {
  const fileUrl = (renditionId: string) =>
    `/external-documents/${encodeURIComponent(token)}/renditions/${renditionId}/file`;
  const pdf = doc.renditions.find((r) => r.kind === 'pdf') ?? null;
  const native = doc.renditions.find((r) => r.kind === 'native') ?? null;

  return (
    <div style={page}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
        {doc.senderOrganisationName} · {doc.projectName}
      </p>
      <h1 className="page" style={{ marginTop: 6 }}>
        {doc.title ?? doc.documentReference}
      </h1>
      <p style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
        <span className="mono">{doc.documentReference}</span>
        <span className="mono">{doc.versionReference}</span>
        <Badge tone="info">Issued {formatDate(doc.issuedAt)}</Badge>
      </p>

      {/* The covering note: what the sender wrote, then the project's standing
          note if it has set one (ADR-0055 §6). Two paragraphs and not one,
          because they are written by different people for different reasons. */}
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: '14px 16px',
          margin: '18px 0',
          background: 'var(--surface-raised, transparent)',
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          For the attention of {doc.recipientName}
        </p>
        <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0, lineHeight: 1.6 }}>{doc.message}</p>
        {doc.standardMessage && (
          <p
            style={{
              whiteSpace: 'pre-wrap',
              marginBottom: 0,
              paddingTop: 12,
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {doc.standardMessage}
          </p>
        )}
      </div>

      {/* ADR-0055 §4/§5, said on the screen rather than only in the record: this
          version is a snapshot of what was sent, a later revision does not
          replace it here, and the link stops working on a date. There is no
          acknowledgement to click — nothing is being asked of the reader. */}
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 620 }}>
        This is one revision of one document, as it stood when it was sent. A later revision does
        not appear here. The link stops working on {formatDate(doc.expiresAt)}. Nothing is being
        asked of you — there is nothing to acknowledge or sign.
      </p>

      {(pdf || native) && (
        <p style={{ display: 'flex', gap: 10 }}>
          {pdf && (
            <a href={fileUrl(pdf.id)}>
              <Button size="sm">Download PDF</Button>
            </a>
          )}
          {native && (
            <a href={fileUrl(native.id)}>
              <Button size="sm" variant="quiet">
                Download .{native.format}
              </Button>
            </a>
          )}
        </p>
      )}

      {pdf ? (
        <object
          data={fileUrl(pdf.id)}
          type="application/pdf"
          style={{
            width: '100%',
            height: '70vh',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
          }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            Your browser can’t preview the PDF — <a href={fileUrl(pdf.id)}>download it</a>.
          </p>
        </object>
      ) : (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
            fontSize: 13.5,
            lineHeight: 1.7,
          }}
        >
          {doc.content}
        </div>
      )}
    </div>
  );
}
