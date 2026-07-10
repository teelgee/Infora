// The Editor surface (T-082) per docs/design/mockups/editor.html: the
// document canvas with manual editing via PATCH (no Suggestion, no Signal,
// no ceremony), pending Suggestions rendered as proposed blocks with their
// citations, and the right panel's Chat and Suggestions tabs — Chat reuses
// the Ask composer bound to this document; the Insert tab is post-skeleton.
// Resolution lives in the callout itself with reprompt-to-refine stacking
// (T-091, ruled 2026-07-09); the panel tab is the read-only queue.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { MeResponse, Run, SandboxDocument, Suggestion } from '@infora/contracts';
import {
  Badge,
  Button,
  Card,
  ChatComposer,
  CitedProse,
  Markdown,
  NumBadge,
  SectionLabel,
  WithheldNotice,
} from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';
import { SourceModal } from '../source-modal';

type ShellContext = { participant: MeResponse['participants'][number] };

// T-090 — the Editor's front door (2026-07-09 QA review): with no document
// open, browse the organisation's project sandbox or create a document and
// land straight in it. Flat for now — folders arrive with the sandbox drawer.
function EditorEntry() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<SandboxDocument[] | null>(null);

  useEffect(() => {
    void api.sandboxDocuments(participant.projectId).then((res) => setDocs(res.items));
  }, [participant.projectId]);

  const open = (id: string) => void navigate(`/projects/${participant.projectId}/editor/${id}`);

  async function create() {
    const title = window.prompt('Document title');
    if (title === null || title.trim() === '') return;
    const doc = await api.createSandboxDocument(participant.projectId, title.trim());
    open(doc.id);
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="page">Editor</h1>
        <span style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant="primary" onClick={() => void create()}>
            ＋ New document
          </Button>
        </span>
      </div>
      <p className="page-sub">
        Open a working document from the sandbox, or start a new one — drafting with the agent
        happens here, against the document.
      </p>

      <SectionLabel>{me.organisationName} — private project sandbox</SectionLabel>
      <Card className="tree">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Modified</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(docs ?? []).map((doc) => (
              <tr key={doc.id} onClick={() => open(doc.id)} style={{ cursor: 'pointer' }}>
                <td>
                  <span className="ficon">📄</span>
                  {doc.title}
                </td>
                <td>{new Date(doc.updatedAt).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <Button size="sm" variant="quiet" onClick={() => open(doc.id)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {docs !== null && docs.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: 'var(--muted)' }}>
                  Nothing here yet — create a document to start drafting.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function EditorScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<SandboxDocument | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [chatLog, setChatLog] = useState<Array<{ id: number; who: 'user' | 'agent'; text: string; run?: Run }>>([]);
  const [pending, setPending] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null); // versionId (T-094)
  const [refining, setRefining] = useState<string | null>(null); // suggestion id (T-096)
  const [refineText, setRefineText] = useState('');
  const [previewing, setPreviewing] = useState(false); // canvas: write / preview (T-096)
  const canvasRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);

  const load = useCallback(async () => {
    if (documentId === undefined) return;
    const [document, list] = await Promise.all([
      api.sandboxDocument(documentId),
      api.documentSuggestions(documentId),
    ]);
    setDoc(document);
    setContent(document.content);
    setDirty(false);
    setSuggestions(list.items);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // takes the value rather than reading state: the blur that triggers a save
  // can fire before React re-renders, and the closure's `content` would be
  // one keystroke stale — a fast type-then-click-away must not lose the edit
  async function save(value: string) {
    if (documentId === undefined || doc === null || value === doc.content) return;
    const updated = await api.patchSandboxDocument(documentId, value);
    setDoc(updated);
    setContent(updated.content);
    setDirty(false);
  }

  // T-053: accept/edit/reject — one Signal per Suggestion; accept/edit lands
  // the content in the document, reject leaves it untouched
  async function resolve(suggestion: Suggestion, resolution: 'accepted' | 'edited' | 'rejected') {
    let editedContent: string | undefined;
    if (resolution === 'edited') {
      const edited = window.prompt('Edit the proposed content', suggestion.content);
      if (edited === null) return;
      editedContent = edited;
    }
    await api.resolveSuggestion(suggestion.id, resolution, editedContent);
    await load();
  }

  async function runAgainst(request: string) {
    if (pending || documentId === undefined) return;
    setChatLog((log) => [...log, { id: nextId.current++, who: 'user', text: request }]);
    setPending(true);
    abortRef.current = new AbortController();
    try {
      conversationRef.current ??= (
        await api.createConversation(participant.projectId)
      ).conversationId;
      const run = await api.createRun(conversationRef.current, request, documentId, abortRef.current.signal);
      setChatLog((log) => [
        ...log,
        {
          id: nextId.current++,
          who: 'agent',
          text:
            run.suggestions.length > 0
              ? `Done — ${run.suggestions.length} suggestion${run.suggestions.length === 1 ? '' : 's'} on the document.`
              : (run.response ?? 'Nothing survived ground-check — no content was proposed.'),
          run,
        },
      ]);
      await load(); // the new Suggestion appears on the canvas and the panel
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setChatLog((log) => [
          ...log,
          {
            id: nextId.current++,
            who: 'agent',
            text: 'Cancelled — the wait was abandoned; the run itself still completes in the audit record. Reload the document to see any suggestion it produced.',
          },
        ]);
      } else {
        throw error;
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  const cancelRun = () => abortRef.current?.abort();

  // T-091/T-096: reprompt-to-refine — an inline dialog in the callout fires a
  // new run seeded with the pending proposal; the refined suggestion stacks
  // above the old one
  async function submitRefine(event: FormEvent, suggestion: Suggestion) {
    event.preventDefault();
    const refinement = refineText.trim();
    if (refinement === '') return;
    setRefining(null);
    setRefineText('');
    await runAgainst(
      `Refine the pending draft below.\n\nRefinement: ${refinement}\n\nThe pending draft:\n${suggestion.content}`,
    );
  }

  // T-096: the formatting toolbar writes markdown around the canvas
  // selection — the sandbox document *is* markdown text (see the
  // canonical-format theme on the grill tracker for true WYSIWYG)
  function applyFormat(action: (text: string, from: number, to: number) => { text: string; from: number; to: number }) {
    const area = canvasRef.current;
    if (area === null) return;
    const applied = action(area.value, area.selectionStart, area.selectionEnd);
    setContent(applied.text);
    setDirty(true);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(applied.from, applied.to);
    });
  }

  const wrapWith = (mark: string) => (text: string, from: number, to: number) => ({
    text: `${text.slice(0, from)}${mark}${text.slice(from, to)}${mark}${text.slice(to)}`,
    from: from + mark.length,
    to: to + mark.length,
  });

  const prefixLines = (prefix: string) => (text: string, from: number, to: number) => {
    const lineStart = text.lastIndexOf('\n', from - 1) + 1;
    const block = text.slice(lineStart, to);
    const prefixed = block
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`))
      .join('\n');
    return {
      text: `${text.slice(0, lineStart)}${prefixed}${text.slice(to)}`,
      from: lineStart,
      to: lineStart + prefixed.length,
    };
  };

  if (documentId === undefined) return <EditorEntry />;
  if (doc === null) return null;

  // T-091, the refine-stack rule (ruled 2026-07-09): pending suggestions
  // stack newest-first; once one is accepted or edited, unaccepted ones
  // older than it leave the surface (the rows remain — append-only).
  const resolvedAt = suggestions.findIndex(
    (sg) => sg.signal !== undefined && sg.signal.resolution !== 'rejected',
  );
  const pendingSuggestions = suggestions.filter(
    (sg, at) => sg.signal === undefined && (resolvedAt === -1 || at < resolvedAt),
  );

  return (
    <>
      {sourceOpen !== null && (
        <SourceModal versionId={sourceOpen} onClose={() => setSourceOpen(null)} />
      )}
      <div className="topbar" style={{ position: 'static' }}>
        <span className="crumb">
          {/* T-098: where the document lives, clickable */}
          <a
            className="location-chip"
            title="Open the sandbox"
            onClick={() => void navigate(`/projects/${participant.projectId}/sandbox`)}
          >
            ▧ {me.organisationName} — project sandbox
          </a>{' '}
          / <b>{doc.title}</b>
        </span>
        <div className="right">
          {dirty ? (
            <Button size="sm" variant="primary" onClick={() => void save(content)}>
              Save
            </Button>
          ) : (
            <Badge tone="grey">No document controls</Badge>
          )}
        </div>
      </div>

      <div className="editor-layout">
        <div className="canvas">
          {/* T-096 — the formatting toolbar: markdown-honest word-processor
              controls; mousedown is swallowed so the selection (and the
              blur-save) are not disturbed */}
          <div className="format-bar" onMouseDown={(e) => e.preventDefault()}>
            <button title="Bold" style={{ fontWeight: 700 }} onClick={() => applyFormat(wrapWith('**'))}>
              B
            </button>
            <button title="Italic" style={{ fontStyle: 'italic' }} onClick={() => applyFormat(wrapWith('*'))}>
              I
            </button>
            <span className="rule" />
            <button title="Heading" onClick={() => applyFormat(prefixLines('## '))}>
              H2
            </button>
            <button title="Subheading" onClick={() => applyFormat(prefixLines('### '))}>
              H3
            </button>
            <span className="rule" />
            <button title="Bulleted list" onClick={() => applyFormat(prefixLines('- '))}>
              • List
            </button>
            <button title="Numbered list" onClick={() => applyFormat(prefixLines('1. '))}>
              1. List
            </button>
            <button title="Quote" onClick={() => applyFormat(prefixLines('> '))}>
              ❝ Quote
            </button>
            <span style={{ marginLeft: 'auto' }} />
            <button
              className={previewing ? undefined : 'active'}
              onClick={() => setPreviewing(false)}
            >
              Write
            </button>
            <button
              className={previewing ? 'active' : undefined}
              onClick={() => {
                void save(content);
                setPreviewing(true);
              }}
            >
              Preview
            </button>
          </div>
          <div className="doc-body">
            {previewing ? (
              <div style={{ minHeight: 260 }}>
                {content.trim() === '' ? (
                  <p style={{ color: 'var(--muted)' }}>Nothing to preview yet.</p>
                ) : (
                  <Markdown>{content}</Markdown>
                )}
              </div>
            ) : (
              <textarea
                ref={canvasRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                onBlur={(e) => void save(e.currentTarget.value)}
                placeholder="Write here — manual editing has no ceremony: no Suggestion, no Signal."
                style={{
                  width: '100%',
                  minHeight: 260,
                  border: 'none',
                  outline: 'none',
                  resize: 'vertical',
                  font: 'inherit',
                  lineHeight: 'inherit',
                  color: 'inherit',
                  background: 'transparent',
                }}
              />
            )}

            {pendingSuggestions.map((suggestion, at) => (
              <div key={suggestion.id} className={at === 0 ? 'proposed' : 'proposed stale'}>
                <div className="proposed-tag">
                  <NumBadge>{at + 1}</NumBadge>{' '}
                  {at === 0
                    ? `Suggestion · ${suggestion.kind} · pending your decision`
                    : 'earlier proposal · superseded by the one above, still resolvable'}
                </div>
                {/* each citation rides the claim it backs (T-095) */}
                <CitedProse
                  content={suggestion.content}
                  citations={suggestion.citations}
                  onOpenSource={setSourceOpen}
                />
                {suggestion.rationale.includes('withheld') &&
                  !suggestion.rationale.includes('nothing was withheld') && (
                    <WithheldNotice>{suggestion.rationale}</WithheldNotice>
                  )}
                <div className="proposed-actions">
                  <Button size="sm" variant="primary" onClick={() => void resolve(suggestion, 'accepted')}>
                    ✓ Accept
                  </Button>
                  <Button size="sm" onClick={() => void resolve(suggestion, 'edited')}>
                    ✎ Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setRefining(refining === suggestion.id ? null : suggestion.id);
                      setRefineText('');
                    }}
                    disabled={pending}
                  >
                    ↻ Refine
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void resolve(suggestion, 'rejected')}>
                    Reject
                  </Button>
                </div>
                {refining === suggestion.id && (
                  <form
                    onSubmit={(e) => void submitRefine(e, suggestion)}
                    className="command"
                    style={{ marginTop: 10, padding: '8px 12px' }}
                  >
                    <span className="glyph">↻</span>
                    <input
                      autoFocus
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRefining(null);
                      }}
                      placeholder="How should this proposal change?"
                      style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', fontSize: 12.5, background: 'transparent', color: 'var(--ink)' }}
                    />
                    <Button size="sm" variant="primary" type="submit" disabled={pending}>
                      Refine ↵
                    </Button>
                    <Button size="sm" variant="quiet" type="button" onClick={() => setRefining(null)}>
                      Cancel
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* T-098: the panel is the chat — proposals live inline in the
            document itself, resolved in their callouts */}
        <div className="suggest-panel">
          <div className="panel-tabs">
            <a className="active">Chat</a>
            {pendingSuggestions.length > 0 && (
              <a style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                {pendingSuggestions.length} pending in the document
              </a>
            )}
          </div>

          {/* just the request and the reply — the run stays fully audited
              server-side, readable on the work item (T-096) */}
          {chatLog.map((entry) => (
            <div key={entry.id} className={`msg ${entry.who}`} style={{ maxWidth: '100%' }}>
              <div className="who">{entry.who === 'user' ? 'You' : 'Infora agent'}</div>
              <div className="bubble" style={{ fontSize: 12.5 }}>
                <Markdown>{entry.text}</Markdown>
              </div>
            </div>
          ))}
          {pending && (
            <div className="msg agent" style={{ maxWidth: '100%' }}>
              <div className="who">Infora agent</div>
              <div className="bubble" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Working…
              </div>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <ChatComposer
              placeholder="Ask for a draft into this document"
              pending={pending}
              onSend={(request) => void runAgainst(request)}
              onCancel={cancelRun}
              fontSize={12.5}
            />
          </div>
        </div>
      </div>
    </>
  );
}
