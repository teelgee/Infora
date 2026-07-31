// The Ask surface (T-052, reshaped by T-088 per the 2026-07-09 QA review):
// a chat for finding and retrieving — formatted markdown answers with the
// sources that grounded them, the audit trail one quiet expander away.
// A source opens the source panel beside the chat (T-105); an answer can be
// carried into the Editor as a fresh sandbox document (T-106); History
// reopens a past conversation via ?conversation= (T-108). v1 returns on
// completion (streaming is a later, additive change).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router';
import type { MeResponse, Run } from '@infora/contracts';
import { Badge, ChatComposer, CitedProse, Markdown, RunTrace } from '@infora/ui';
import type { ChatComposerHandle } from '@infora/ui';
import { statusBadge } from './shared';
import { api, RequestError } from '../api';
import { ComposerSources } from '../composer-sources';
import { useMe } from '../session';
import { SourcePanel } from '../source-panel';

type ShellContext = { participant: MeResponse['participants'][number] };
type Message =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'agent'; run: Run }
  | { id: number; kind: 'note'; text: string }; // e.g. a cancelled wait (T-097)

export function AskScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reopenId = searchParams.get('conversation'); // a History entry (T-108)

  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null); // versionId (T-094/T-105)
  // T-249 — the label-propagation refusal, stated where the action was taken
  const [editorRefusal, setEditorRefusal] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const nextId = useRef(0);

  // T-108 — a History entry reopens here: the past runs seed the transcript
  // and the conversation continues under its own id
  useEffect(() => {
    conversationRef.current = reopenId;
    setMessages([]);
    setSourceOpen(null);
    if (reopenId === null) return;
    void api.conversation(reopenId).then(({ runs }) =>
      setMessages(
        runs.flatMap((run) => [
          { id: nextId.current++, kind: 'user' as const, text: run.request },
          { id: nextId.current++, kind: 'agent' as const, run },
        ]),
      ),
    );
  }, [reopenId]);

  // T-106 — the answer carried into the Editor: a fresh sandbox document
  // seeded with the agent's response, opened on the canvas.
  // T-249: one server-side call, not create-then-PATCH. The server computes
  // the answer's access label from the sources the run admitted and refuses a
  // destination broader than they are (finding F2) — which it could not do
  // when the content arrived as an anonymous content update. The refusal
  // names both labels; the destination selector that offers the override
  // before the fact is T-295.
  async function openInEditor(run: Run) {
    try {
      const doc = await api.openRunInEditor(run.id);
      void navigate(`/projects/${participant.projectId}/editor/${doc.id}`);
    } catch (error) {
      // the refusal states both labels — a refusal a user cannot act on reads
      // as a broken system rather than a careful one
      const detail = error instanceof RequestError ? error.body?.detail : undefined;
      setEditorRefusal(
        detail !== undefined
          ? `This answer was not opened in the editor: ${detail}.`
          : 'This answer could not be opened in the editor.',
      );
    }
  }

  async function send(request: string) {
    if (pending) return;
    setFailed(false);
    setMessages((m) => [...m, { id: nextId.current++, kind: 'user', text: request }]);
    setPending(true);
    abortRef.current = new AbortController();
    try {
      conversationRef.current ??= (await api.createConversation(participant.projectId)).conversationId;
      const run = await api.createRun(conversationRef.current, request, undefined, abortRef.current.signal);
      setMessages((m) => [...m, { id: nextId.current++, kind: 'agent', run }]);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessages((m) => [
          ...m,
          {
            id: nextId.current++,
            kind: 'note',
            text: 'Cancelled — the answer was discarded; the run itself still completes in the audit record.',
          },
        ]);
      } else {
        setFailed(true);
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  const cancel = () => abortRef.current?.abort();

  return (
    <div className="chat-layout">
      <div className="chat-main">
        <div className="topbar" style={{ position: 'static' }}>
          <span className="crumb">
            <b>Ask</b> · Conversation bound to {participant.projectName}
          </span>
          <div className="right">
            <Badge tone="success">Grounded &amp; cited</Badge>
          </div>
        </div>

        <div className="chat-scroll">
          <div className="chat-inner">
            {messages.map((message) =>
              message.kind === 'user' ? (
                <div key={message.id} className="msg user" style={{ marginLeft: 'auto', maxWidth: '78%' }}>
                  <div className="who" style={{ textAlign: 'right' }}>
                    {me.name.split(' ')[0]}
                  </div>
                  <div className="bubble">
                    <Markdown>{message.text}</Markdown>
                  </div>
                </div>
              ) : message.kind === 'note' ? (
                <div key={message.id} className="msg agent" style={{ maxWidth: '100%' }}>
                  <div className="bubble" style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                    {message.text}
                  </div>
                </div>
              ) : (
                <AgentMessage
                  key={message.id}
                  run={message.run}
                  onOpenSource={setSourceOpen}
                  onOpenInEditor={() => void openInEditor(message.run)}
                />
              ),
            )}

            {pending && (
              <div className="msg agent" style={{ maxWidth: '100%' }}>
                <div className="who">Infora agent</div>
                <div className="bubble" style={{ color: 'var(--text-muted)' }}>Working…</div>
              </div>
            )}
            {editorRefusal !== null && (
              <div className="msg agent" style={{ maxWidth: '100%' }}>
                <div className="who">Infora agent</div>
                <div className="withheld">{editorRefusal}</div>
              </div>
            )}
            {failed && (
              <div className="msg agent" style={{ maxWidth: '100%' }}>
                <div className="who">Infora agent</div>
                <div className="withheld">
                  The run failed and was recorded as failed — nothing was produced. Try again.
                </div>
              </div>
            )}
            {messages.length === 0 && !pending && (
              <p className="page-sub" style={{ marginTop: 40 }}>
                Ask about the project — answers are grounded on its library, with the sources
                inline. To draft into a document, open it in the Editor and use its chat.
              </p>
            )}
          </div>
        </div>

        <div className="chat-composer">
          <div className="inner">
            <ChatComposer
              ref={composerRef}
              placeholder="Ask about the project"
              pending={pending}
              onSend={(request) => void send(request)}
              onCancel={cancel}
              sources={
                <ComposerSources
                  projectId={participant.projectId}
                  onInsert={(snippet) => composerRef.current?.insert(snippet)}
                />
              }
            />
          </div>
        </div>
      </div>

      {/* T-105 — the source panel: the clicked source, rendered beside the chat */}
      {sourceOpen !== null && (
        <SourcePanel versionId={sourceOpen} onClose={() => setSourceOpen(null)} />
      )}
    </div>
  );
}

function AgentMessage(props: {
  run: Run;
  onOpenSource: (versionId: string) => void;
  onOpenInEditor: () => void;
}) {
  const { run } = props;
  const outcomes = run.steps
    .filter((step) => step.type === 'ground_check')
    .flatMap((step) => step.railOutcomes);
  const withheld = outcomes.filter((outcome) => outcome.outcome === 'withheld').length;
  const openWorld = outcomes.filter((outcome) => outcome.outcome === 'open_world').length;

  return (
    <div className="msg agent" style={{ maxWidth: '100%' }}>
      <div className="who">Infora agent</div>
      {run.response !== null && (
        <div className="bubble">
          {/* each source rides the claim it backs (T-095) */}
          <CitedProse content={run.response} citations={run.citations} onOpenSource={props.onOpenSource} />
        </div>
      )}
      {run.response === null && (
        <div className="withheld">Nothing survived ground-check — no answer was produced.</div>
      )}
      {run.response !== null && (
        <div style={{ margin: '6px 0 2px' }}>
          {/* T-106 — the answer carried onto the Editor canvas */}
          <a className="location-chip" title="Carry this answer into a new sandbox document" onClick={props.onOpenInEditor}>
            ✎ Open in editor
          </a>
        </div>
      )}
      {openWorld > 0 && (
        <div style={{ margin: '6px 0 2px' }}>
          <Badge tone="neutral">
            includes model knowledge — {openWorld} uncited claim{openWorld === 1 ? '' : 's'}
          </Badge>
        </div>
      )}
      <details className="meta" style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>
          Run {run.id.slice(0, 8)} · {statusBadge(run.state).label}
          {withheld > 0 && ` · ${withheld} claim${withheld === 1 ? '' : 's'} withheld`} · every step
          in the audit trail
        </summary>
        <RunTrace steps={run.steps} />
      </details>
    </div>
  );
}
