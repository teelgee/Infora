// T-127 — the deliverable's cycle page (ADR-0005–0014/0032): the DRR made a
// screen. Rounds newest-first with their comments, codes, responses and
// transmittals; the actions each role holds at each phase — reviewers
// comment and code while open, the lead reviewer sets the verdict and
// issues, the authoring side responds and re-promotes, the lead author or
// owner may close-rejected. Review happens against the frozen version; the
// full in-PDF anchored viewer is the noted follow-up (anchors here are
// quote/page fields; the PDF rendition downloads beside each round).
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
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
import { Download, X } from 'lucide-react';
import { Badge, Button, Card, Field, Modal, SectionLabel, SelectInput, Skeleton, TextArea } from '@infora/ui';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { formatDateTime, statusBadge } from './shared';

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
  // the multi-step close-as-rejected flow (T-194): confirm → reason → confirm
  const [rejectStep, setRejectStep] = useState<'confirm' | 'reason' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

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
      setLoadError(error instanceof RequestError ? describeApiError(errorCode(error)) : 'Could not load this deliverable.');
    }
  }, [containerId, me.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!containerId) return null;
  if (loadError) {
    return (
      <div className="content">
        <p style={{ color: 'var(--text-muted)' }}>{loadError}</p>
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="content">
        {loaded ? (
          <p style={{ color: 'var(--text-muted)' }}>This deliverable is not on a plan you can see.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <Skeleton height={28} width="40%" />
            <Skeleton height={16} width="70%" />
            <Skeleton height={320} />
          </div>
        )}
      </div>
    );
  }

  // the requester's sides, read off the plan row's live grants
  const myAuthor = row.authors.find((g) => g.participantId === me.participantId && g.revokedAt === null);
  const myReviewer = row.reviewers.find(
    (g) => g.participantId === me.participantId && g.revokedAt === null && g.confirmedAt !== null,
  );
  const status = statusBadge(row.workItem?.status ?? row.state);

  async function act(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      await action();
      await reload();
    } catch (error) {
      if (error instanceof RequestError) setNotice(describeApiError(errorCode(error)));
      else throw error;
    }
  }

  const verdictLabel = row.deliverableCode
    ? `${row.deliverableCode.code}${
        codes.find((c) => c.code === row.deliverableCode!.code)?.description
          ? ` — ${codes.find((c) => c.code === row.deliverableCode!.code)!.description}`
          : ''
      }`
    : null;

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page" style={{ fontFamily: 'var(--primitive-font-family-mono)' }}>
            {row.documentReference}
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {row.workItem?.title ?? 'Reference material'} · produced by {row.producingOrganisationName} ·{' '}
            <Badge tone={status.tone}>{status.label}</Badge>
            {cycle && cycle.state === 'active' && (
              <>
                {' '}
                · pen with <b>{cycle.editLockHolder === 'reviewing' ? 'the review group' : 'the authoring team'}</b>
              </>
            )}
            {verdictLabel && (
              <>
                {' '}
                · verdict <Badge tone="info">{verdictLabel}</Badge>
              </>
            )}
          </p>
        </div>
        {/* actions, right-aligned; the destructive close is set apart from the
            primary promote by a divider so it never sits adjacent to it (T-226) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
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
          {/* Close-as-rejected is a governance-level, destructive act (→ container
              `rejected`, never grounds — ADR-0032/T-126), held by the elevated
              (super-user) tier, not a routine project-role power (T-174/T-133). It
              surfaces only to elevated participants. */}
          {cycle?.state === 'active' && me.elevated && (
            <>
              <span style={{ alignSelf: 'stretch', borderLeft: '1px solid var(--border-default)', margin: '2px 2px' }} />
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setRejectReason('');
                  setRejectStep('confirm');
                }}
              >
                Close as rejected
              </Button>
            </>
          )}
        </div>
      </div>

      {cycle?.state === 'closed_rejected' && (
        <div className="banner" style={{ marginBottom: 8 }}>
          Closed as rejected{cycle.closedReason ? ` — ${cycle.closedReason}` : ''}. The deliverable
          stays as a record and never grounds.
        </div>
      )}

      {notice && (
        <div className="banner banner--error" style={{ marginBottom: 8 }}>
          {notice}
          <button className="modal-x" aria-label="Dismiss" onClick={() => setNotice(null)} style={{ marginLeft: 'auto' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* the destructive stop is deliberately multi-step (T-194): confirm →
          reason → confirm, so it can't be triggered in one careless click */}
      {rejectStep && cycle && (
        <Modal
          open
          onClose={() => setRejectStep(null)}
          title="Close as rejected"
          size="sm"
          footer={
            rejectStep === 'confirm' ? (
              <>
                <Button variant="quiet" onClick={() => setRejectStep(null)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => setRejectStep('reason')}>
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button variant="quiet" onClick={() => setRejectStep('confirm')}>
                  Back
                </Button>
                <Button
                  variant="danger"
                  disabled={rejectBusy || rejectReason.trim() === ''}
                  onClick={async () => {
                    setRejectBusy(true);
                    await act(() => api.closeRejected(cycle.id, rejectReason.trim()));
                    setRejectBusy(false);
                    setRejectStep(null);
                  }}
                >
                  Close as rejected
                </Button>
              </>
            )
          }
        >
          {rejectStep === 'confirm' ? (
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              This permanently closes the review cycle as <b>rejected</b>. The deliverable stays as a
              record, is badged rejected, and never grounds — it cannot be reopened. Continue?
            </p>
          ) : (
            <Field label="Reason for rejection" hint="Recorded on the audit trail — say why it was rejected.">
              <TextArea
                value={rejectReason}
                onChange={setRejectReason}
                rows={3}
                placeholder="e.g. Superseded by a re-scoped deliverable; not to be resubmitted."
              />
            </Field>
          )}
        </Modal>
      )}

      {!cycle && (
        <Card>
          <div style={{ padding: 18, color: 'var(--text-muted)', fontSize: 13 }}>
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
  const [issuing, setIssuing] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const [draftAnchor, setDraftAnchor] = useState<CommentAnchor | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const roundState = statusBadge(round.state);
  const pdf = renditions.find((r) => r.kind === 'pdf') ?? null;

  return (
    <>
      <SectionLabel>
        Round {round.number} · {round.versionReference}
      </SectionLabel>
      <div style={{ display: 'grid', gap: 12, fontSize: 13, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={roundState.tone}>{roundState.label}</Badge>
          {round.deliverableCode && (
            <Badge tone={round.deliverableCode.isAccepting ? 'success' : 'warning'}>
              {round.deliverableCode.code} — {round.deliverableCode.description}
            </Badge>
          )}
          <span style={{ flex: 1 }} />
          {renditions.map((r) => (
            <a
              key={r.id}
              href={`/renditions/${r.id}/file`}
              style={{ fontSize: 12, color: 'var(--text-muted)' }}
            >
              <Download size={12} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              {r.kind === 'pdf' ? 'PDF (review rendition)' : `native .${r.format}`}
            </a>
          ))}
        </div>

        {/* T-131/tool-separation (design-rules.md §A) — the frozen version's
            PDF and the DRR are two independent Pane cards, not one card split
            by a border: the reviewer's tool is never visually merged with the
            document it's reviewing. The list↔region hover spans the split;
            the columns stack when the content area is too narrow for both. */}
        <div className="round-tray" style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 640px', minWidth: 0 }}>
            {pdf ? (
              <div className="review-viewer">
                {props.canComment && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
                    Select text on the page to quote it, or click to drop a point — then write the comment
                    alongside.
                  </div>
                )}
                <Suspense
                  fallback={<div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading the review PDF…</div>}
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
          </div>

          <div
            className="review-drr"
            style={{
              flex: '1 1 320px',
                minWidth: 280,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div
                style={{
                  overflowY: 'auto',
                  minHeight: 0,
                  flex: '1 1 auto',
                  display: 'grid',
                  gap: 12,
                  alignContent: 'start',
                }}
              >
                {round.comments.length === 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>
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
              </div>

              {props.canComment && (
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                  <AnchorChip anchor={draftAnchor} onClear={() => setDraftAnchor(null)} />
                  <textarea
                    placeholder="Add a review comment…"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    style={{ ...field, minHeight: 54 }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SelectInput
                        value={commentCode}
                        onChange={setCommentCode}
                        placeholder="no code"
                        options={codes
                          .filter((c) => c.level !== 'deliverable')
                          .map((c) => ({ value: c.id, label: `${c.code} — ${c.description}` }))}
                      />
                    </div>
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
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                    borderTop: '1px solid var(--border-default)',
                    paddingTop: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Deliverable verdict</span>
                  <SelectInput
                    value={verdict}
                    onChange={setVerdict}
                    placeholder="choose a code…"
                    options={codes
                      .filter((c) => c.level !== 'comment')
                      .map((c) => ({
                        value: c.id,
                        label: `${c.code} — ${c.description}${c.isAccepting ? ' (accepting)' : ''}`,
                      }))}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ flex: 1 }} />
                    <Button size="sm" variant="primary" disabled={!verdict} onClick={() => setIssuing(true)}>
                      Close &amp; issue the round
                    </Button>
                  </div>
                  <span className="field-hint">
                    A verdict is required to close the round. An accepting code (e.g. A1) publishes the deliverable to
                    the project library — the review is complete; any other code returns it to the authors for revision.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      {issuing &&
        (() => {
          const selected = codes.find((c) => c.id === verdict);
          const accepting = selected?.isAccepting ?? false;
          return (
            <Modal
              open
              onClose={() => setIssuing(false)}
              title="Close & issue the round"
              footer={
                <>
                  <Button variant="quiet" disabled={issueBusy} onClick={() => setIssuing(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={issueBusy}
                    onClick={async () => {
                      setIssueBusy(true);
                      await props.act(async () => {
                        if (verdict !== round.deliverableCode?.id) await api.setDeliverableCode(round.id, verdict);
                        await api.issueRound(round.id);
                      });
                      setIssueBusy(false);
                      setIssuing(false);
                    }}
                  >
                    {issueBusy
                      ? accepting
                        ? 'Publishing…'
                        : 'Issuing…'
                      : accepting
                        ? 'Accept & publish'
                        : 'Issue for revision'}
                  </Button>
                </>
              }
            >
              <p style={{ marginTop: 0 }}>
                Verdict:{' '}
                <Badge tone={accepting ? 'success' : 'warning'}>
                  {selected?.code} — {selected?.description}
                </Badge>
              </p>
              {accepting ? (
                <p>
                  This <strong>accepts the deliverable</strong>: the contractual revision is issued and it enters the{' '}
                  <strong>project library</strong>. The review is complete — no further edits.
                </p>
              ) : (
                <p>
                  The snapshot freezes and the pen returns to the authors for another round. This does <strong>not</strong>{' '}
                  publish to the library.
                </p>
              )}
            </Modal>
          );
        })()}
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
        borderLeft: `2px solid ${hovered ? 'var(--action-primary-bg)' : 'var(--border-default)'}`,
        background: hovered ? 'var(--surface-hover)' : 'transparent',
        borderRadius: hovered ? 'var(--control-sm)' : 0,
        paddingLeft: 10,
        display: 'grid',
        gap: 4,
      }}
    >
      <div>
        <b>{comment.author.name}</b>{' '}
        {comment.acceptanceCode && <Badge tone="info">{comment.acceptanceCode.code}</Badge>}{' '}
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {formatDateTime(comment.createdAt)}
        </span>
      </div>
      {comment.anchor?.quote && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
          “{comment.anchor.quote}”{comment.anchor.page !== undefined && ` — p.${comment.anchor.page}`}
        </div>
      )}
      <div>{comment.body}</div>
      {comment.response && (
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--primitive-radius-xs)', padding: '6px 10px' }}>
          <b>Response</b> · {comment.response.body}
          {comment.response.noChangeReason && (
            <span style={{ color: 'var(--text-muted)' }}> — {comment.response.noChangeReason}</span>
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
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
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
      <Badge tone="warning">anchored</Badge>
      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{label}</span>
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
    <div className="review-viewer">
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
        No PDF rendition for this version — shown as text until the office→PDF converter lands (ADR-0034). In-PDF
        anchoring resumes once the rendition exists.
      </div>
      {failed && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>The version text could not be read.</div>}
      {version && (
        <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 13, margin: 0 }}>{version.content}</pre>
      )}
    </div>
  );
}

const field = {
  font: 'inherit',
  fontSize: 13,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--control-sm)',
  padding: '7px 10px',
  background: 'var(--surface-sunken)',
  color: 'var(--text-primary)',
} as const;
