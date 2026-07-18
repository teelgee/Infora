// T-112 — the Editor's Comments tab: Word-style working-draft threads on the
// sandbox document. Anchors are advisory quoted spans (the Suggestion
// pattern); a "suggested edit" is prose in a comment, resolved by a colleague
// editing the canvas and closing the thread. Mentions insert as @Name and are
// resolved to participant ids at submit; delivery is parked on the tracker —
// they render as highlights only.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { ProjectParticipant, SandboxComment } from '@infora/contracts';
import { Button } from '@infora/ui';
import { api } from './api';

type Props = {
  documentId: string;
  projectId: string;
  meParticipantId: string;
  comments: SandboxComment[];
  onChanged: () => void;
  draftAnchor: string | null; // canvas selection captured by the Comment button
  onClearDraftAnchor: () => void;
  onLocate: (root: SandboxComment) => void; // panel → canvas: select + scroll to the anchor
  focused: { id: string; at: number } | null; // canvas → panel: scroll to + flash this thread
};

/** The @-token being typed at the caret, if any. */
function mentionToken(value: string, caret: number): { start: number; query: string } | null {
  const match = /@([^\s@]*)$/.exec(value.slice(0, caret));
  return match ? { start: caret - match[0].length, query: match[1]! } : null;
}

/** Body text → participant ids whose @Name appears in it. */
function mentionsIn(body: string, participants: ProjectParticipant[]): string[] {
  return participants.filter((p) => body.includes(`@${p.name}`)).map((p) => p.participantId);
}

