// T-127 — the deliverable's cycle page (ADR-0005–0014/0032): the DRR made a
// screen. Rounds newest-first with their comments, codes, responses and
// transmittals; the actions each role holds at each phase — reviewers
// comment and code while open, the lead reviewer sets the verdict and
// issues, the authoring side responds and re-promotes, the lead author or
// owner may close-rejected. Review happens against the frozen version; the
// full in-PDF anchored viewer is the noted follow-up (anchors here are
// quote/page fields; the PDF rendition downloads beside each round).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type {
  AcceptanceCode,
  MeResponse,
  PlanRow,
  Rendition,
  ReviewComment,
  ReviewCycle,
  Round,
  SandboxDocument,
} from '@infora/contracts';
import { Badge, Button, Card, SectionLabel } from '@infora/ui';
import { api, RequestError } from '../api';
import { statusBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function CycleScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<PlanRow | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [codes, setCodes] = useState<AcceptanceCode[]>([]);
  const [draft, setDraft] = useState<SandboxDocument | null>(null);
  const [renditionsByVersion, setRenditions] = useState<Record<string, Rendition[]>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const me = participant;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!containerId) return;
    try {
      const [plan, cycleRead, codeList, docs] = await Promise.all([
        api.plan(me.projectId),
        api.cycle(containerId),
        api.acceptanceCodes(me.projectId).catch(() => ({ items: [] as AcceptanceCode[] })),
        api.sandboxDocuments(me.projectId).catch(() => ({ items: [] as SandboxDocument[] })),
      ]);
      setRow(plan.items.find((r) => r.containerId === containerId) ?? null);
      setCycle(cycleRead);
      setCodes(codeList.items.filter((c) => c.retiredAt === null));
      setDraft(docs.items.find((d) => d.containerId === containerId) ?? null);
      setLoaded(true);
      if (cycleRead) {
        const wanted = cycleRead.rounds.map((r) => r.versionId);
        const entries = await Promise.all(
          wanted.map(async (v) => [v, await api.renditions(v).then((r) => r.items, () => [])] as const),
        );
        setRenditions(Object.fromEntries(entries));
      }
    } catch (error) {
      setLoadError(error instanceof RequestError ? (error.body?.error ?? 'failed') : String(error));
    }
  }, [containerId, me.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!containerId) return null;
  if (loadError) {
    return (
      <div className="content">
        <p style={{ color: 'var(--muted)' }}>Could not load the deliverable ({loadError}).</p>
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="content">
        <p style={{ color: 'var(--muted)' }}>
          {loaded ? 'This deliverable is not on a plan you can see.' : 'Loading the deliverable…'}
        </p>
      </div>
    );
  }

  // the requester's sides, read off the plan row's live grants
  const myAuthor = row.authors.find((g) => g.participantId === me.participantId && g.revokedAt === null);
  const myReviewer = row.reviewers.find(
    (g) => g.participantId === me.participantId && g.revokedAt === null && g.confirmedAt !== null,
  );
  const isOwner = me.membershipRole === 'owner';
  const status = statusBadge(row.workItem?.status ?? row.state);

  async function act(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      await action();
      await reload();
    } catch (error) {
      if (error instanceof RequestError) setNotice(error.body?.detail ?? error.body?.error ?? 'failed');
      else throw error;
    }
  }

  return (
    <div className="content">
      <h1 className="page" style={{ fontFamily: 'var(--mono, monospace)' }}>
        {row.documentReference}
      </h1>
      <p className="page-sub">
        {row.workItem?.title ?? 'Reference material'} · produced by {row.producingOrganisationName} ·{' '}
        <Badge tone={status.tone}>{status.label}</Badge>
        {cycle && (
          <>
            {' '}
            · pen with <b>{cycle.editLockHolder === 'reviewing' ? 'the review group' : 'the authoring team'}</b>
          </>
        )}
        {row.deliverableCode && (
          <>
            {' '}
            · verdict <Badge tone="slate">{row.deliverableCode.code}</Badge>
          </>
        )}
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {notice && <Badge tone="red">{notice}</Badge>}
        {draft && myAuthor && (
          <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${me.projectId}/editor/${draft.id}`)}>
            Open the draft in the Editor
          </Button>
        )}
        {draft && myAuthor?.isLead && cycle?.state === 'active' && (
          <Button size="sm" variant="primary" onClick={() => void act(() => api.promoteDocument(draft.id))}>
            Promote the next version
          </Button>
        )}
        {cycle?.state === 'active' && (myAuthor?.isLead || isOwner) && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (window.confirm('Close this deliverable as rejected? It stays on the record and never grounds.')) {
                void act(() => api.closeRejected(cycle.id));
              }
            }}
          >
            Close as rejected
          </Button>
        )}
      </div>

      {!cycle && (
        <Card>
          <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>
            Not yet promoted — the review cycle launches when the lead author promotes the first
            version from the sandbox draft.
          </div>
        </Card>
      )}

      {cycle &&
        [...cycle.rounds].reverse().map((round) => (
          <RoundCard
            key={round.id}
            round={round}
            cycleState={cycle.state}
            codes={codes}
            renditions={renditionsByVersion[round.versionId] ?? []}
            canComment={round.state === 'open' && !!myReviewer && cycle.state === 'active'}
            canModerate={round.state === 'open' && (myReviewer?.isLead ?? false)}
            canRespond={round.state === 'issued' && !!myAuthor && cycle.state === 'active'}
            act={act}
          />
        ))}
    </div>
  );
}

function RoundCard(props: {
  round: Round;
  cycleState: ReviewCycle['state'];
  codes: AcceptanceCode[];
  renditions: Rendition[];
  canComment: boolean;
  canModerate: boolean;
  canRespond: boolean;
  act: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const { round, codes, renditions } = props;
  const [commentBody, setCommentBody] = useState('');
  const [commentCode, setCommentCode] = useState('');
  const [verdict, setVerdict] = useState(round.deliverableCode?.id ?? '');
  const roundState = statusBadge(round.state);

  return (
    <>
      <SectionLabel>
        Round {round.number} · {round.versionReference}
      </SectionLabel>
      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone={roundState.tone}>{roundState.label}</Badge>
            {round.deliverableCode && (
              <Badge tone={round.deliverableCode.isAccepting ? 'green' : 'amber'}>
                {round.deliverableCode.code} — {round.deliverableCode.description}
              </Badge>
            )}
            <span style={{ flex: 1 }} />
            {renditions.map((r) => (
              <a
                key={r.id}
                href={`/renditions/${r.id}/file`}
                style={{ fontSize: 12, color: 'var(--muted)' }}
              >
                ⬇ {r.kind === 'pdf' ? 'PDF (review rendition)' : `native .${r.format}`}
              </a>
            ))}
          </div>

          {round.comments.length === 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {round.state === 'open'
                ? 'No comments yet — the round is open to the review group.'
                : 'No comments were recorded in this round.'}
            </span>
          )}
          {round.comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} canRespond={props.canRespond} act={props.act} />
          ))}

          {props.canComment && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                placeholder="Add a review comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                style={{ ...field, flex: 1, minHeight: 54 }}
              />
              <select value={commentCode} onChange={(e) => setCommentCode(e.target.value)} style={field}>
                <option value="">no code</option>
                {codes
                  .filter((c) => c.level !== 'deliverable')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.description}
                    </option>
                  ))}
              </select>
              <Button
                size="sm"
                variant="primary"
                disabled={!commentBody.trim()}
                onClick={() =>
                  void props
                    .act(() =>
                      api.addReviewComment(round.id, {
                        body: commentBody.trim(),
                        ...(commentCode && { acceptanceCodeId: commentCode }),
                      }),
                    )
                    .then(() => {
                      setCommentBody('');
                      setCommentCode('');
                    })
                }
              >
                Comment
              </Button>
            </div>
          )}

          {props.canModerate && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
              <span style={{ color: 'var(--muted)' }}>Deliverable verdict</span>
              <select value={verdict} onChange={(e) => setVerdict(e.target.value)} style={field}>
                <option value="">choose a code…</option>
                {codes
                  .filter((c) => c.level !== 'comment')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.description}
                      {c.isAccepting ? ' (accepting)' : ''}
                    </option>
                  ))}
              </select>
              {verdict && verdict !== round.deliverableCode?.id && (
                <Button size="sm" variant="quiet" onClick={() => void props.act(() => api.setDeliverableCode(round.id, verdict))}>
                  Set verdict
                </Button>
              )}
              <span style={{ flex: 1 }} />
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  if (window.confirm('Close and issue this round? The snapshot freezes and the pen changes hands.')) {
                    void props.act(() => api.issueRound(round.id));
                  }
                }}
              >
                Close &amp; issue the round
              </Button>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function CommentRow(props: {
  comment: ReviewComment;
  canRespond: boolean;
  act: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const { comment } = props;
  const [responding, setResponding] = useState(false);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('addressed in the next revision');

  return (
    <div style={{ borderLeft: '2px solid var(--hairline)', paddingLeft: 10, display: 'grid', gap: 4 }}>
      <div>
        <b>{comment.author.name}</b>{' '}
        {comment.acceptanceCode && <Badge tone="slate">{comment.acceptanceCode.code}</Badge>}{' '}
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      {comment.anchor?.quote && (
        <div style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
          “{comment.anchor.quote}”{comment.anchor.page !== undefined && ` — p.${comment.anchor.page}`}
        </div>
      )}
      <div>{comment.body}</div>
      {comment.response && (
        <div style={{ background: 'var(--panel)', borderRadius: 6, padding: '6px 10px' }}>
          <b>Response</b> · {comment.response.body}
          {comment.response.noChangeReason && (
            <span style={{ color: 'var(--muted)' }}> — {comment.response.noChangeReason}</span>
          )}
        </div>
      )}
      {props.canRespond && !comment.response && !responding && (
        <div>
          <Button size="sm" variant="quiet" onClick={() => setResponding(true)}>
            Respond
          </Button>
        </div>
      )}
      {props.canRespond && !comment.response && responding && (
        <div style={{ display: 'grid', gap: 6 }}>
          <textarea
            placeholder="The response — how the comment is addressed…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ ...field, minHeight: 44 }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, flex: 1 }} />
            <Button
              size="sm"
              variant="primary"
              disabled={!body.trim() || !reason.trim()}
              onClick={() =>
                void props.act(() => api.respondToComment(comment.id, body.trim(), reason.trim()))
              }
            >
              Record the response
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const field = {
  font: 'inherit',
  fontSize: 13,
  border: '1px solid var(--hairline)',
  borderRadius: 6,
  padding: '7px 10px',
  background: 'var(--panel)',
  color: 'var(--ink)',
} as const;
