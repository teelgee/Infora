// T-095 — prose with its sources inline: each source renders at the end of
// the claim it backs, located by the citation's claimSpan over the text
// (the cite leaf computes spans against the same paragraph-joined content).
// Claims without a citation (labelled open-world in chat) render plain; a
// citation without a span — none are written today — falls back to trailing.
import type { ReactNode } from 'react';
import type { Citation } from '@infora/contracts';
import { Markdown } from './markdown';
import { SourceChip } from './primitives';

type Segment = { text: string; citations: Citation[] };

export function CitedProse(props: {
  content: string;
  citations: Citation[];
  onOpenSource?: (versionId: string, chunkId?: string) => void;
  /** T-468 — the card a library or authority source opens on hover/focus */
  renderCard?: (citation: Citation) => ReactNode;
}) {
  const { spanned, trailing } = split(props.citations);
  const segments = segmentBySpans(props.content, spanned);

  return (
    <div>
      {segments.map((segment, at) => (
        <div key={at} className="cited-claim">
          <Markdown>{segment.text}</Markdown>
          {segment.citations.map((citation) => chip(citation, props.onOpenSource, props.renderCard))}
        </div>
      ))}
      {trailing.length > 0 && (
        <div style={{ marginTop: 4 }}>{trailing.map((citation) => chip(citation, props.onOpenSource, props.renderCard))}</div>
      )}
    </div>
  );
}

function chip(
  citation: Citation,
  onOpenSource?: (versionId: string, chunkId?: string) => void,
  renderCard?: (citation: Citation) => ReactNode,
) {
  const library = 'versionId' in citation.source;
  const source = citation.source;
  return (
    <SourceChip
      key={citation.id}
      corpus={library ? 'library' : 'authority'}
      card={renderCard?.(citation)}
      cardLabel={`Source: ${'versionId' in source ? source.documentReference : source.authorityRef}`}
      onClick={
        onOpenSource !== undefined && 'versionId' in source
          ? () => onOpenSource(source.versionId, citation.chunkId)
          : undefined
      }
    >
      {'versionId' in source ? source.documentReference : source.authorityRef}
    </SourceChip>
  );
}

function split(citations: Citation[]): { spanned: Citation[]; trailing: Citation[] } {
  const spanned: Citation[] = [];
  const trailing: Citation[] = [];
  for (const citation of citations) (citation.claimSpan ? spanned : trailing).push(citation);
  spanned.sort((a, b) => a.claimSpan!.start - b.claimSpan!.start);
  return { spanned, trailing };
}

function segmentBySpans(content: string, spanned: Citation[]): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  const pushPlain = (text: string) => {
    // an uncited stretch may hold several paragraph-joined claims
    for (const paragraph of text.split('\n\n')) {
      if (paragraph.trim() !== '') segments.push({ text: paragraph, citations: [] });
    }
  };
  for (const citation of spanned) {
    const span = citation.claimSpan!;
    if (span.start > at) pushPlain(content.slice(at, span.start));
    const claim = content.slice(span.start, span.end);
    const last = segments.at(-1);
    if (last !== undefined && last.citations.length > 0 && span.start < at) {
      last.citations.push(citation); // two citations sharing a claim
    } else {
      segments.push({ text: claim, citations: [citation] });
    }
    at = Math.max(at, span.end);
  }
  if (at < content.length) pushPlain(content.slice(at));
  return segments;
}