/** Render a body with the mentioned names highlighted. */
function withMentions(body: string, names: string[]): ReactNode {
  if (names.length === 0) return body;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return parts.map((part, at) =>
    at % 2 === 1 ? (
      <span key={at} className="mention">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** A comment textarea with @-mention typeahead over the project's picker. */
function MentionBox(props: {
  value: string;
  onChange: (value: string) => void;
  participants: ProjectParticipant[];
  placeholder: string;
  autoFocus?: boolean;
  onSubmit: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [token, setToken] = useState<{ start: number; query: string } | null>(null);

  const matches =
    token === null
      ? []
      : props.participants.filter((p) =>
          p.name.toLowerCase().startsWith(token.query.toLowerCase()),
        );

  function refreshToken() {
    const area = areaRef.current;
    if (area === null) return;
    setToken(mentionToken(area.value, area.selectionStart));
  }

  function pick(participant: ProjectParticipant) {
    const area = areaRef.current;
    if (area === null || token === null) return;
    const caret = area.selectionStart;
    const next = `${props.value.slice(0, token.start)}@${participant.name} ${props.value.slice(caret)}`;
    props.onChange(next);
    setToken(null);
    const at = token.start + participant.name.length + 2;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(at, at);
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={areaRef}
        className="comment-box"
        value={props.value}
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        onChange={(e) => {
          props.onChange(e.target.value);
          requestAnimationFrame(refreshToken);
        }}
        onKeyUp={refreshToken}
        onClick={refreshToken}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && token === null) {
            e.preventDefault();
            props.onSubmit();
          }
          if (e.key === 'Escape') setToken(null);
        }}
      />
      {matches.length > 0 && (
        <div className="mention-pop">
          {matches.map((p) => (
            <button key={p.participantId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              @{p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentsPanel(props: Props) {
  const [participants, setParticipants] = useState<ProjectParticipant[]>([]);
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const threadRefs = useRef(new Map<string, HTMLDivElement>());
  const commentsRef = useRef(props.comments);
  commentsRef.current = props.comments;

  useEffect(() => {
    void api.participants(props.projectId).then((res) => setParticipants(res.items));
  }, [props.projectId]);

  // canvas → panel: a click on a highlight centres and flashes its thread
  useEffect(() => {
    if (props.focused === null) return;
    const { id } = props.focused;
    if (commentsRef.current.find((c) => c.id === id)?.status === 'closed') setShowClosed(true);
    // scroll on the next tick so a just-revealed closed thread has rendered
    const scroll = window.setTimeout(() => {
      threadRefs.current.get(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    setFlashId(id);
    const clear = window.setTimeout(() => setFlashId(null), 1400);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [props.focused]);

  // a captured canvas selection opens the composer with its anchor
  useEffect(() => {
    if (props.draftAnchor !== null) setComposing(true);
  }, [props.draftAnchor]);

  const names = useMemo(() => participants.map((p) => p.name), [participants]);
  const roots = props.comments.filter((c) => c.parentCommentId === null);
  const replies = (rootId: string) => props.comments.filter((c) => c.parentCommentId === rootId);
  const open = roots.filter((r) => r.status === 'open');
  const closed = roots.filter((r) => r.status === 'closed');

  async function submitNew(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (body === '') return;
    await api.createComment(props.documentId, {
      body,
      ...(props.draftAnchor !== null && { anchor: props.draftAnchor }),
      mentions: mentionsIn(body, participants),
    });
    setDraft('');
    setComposing(false);
    props.onClearDraftAnchor();
    props.onChanged();
  }

  async function submitReply(rootId: string) {
    const body = replyText.trim();
    if (body === '') return;
    await api.createComment(props.documentId, {
      body,
      parentCommentId: rootId,
      mentions: mentionsIn(body, participants),
    });
    setReplyFor(null);
    setReplyText('');
    props.onChanged();
  }

  async function submitEdit(commentId: string) {
    const body = editText.trim();
    if (body === '') return;
    await api.patchComment(commentId, body, mentionsIn(body, participants));
    setEditing(null);
    props.onChanged();
  }

  async function remove(commentId: string) {
    await api.deleteComment(commentId);
    props.onChanged();
  }

  async function setStatus(rootId: string, status: 'open' | 'closed') {
    await api.setCommentStatus(rootId, status);
    props.onChanged();
  }

  function renderComment(comment: SandboxComment, isRoot: boolean) {
    const mine = comment.author.participantId === props.meParticipantId;
    return (
      <div key={comment.id} className={isRoot ? 'comment' : 'comment reply'}>
        <div className="comment-head">
          <b>{comment.author.name}</b>
          <span className="when">{new Date(comment.createdAt).toLocaleString()}</span>
          {mine && editing !== comment.id && (
            <span className="comment-tools">
              <button
                title="Edit"
                onClick={() => {
                  setEditing(comment.id);
                  setEditText(comment.body);
                }}
              >
                ✎
              </button>
              <button title={isRoot ? 'Delete the thread' : 'Delete'} onClick={() => void remove(comment.id)}>
                ✕
              </button>
            </span>
          )}
        </div>
        {editing === comment.id ? (
          <div>
            <MentionBox
              value={editText}
              onChange={setEditText}
              participants={participants}
              placeholder="Edit the comment"
              autoFocus
              onSubmit={() => void submitEdit(comment.id)}
            />
            <div className="comment-actions">
              <Button size="sm" variant="primary" onClick={() => void submitEdit(comment.id)}>
                Save
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="comment-body">{withMentions(comment.body, names)}</div>
        )}
      </div>
    );
  }

  function renderThread(root: SandboxComment) {
    const thread = replies(root.id);
    const classes = [
      'comment-thread',
      root.status === 'closed' ? 'closed' : '',
      root.anchor !== null ? 'anchored' : '',
      flashId === root.id ? 'flash' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={root.id}
        className={classes}
        ref={(el) => {
          if (el === null) threadRefs.current.delete(root.id);
          else threadRefs.current.set(root.id, el);
        }}
        title={root.anchor !== null ? 'Click to find in the document' : undefined}
        onClick={(e) => {
          // panel → canvas, unless the click was on a control inside the card
          if (root.anchor === null) return;
          if ((e.target as HTMLElement).closest('button, textarea, form, a') !== null) return;
          props.onLocate(root);
        }}
      >
        {root.anchor !== null && (
          <button
            className="comment-anchor"
            title="Find in the document"
            onClick={() => props.onLocate(root)}
          >
            ❝ {root.anchor.length > 90 ? `${root.anchor.slice(0, 90)}…` : root.anchor}
          </button>
        )}
        {renderComment(root, true)}
        {thread.map((reply) => renderComment(reply, false))}
        {root.status === 'closed' && root.closedBy !== null && (
          <div className="comment-resolved">
            Resolved by {root.closedBy.name}
            {root.closedAt !== null && ` · ${new Date(root.closedAt).toLocaleString()}`}
          </div>
        )}
        {replyFor === root.id ? (
          <div style={{ marginTop: 8 }}>
            <MentionBox
              value={replyText}
              onChange={setReplyText}
              participants={participants}
              placeholder="Reply — @ mentions a colleague"
              autoFocus
              onSubmit={() => void submitReply(root.id)}
            />
            <div className="comment-actions">
              <Button size="sm" variant="primary" onClick={() => void submitReply(root.id)}>
                Reply
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setReplyFor(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="comment-actions">
            {root.status === 'open' ? (
              <>
                <Button size="sm" variant="quiet" onClick={() => setReplyFor(root.id)}>
                  ↩ Reply
                </Button>
                <Button size="sm" variant="quiet" onClick={() => void setStatus(root.id, 'closed')}>
                  ✓ Close
                </Button>
              </>
            ) : (
              <Button size="sm" variant="quiet" onClick={() => void setStatus(root.id, 'open')}>
                ↺ Reopen
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {composing ? (
        <form onSubmit={(e) => void submitNew(e)} className="comment-thread">
          {props.draftAnchor !== null && (
            <span className="comment-anchor" style={{ cursor: 'default' }}>
              ❝ {props.draftAnchor.length > 90 ? `${props.draftAnchor.slice(0, 90)}…` : props.draftAnchor}
            </span>
          )}
          <MentionBox
            value={draft}
            onChange={setDraft}
            participants={participants}
            placeholder={
              props.draftAnchor !== null
                ? 'Comment on the selected text — @ mentions a colleague'
                : 'Comment on the document — @ mentions a colleague'
            }
            autoFocus
            onSubmit={() => void submitNew()}
          />
          <div className="comment-actions">
            <Button size="sm" variant="primary" type="submit" disabled={draft.trim() === ''}>
              Comment
            </Button>
            <Button
              size="sm"
              variant="quiet"
              type="button"
              onClick={() => {
                setComposing(false);
                setDraft('');
                props.onClearDraftAnchor();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <Button size="sm" onClick={() => setComposing(true)}>
            💬 New comment
          </Button>
        </div>
      )}

      {open.map(renderThread)}
      {open.length === 0 && !composing && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
          No open comments. Select text on the canvas and press 💬 Comment, or start one here —
          any project colleague can reply and close.
        </p>
      )}

      {closed.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="comment-closed-toggle" onClick={() => setShowClosed((s) => !s)}>
            {showClosed ? '▾' : '▸'} Resolved ({closed.length})
          </button>
          {showClosed && closed.map(renderThread)}
        </div>
      )}
    </div>
  );
}
