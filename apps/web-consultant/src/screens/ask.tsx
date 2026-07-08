// The Ask surface (T-052) per docs/design/mockups/ask.html: the run trace as
// a progressive checklist, the cited answer, the output-target chip putting
// sandboxDocumentId on the run request, and the "draft created" card into
// the Editor. v1 returns on completion (streaming is a later, additive
// change) — the pending trace shows while the chain runs server-side.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { MeResponse, Run, SandboxDocument } from '@infora/contracts';
import { Badge, Button, MadeCard, OutChip, RunTrace } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';

type ShellContext = { participant: MeResponse['participants'][number] };
type Message = { id: number; kind: 'user'; text: string } | { id: number; kind: 'agent'; run: Run };

export function AskScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [docs, setDocs] = useState<SandboxDocument[]>([]);
  const [targetId, setTargetId] = useState<string>('');
  const conversationRef = useRef<string | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    void api.sandboxDocuments(participant.projectId).then((res) => setDocs(res.items));
  }, [participant.projectId]);

  const target = docs.find((doc) => doc.id === targetId);

  async function send(event: FormEvent) {
    event.preventDefault();
    const request = text.trim();
    if (request === '' || pending) return;
    setText('');
    setFailed(false);
    setMessages((m) => [...m, { id: nextId.current++, kind: 'user', text: request }]);
    setPending(true);
    try {
      conversationRef.current ??= (await api.createConversation(participant.projectId)).conversationId;
      const run = await api.createRun(conversationRef.current, request, target?.id);
      setMessages((m) => [...m, { id: nextId.current++, kind: 'agent', run }]);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

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
                <div className="bubble">{message.text}</div>
              </div>
            ) : (
              <AgentMessage
                key={message.id}
                run={message.run}
                target={docs.find((doc) => doc.id === message.run.suggestions[0]?.sandboxDocumentId)}
                onOpenEditor={(docId) =>
                  void navigate(`/projects/${participant.projectId}/editor/${docId}`)
                }
              />
            ),
          )}

          {pending && (
            <div className="msg agent" style={{ maxWidth: '100%' }}>
              <div className="who">Infora agent</div>
              <div className="trace">
                <div className="t-head">Working on task · retrieve → draft → ground-check → cite</div>
                <div className="t-row">
                  <span className="tick">…</span> Running the coded chain — every step lands in the
                  audit trail
                </div>
              </div>
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
              Ask about the project, or target a sandbox document and ask for a draft — grounded on
              the project library, every claim cited or withheld.
            </p>
          )}
        </div>
      </div>

      <div className="chat-composer">
        <div className="inner">
          <div className="composer-chips">
            {target !== undefined ? (
              <>
                <OutChip onRemove={() => setTargetId('')}>{target.title}</OutChip>
                <span>output target — remove it and the answer stays in this thread</span>
              </>
            ) : (
              <>
                <span>Draft into:</span>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  style={{ font: 'inherit', fontSize: 11.5, border: '1px solid var(--hairline)', borderRadius: 6, padding: '2px 6px', background: 'var(--panel)' }}
                >
                  <option value="">this thread only</option>
                  {docs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <form onSubmit={send} className="command" style={{ marginTop: 0 }}>
            <span className="glyph">✦</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Reply, refine, or ask about the project"
              style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', color: 'var(--ink)', background: 'transparent' }}
            />
            <Button size="sm" variant="primary" type="submit" disabled={pending}>
              ↵
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AgentMessage(props: {
  run: Run;
  target: SandboxDocument | undefined;
  onOpenEditor: (documentId: string) => void;
}) {
  const { run } = props;
  const suggestion = run.suggestions[0];
  const withheld = run.steps
    .filter((step) => step.type === 'ground_check')
    .flatMap((step) => step.railOutcomes)
    .filter((outcome) => outcome.outcome === 'withheld').length;

  return (
    <div className="msg agent" style={{ maxWidth: '100%' }}>
      <div className="who">Infora agent</div>
      <RunTrace steps={run.steps} />
      {run.response !== null && <div className="bubble">{run.response}</div>}
      {suggestion !== undefined && (
        <MadeCard
          title={props.target?.title ?? 'Sandbox document'}
          subtitle={`Sandbox document · ${run.suggestions.length} suggestion${run.suggestions.length === 1 ? '' : 's'} · ${suggestion.citations.length} citation${suggestion.citations.length === 1 ? '' : 's'}${withheld > 0 ? ` · ${withheld} claim${withheld === 1 ? '' : 's'} withheld` : ''}`}
          action={
            <Button size="sm" variant="primary" onClick={() => props.onOpenEditor(suggestion.sandboxDocumentId)}>
              Open in Editor →
            </Button>
          }
        />
      )}
      <div className="meta">
        Run {run.id.slice(0, 8)} · {run.state} · every step in the audit trail
      </div>
    </div>
  );
}
