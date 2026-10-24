// T-472 — THE INTAKE SCREEN: where uploaded reference material is checked.
//
// *In plain terms: every file the owner's super user has dropped on the library
// waits here, with the AI's proposed title and classification filled in and a
// word beside each guess — confident, likely or unsure. Correct what is wrong,
// tick the rows you are happy with and confirm them together, or confirm one
// at a time. Nothing in this list can be read by the AI until you confirm it,
// and rejecting a file deletes it.*
//
// The screen fetches; `IntakeTable` renders. They are split so the table — the
// part with sentences in it — can be rendered in a test without a network.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type {
  BulkConfirmIntakeBody,
  ClassificationFacet,
  ClassificationSchemeResponse,
  ClassificationTerm,
  ConfirmIntakeResult,
  IntakeConfidence,
  IntakeRow,
  ListReferenceIntakeResponse,
  MeResponse,
} from '@infora/contracts';
import { Badge, Button, PageIntro, Register, SelectInput } from '@infora/ui';
import type { RegisterColumn } from '@infora/ui';
import { api } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { describeTextStatus } from '../reference-intake-words';

type ShellContext = { participant: MeResponse['participants'][number] };

/** what the person has typed and chosen on one row (starts from the proposal) */
export type Edit = { title: string; terms: Record<string, string> };

/** a facet with the live terms a person may choose from */
export type IntakeFacet = ClassificationFacet & { terms: ClassificationTerm[] };

const PAGE_SIZE = 50;

export function startingEdit(row: IntakeRow): Edit {
  const terms: Record<string, string> = {};
  for (const c of row.proposedClassifications ?? []) terms[c.facetId] = c.termId;
  return { title: row.proposedTitle, terms };
}

/** What the person settled on for the given rows — ids and the corrected fields, as the bulk door takes them. */
export function bulkConfirmBody(rows: readonly IntakeRow[], edits: Record<string, Edit>): BulkConfirmIntakeBody {
  return {
    items: rows.map((r) => {
      const e = edits[r.id] ?? startingEdit(r);
      return {
        id: r.id,
        title: e.title.trim(),
        classifications: Object.entries(e.terms).map(([facetId, termId]) => ({ facetId, termId })),
      };
    }),
  };
}

