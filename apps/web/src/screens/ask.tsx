// The Ask surface (T-052, reshaped by T-088 per the 2026-07-09 QA review):
// a chat for finding and retrieving — formatted markdown answers with the
// sources that grounded them, the audit trail one quiet expander away.
// A source opens the source panel beside the chat (T-105); an answer can be
// carried into the Editor as a fresh sandbox document (T-106); History
// reopens a past conversation via ?conversation= (T-108). v1 returns on
// completion (streaming is a later, additive change).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router';
import type { MeResponse, Plan, PlanStep, Run } from '@infora/contracts';
import {
  Badge,
  ChatComposer,
  CitedProse,
  CompletionFooter,
  Markdown,
  ProgressRail,
  RunTrace,
} from '@infora/ui';
import type { ChatComposerHandle } from '@infora/ui';
import { statusBadge } from './shared';
import { api, RequestError } from '../api';
import { ComposerSources } from '../composer-sources';
import { ContextChip, DataSourcesChip, useGroundingScope } from '../composer-chips';
import { DestinationSelector, DestinationWarning, useDestinations } from '../destination-selector';
import type { Destination } from '../destination-selector';
import { LensPicker, useLenses } from '../lens-picker';
import type { LensChoice } from '../lens-picker';
import { useMe } from '../session';
import { SourcePanel } from '../source-panel';

