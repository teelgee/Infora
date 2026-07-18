// T-130 — the in-PDF anchored review viewer (ADR-0004/0006). Review happens
// ON the frozen version's PDF: pdf.js renders the rendition locally (the
// worker bundles with the app — no CDN), reviewers anchor a comment by
// selecting text (page + quoted text + normalised quads) or dropping a point
// (page + x/y), and every comment paints as a highlight overlay read straight
// from its STORED anchor — never a sidecar. Anchors are fractions of the page
// box, so they are resolution- and rendition-agnostic and cannot drift from
// the immutable version they were bound to. Each viewer paints one version's
// PDF only (the round hands it `round.versionId`'s rendition), so anchors
// never migrate to a later version.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, setLayerDimensions, TextLayer } from 'pdfjs-dist';
import type { CommentAnchor, ReviewComment } from '@infora/contracts';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

type PdfDoc = Awaited<ReturnType<typeof getDocument>['promise']>;
type PageBox = { width: number; height: number };

const TARGET_WIDTH = 680; // css px of the rendered page column

// The text layer's own positioning CSS (pdf.js positions spans with
// `calc(var(--scale-factor) * …)`; without these rules selection is dead).
// Injected once — the shared UI kit owns none of this, it is pdf.js internal.
const TEXT_LAYER_STYLES = `
.review-pdf .textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;opacity:1;line-height:1;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;}
.review-pdf .textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;}
.review-pdf .textLayer ::selection{background:rgba(90,130,255,0.35);}
`;
let stylesInjected = false;
function injectTextLayerStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.dataset.reviewPdf = 'text-layer';
  el.textContent = TEXT_LAYER_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const within = (b: DOMRect, x: number, y: number) =>
  x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

export interface ReviewPdfProps {
  renditionId: string;
  comments: ReviewComment[];
  /** open round + entitled reviewer: selection/point produce a draft anchor */
  interactive: boolean;
  /** the anchor being composed, lifted to the comment form; painted distinctly */
  draft: CommentAnchor | null;
  onDraft?: (anchor: CommentAnchor | null) => void;
  hoveredCommentId: string | null;
  onHoverComment?: (id: string | null) => void;
}

