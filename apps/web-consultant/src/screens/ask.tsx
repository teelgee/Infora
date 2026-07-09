// The Ask surface (T-052, reshaped by T-088 per the 2026-07-09 QA review):
// a chat for finding and retrieving — formatted markdown answers with the
// citations that grounded them, the audit trail one quiet expander away.
// Drafting into documents belongs to the Editor; Ask carries no output
// target. v1 returns on completion (streaming is a later, additive change).
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { MeResponse, Run } from '@infora/contracts';
import { Badge, Button, CitationChip, Markdown, RunTrace } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';
import { SourceModal } from '../source-modal';

type ShellContext = { participant: MeResponse['participants'][number] };
type Message = { id: number; kind: 'user'; text: string } | { id: number; kind: 'agent'; run: Run };

export function AskScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null); // versionId (T-094)
  const conversationRef = useRef<string | null>(null);
  const nextId = useRef(0);

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
      const run = await api.createRun(conversationRef.current, request);
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
          <form onSubmit={send} className="command" style={{ marginTop: 0 }}>
            <span className="glyph">✦</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about the project"
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

function AgentMessage(props: { run: Run; onOpenSource: (versionId: string) => void }) {
  const { run } = props;
  // one chip per cited document, not per claim
  const cited = [
    ...new Map(
      run.citations.map((citation) => [
        'versionId' in citation.source ? citation.source.documentReference : citation.source.authorityRef,
        citation.source,
      ]),
    ).entries(),
  ];
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
          <Markdown>{run.response}</Markdown>
        </div>
      )}
      {run.response === null && (
        <div className="withheld">Nothing survived ground-check — no answer was produced.</div>
      )}
      {(cited.length > 0 || openWorld > 0) && (
        <div style={{ margin: '6px 0 2px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {cited.map(([label, source]) => (
            <CitationChip
              key={label}
              corpus={'versionId' in source ? 'library' : 'authority'}
              onClick={'versionId' in source ? () => props.onOpenSource(source.versionId) : undefined}
            >
              {label}
            </CitationChip>
          ))}
          {openWorld > 0 && (
            <Badge tone="grey">
              includes model knowledge — {openWorld} uncited claim{openWorld === 1 ? '' : 's'}
            </Badge>
          )}
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
