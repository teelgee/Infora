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
  CitationChip,
  Markdown,
  NumBadge,
  RunTrace,
  SectionLabel,
  SuggestionCard,
  WithheldNotice,
} from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';

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
  const { participant } = useOutletContext<ShellContext>();
  const { documentId } = useParams();

  const [doc, setDoc] = useState<SandboxDocument | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [tab, setTab] = useState<'chat' | 'suggestions'>('suggestions');
  const [chatLog, setChatLog] = useState<Array<{ id: number; who: 'user' | 'agent'; text: string; run?: Run }>>([]);
  const [chatText, setChatText] = useState('');
  const [pending, setPending] = useState(false);
  const conversationRef = useRef<string | null>(null);
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

  async function save() {
    if (documentId === undefined || !dirty) return;
    const updated = await api.patchSandboxDocument(documentId, content);
    setDoc(updated);
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
    try {
      conversationRef.current ??= (
        await api.createConversation(participant.projectId)
      ).conversationId;
      const run = await api.createRun(conversationRef.current, request, documentId);
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
    } finally {
      setPending(false);
    }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const request = chatText.trim();
    if (request === '') return;
    setChatText('');
    await runAgainst(request);
  }

  // T-091: reprompt-to-refine — a new run seeded with the pending proposal;
  // the refined suggestion stacks above the old one in the callout
  async function refine(suggestion: Suggestion) {
    const refinement = window.prompt('How should the proposal change?');
    if (refinement === null || refinement.trim() === '') return;
    await runAgainst(
      `Refine the pending draft below.\n\nRefinement: ${refinement.trim()}\n\nThe pending draft:\n${suggestion.content}`,
    );
  }

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
      <div className="topbar" style={{ position: 'static' }}>
        <span className="crumb">
          <b>{doc.title}</b> · Sandbox document
        </span>
        <div className="right">
          {dirty ? (
            <Button size="sm" variant="primary" onClick={() => void save()}>
              Save
            </Button>
          ) : (
            <Badge tone="grey">No document controls</Badge>
          )}
        </div>
      </div>

      <div className="editor-layout">
        <div className="canvas">
          <div className="doc-body">
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              onBlur={() => void save()}
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

            {pendingSuggestions.map((suggestion, at) => (
              <div key={suggestion.id} className={at === 0 ? 'proposed' : 'proposed stale'}>
                <div className="proposed-tag">
                  <NumBadge>{at + 1}</NumBadge>{' '}
                  {at === 0
                    ? `Suggestion · ${suggestion.kind} · pending your decision`
                    : 'earlier proposal · superseded by the one above, still resolvable'}
                </div>
                <Markdown>{suggestion.content}</Markdown>
                <div style={{ marginTop: 6 }}>
                  {suggestion.citations.map((citation) => (
                    <CitationChip
                      key={citation.id}
                      corpus={'versionId' in citation.source ? 'library' : 'authority'}
                    >
                      {'versionId' in citation.source
                        ? citation.source.documentReference
                        : citation.source.authorityRef}
                    </CitationChip>
                  ))}
                </div>
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
                  <Button size="sm" onClick={() => void refine(suggestion)} disabled={pending}>
                    ↻ Refine
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void resolve(suggestion, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="suggest-panel">
          <div className="panel-tabs">
            <a
              className={tab === 'chat' ? 'active' : undefined}
              onClick={() => setTab('chat')}
              style={{ cursor: 'pointer' }}
            >
              Chat
            </a>
            <a
              className={tab === 'suggestions' ? 'active' : undefined}
              onClick={() => setTab('suggestions')}
              style={{ cursor: 'pointer' }}
            >
              Suggestions · {pendingSuggestions.length}
            </a>
          </div>

          {tab === 'suggestions' && (
            <>
              {pendingSuggestions.map((suggestion, at) => (
                <SuggestionCard
                  key={suggestion.id}
                  number={at + 1}
                  title={`${suggestion.kind === 'insert' ? 'Insert' : 'Replace'} — proposed content`}
                  description={`${suggestion.rationale} Resolve it in the document.`}
                  active={at === 0}
                />
              ))}
              {pendingSuggestions.length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', padding: '4px 2px' }}>
                  Nothing pending — ask the agent in the Chat tab to propose content for this
                  document.
                </p>
              )}
            </>
          )}

          {tab === 'chat' && (
            <>
              {chatLog.map((entry) => (
                <div key={entry.id} className={`msg ${entry.who}`} style={{ maxWidth: '100%' }}>
                  <div className="who">{entry.who === 'user' ? 'You' : 'Infora agent'}</div>
                  <div className="bubble" style={{ fontSize: 12.5 }}>
                    {entry.text}
                  </div>
                  {entry.run !== undefined && <RunTrace steps={entry.run.steps} />}
                </div>
              ))}
              {pending && (
                <div className="msg agent" style={{ maxWidth: '100%' }}>
                  <div className="who">Infora agent</div>
                  <div className="bubble" style={{ fontSize: 12.5 }}>
                    Working — retrieve → draft → ground-check → cite…
                  </div>
                </div>
              )}
              <form onSubmit={sendChat} className="command" style={{ marginTop: 8, padding: '10px 12px' }}>
                <span className="glyph">✦</span>
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Ask for a draft into this document"
                  style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', fontSize: 12.5, background: 'transparent' }}
                />
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