export function ReviewPdf({
  renditionId,
  comments,
  interactive,
  draft,
  onDraft,
  hoveredCommentId,
  onHoverComment,
}: ReviewPdfProps) {
  const [rendered, setRendered] = useState<{ doc: PdfDoc; boxes: PageBox[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const textRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  injectTextLayerStyles();

  // ── Phase 1: load the rendition and measure every page ────────────────────
  useEffect(() => {
    let cancelled = false;
    setRendered(null);
    setError(null);
    const task = getDocument({ url: `/renditions/${renditionId}/file`, withCredentials: true });
    (async () => {
      try {
        const doc = await task.promise;
        if (cancelled) return;
        const boxes: PageBox[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = TARGET_WIDTH / base.width;
          const vp = page.getViewport({ scale });
          boxes.push({ width: vp.width, height: vp.height });
        }
        if (!cancelled) setRendered({ doc, boxes });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'could not load the PDF');
      }
    })();
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [renditionId]);

  // ── Phase 2: paint the canvas + selectable text layer into each page ──────
  useEffect(() => {
    if (!rendered) return;
    let cancelled = false;
    const renderTasks: Array<{ cancel(): void }> = [];
    (async () => {
      for (let i = 0; i < rendered.boxes.length; i++) {
        const canvas = canvasRefs.current[i];
        const textDiv = textRefs.current[i];
        if (!canvas || !textDiv) continue;
        const page = await rendered.doc.getPage(i + 1);
        if (cancelled) return;
        const scale = TARGET_WIDTH / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const task = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTasks.push(task);
        try {
          await task.promise;
        } catch {
          if (cancelled) return;
        }
        if (cancelled) return;
        textDiv.replaceChildren();
        setLayerDimensions(textDiv, viewport);
        textDiv.style.setProperty('--scale-factor', String(scale));
        const textContent = await page.getTextContent();
        if (cancelled) return;
        await new TextLayer({ textContentSource: textContent, container: textDiv, viewport }).render();
      }
    })();
    return () => {
      cancelled = true;
      for (const t of renderTasks) t.cancel();
    };
  }, [rendered]);

  // A selection becomes a quads anchor; a bare click a dropped point.
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!interactive || !onDraft) return;
      const sel = window.getSelection();
      const text = sel?.toString() ?? '';
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed && text.trim()) {
        const perPage = new Map<number, Array<{ x: number; y: number; w: number; h: number }>>();
        for (const r of Array.from(sel.getRangeAt(0).getClientRects())) {
          if (r.width < 1 || r.height < 1) continue;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const idx = pageRefs.current.findIndex((el) => el && within(el.getBoundingClientRect(), cx, cy));
          if (idx < 0) continue;
          const box = pageRefs.current[idx]!.getBoundingClientRect();
          const list = perPage.get(idx + 1) ?? [];
          list.push({
            x: clamp01((r.left - box.left) / box.width),
            y: clamp01((r.top - box.top) / box.height),
            w: clamp01(r.width / box.width),
            h: clamp01(r.height / box.height),
          });
          perPage.set(idx + 1, list);
        }
        let page = 0;
        let most = 0;
        for (const [p, list] of perPage) {
          if (list.length > most) {
            most = list.length;
            page = p;
          }
        }
        if (page === 0) return;
        onDraft({ page, quote: text.trim().slice(0, 4000), rects: perPage.get(page) });
        return;
      }
      const idx = pageRefs.current.findIndex((el) => el && within(el.getBoundingClientRect(), e.clientX, e.clientY));
      if (idx < 0) return;
      const box = pageRefs.current[idx]!.getBoundingClientRect();
      onDraft({
        page: idx + 1,
        point: { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) },
      });
    },
    [interactive, onDraft],
  );

  // paintable anchors grouped by 1-based page (rects/point only; a bare quote
  // anchor — the pre-viewer text form — has nothing to paint, only to list)
  const painted = useMemo(() => {
    const byPage = new Map<number, Array<{ id: string; anchor: CommentAnchor; draft: boolean }>>();
    const add = (id: string, anchor: CommentAnchor | null, isDraft: boolean) => {
      if (!anchor?.page || (!anchor.rects?.length && !anchor.point)) return;
      const list = byPage.get(anchor.page) ?? [];
      list.push({ id, anchor, draft: isDraft });
      byPage.set(anchor.page, list);
    };
    for (const c of comments) add(c.id, c.anchor, false);
    add('__draft__', draft, true);
    return byPage;
  }, [comments, draft]);

  return (
    <div className="review-pdf" onMouseUp={handleMouseUp}>
      {error && (
        <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>
          The PDF rendition could not be rendered ({error}). Use the download beside the round.
        </div>
      )}
      {!rendered && !error && (
        <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>Rendering the review PDF…</div>
      )}
      {rendered?.boxes.map((box, i) => (
        <div
          key={i}
          ref={(el) => {
            pageRefs.current[i] = el;
          }}
          className="review-pdf-page"
          style={{
            position: 'relative',
            width: box.width,
            height: box.height,
            margin: '0 auto 12px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
            background: '#fff',
          }}
        >
          <canvas
            ref={(el) => {
              canvasRefs.current[i] = el;
            }}
            style={{ display: 'block' }}
          />
          <div
            ref={(el) => {
              textRefs.current[i] = el;
            }}
            className="textLayer"
            style={{ position: 'absolute', inset: 0, zIndex: interactive ? 2 : 1 }}
          />
          <div
            className="review-pdf-overlay"
            style={{ position: 'absolute', inset: 0, zIndex: interactive ? 1 : 3, pointerEvents: 'none' }}
          >
            {(painted.get(i + 1) ?? []).map(({ id, anchor, draft: isDraft }) => (
              <Overlay
                key={id}
                anchor={anchor}
                box={box}
                draft={isDraft}
                active={hoveredCommentId === id}
                // region → list hover on read-only rounds (selection owns the
                // pointer while a round is open, so it is enabled off-round)
                interactive={interactive}
                onHover={isDraft ? undefined : onHoverComment}
                commentId={id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Overlay(props: {
  anchor: CommentAnchor;
  box: PageBox;
  draft: boolean;
  active: boolean;
  interactive: boolean;
  commentId: string;
  onHover?: (id: string | null) => void;
}) {
  const { anchor, box, draft, active, interactive, commentId, onHover } = props;
  const fill = draft
    ? 'rgba(60,180,100,0.28)'
    : active
      ? 'rgba(255,168,0,0.5)'
      : 'rgba(255,196,0,0.28)';
  const border = draft ? '1px dashed rgba(40,150,80,0.9)' : '1px solid rgba(200,150,0,0.55)';
  const pointerEvents = !draft && !interactive ? 'auto' : 'none';
  const hover = onHover
    ? { onMouseEnter: () => onHover(commentId), onMouseLeave: () => onHover(null) }
    : {};

  if (anchor.point) {
    return (
      <div
        {...hover}
        aria-label="dropped-point comment"
        style={{
          position: 'absolute',
          left: `calc(${clamp01(anchor.point.x) * box.width}px - 7px)`,
          top: `calc(${clamp01(anchor.point.y) * box.height}px - 7px)`,
          width: 14,
          height: 14,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          background: fill,
          border,
          pointerEvents,
        }}
      />
    );
  }
  return (
    <>
      {(anchor.rects ?? []).map((r, i) => (
        <div
          key={i}
          {...hover}
          aria-label="anchored comment highlight"
          style={{
            position: 'absolute',
            left: clamp01(r.x) * box.width,
            top: clamp01(r.y) * box.height,
            width: clamp01(r.w) * box.width,
            height: clamp01(r.h) * box.height,
            background: fill,
            border,
            borderRadius: 2,
            pointerEvents,
          }}
        />
      ))}
    </>
  );
}
