// T-127 — the deliverable's cycle page (ADR-0005–0014/0032): the DRR made a
// screen. Rounds newest-first with their comments, codes, responses and
// transmittals; the actions each role holds at each phase — reviewers
// comment and code while open, the lead reviewer sets the verdict and
// issues, the authoring side responds and re-promotes, the lead author or
// owner may close-rejected. Review happens against the frozen version; the
// full in-PDF anchored viewer is the noted follow-up (anchors here are
// quote/page fields; the PDF rendition downloads beside each round).
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type {
  AcceptanceCode,
  CommentAnchor,
  GetVersionResponse,
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

// pdf.js is heavy and only the cycle page renders it — split it into its own
// chunk (loaded when a round with a PDF rendition mounts), not the main bundle.
const ReviewPdf = lazy(() => import('../pdf-review').then((m) => ({ default: m.ReviewPdf })));

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
  const [draftAnchor, setDraftAnchor] = useState<CommentAnchor | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const roundState = statusBadge(round.state);
  const pdf = renditions.find((r) => r.kind === 'pdf') ?? null;

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

          {/* The review surface itself: the frozen version's PDF, anchors
              painted from the stored fields. This round paints only its own
              version's rendition, so anchors never migrate forward. */}
          {pdf ? (
            <div
              className="review-viewer"
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--hairline)',
                borderRadius: 8,
                padding: 12,
                maxHeight: 560,
                overflow: 'auto',
              }}
            >
              {props.canComment && (
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
                  Select text on the page to quote it, or click to drop a point — then write the comment below.
                </div>
              )}
              <Suspense
                fallback={<div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading the review PDF…</div>}
              >
                <ReviewPdf
                  renditionId={pdf.id}
                  comments={round.comments}
                  interactive={props.canComment}
                  draft={draftAnchor}
                  onDraft={setDraftAnchor}
                  hoveredCommentId={hovered}
                  onHoverComment={setHovered}
                />
              </Suspense>
            </div>
          ) : (
            <TextFallback versionId={round.versionId} />
          )}

          {round.comments.length === 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {round.state === 'open'
                ? 'No comments yet — the round is open to the review group.'
                : 'No comments were recorded in this round.'}
            </span>
          )}
          {round.comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              canRespond={props.canRespond}
              act={props.act}
              hovered={hovered === comment.id}
              onHover={setHovered}
            />
          ))}

          {props.canComment && (
            <div style={{ display: 'grid', gap: 8 }}>
              <AnchorChip anchor={draftAnchor} onClear={() => setDraftAnchor(null)} />
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
                          ...(draftAnchor && { anchor: draftAnchor }),
                        }),
                      )
                      .then(() => {
                        setCommentBody('');
                        setCommentCode('');
                        setDraftAnchor(null);
                      })
                  }
                >
                  Comment
                </Button>
              </div>
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
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const { comment, hovered, onHover } = props;
  const [responding, setResponding] = useState(false);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('addressed in the next revision');

  return (
    <div
      onMouseEnter={() => onHover(comment.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        borderLeft: `2px solid ${hovered ? 'var(--accent, #c89600)' : 'var(--hairline)'}`,
        background: hovered ? 'var(--panel)' : 'transparent',
        borderRadius: hovered ? 4 : 0,
        paddingLeft: 10,
        display: 'grid',
        gap: 4,
      }}
    >
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

// The pending anchor beside the comment form: what the reviewer selected or
// dropped, and a way to drop it (an unanchored comment is still valid).
function AnchorChip(props: { anchor: CommentAnchor | null; onClear: () => void }) {
  const { anchor } = props;
  if (!anchor) {
    return (
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
        No anchor — the comment will attach to the round, not a passage.
      </span>
    );
  }
  const label = anchor.quote
    ? `“${anchor.quote.length > 80 ? `${anchor.quote.slice(0, 80)}…` : anchor.quote}” — p.${anchor.page}`
    : anchor.point
      ? `Dropped point · p.${anchor.page}`
      : `Anchored · p.${anchor.page}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <Badge tone="amber">anchored</Badge>
      <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{label}</span>
      <Button size="sm" variant="quiet" onClick={props.onClear}>
        Clear anchor
      </Button>
    </span>
  );
}

// The honest fallback for a version with no PDF rendition (uploaded natives,
// pre-converter — ADR-0034): read the frozen text, anchor overlays wait on
// the render. Downloads still sit beside the round.
function TextFallback(props: { versionId: string }) {
  const [version, setVersion] = useState<GetVersionResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.version(props.versionId).then(
      (v) => live && setVersion(v),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [props.versionId]);
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--hairline)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
        No PDF rendition for this version — shown as text until the office→PDF converter lands (ADR-0034). In-PDF
        anchoring resumes once the rendition exists.
      </div>
      {failed && <div style={{ color: 'var(--muted)', fontSize: 13 }}>The version text could not be read.</div>}
      {version && (
        <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 13, margin: 0 }}>{version.content}</pre>
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
