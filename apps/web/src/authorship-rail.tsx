// T-475 — WHO WROTE EACH PASSAGE, in the editor's margin.
//
// *In plain terms: beside every paragraph there is a small mark — a robot where
// the agent drafted it, a pen where someone wrote it. Hover it (or tab to it)
// and a card says who: "Drafted by the agent in run …, accepted by Eleanor on
// …", or "Written by hand — by …".*
//
// The marks are positioned from a hidden copy of the text laid out exactly as
// the textarea lays it out (the same mirror trick the comment highlights use),
// so each sits beside its own paragraph whatever the wrapping. The answers come
// from `GET /sandbox-documents/:id/provenance`, which matches paragraphs to
// accepted suggestions by exact text (apps/api/src/provenance.ts states the
// limit). If the text has been edited since the answer was fetched the rail
// steps aside rather than label the wrong paragraph.
import { useLayoutEffect, useRef, useState } from 'react';
import { Bot, PenLine } from 'lucide-react';
import { paragraphsOf, provenanceStatement } from '@infora/contracts';
import type { PassageProvenance } from '@infora/contracts';
import { HoverCard } from '@infora/ui';

/** Do the fetched answers still describe this text, paragraph for paragraph? */
export function provenanceFits(content: string, passages: readonly PassageProvenance[]): boolean {
  const paragraphs = paragraphsOf(content);
  return (
    paragraphs.length === passages.length &&
    paragraphs.every((p, at) => p.start === passages[at]!.start && p.end === passages[at]!.end)
  );
}

export function AuthorshipCard(props: { passage: PassageProvenance }) {
  const { passage } = props;
  return (
    <div className="authorship-card">
      <div className="authorship-kicker">{passage.origin === 'agent' ? 'Drafted by the agent' : 'Written by hand'}</div>
      <div>{provenanceStatement(passage)}.</div>
      {passage.origin === 'hand' && (
        <div className="authorship-note">
          A passage the agent drafted and someone then reworded reads here as hand-written: the
          record matches the text exactly.
        </div>
      )}
    </div>
  );
}

export function AuthorshipRail(props: { content: string; passages: PassageProvenance[] | null }) {
  const { content, passages } = props;
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [tops, setTops] = useState<number[]>([]);
  const fits = passages !== null && passages.length > 0 && provenanceFits(content, passages);

  useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    if (!fits || mirror === null) return;
    const measure = () =>
      setTops(
        [...mirror.querySelectorAll<HTMLElement>('[data-para]')].map((node) => node.offsetTop),
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(mirror);
    return () => observer.disconnect();
  }, [fits, content]);

  if (!fits) return null;
  let at = 0;
  const pieces: Array<{ gap: string } | { para: number; text: string }> = [];
  passages.forEach((passage, index) => {
    pieces.push({ gap: content.slice(at, passage.start) });
    pieces.push({ para: index, text: content.slice(passage.start, passage.end) });
    at = passage.end;
  });
  pieces.push({ gap: content.slice(at) });

  return (
    <>
      <div className="canvas-mirror" aria-hidden ref={mirrorRef}>
        {pieces.map((piece, index) =>
          'gap' in piece ? (
            <span key={index}>{piece.gap}</span>
          ) : (
            <span key={index} data-para={piece.para}>
              {piece.text}
            </span>
          ),
        )}
      </div>
      <div className="authorship-rail" data-testid="authorship-rail">
        {passages.map((passage, index) => (
          <div
            key={passage.start}
            className="authorship-mark"
            data-origin={passage.origin}
            style={{ top: tops[index] ?? 0 }}
          >
            <HoverCard
              label={`Who wrote paragraph ${index + 1}`}
              card={<AuthorshipCard passage={passage} />}
            >
              <button
                type="button"
                aria-label={`Who wrote paragraph ${index + 1}: ${provenanceStatement(passage)}`}
              >
                {passage.origin === 'agent' ? (
                  <Bot size={13} strokeWidth={2} />
                ) : (
                  <PenLine size={13} strokeWidth={2} />
                )}
              </button>
            </HoverCard>
          </div>
        ))}
      </div>
    </>
  );
}
