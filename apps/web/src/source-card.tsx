// T-468 — the source card: what a citation shows when you hover or focus it.
//
// *In plain terms: the document's name and revision, whether it is still
// current, the page, and the exact passage the AI read — taken from the
// passage the run recorded, never found again by a new search. If the passage
// has since been re-indexed, the card says so in words.*
//
// The card is mounted only while open (HoverCard), so the passage is fetched on
// first open and then kept for the life of the page, per (version, chunk).
import { useEffect, useMemo, useState } from 'react';
import type { Citation, GetPassageResponse, GetVersionResponse } from '@infora/contracts';
import { LifecycleBadge, type LifecyclePosition } from '@infora/ui';
import { api } from './api';

/** Where a cited version stands, in the lifecycle vocabulary (T-455) — derived, never hand-worded. */
export function citedPosition(source: {
  containerState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  isCurrent: boolean;
}): LifecyclePosition {
  if (source.containerState === 'withdrawn') return 'withdrawn';
  if (source.containerState === 'rejected') return 'rejected';
  if (source.containerState === 'superseded' || !source.isCurrent) return 'superseded';
  return 'accepted';
}

const passages = new Map<string, Promise<GetPassageResponse>>();

/** Fetch once per (version, chunk) for the page's life; a failure is not cached. */
export function loadPassage(versionId: string, chunkId: string): Promise<GetPassageResponse> {
  const key = `${versionId}:${chunkId}`;
  let hit = passages.get(key);
  if (hit === undefined) {
    hit = api.passage(versionId, chunkId);
    passages.set(key, hit);
    hit.catch(() => passages.delete(key));
  }
  return hit;
}

const versions = new Map<string, Promise<GetVersionResponse>>();
function loadVersion(versionId: string): Promise<GetVersionResponse> {
  let hit = versions.get(versionId);
  if (hit === undefined) {
    hit = api.version(versionId);
    versions.set(versionId, hit);
    hit.catch(() => versions.delete(versionId));
  }
  return hit;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'passage'; read: GetPassageResponse }
  | { kind: 'document'; read: GetVersionResponse };

export function SourceCardBody(props: { versionId: string; chunkId?: string | undefined }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    setLoaded({ kind: 'loading' });
    const read =
      props.chunkId !== undefined
        ? loadPassage(props.versionId, props.chunkId).then((r): Loaded => ({ kind: 'passage', read: r }))
        : loadVersion(props.versionId).then((r): Loaded => ({ kind: 'document', read: r }));
    read.then(
      (value) => live && setLoaded(value),
      () => live && setLoaded({ kind: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [props.versionId, props.chunkId]);

  if (loaded.kind === 'loading') return <p className="source-card-note">Reading the passage…</p>;
  if (loaded.kind === 'failed') {
    return <p className="source-card-note">This source could not be read — you may not have access to it.</p>;
  }
  const read = loaded.read;
  const position = citedPosition(read);
  const title = loaded.kind === 'passage' ? loaded.read.documentTitle : null;
  const passage = loaded.kind === 'passage' ? loaded.read.passage : null;
  const where = passage
    ? [
        passage.page !== undefined ? `page ${passage.page}` : null,
        passage.paragraph !== undefined ? `paragraph ${passage.paragraph + 1}` : null,
      ]
        .filter((part) => part !== null)
        .join(' · ')
    : '';
  return (
    <div>
      <div className="source-card-head">
        <span className="mono source-card-title">{read.documentReference}</span>
        <span className="mono">{read.versionReference}</span>
        <LifecycleBadge position={position} />
      </div>
      {title !== null && title !== read.documentReference && <div className="source-card-where">{title}</div>}
      {where !== '' && <div className="source-card-where">{where}</div>}
      {passage !== null && <blockquote className="source-card-passage">{passage.verbatim}</blockquote>}
      {loaded.kind === 'passage' && !loaded.read.held && (
        <p className="source-card-note">
          This passage was re-indexed after the run and its recorded text is no longer held.
        </p>
      )}
      {loaded.kind === 'document' && (
        <p className="source-card-note">
          This citation was recorded before passages were kept, so it points at the whole document.
        </p>
      )}
      {position === 'superseded' && (
        <p className="source-card-note">
          This version has been superseded — the citation still points at what the AI read.
        </p>
      )}
      {position === 'withdrawn' && (
        <p className="source-card-note">
          This document has been withdrawn — the citation still points at what the AI read.
        </p>
      )}
    </div>
  );
}

/** An authority reference has no stored passage in this build (the authority shelf is beyond V1). */
export function AuthorityCardBody(props: { reference: string }) {
  return (
    <div>
      <div className="source-card-head">
        <span className="source-card-title">§ {props.reference}</span>
      </div>
      <p className="source-card-note" style={{ marginTop: 0 }}>
        The authority library is not part of this build; this reference was cited by name.
      </p>
    </div>
  );
}

/** The card for any citation — handed to `CitedProse.renderCard` and the findings panel. */
export function cardFor(citation: Citation) {
  return 'versionId' in citation.source ? (
    <SourceCardBody versionId={citation.source.versionId} chunkId={citation.chunkId} />
  ) : (
    <AuthorityCardBody reference={citation.source.authorityRef} />
  );
}

/**
 * The version's text with the cited passage marked, scrolled into view and
 * flashed. Raw text, not Markdown: the mark is placed by character offset into
 * the stored content, which rendering would move. The locator's offsets are
 * checked against the verbatim (offsets count characters, JS counts UTF-16
 * units); if the slice does not read as the passage it is searched for, and a
 * span that cannot be found paints nothing rather than a wrong mark.
 */
export function PassageText(props: { content: string; passage: NonNullable<GetPassageResponse['passage']> }) {
  const { content, passage } = props;
  const marked = useMemo(() => {
    let start = passage.span?.start ?? -1;
    let end = passage.span?.end ?? -1;
    if (start < 0 || content.slice(start, end) !== passage.verbatim) {
      start = content.indexOf(passage.verbatim);
      end = start + passage.verbatim.length;
    }
    return start < 0 ? null : { start, end };
  }, [content, passage]);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!marked) return;
    document.querySelector('mark[data-passage]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(timer);
  }, [marked]);
  if (!marked) {
    return (
      <>
        <p className="passage-banner" data-passage-banner>
          The cited passage: “{passage.verbatim}”
        </p>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65 }}>{content}</div>
      </>
    );
  }
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65 }}>
      {content.slice(0, marked.start)}
      <mark data-passage className={flash ? 'flash' : undefined}>
        {content.slice(marked.start, marked.end)}
      </mark>
      {content.slice(marked.end)}
    </div>
  );
}
