// The Ask surface (T-052, reshaped by T-088 per the 2026-07-09 QA review):
// a chat for finding and retrieving — formatted markdown answers with the
// citations that grounded them, the audit trail one quiet expander away.
// Drafting into documents belongs to the Editor; Ask carries no output
// target. v1 returns on completion (streaming is a later, additive change).
import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { MeResponse, Run } from '@infora/contracts';
import { Badge, ChatComposer, CitedProse, Markdown, RunTrace } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';
import { SourceModal } from '../source-modal';

type ShellContext = { participant: MeResponse['participants'][number] };
type Message =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'agent'; run: Run }
  | { id: number; kind: 'note'; text: string }; // e.g. a cancelled wait (T-097)

export function AskScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null); // versionId (T-094)
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);

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
    <div className="chat-main">
      <div className="topbar" style={{ position: 'static' }}>
        <span className="crumb">
          <b>Ask</b> · Conversation bound to {participant.projectName}
        </span>
        <div className="right">
          <Badge tone="green">Grounded &amp; cited</Badge>
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
                <div className="bubble" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                  {message.text}
                </div>
              </div>
            ) : (
              <AgentMessage key={message.id} run={message.run} onOpenSource={setSourceOpen} />
            ),
          )}

          {pending && (
            <div className="msg agent" style={{ maxWidth: '100%' }}>
              <div className="who">Infora agent</div>
              <div className="bubble" style={{ color: 'var(--muted)' }}>Working…</div>
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
              Ask about the project — answers are grounded on its library and cited. To draft into
              a document, open it in the Editor and use its chat.
            </p>
          )}
        </div>
      </div>

      {sourceOpen !== null && (
        <SourceModal versionId={sourceOpen} onClose={() => setSourceOpen(null)} />
      )}

      <div className="chat-composer">
        <div className="inner">
          <ChatComposer
            placeholder="Ask about the project"
            pending={pending}
            onSend={(request) => void send(request)}
            onCancel={cancel}
          />
        </div>
      </div>
    </div>
  );
}

function AgentMessage(props: { run: Run; onOpenSource: (versionId: string) => void }) {
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
          {/* each citation rides the claim it backs (T-095) */}
          <CitedProse content={run.response} citations={run.citations} onOpenSource={props.onOpenSource} />
        </div>
      )}
      {run.response === null && (
        <div className="withheld">Nothing survived ground-check — no answer was produced.</div>
      )}
      {openWorld > 0 && (
        <div style={{ margin: '6px 0 2px' }}>
          <Badge tone="grey">
            includes model knowledge — {openWorld} uncited claim{openWorld === 1 ? '' : 's'}
          </Badge>
        </div>
      )}
      <details className="meta" style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>
          Run {run.id.slice(0, 8)} · {run.state}
          {withheld > 0 && ` · ${withheld} claim${withheld === 1 ? '' : 's'} withheld`} · every step
          in the audit trail
        </summary>
        <RunTrace steps={run.steps} />
      </details>
    </div>
  );
}
