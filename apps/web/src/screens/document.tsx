// T-457 — THE DOCUMENT PAGE: one page per container, where every row, chip
// and link about a deliverable lands.
//
// *In plain terms: click a deliverable anywhere — the plan, the library, the
// side menu, a citation — and you arrive here. The page says what the
// document is and where it is in its life (the two badges), who can see it,
// every version it has had with the files to open, how it relates to other
// documents, its review record, where it has been sent, and what has
// happened to it. Editing its details, or working its review, is one click
// away, on the screens that already do that.*
//
// Before this page a deliverable was shown in four partial places: the plan
// row's modal, the library row's modal, the review status page's facts card
// and the side menu's text modal — none with a version history outside a
// review, none saying who may see it. This page composes the record the API
// already returns (the plan row, the cycle, the renditions, the transmittal
// log, the external issues, the ontology) and adds no new read. The four
// partial views retire under T-458, once the register's side panel (T-460)
// carries the quick edits the plan modal holds today.
//
// 🔒 Access is unchanged and resolved by the API: the row comes from the plan
// read (or the org-private qa-row read for an internal series), and a person
// outside the share gets "not on a plan you can see", never a page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router';
import { currencyWords } from '@infora/contracts';
import type {
  ContainerStateChange,
  GetContainerCurrencyResponse,
  LibraryAdmission,
  ExternalIssue,
  GetPassageResponse,
  GetVersionResponse,
  MeResponse,
  PlanRow,
  Rendition,
  ReviewCycle,
  RosterEntry,
  SandboxDocument,
  TransmittalHistoryRow,
} from '@infora/contracts';
import { Badge, Button, Markdown, SegmentedControl, Skeleton } from '@infora/ui';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { OntologyPanel } from '../ontology-panel';
import { useMe } from '../session';
import { VisibilityPanel } from '../visibility-panel';
import { SourceModal } from '../source-modal';
import { loadPassage, PassageText } from '../source-card';
import { TransmittalRow } from './deliverable-status';
import { DeliverableDetail } from './plan';
import { usePaletteActions } from '../command-palette';
import { ReviewRecordTable } from './review-record';
import { contextStateBadge, formatDate, formatDateTime, lifecycleBadgeOf } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };
type Tab = 'overview' | 'versions' | 'relationships' | 'record' | 'transmittals' | 'activity';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'versions', label: 'Versions' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'record', label: 'Review record' },
  { value: 'transmittals', label: 'Transmittals' },
  { value: 'activity', label: 'Activity' },
];

