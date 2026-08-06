// T-097 — the one chat composer, used by every chat surface (Ask, the
// Editor's document chat). The typical chat grammar: ⏎ sends, Shift+⏎ makes
// a new line and continues a hyphen/numbered list, the input grows with its
// content, and while a run is in flight the send button becomes a stop
// (Esc does the same). Cancel aborts the caller's wait — whether the run
// itself can be stopped is the server's business, not the composer's.
// T-100: a `sources` slot beneath the input carries the surface's source
// chips, and the ref exposes insert() so a picker can write into the draft.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from './primitives';

/** A chat turn. The user's message is a filled, shadowed bubble aligned
 * right; the agent's reply is plain text — the asymmetry is deliberate, so
 * replies read as content rather than as speech. */
export function ChatBubble(props: { from?: 'user' | 'agent'; children: ReactNode }) {
  return (props.from ?? 'user') === 'user' ? (
    <div className="bubble mine">{props.children}</div>
  ) : (
    <div className="reply">{props.children}</div>
  );
}

const MAX_HEIGHT = 168; // ~7 lines before the composer scrolls

export type ChatComposerHandle = { insert: (snippet: string) => void };

export const ChatComposer = forwardRef<
  ChatComposerHandle,
  {
    placeholder: string;
    pending: boolean;
    onSend: (text: string) => void;
    onCancel?: () => void;
    fontSize?: number;
    sources?: ReactNode;
  }
>(function ChatComposer(props, ref) {
  const [text, setText] = useState('');
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    insert: (snippet: string) => {
      setText((prev) => (prev === '' ? snippet : `${prev.replace(/\s+$/, '')} ${snippet}`));
      requestAnimationFrame(() => {
        resize();
        areaRef.current?.focus();
      });
    },
  }));

  function resize() {
    const area = areaRef.current;
    if (area === null) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, MAX_HEIGHT)}px`;
  }

  function setValue(next: string) {
    setText(next);
    requestAnimationFrame(resize);
  }

  function send() {
    const value = text.trim();
    if (value === '' || props.pending) return;
    setValue('');
    props.onSend(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && props.pending && props.onCancel !== undefined) {
      event.preventDefault();
      props.onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
      return;
    }
    if (event.key === 'Enter' && event.shiftKey) {
      // continue a list across the new line — "- ", "* " or "3. " begets the next
      const area = event.currentTarget;
      const at = area.selectionStart;
      const lineStart = area.value.lastIndexOf('\n', at - 1) + 1;
      const bullet = /^(\s*)([-*]|\d+\.)\s/.exec(area.value.slice(lineStart, at));
      if (bullet !== null) {
        event.preventDefault();
        const next = /^\d+\.$/.test(bullet[2]!) ? `${Number.parseInt(bullet[2]!, 10) + 1}.` : bullet[2]!;
        const insert = `\n${bullet[1]!}${next} `;
        setValue(`${area.value.slice(0, at)}${insert}${area.value.slice(area.selectionEnd)}`);
        requestAnimationFrame(() => {
          area.selectionStart = area.selectionEnd = at + insert.length;
        });
      }
      // otherwise the default newline stands
    }
  }

  return (
    <div>
      <div className="command chat-composer-box">
        <span className="glyph">✦</span>
        <textarea
        ref={areaRef}
        rows={1}
        value={text}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={props.placeholder}
        title="⏎ to send · Shift+⏎ for a new line"
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          resize: 'none',
          font: 'inherit',
          lineHeight: 1.5,
          color: 'var(--text-primary)',
          background: 'transparent',
          ...(props.fontSize !== undefined && { fontSize: props.fontSize }),
        }}
      />
        {props.pending && props.onCancel !== undefined ? (
          <button
            type="button"
            className="stop-btn"
            title="Cancel run (Esc)"
            onClick={props.onCancel}
          >
            <span />
          </button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            type="button"
            disabled={props.pending || text.trim() === ''}
            onClick={send}
          >
            ↵
          </Button>
        )}
      </div>
      {props.sources !== undefined && <div className="composer-sources">{props.sources}</div>}
    </div>
  );
});