export function IntakeTable(props: {
  rows: readonly IntakeRow[] | null;
  facets: readonly IntakeFacet[];
  edits: Record<string, Edit>;
  /** the project's AI switch for proposing — off, the table says so and the person fills the fields */
  proposalsOn: boolean;
  busy: boolean;
  selected: ReadonlySet<string>;
  onSelect: (selected: Set<string>) => void;
  onTitle: (id: string, title: string) => void;
  onTerm: (id: string, facetId: string, termId: string) => void;
  onConfirm: (ids: string[]) => void;
  onReject: (row: IntakeRow) => void;
  page?: { page: number; pageSize: number; total: number; onPage: (page: number) => void };
}) {
  const columns: RegisterColumn<IntakeRow>[] = [
    {
      key: 'file',
      label: 'File',
      render: (r) => (
        <div>
          <div className="mono" style={{ fontSize: 13 }}>{r.originalFilename}</div>
          {r.readable ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.format.toUpperCase()} · text read</span>
          ) : (
            <span style={{ fontSize: 12.5 }}>
              <Badge tone="warning">{describeTextStatus(r.textStatus)}</Badge>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                No proposal — no readable text. Held but not citable if confirmed.
              </div>
            </span>
          )}
          {r.readable && !props.proposalsOn && r.proposedClassifications === null && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
              No proposal — the AI is switched off for this project
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      render: (r) => (
        <input
          className="field-input"
          aria-label={`Title for ${r.originalFilename}`}
          value={props.edits[r.id]?.title ?? r.proposedTitle}
          onChange={(e) => props.onTitle(r.id, e.target.value)}
        />
      ),
    },
    ...props.facets.map(
      (f): RegisterColumn<IntakeRow> => ({
        key: f.key,
        label: f.name,
        hideable: true,
        render: (r) => {
          const chosen = props.edits[r.id]?.terms[f.id] ?? startingEdit(r).terms[f.id] ?? '';
          const proposal = r.proposedClassifications?.find((c) => c.facetId === f.id);
          const word: IntakeConfidence | null = proposal !== undefined && proposal.termId === chosen ? proposal.confidence : null;
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <SelectInput
                ariaLabel={`${f.name} for ${r.originalFilename}`}
                value={chosen}
                placeholder="—"
                onChange={(v) => props.onTerm(r.id, f.id, v)}
                options={f.terms.map((t) => ({ value: t.id, label: t.label }))}
              />
              {word !== null && (
                <Badge tone={word === 'confident' ? 'success' : word === 'likely' ? 'info' : 'neutral'}>{word}</Badge>
              )}
            </span>
          );
        },
      }),
    ),
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="primary" disabled={props.busy} onClick={() => props.onConfirm([r.id])} aria-label={`Confirm ${r.originalFilename}`}>
            Confirm
          </Button>
          <Button size="sm" variant="quiet" disabled={props.busy} onClick={() => props.onReject(r)} aria-label={`Reject ${r.originalFilename}`}>
            Reject
          </Button>
        </span>
      ),
    },
  ];
  return (
    <Register<IntakeRow>
      label="Reference material intake"
      columns={columns}
      rows={props.rows}
      rowKey={(r) => r.id}
      rowLabel={(r) => r.originalFilename}
      selection={{
        selected: props.selected,
        onChange: props.onSelect,
        bar: (ids) => (
          <Button size="sm" variant="primary" disabled={props.busy} onClick={() => props.onConfirm(ids)}>
            Confirm selected
          </Button>
        ),
      }}
      {...(props.page !== undefined && { page: props.page })}
      empty="Nothing is waiting. Add reference material from the library screen."
    />
  );
}

