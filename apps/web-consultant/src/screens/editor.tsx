// The Editor surface (T-082) per docs/design/mockups/editor.html: the
// document canvas with manual editing via PATCH (no Suggestion, no Signal,
// no ceremony), pending Suggestions rendered as proposed blocks with their
// citations, and the right panel's Chat and Suggestions tabs — Chat reuses
// the Ask composer bound to this document; the Insert tab is post-skeleton.
// Resolution controls land with T-053.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import type { MeResponse, Run, SandboxDocument, Suggestion } from '@infora/contracts';
import {
  Badge,
  Button,
  CitationChip,
  NumBadge,
  RunTrace,
  SuggestionCard,
  WithheldNotice,
} from '@infora/ui';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

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

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const request = chatText.trim();
    if (request === '' || pending || documentId === undefined) return;
    setChatText('');
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

  if (documentId === undefined || doc === null) {
    return (
      <div className="content">
        <h1 className="page">Editor</h1>
        <p className="page-sub">Open a document from the Sandbox to edit it here.</p>
      </div>
    );
  }

  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.signal === undefined);

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
              <div key={suggestion.id} className="proposed">
                <div className="proposed-tag">
                  <NumBadge>{at + 1}</NumBadge> Suggestion {at + 1} · {suggestion.kind} · pending
                  your decision
                </div>
                <p>
                  {suggestion.content}{' '}
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
                </p>
                {suggestion.rationale.includes('withheld') &&
                  !suggestion.rationale.includes('nothing was withheld') && (
                    <WithheldNotice>{suggestion.rationale}</WithheldNotice>
                  )}
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
                  description={suggestion.rationale}
                  active={at === 0}
                  actions={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Accept / edit / reject arrive with T-053</span>}
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