export function DocumentScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const { containerId } = useParams();
  const navigate = useNavigate();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';
  const isSuper = participant.elevated;

  const [row, setRow] = useState<PlanRow | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [draft, setDraft] = useState<SandboxDocument | null>(null);
  const [renditionsByVersion, setRenditions] = useState<Record<string, Rendition[]>>({});
  const [transmittals, setTransmittals] = useState<TransmittalHistoryRow[]>([]);
  const [externalIssues, setExternalIssues] = useState<ExternalIssue[]>([]);
  const [stateChanges, setStateChanges] = useState<ContainerStateChange[]>([]);
  // T-472 — who confirmed this reference document into the library, from its intake row
  const [admission, setAdmission] = useState<LibraryAdmission | null>(null);
  // T-473 — whether the owner's super user has confirmed this reference document
  // current, and when it is next due; null on a deliverable (no such card)
  const [currencyRead, setCurrencyRead] = useState<GetContainerCurrencyResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // T-468 — a citation lands here as ?version=<id>&passage=<chunk>: open that
  // version (even a superseded one outside the cycle's rounds) at the passage
  const [searchParams] = useSearchParams();
  const citedVersionId = searchParams.get('version');
  const citedChunkId = searchParams.get('passage');
  const [cited, setCited] = useState<GetPassageResponse | null>(null);
  const [tab, setTab] = useState<Tab>(citedVersionId ? 'versions' : 'overview');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setCited(null);
    if (citedVersionId && citedChunkId) {
      void loadPassage(citedVersionId, citedChunkId).then(setCited, () => setCited(null));
    }
  }, [citedVersionId, citedChunkId]);

  const reload = useCallback(async () => {
    if (!containerId) return;
    try {
      const [plan, cycleRead, docs, history, issues, rosterRead, changes, admitted, currencyAnswer] = await Promise.all([
        api.plan(projectId),
        api.cycle(containerId).catch(() => null),
        api.sandboxDocuments(projectId).catch(() => ({ items: [] as SandboxDocument[] })),
        api.containerTransmittals(containerId).catch(() => ({ items: [] as TransmittalHistoryRow[] })),
        api.containerExternalIssues(containerId).catch(() => ({ items: [] as ExternalIssue[] })),
        api.participants(projectId).catch(() => ({ items: [] as RosterEntry[] })),
        // T-465 — the document's own record of state changes
        api.containerStateChanges(containerId).catch(() => ({ items: [] as ContainerStateChange[] })),
        api.libraryAdmission(containerId).catch(() => ({ admission: null as LibraryAdmission | null })),
        api.containerCurrency(containerId).catch(() => null),
      ]);
      setAdmission(admitted.admission);
      setCurrencyRead(currencyAnswer);
      const planRow =
        (plan.items.find((r) => r.containerId === containerId) ?? null) ||
        (await api.qaRow(containerId).catch(() => null));
      setRow(planRow);
      setCycle(cycleRead);
      setDraft(docs.items.find((d) => d.containerId === containerId || d.freezeContainerId === containerId) ?? null);
      setTransmittals(history.items);
      setExternalIssues(issues.items);
      setStateChanges(changes.items);
      setRoster(rosterRead.items.filter((r) => r.removedAt === null));
      setLoaded(true);
      const wanted = new Set<string>(cycleRead?.rounds.map((r) => r.versionId) ?? []);
      if (planRow?.currentVersion) wanted.add(planRow.currentVersion.versionId);
      if (citedVersionId) wanted.add(citedVersionId);
      const entries = await Promise.all(
        [...wanted].map(async (v) => [v, await api.renditions(v).then((r) => r.items, () => [])] as const),
      );
      setRenditions(Object.fromEntries(entries));
    } catch (error) {
      setLoadError(error instanceof RequestError ? describeApiError(errorCode(error)) : 'Could not load this document.');
    }
  }, [containerId, projectId, citedVersionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // the versions, newest first: every reviewed revision, plus the current one
  // when it is a fresh issue outside the rounds (the accepted C revision)
  const versions = useMemo(() => {
    const out: Array<{ versionId: string; versionReference: string; createdAt: string | null; note: string }> = [];
    const rounds = cycle ? [...cycle.rounds].sort((a, b) => b.number - a.number) : [];
    for (const r of rounds) {
      out.push({
        versionId: r.versionId,
        versionReference: r.versionReference,
        createdAt: null,
        note: `Round ${r.number} — ${r.state}`,
      });
    }
    if (row?.currentVersion && !rounds.some((r) => r.versionId === row.currentVersion!.versionId)) {
      out.unshift({
        versionId: row.currentVersion.versionId,
        versionReference: row.currentVersion.versionReference,
        createdAt: row.currentVersion.createdAt,
        note: cycle?.state === 'accepted' ? 'Issued on acceptance — current' : 'Current',
      });
    }
    // T-468 — a cited version that is no longer in the rounds or current (a
    // superseded revision) must still open: the record's citations stay resolvable
    if (citedVersionId && !out.some((v) => v.versionId === citedVersionId)) {
      out.push({
        versionId: citedVersionId,
        versionReference: cited?.versionReference ?? 'Cited version',
        createdAt: null,
        note: 'Cited version',
      });
    }
    return out;
  }, [cycle, row, citedVersionId, cited]);

  // T-466 — this page's actions, in the palette while the page is open. A hook,
  // so it sits above the early returns; the row may still be loading.
  const paletteMayEdit =
    row !== null &&
    ((isSuper && (row.producingOrganisationId === me.organisationId || isOwner)) ||
      (row.producingOrganisationId === me.organisationId &&
        row.authors.some((a) => a.isLead && a.revokedAt === null && a.participantId === participant.participantId)));
  usePaletteActions(
    row === null || !containerId
      ? []
      : [
          ...(paletteMayEdit ? [{ id: 'edit-details', label: 'Edit details…', hint: 'This document', run: () => setEditing(true) }] : []),
          ...(draft ? [{ id: 'open-draft', label: 'Open the draft', hint: 'This document', run: () => void navigate(`/projects/${projectId}/editor/${draft.id}`) }] : []),
          ...(cycle || row.workItem ? [{ id: 'open-review', label: 'Open the review', hint: 'This document', run: () => void navigate(`/projects/${projectId}/review/${containerId}`) }] : []),
        ],
  );

  const confirmCurrent = async () => {
    if (!containerId) return;
    setConfirming(true);
    try {
      setCurrencyRead(await api.confirmCurrent(containerId));
    } catch {
      /* the card stays as it was; the next read says what is true */
    } finally {
      setConfirming(false);
    }
  };

  const indexAgain = async () => {
    if (!admission) return;
    try {
      await api.indexIntake(projectId, admission.intakeId);
    } catch {
      /* the line below stays; the next read says whether it worked */
    }
    await reload();
  };

  if (!containerId) return null;
  if (loadError) {
    return (
      <div className="content">
        <p style={{ color: 'var(--text-muted)' }}>{loadError}</p>
      </div>
    );
  }
  if (row === null && loaded && citedVersionId) {
    // no plan row this reader can see for the container: never a dead click —
    // the source view still shows the cited passage and the version's text
    return (
      <div className="content">
        <SourceModal
          versionId={citedVersionId}
          chunkId={citedChunkId ?? undefined}
          onClose={() => void navigate(-1)}
        />
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="content">
        {loaded ? (
          <p style={{ color: 'var(--text-muted)' }}>This document is not on a plan you can see.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <Skeleton height={28} width="40%" />
            <Skeleton height={320} />
          </div>
        )}
      </div>
    );
  }

  const lifecycle = lifecycleBadgeOf(row);
  const contextBadge = contextStateBadge(row.contextState);
  const isInternalQa = row.documentReference === null;
  const isRowLeadAuthor =
    row.producingOrganisationId === me.organisationId &&
    row.authors.some((a) => a.isLead && a.revokedAt === null && a.participantId === participant.participantId);
  const canEdit = isSuper && row.producingOrganisationId === me.organisationId;
  const mayEditDetails = canEdit || isRowLeadAuthor || (isSuper && isOwner);
  const authors = row.authors.filter((a) => a.revokedAt === null);
  const reviewers = row.reviewers.filter((r) => r.revokedAt === null);
  const title = row.workItem?.title ?? (isInternalQa ? (draft?.title ?? 'Working draft') : 'Reference material');

  return (
    <div className="content">
      {editing && (
        <DeliverableDetail
          row={row}
          projectId={projectId}
          roster={roster}
          canEdit={canEdit}
          isLeadAuthor={isRowLeadAuthor}
          isOwnerSuper={isSuper && isOwner}
          viewer={{
            organisationId: me.organisationId,
            organisationName: me.organisationName,
            isOwner,
            isOrgAdmin: me.orgRole === 'admin',
            ownerOrganisationName: participant.ownerOrganisationName,
          }}
          onChanged={() => void reload()}
          onClose={() => setEditing(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page" style={{ fontFamily: 'var(--primitive-font-family-mono)' }}>
            {row.documentReference ?? 'Internal QA'}
          </h1>
          <p className="page-sub" style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span>{title}</span>
            <span>· {row.producingOrganisationName}</span>
            {/* T-455 — the lifecycle badge pair: where it is, and whether the AI may use it */}
            <Badge tone={lifecycle.tone}>{lifecycle.label}</Badge>
            {contextBadge && <Badge tone={contextBadge.tone}>{contextBadge.label}</Badge>}
          </p>
        </div>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {mayEditDetails && (
            <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
              Edit details…
            </Button>
          )}
          {draft && (
            <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${projectId}/editor/${draft.id}`)}>
              Open the draft
            </Button>
          )}
          {(cycle || row.workItem) && (
            <Button size="sm" variant="primary" onClick={() => void navigate(`/projects/${projectId}/review/${containerId}`)}>
              Open the review
            </Button>
          )}
        </span>
      </div>

      <div style={{ margin: '12px 0 16px' }}>
        <SegmentedControl value={tab} onChange={setTab} options={TABS} label="Document page sections" />
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
          <Card label="Deliverable">
            <MetaRow k="Reference">
              <span className="mono">{row.documentReference ?? 'Internal QA — no coded reference'}</span>
            </MetaRow>
            <MetaRow k="Title">{title}</MetaRow>
            {row.description && <MetaRow k="What it is">{row.description}</MetaRow>}
            <MetaRow k="Producing organisation">{row.producingOrganisationName}</MetaRow>
            <MetaRow k="Where it is">
              <Badge tone={lifecycle.tone}>{lifecycle.label}</Badge>
            </MetaRow>
            <MetaRow k="AI reach">
              {contextBadge ? <Badge tone={contextBadge.tone}>{contextBadge.label}</Badge> : 'In the AI’s reach'}
            </MetaRow>
            {row.currentVersion && <MetaRow k="Current revision">{row.currentVersion.versionReference}</MetaRow>}
            {row.deliverableCode && (
              <MetaRow k="Verdict">{`${row.deliverableCode.code} — ${row.deliverableCode.description}`}</MetaRow>
            )}
            {row.withdrawnReason && (
              <MetaRow k={row.inLibrary ? 'Withdrawn' : 'Removed from plan'}>
                {row.withdrawnReason}
                {row.withdrawnBy && ` — ${row.withdrawnBy.name}`}
              </MetaRow>
            )}
            {row.documentOwner && <MetaRow k="Document owner">{row.documentOwner.name}</MetaRow>}
            {authors.length > 0 && (
              <MetaRow k="Authoring team">{authors.map((a) => `${a.name}${a.isLead ? ' (lead)' : ''}`).join(', ')}</MetaRow>
            )}
            {reviewers.length > 0 && (
              <MetaRow k="Review group">
                {reviewers
                  .map((r) => `${r.name}${r.isLead ? ' (lead)' : ''}${r.confirmedAt === null ? ' · proposed' : ''}`)
                  .join(', ')}
              </MetaRow>
            )}
          </Card>
          <Card>
            <VisibilityPanel
              row={row}
              roster={roster}
              viewer={{
                organisationId: me.organisationId,
                organisationName: me.organisationName,
                isOwner,
                isOrgAdmin: me.orgRole === 'admin',
                ownerOrganisationName: participant.ownerOrganisationName,
              }}
              onChanged={() => void reload()}
            />
          </Card>
          {currencyRead !== null && (
            <div style={{ gridColumn: '1 / -1' }}>
              <CurrencyCard
                read={currencyRead}
                mayConfirm={isOwner && isSuper}
                confirming={confirming}
                onConfirm={() => void confirmCurrent()}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <VersionsTab
          versions={versions}
          renditionsByVersion={renditionsByVersion}
          focus={citedVersionId ? { versionId: citedVersionId, passage: cited } : null}
        />
      )}

      {tab === 'relationships' && (
        <Card label="Classification and relationships">
          <OntologyPanel containerId={containerId} projectId={projectId} editable={canEdit || isRowLeadAuthor} />
        </Card>
      )}

      {tab === 'record' &&
        (cycle && cycle.rounds.length > 0 ? (
          <>
            <ReviewRecordTable rounds={cycle.rounds} />
            <p className="field-hint" style={{ marginTop: 8 }}>
              The record as this reader may see it; the review itself runs on{' '}
              <button className="linklike" onClick={() => void navigate(`/projects/${projectId}/review/${containerId}/record`)}>
                its own page
              </button>
              .
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No rounds yet — the record begins when the first version is promoted.
          </p>
        ))}

      {tab === 'transmittals' && (
        <TransmittalsTab transmittals={transmittals} externalIssues={externalIssues} isOwner={isOwner} />
      )}

      {tab === 'activity' && (
        <ActivityTab row={row} cycle={cycle} versions={versions} transmittals={transmittals} externalIssues={externalIssues} stateChanges={stateChanges} admission={admission} onIndexAgain={isOwner && isSuper && admission?.needsIndexing ? () => void indexAgain() : undefined} />
      )}
    </div>
  );
}

function Card(props: { label?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {props.label && (
        <div className="section-label" style={{ margin: '0 0 8px' }}>
          {props.label}
        </div>
      )}
      {props.children}
    </div>
  );
}

function MetaRow(props: { k: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '7px 0',
        fontSize: 12.5,
        borderBottom: '1px solid var(--border-subtle, var(--border-default))',
      }}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{props.k}</span>
      <span style={{ textAlign: 'right' }}>{props.children}</span>
    </div>
  );
}

/** Every version, newest first, each with its files; one opens inline. */
function VersionsTab(props: {
  versions: Array<{ versionId: string; versionReference: string; createdAt: string | null; note: string }>;
  renditionsByVersion: Record<string, Rendition[]>;
  /** T-468 — the cited version and its recorded passage, when arriving from a citation */
  focus?: { versionId: string; passage: GetPassageResponse | null } | null;
}) {
  const [openId, setOpenId] = useState<string | null>(props.focus?.versionId ?? props.versions[0]?.versionId ?? null);
  const [text, setText] = useState<GetVersionResponse | null>(null);
  const open = props.versions.find((v) => v.versionId === openId) ?? null;
  const renditions = open ? (props.renditionsByVersion[open.versionId] ?? []) : [];
  const pdf = renditions.find((r) => r.kind === 'pdf') ?? null;
  const native = renditions.find((r) => r.kind === 'native') ?? null;
  useEffect(() => {
    setText(null);
    if (open && !pdf) void api.version(open.versionId).then(setText, () => setText(null));
  }, [open, pdf]);

  const passage = open && props.focus?.versionId === open.versionId ? (props.focus.passage?.passage ?? null) : null;

  if (props.versions.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No versions yet — nothing has been promoted.</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 2fr)', gap: 16 }}>
      <Card label="Versions">
        <ul className="shelf-rows" aria-label="Versions">
          {props.versions.map((v) => (
            <li key={v.versionId} style={{ cursor: 'pointer' }} onClick={() => setOpenId(v.versionId)}>
              <span className="shelf-row-title" style={{ fontFamily: 'var(--primitive-font-family-mono)' }}>
                {v.versionReference}
                {openId === v.versionId && (
                  <>
                    {' '}
                    <Badge tone="neutral">open</Badge>
                  </>
                )}
              </span>
              <span className="shelf-row-note">
                {v.note}
                {v.createdAt && ` · ${formatDate(v.createdAt)}`}
                {(props.renditionsByVersion[v.versionId] ?? []).map((r) => (
                  <span key={r.id}>
                    {' · '}
                    <a href={`/renditions/${r.id}/file`} onClick={(e) => e.stopPropagation()}>
                      {r.kind === 'pdf' ? 'PDF' : `native .${r.format}`}
                    </a>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card label={open ? `${open.versionReference}` : undefined}>
        {!open ? null : pdf ? (
          <>
            {/* an <object> cannot be highlighted inside, so a PDF opens at the
                cited page and the verbatim passage rides above it */}
            {passage && (
              <p className="passage-banner" data-passage-banner>
                {passage.page !== undefined ? `The cited passage, on page ${passage.page}: ` : 'The cited passage: '}
                “{passage.verbatim}”
              </p>
            )}
          <object
            data={`/renditions/${pdf.id}/file${passage?.page !== undefined ? `#page=${passage.page}` : ''}`}
            type="application/pdf"
            style={{ width: '100%', height: '64vh', border: '1px solid var(--border-default)', borderRadius: 6 }}
          >
            <p style={{ color: 'var(--text-muted)' }}>
              Your browser can’t preview the PDF — <a href={`/renditions/${pdf.id}/file`}>download it</a>.
            </p>
          </object>
          </>
        ) : native && text === null ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            The native file <span className="mono">.{native.format}</span> is ready — <a href={`/renditions/${native.id}/file`}>download it</a>.
          </p>
        ) : text && passage ? (
          <PassageText content={text.content} passage={passage} />
        ) : text ? (
          <Markdown>{text.content}</Markdown>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
        )}
      </Card>
    </div>
  );
}

function TransmittalsTab(props: { transmittals: TransmittalHistoryRow[]; externalIssues: ExternalIssue[]; isOwner: boolean }) {
  if (props.transmittals.length === 0 && props.externalIssues.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Not issued to anyone yet.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {props.transmittals.length > 0 && (
        <Card label="Transmittals and acknowledgements">
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Kind</th>
                <th>Version</th>
                <th>Issued by</th>
                <th>Recipient</th>
                <th>Acknowledgement</th>
              </tr>
            </thead>
            <tbody>
              {props.transmittals.map((t) => (
                <TransmittalRow key={t.id} row={t} />
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.4 }}>
            {props.isOwner
              ? 'The full distribution record — every recipient organisation and its acknowledgement state.'
              : 'Your organisation’s view of the record; the owner holds the full distribution list.'}
          </p>
        </Card>
      )}
      {props.externalIssues.length > 0 && (
        <Card label="Issued outside the project">
          <ul className="shelf-rows" aria-label="External issues">
            {props.externalIssues.map((i) => (
              <li key={i.id}>
                <span className="shelf-row-title">
                  {i.recipientName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({i.recipientEmail})</span>
                </span>
                <span className="shelf-row-note">
                  {i.versionReference} · {i.state} · {formatDate(i.createdAt)}
                  {i.expiresAt && ` · link expires ${formatDate(i.expiresAt)}`}
                  {i.openedAt && ` · opened ${formatDate(i.openedAt)}`}
                  {' · '}
                  {i.reason}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * What happened to this document, newest first, composed from the record:
 * versions, the review rounds' events, issues and the record-state acts.
 * The AI run audit (what an answer read) is NOT here — it is the producing
 * organisation's own record and lives on the History screen (ADR-0039 §4).
 */
function ActivityTab(props: {
  stateChanges: ContainerStateChange[];
  row: PlanRow;
  cycle: ReviewCycle | null;
  versions: Array<{ versionId: string; versionReference: string; createdAt: string | null; note: string }>;
  transmittals: TransmittalHistoryRow[];
  externalIssues: ExternalIssue[];
  admission: LibraryAdmission | null;
  /** the owner's super user may re-run indexing for an admitted file the index call failed on */
  onIndexAgain?: (() => void) | undefined;
}) {
  const events: Array<{ at: string; what: string; who?: string }> = [];
  // T-472 — reference material enters the library by a person's confirmation
  if (props.admission) {
    events.push({
      at: props.admission.confirmedAt,
      what: `Added to the library by ${props.admission.confirmedBy.name} on ${formatDate(props.admission.confirmedAt)}`,
    });
    if (props.admission.needsIndexing) {
      events.push({
        at: props.admission.confirmedAt,
        what: 'Not yet indexed — the AI cannot read this document until it is',
      });
    }
  }
  for (const t of props.transmittals) {
    const what =
      t.kind === 'review'
        ? t.direction === 'return'
          ? `Submitted ${t.versionReference ?? ''} for review${t.roundNumber ? ` (round ${t.roundNumber})` : ''}`
          : `Round ${t.roundNumber ?? ''} issued back to the authoring team`
        : t.kind === 'external'
          ? `Issued ${t.versionReference ?? ''} outside the project`
          : `Issued ${t.versionReference ?? ''} to ${t.recipientsWithheld ? 'an organisation' : t.recipientOrganisations.map((r) => r.organisationName).join(', ')}`;
    events.push({ at: t.issuedAt, what, who: t.sender.name });
  }
  for (const r of props.cycle?.rounds ?? []) {
    if (r.acknowledgedAt && r.acknowledgedBy) {
      events.push({ at: r.acknowledgedAt, what: `Round ${r.number} acknowledged — the round opened`, who: r.acknowledgedBy.name });
    }
    for (const c of r.reviewerCompletions) {
      events.push({ at: c.completedAt, what: `Round ${r.number}: review marked complete`, who: c.name });
    }
  }
  if (props.cycle?.closedAt) {
    events.push({
      at: props.cycle.closedAt,
      what:
        props.cycle.state === 'accepted'
          ? `Accepted${props.row.deliverableCode ? ` — ${props.row.deliverableCode.code}` : ''}`
          : `Closed as rejected${props.cycle.closedReason ? ` — ${props.cycle.closedReason}` : ''}`,
    });
  }
  for (const v of props.versions) {
    if (v.createdAt) events.push({ at: v.createdAt, what: `${v.versionReference} issued — ${v.note.toLowerCase()}` });
  }
  for (const i of props.externalIssues) {
    events.push({ at: i.createdAt, what: `External issue to ${i.recipientName} — ${i.state}`, who: i.requestedBy.name });
    if (i.openedAt) events.push({ at: i.openedAt, what: `${i.recipientName} opened the link` });
  }
  // T-465 — the record of state changes, dated; a proposed withdrawal (state
  // untouched) still reads off the row until the owner answers
  for (const ch of props.stateChanges) {
    const what =
      ch.toState === 'withdrawn'
        ? `${props.row.inLibrary ? 'Withdrawn from the library' : 'Removed from the plan'}${ch.reason ? ` — ${ch.reason}` : ''}`
        : ch.toState === 'superseded'
          ? `Superseded${ch.reason ? ` — ${ch.reason}` : ''}`
          : ch.fromState === 'withdrawn'
            ? `Restored to the ${props.row.inLibrary ? 'library' : 'plan'}`
            : `Back to live${ch.reason ? ` — ${ch.reason}` : ''}`;
    events.push({ at: ch.changedAt, what, who: ch.changedBy.name });
  }
  if (props.row.withdrawnReason && props.row.withdrawnBy && props.row.state === 'live') {
    events.push({ at: '', what: `Withdrawal proposed — ${props.row.withdrawnReason}`, who: props.row.withdrawnBy.name });
  }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  if (events.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing has happened to this document yet beyond its planning.</p>;
  }
  return (
    <Card label="What happened">
      <ul className="shelf-rows" aria-label="Activity">
        {events.map((e, i) => (
          <li key={i}>
            <span className="shelf-row-title" style={{ fontWeight: 500 }}>{e.what}</span>
            {props.onIndexAgain && e.what.startsWith('Not yet indexed') && (
              <Button size="sm" variant="quiet" onClick={props.onIndexAgain}>
                Index again
              </Button>
            )}
            <span className="shelf-row-note">
              {e.at ? formatDateTime(e.at) : 'date not on this read'}
              {e.who && ` · ${e.who}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="field-hint" style={{ marginTop: 8 }}>
        What the AI read for an answer is the producing organisation’s own run record, on the History screen, not here.
      </p>
    </Card>
  );
}

/** T-473 — is this reference document still the one to rely on, who said so, and when it is next due. */
export function CurrencyCard(props: {
  read: GetContainerCurrencyResponse;
  mayConfirm: boolean;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const { currency, intervalMonths } = props.read;
  const words = currencyWords(currency);
  return (
    <Card label="Currency">
      <MetaRow k="State">
        <span data-currency={currency.state}>
          {currency.state === 'confirmed' ? (
            <Badge tone="success">Confirmed current</Badge>
          ) : currency.state === 'overdue' ? (
            <Badge tone="warning">Re-check overdue</Badge>
          ) : (
            <Badge tone="warning">Not confirmed current</Badge>
          )}
        </span>
      </MetaRow>
      {words !== null && <MetaRow k="What that means">{words}</MetaRow>}
      {currency.confirmedAt !== null && (
        <MetaRow k="Last confirmed">
          {currency.confirmedBy ?? 'A colleague who has since left'} on {formatDate(currency.confirmedAt)}
        </MetaRow>
      )}
      {currency.recheckDue !== null && <MetaRow k="Re-check due">{formatDate(currency.recheckDue)}</MetaRow>}
      <MetaRow k="Next confirmation">
        {`would run for ${intervalMonths} month${intervalMonths === 1 ? '' : 's'}, the project's interval for this kind of document`}
      </MetaRow>
      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
        A document nobody has confirmed is still read by the AI; every citation of it says so.
      </p>
      {props.mayConfirm && (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="primary" disabled={props.confirming} onClick={props.onConfirm}>
            Confirm current
          </Button>
        </div>
      )}
    </Card>
  );
}