export function ReferenceIntakeScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const navigate = useNavigate();
  const mayReview = participant.membershipRole === 'owner' && participant.elevated;
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<ListReferenceIntakeResponse | null>(null);
  const [scheme, setScheme] = useState<ClassificationSchemeResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // confirmed files the index call failed on — in the library, not yet readable by the AI
  const [unindexed, setUnindexed] = useState<IntakeRow[]>([]);

  const load = useCallback(async () => {
    const [q, sc, done] = await Promise.all([
      api.referenceIntake(projectId, { status: 'proposed', page, pageSize: PAGE_SIZE }),
      api.classificationScheme(projectId),
      api.referenceIntake(projectId, { status: 'confirmed', pageSize: PAGE_SIZE }),
    ]);
    setUnindexed(done.items.filter((r) => r.needsIndexing));
    setQueue(q);
    setScheme(sc);
    setEdits((current) => {
      const next = { ...current };
      for (const row of q.items) next[row.id] ??= startingEdit(row);
      return next;
    });
  }, [projectId, page]);
  useEffect(() => {
    if (mayReview) void load().catch(() => setNote('Could not load the intake queue — try again.'));
  }, [load, mayReview]);

  // facets with at least one live term: an empty facet (work packages) has nothing to choose
  const facets = useMemo(
    () =>
      (scheme?.facets ?? [])
        .map((f) => ({ ...f, terms: f.terms.filter((t) => t.retiredAt === null) }))
        .filter((f) => f.terms.length > 0),
    [scheme],
  );

  if (!mayReview) {
    return (
      <div className="content">
        <h1 className="page">Reference material intake</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Incoming reference material is checked by the project owner’s super user.
        </p>
      </div>
    );
  }

  const editRow = (id: string, patch: Partial<Edit>) =>
    setEdits((current) => ({ ...current, [id]: { title: '', terms: {}, ...current[id], ...patch } }));
  const setTerm = (id: string, facetId: string, termId: string) => {
    const terms = { ...(edits[id]?.terms ?? {}) };
    if (termId === '') delete terms[facetId];
    else terms[facetId] = termId;
    editRow(id, { terms });
  };
  const wordsFor = (r: ConfirmIntakeResult, name: string) => (r.ok ? null : `${name}: ${describeApiError(r.reason)}`);

  async function confirm(ids: string[]) {
    const rows = (queue?.items ?? []).filter((r) => ids.includes(r.id));
    if (rows.some((r) => (edits[r.id]?.title.trim() ?? r.proposedTitle.trim()) === '')) {
      setNote('Every file needs a title before it can be confirmed.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const result = await api.confirmIntakeBulk(projectId, bulkConfirmBody(rows, edits));
      const names = new Map(rows.map((r) => [r.id, r.originalFilename]));
      const failures = result.results.map((r) => wordsFor(r, names.get(r.id) ?? 'A file')).filter((x): x is string => x !== null);
      const held = result.results.filter((r) => r.ok && r.notCitable).length;
      const unindexed = result.results.filter((r) => r.ok && !r.indexed).length;
      setNote(
        [
          `Confirmed ${result.confirmed} — ${result.confirmed === 1 ? 'it is' : 'they are'} now in the library.`,
          held > 0 ? `${held} ${held === 1 ? 'is' : 'are'} held but not citable, because there is no readable text.` : null,
          unindexed > 0 ? `${unindexed} ${unindexed === 1 ? 'is' : 'are'} in the library but could not be indexed for the AI to read yet — use “Index again” below.` : null,
          failures.length > 0 ? `Not confirmed — ${failures.join(' · ')}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      setSelected(new Set());
      await load();
    } catch {
      setNote('Could not confirm — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reject(row: IntakeRow) {
    setBusy(true);
    try {
      await api.rejectIntake(projectId, row.id);
      setNote(`${row.originalFilename} rejected and deleted.`);
      setSelected((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch {
      setNote('Could not reject — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function indexAgain(row: IntakeRow) {
    setBusy(true);
    try {
      await api.indexIntake(projectId, row.id);
      setNote(`${row.originalFilename} is indexed — the AI can read it now.`);
      await load();
    } catch (error) {
      setNote(describeApiError(errorCode(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <h1 className="page">Reference material intake</h1>
      <PageIntro
        line="Files you have added wait here until you confirm them. Nothing on this page can be read by the AI yet."
        more="The AI proposes a title and a classification for each file, with a word for how sure it is. Correct anything, then confirm — one at a time, or tick several and confirm them together. Confirming puts the document in the project library and records that you confirmed it. Rejecting a file deletes it. A file with no readable text (a scan) can still be confirmed: the library holds it, but no run can read or cite it."
      />
      <p>
        <Button size="sm" variant="quiet" onClick={() => void navigate(`/projects/${projectId}/documents`)}>
          Back to the library
        </Button>
      </p>
      {note && (
        <p role="status" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}
      {unindexed.length > 0 && (
        <ul aria-label="In the library but not yet indexed" style={{ listStyle: 'none', padding: 0 }}>
          {unindexed.map((r) => (
            <li key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
              <span>
                <span className="mono">{r.originalFilename}</span> is in the library but could not be indexed, so the AI cannot read it yet.
              </span>
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => void indexAgain(r)} aria-label={`Index again ${r.originalFilename}`}>
                Index again
              </Button>
            </li>
          ))}
        </ul>
      )}
      <IntakeTable
        rows={queue?.items ?? null}
        facets={facets}
        edits={edits}
        proposalsOn={queue?.proposalsOn ?? true}
        busy={busy}
        selected={selected}
        onSelect={setSelected}
        onTitle={(id, title) => editRow(id, { title })}
        onTerm={setTerm}
        onConfirm={(ids) => void confirm(ids)}
        onReject={(row) => void reject(row)}
        {...(queue && { page: { page: queue.page, pageSize: queue.pageSize, total: queue.total, onPage: setPage } })}
      />
    </div>
  );
}