type ShellContext = { participant: MeResponse['participants'][number] };
type Message =
  | { id: number; kind: 'user'; text: string }
  // T-283 — `lens` is the Lens THIS answer was produced under, carried on the
  // message rather than read from the picker. Switching re-renders the next
  // answer only; history keeps what produced it, so scrolling back does not
  // silently relabel an old answer with a register it was never written in.
  // T-294 — the plan rides the message beside the run, because the completion
  // footer states the orchestration mode and the mode lives on the plan. `null`
  // is a real value: a plan that could not be read is a stated absence, and the
  // footer says so rather than deriving a label from the workflow id.
  | { id: number; kind: 'agent'; run: Run; lens: LensChoice; plan: Plan | null }
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
  // T-283 — the active Lens. Deliberately NOT persisted on the conversation:
  // an answer's Lens is a property of the answer, which is why it rides the
  // run (and the plan record T-299 writes) and not a conversation column.
  const { lenses, defaultLensId, loaded: lensesLoaded } = useLenses();
  const [lens, setLens] = useState<LensChoice>(null);
  // T-293 — the progress rail's steps, read off the plan the run wrote. NULL,
  // not [], while a run is in flight: the rail claims nothing it has not read,
  // and the API returns on completion, so there is genuinely no record yet.
  // A rail that lit its first stage on send would be a client-side timer with
  // the timer hidden.
  const [railSteps, setRailSteps] = useState<PlanStep[] | null>(null);
  // T-292 — the composer's scope chips. The refinement is per-conversation and
  // lives here rather than on the run, because it is the user's standing
  // narrowing for the turns that follow; each run carries the ids it was sent
  // with. Empty means NOT NARROWED — the surface never sends an empty array,
  // since an empty one means "narrowed to nothing" (T-248's `absent ≠ empty`).
  const groundingScope = useGroundingScope(participant.projectId);
  const [refinement, setRefinement] = useState<string[]>([]);
  // T-295 — where answers are written. Per CONVERSATION, at the top of a new
  // one: it carries permission consequences and is chosen before asking, not
  // tidied away afterwards. `null` means the organisation's default working
  // area, which is what the server picks when no sandbox is named (T-171).
  const destinations = useDestinations(participant.projectId);
  const [destination, setDestination] = useState<Destination>(null);
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const nextId = useRef(0);

  // The configured default, applied once the list has loaded. `null` is a real
  // configuration (no Lens named), so this cannot key off `lens === null`.
  const [lensInitialised, setLensInitialised] = useState(false);
  useEffect(() => {
    if (!lensesLoaded || lensInitialised) return;
    const preselected = lenses.find((candidate) => candidate.id === defaultLensId);
    if (preselected !== undefined) setLens({ id: preselected.id, label: preselected.label });
    setLensInitialised(true);
  }, [lensesLoaded, lensInitialised, lenses, defaultLensId]);

  // T-108 — a History entry reopens here: the past runs seed the transcript
  // and the conversation continues under its own id
  useEffect(() => {
    conversationRef.current = reopenId;
    setMessages([]);
    setSourceOpen(null);
    setRailSteps(null);
    if (reopenId === null) return;
    void api.conversation(reopenId).then(async ({ runs }) => {
      // T-294 — every answer's plan, not just the last one. T-293 read one
      // because the RAIL shows one; the footer states the orchestration mode
      // under EVERY answer, and a mode a scrolled-back answer cannot state is
      // the labelling requirement failing exactly where history is read. A
      // refusal or an absent plan resolves to null and the footer says so.
      const plans = await Promise.all(
        runs.map((run) =>
          api
            .runPlan(run.id)
            .then((res) => res.plan)
            .catch(() => null),
        ),
      );
      // the rail shows the LAST answer's plan, and `null` until it arrives
      // rather than the previous conversation's stages left standing
      setRailSteps(plans.at(-1)?.steps ?? null);
      setMessages(
        runs.flatMap((run, at) => [
          { id: nextId.current++, kind: 'user' as const, text: run.request },
          // T-294 closes T-293's own gap here: a reopened conversation's Lens
          // WAS unrecoverable, and it is on the plan (T-299) — so the message
          // carries the id the plan recorded rather than nothing. Null still
          // means "not known", and never the picker's current value, which
          // would be a fabrication about a past answer.
          {
            id: nextId.current++,
            kind: 'agent' as const,
            run,
            lens: lensChoiceOf(plans[at] ?? null),
            plan: plans[at] ?? null,
          },
        ]),
      );
    });
  }, [reopenId]);

  // The plan is producer-private and inherits the run's read scope exactly
  // (T-261), so a refusal is an ordinary outcome and the rail stays honest by
  // staying empty rather than by inventing stages.
  async function loadPlan(runId: string): Promise<Plan | null> {
    try {
      return (await api.runPlan(runId)).plan;
    } catch {
      return null;
    }
  }

  // T-106 — the answer carried into the Editor: a fresh sandbox document
  // seeded with the agent's response, opened on the canvas.
  // T-249: one server-side call, not create-then-PATCH. The server computes
  // the answer's access label from the sources the run admitted and refuses a
  // destination broader than they are (finding F2) — which it could not do
  // when the content arrived as an anonymous content update. The refusal
  // names both labels; the destination selector that offers the override
  // before the fact is T-295.
  async function openInEditor(run: Run, overrideReason?: string) {
    try {
      // T-295 — the chosen destination rides the write. The server recomputes
      // the labels and refuses on its own account; this only says WHERE.
      const doc = await api.openRunInEditor(run.id, destination?.id, overrideReason);
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
    // the previous answer's stages must not stand while a new question runs —
    // they would read as this run's progress
    setRailSteps(null);
    setPending(true);
    abortRef.current = new AbortController();
    try {
      conversationRef.current ??= (await api.createConversation(participant.projectId)).conversationId;
      // the Lens is captured HERE, at send time — switching while a run is in
      // flight must not relabel the answer already being produced
      const sentUnder = lens;
      // T-292 — the refinement is captured at send time for the same reason:
      // narrowing while a run is in flight must not relabel what that answer
      // was actually built on.
      const narrowedTo = refinement;
      const run = await api.createRun(
        conversationRef.current,
        request,
        undefined,
        abortRef.current.signal,
        sentUnder?.id,
        narrowedTo,
      );
      // T-293/T-294 — ONE read of the plan the run actually wrote, after it
      // reports, serving both the rail and the footer. Two reads would be two
      // chances for them to disagree about what ran.
      const plan = await loadPlan(run.id);
      setRailSteps(plan?.steps ?? null);
      setMessages((m) => [
        ...m,
        { id: nextId.current++, kind: 'agent', run, lens: sentUnder, plan },
      ]);
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
      {/* T-293 — the progress rail, left of the transcript (the Wave 8 layout).
          Driven entirely by the plan's step states; there is no timer here and
          no state that advances without the record advancing. */}
      <ProgressRail steps={railSteps} />
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
            {/* T-295 — at the top of the conversation, above the first answer.
                Where an answer is written decides who can read it, so it is
                chosen before asking rather than discovered at the refusal. */}
            <DestinationSelector
              destinations={destinations}
              value={destination}
              onChange={setDestination}
            />
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
                  lens={message.lens}
                  plan={message.plan}
                  onOpenSource={setSourceOpen}
                  destination={destination}
                  onOpenInEditor={(overrideReason) => void openInEditor(message.run, overrideReason)}
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
                <>
                  <LensPicker lenses={lenses} value={lens} onChange={setLens} />
                  <DataSourcesChip
                    scope={groundingScope}
                    selected={refinement}
                    onChange={setRefinement}
                  />
                  <ContextChip scope={groundingScope} />
                  <ComposerSources
                    projectId={participant.projectId}
                    onInsert={(snippet) => composerRef.current?.insert(snippet)}
                  />
                </>
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

// T-294 — the Lens a past answer was produced under, recovered from its plan.
// The label is not on the plan (only the id and version are), so the id stands
// in until the picker's list can name it — which is what the footer does.
function lensChoiceOf(plan: Plan | null): LensChoice {
  if (plan === null || plan.lensId === null) return null;
  return { id: plan.lensId, label: plan.lensId };
}

function AgentMessage(props: {
  run: Run;
  lens: LensChoice;
  plan: Plan | null;
  destination: Destination;
  onOpenSource: (versionId: string) => void;
  onOpenInEditor: (overrideReason?: string) => void;
}) {
  const { run } = props;
  const outcomes = run.steps
    .filter((step) => step.type === 'ground_check')
    .flatMap((step) => step.railOutcomes);
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
          <a
            className="location-chip"
            title="Carry this answer into a new sandbox document"
            onClick={() => props.onOpenInEditor()}
          >
            ✎ Open in editor
            {props.destination !== null && ` → ${props.destination.name}`}
          </a>
        </div>
      )}
      {/* T-295 — the block, stated per ANSWER, because the source label is
          computed from that run's own source set: the same destination can be
          legal for one answer in a conversation and refused for the next. */}
      {run.response !== null && props.destination !== null && (
        <DestinationWarning
          runId={run.id}
          destination={props.destination}
          onOverride={(reason) => props.onOpenInEditor(reason)}
        />
      )}
      {openWorld > 0 && (
        <div style={{ margin: '6px 0 2px' }}>
          <Badge tone="neutral">
            includes model knowledge — {openWorld} uncited claim{openWorld === 1 ? '' : 's'}
          </Badge>
        </div>
      )}
      {/* T-294 — the completion footer. Always visible, under every answer:
          the mode in words is a hard requirement, not a Details affordance. */}
      <CompletionFooter
        run={run}
        plan={props.plan}
        {...(props.lens !== null && { lensLabel: props.lens.label })}
      />
      {/* T-294 — the Lens and the withheld count moved INTO the footer, which
          states them beside the mode; repeating them here would be two places
          to read one fact and two places for it to go stale. What stays is the
          raw Step tree, which the footer deliberately does not duplicate: the
          footer says what the run was, this says what it did. */}
      <details className="meta" style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>
          Run {run.id.slice(0, 8)} · {statusBadge(run.state).label} · every step in the audit trail
        </summary>
        <RunTrace steps={run.steps} />
      </details>
    </div>
  );
}
