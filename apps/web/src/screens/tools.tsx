// T-334 — the Tools section stops being an empty state, and T-335 — the
// document creator, the first tool that lives in it.
//
// *In plain terms: the rail's "Tools" item has been empty since the skeleton.
// This is what fills it — the standalone things you can open and run, and the
// first of them: build a document's structure, say what each part is for,
// choose the library documents it may draw on, see what it will cost and what
// it will cover, and only then generate.*
//
// 🔒 **THE LIST IS ASSEMBLED SERVER-SIDE, NOT FILTERED HERE.** `GET
// /projects/:id/tools` returns the set for this requester, so a tool they
// cannot use never reaches this component at all. There is no `enabled` check
// below and there must never be one: the moment a surface decides what to grey
// out, the section is advertising capabilities the viewer cannot reach.
//
// 🔒 **THE LAUNCH KEEPS ITS STATE** (ADR-0053 §1). Pick the template, say what
// the document is for, choose the sources, choose where it goes, **see the
// plan**, then step back and change one thing without re-entering the rest.
// That is the pattern T-336 sets for the checker and it is not re-invented
// here: the form's state survives the plan being shown, and changing any field
// discards the plan rather than the answers.
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type {
  CheckFamily,
  CorpusDepth,
  DocumentCreationRunResponse,
  GroundingSource,
  QaCheckRunResponse,
  Sandbox,
  SandboxDocument,
  ToolSummary,
  ToolPlan,
} from '@infora/contracts';
import {
  CHECK_FAMILIES,
  CHECK_FAMILY_CATALOGUE,
  CHECK_PRESETS,
  DEFAULT_CHECK_PRESET,
  DEFAULT_CORPUS_DEPTH,
} from '@infora/contracts';
import { ClipboardCheck, FileText, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, Field, SelectInput, TextArea, TextInput } from '@infora/ui';
import { api } from '../api';
import { useGroundingScope } from '../composer-chips';

export function ToolsScreen() {
  const { projectId } = useParams();
  const [tools, setTools] = useState<ToolSummary[] | null>(null);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .tools(projectId)
      .then((res) => setTools(res.items))
      // a failed read is not an empty tool set: rendering "no tools" off a
      // request that did not answer is a claim about this deployment we cannot
      // make
      .catch(() => setTools(null));
  }, [projectId]);

  return (
    <div className="content">
      <h1 className="page">Tools</h1>
      <p className="page-sub">
        Infora’s standard tools. Each runs a codified workflow — the same inputs produce the same
        steps, in the same order, every time.
      </p>
      {tools === null ? (
        <p className="page-sub">Loading…</p>
      ) : (
        <div className="tool-cards">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The icon a tool wears, by tool id.
 *
 * **A presentation decision, made here rather than sent over the wire.** What a
 * tool *is* — its name, what it does, whether the viewer may reach it — is the
 * server's to say, and does. Which glyph sits beside it is not: putting an icon
 * name in the contract would make the API answerable for the icon set, and the
 * next surface that wanted a different one would have to change the server.
 * A tool this map has not met falls back to a neutral glyph and still renders
 * as a card, which is the honest failure — a tile is never dropped for want of
 * a picture.
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  'document-creation': FileText,
  'qa-check': ClipboardCheck,
};

/**
 * T-403 — one tool, as a card.
 *
 * 🔒 **THE ASSEMBLED-NOT-FILTERED RULE IS UNTOUCHED, AND THE CARD FORM IS WHY
 * IT IS WORTH RESTATING.** A card is a more inviting shape than a row, and the
 * temptation a card form creates is to render an unentitled tool greyed out so
 * the grid stays even. It must not: a tool the requester cannot use never
 * reaches this component, and there is no `enabled` prop here to add one with.
 * `unbuilt` is a different thing — the tool exists, nobody has built it, and it
 * says so **inside its own card** rather than as a note beside the grid.
 */
export function ToolCard({ tool }: { tool: ToolSummary }) {
  const Icon = TOOL_ICONS[tool.id] ?? Wrench;
  const body = (
    <>
      <span className="tool-card-head">
        <span className="tool-card-icon">
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="tool-card-name">{tool.label}</span>
        {tool.state === 'unbuilt' && <Badge tone="neutral">Not built yet</Badge>}
      </span>
      <p className="tool-card-desc">{tool.description}</p>
    </>
  );

  return tool.state === 'available' && tool.href !== undefined ? (
    <Link className="tool-card" to={tool.href}>
      {body}
    </Link>
  ) : (
    <div className="tool-card tool-card--unbuilt">
      {body}
      <p className="tool-card-waits">{tool.waitsOn}</p>
    </div>
  );
}

/** The templates this deployment carries. Fixed for V1; the set is domain content. */
const TEMPLATES = [
  { id: 'technical-note', label: 'Technical note' },
  { id: 'chapter-section', label: 'Chapter section' },
];

export function DocumentCreatorScreen() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const scope = useGroundingScope(projectId ?? '');
  const [destinations, setDestinations] = useState<Sandbox[]>([]);

  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [brief, setBrief] = useState('');
  const [title, setTitle] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [destination, setDestination] = useState('');

  const [plan, setPlan] = useState<ToolPlan | null>(null);
  const [result, setResult] = useState<DocumentCreationRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .sandboxes(projectId)
      .then((res) => setDestinations(res.items))
      .catch(() => setDestinations([]));
  }, [projectId]);

  // ⚠ **THE BOUND-CONTAINER PATH IS REFUSED, WITH A POINTER.** `Q-037` — whether
  // a bound container's plan row seeds this structure — is raised and unruled,
  // and inventing the answer here would build toward something nobody agreed
  // to. The unbound path is the tool; arriving bound says so rather than
  // quietly ignoring the binding, which would look like it had worked.
  const boundContainerId = params.get('containerId');
  if (boundContainerId !== null) {
    return (
      <div className="content">
        <h1 className="page">Document creator</h1>
        <div className="banner banner--warning">
          Starting the creator from a deliverable in the plan is not built. Whether a bound
          container’s plan row seeds the structure is an open design question (
          <span className="mono">Q-037</span>), and guessing at it here would produce a document
          shaped by an answer nobody has given. Open the creator from{' '}
          <Link to={`/projects/${projectId}/tools`}>Tools</Link> and choose the sources yourself.
        </div>
      </div>
    );
  }

  /** Any change to the answers discards the plan — a plan is about the inputs it was computed from. */
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPlan(null);
    setResult(null);
    setError(null);
  };

  const ready = brief.trim() !== '' && title.trim() !== '' && destination !== '';

  const body = () => ({
    templateId,
    brief: brief.trim(),
    sourceVersionIds: sources,
    destinationSandboxId: destination,
    title: title.trim(),
  });

  const seePlan = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .documentCreationPlan(projectId, body())
      .then((res) => setPlan(res.plan))
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  const run = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .documentCreationRun(projectId, body())
      .then(setResult)
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="content">
      <h1 className="page">Document creator</h1>
      <p className="page-sub">
        Choose the shape, say what it is for, and pick the library documents it may draw on — before
        anything is drafted. The sources are chosen first so the result can be checked against what
        you asked for.
      </p>

      <Card>
        <Field label="Shape">
          <SelectInput
            value={templateId}
            onChange={change(setTemplateId)}
            options={TEMPLATES.map((template) => ({ value: template.id, label: template.label }))}
          />
        </Field>
        <Field label="What is this document for?">
          <TextArea value={brief} onChange={change(setBrief)} rows={3} />
        </Field>
        <Field label="Title">
          <TextInput value={title} onChange={change(setTitle)} />
        </Field>
        <Field label="Where it goes">
          <SelectInput
            value={destination}
            onChange={change(setDestination)}
            options={[
              { value: '', label: 'Choose a working area…' },
              ...destinations.map((sandbox) => ({ value: sandbox.id, label: sandbox.name })),
            ]}
          />
        </Field>
      </Card>

      <Card>
        <strong>Sources this draft may use</strong>
        {/* The list is `grounding-scope` — the SAME pre-filter retrieval runs, so
            a document offered here is one the draft could actually have used
            (T-292). Nothing unreachable is greyed: it is absent. */}
        {scope === null || scope.sources.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Nothing in this project’s library is in scope for a grounded draft. Without at least one
            source there is nothing to draft from, and the plan will say so.
          </p>
        ) : (
          scope.sources.map((source: GroundingSource) => (
            <label key={source.containerId} style={{ display: 'block', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={sources.includes(source.versionId)}
                onChange={() =>
                  change(setSources)(
                    sources.includes(source.versionId)
                      ? sources.filter((id) => id !== source.versionId)
                      : [...sources, source.versionId],
                  )
                }
              />{' '}
              <span className="mono">{source.documentReference}</span>{' '}
              {source.title !== null && <span>{source.title}</span>}
            </label>
          ))
        )}
      </Card>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" disabled={!ready || busy} onClick={seePlan}>
          See the plan
        </Button>
      </div>

      {error !== null && <div className="banner banner--warning">{error}</div>}

      {plan !== null && (
        <Card>
          <strong>The plan</strong>
          {/* Rendered, NOT editable (ADR-0053 §4). You shape it by changing the
              answers above and the plan regenerates — which is what keeps the
              run `declared`; hand-editing a step list would not. */}
          <p style={{ color: 'var(--text-muted)' }}>
            This is what will run. Change an answer above to change it — the steps are not editable,
            which is what makes the run repeatable.
          </p>
          <ul>
            {plan.steps.map((step) => (
              <li key={step.key}>{step.label}</li>
            ))}
          </ul>
          <p>
            <strong>Covers:</strong> {plan.coverage}
          </p>
          <p>
            <strong>Estimated cost:</strong>{' '}
            {/* null is NOT zero: an unpriced deployment says so rather than
                showing a plausible £0.00 (T-254) */}
            {plan.cost.priced && plan.cost.total !== null
              ? `£${plan.cost.total.toFixed(4)}`
              : 'not priced — this deployment has no rate for the model that would run it'}
          </p>
          {plan.refusal !== null ? (
            <div className="banner banner--warning">{plan.refusal}</div>
          ) : (
            <Button variant="primary" disabled={busy} onClick={run}>
              Create the document
            </Button>
          )}
        </Card>
      )}

      {result !== null && (
        <Card>
          <strong>What was made</strong>
          {/* Coverage again, in the SAME SHAPE as the plan's — so the difference
              between what was promised and what happened is visible at a
              glance rather than something to go looking for (ADR-0053 §5). */}
          <p>
            <strong>Covered:</strong> {result.coverage}
          </p>
          {result.label.refusal !== null ? (
            <div className="banner banner--warning">
              Nothing was written. This draft would draw on material {result.label.computed}, and the
              working area you chose is {result.label.destination} — writing it there would widen who
              can read it. {result.label.refusal}
            </div>
          ) : (
            <p>
              <Link to={`/projects/${projectId}/editor/${result.documentId}`}>
                Open the document
              </Link>
            </p>
          )}
          {result.unreachableSources.length > 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              {result.unreachableSources.length} source
              {result.unreachableSources.length === 1 ? '' : 's'} you named returned nothing from the
              library — either out of reach, or nothing in them matched the brief.
            </p>
          )}
          {result.withheld.length > 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              {result.withheld.length} sentence{result.withheld.length === 1 ? '' : 's'} rested on no
              source and {result.withheld.length === 1 ? 'was' : 'were'} not written.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

// ── T-336 — THE QA CHECKER'S LAUNCHER ───────────────────────────────────────
//
// *In plain terms: pick a draft, pick how hard to look, see exactly what will
// run and roughly what it will cost, then run it. Afterwards the same sentence
// comes back with what actually happened in it, beside what was found.*
//
// 🔒 **THE LAUNCH KEEPS ITS STATE** (ADR-0053 §1). Pick the document, pick the
// checks and their settings, see the plan, then **step back and change one
// thing without re-entering the rest**. That is the pattern T-334/T-335 set for
// the creator and it is not re-invented here: the form's answers survive the
// plan being shown, and changing any of them discards the plan rather than the
// answers.
//
// 🔒 **THE PLAN IS RENDERED AND NOT EDITABLE** (ADR-0053 §4, §12). The user
// shapes it by changing **parameters** and the plan regenerates. Hand-editing a
// step list would make the plan `model_chosen` by T-267's own correct rule, and
// for a tool sold on *same inputs, same steps, same order* that is the
// guarantee a user should not be able to switch off in passing.
//
// 🔒 **TWO DOCUMENT-SELECTION AFFORDANCES, NAMED DIFFERENTLY BECAUSE THEY ARE
// TWO GUARANTEES** (ADR-0053 §3). *Check against library documents* cites
// normally, resolves to a locator and carries currency; *attach a document*
// never grounds and is never cited. Attaching a library document silently
// yields the strictly worse result, so the copy says which you get.

/**
 * 🔒 **TWO DOCUMENT-SELECTION AFFORDANCES, NAMED DIFFERENTLY BECAUSE THEY ARE
 * TWO GUARANTEES** (ADR-0053 §3) — and the copy has to say which one you get.
 *
 * Attaching a *library* document silently yields the strictly worse result — no
 * citation, no locator, no currency — and a user choosing *"select a document
 * to check against"* would have no way to know they took the weak path. Pure
 * components so both sentences can be pinned in a test: a sentence that cannot
 * be rendered in a test is a sentence nobody is checking (T-395).
 */
export function LibraryScopeCopy() {
  return (
    <p style={{ color: 'var(--text-muted)' }}>
      {/* the DEFAULT is the whole access-resolved library, and saying so is the
          difference between "everything you can see" and "nothing" */}
      By default the whole library you can reach. Narrow it here if you want. Findings from these{' '}
      <strong>cite normally</strong> — they resolve to a place in a source document.
    </p>
  );
}

export function AttachedCopy() {
  return (
    <p style={{ color: 'var(--text-muted)' }}>
      One of your own drafts, read as background. Findings from an attached document are{' '}
      <strong>never cited</strong> — they quote an excerpt instead of resolving to a source. If you
      want citations, scope to the library document above instead.
    </p>
  );
}

/**
 * The plan, **rendered and not editable** (ADR-0053 §4, §12).
 *
 * The user shapes it by changing parameters and it regenerates; hand-editing a
 * step list would make the plan `model_chosen` by T-267's own correct rule, and
 * for a tool sold on *same inputs, same steps, same order* that is the
 * guarantee a user should not be able to switch off in passing.
 *
 * 🔒 A `caveat` is rendered **before** the run button, never after the result:
 * the very-long shape compares sections in groups, and a run that reported a
 * clean cross-section result without saying it had not looked everywhere would
 * be the silent degradation ADR-0053 §4 forbids. It degrades loudly or not at
 * all.
 */
export function CheckPlanCard(props: { plan: ToolPlan; busy: boolean; onRun: () => void }) {
  const { plan } = props;
  return (
    <Card>
      <strong>The plan</strong>
      <p style={{ color: 'var(--text-muted)' }}>
        This is what will run. Change an answer above to change it — the steps are not editable,
        which is what makes the run repeatable.
      </p>
      {plan.shape !== undefined && <p>{plan.shape}</p>}
      <ul>
        {plan.steps.map((step) => (
          <li key={step.key}>{step.label}</li>
        ))}
      </ul>
      <p>
        <strong>Covers:</strong> {plan.coverage}
      </p>
      {plan.caveats?.map((caveat) => (
        <div key={caveat} className="banner banner--warning">
          {caveat}
        </div>
      ))}
      <p>
        <strong>Estimated cost:</strong>{' '}
        {/* null is NOT zero: an unpriced deployment says so rather than showing
            a plausible £0.00 (T-254) */}
        {plan.cost.priced && plan.cost.total !== null
          ? `£${plan.cost.total.toFixed(4)}`
          : 'not priced — this deployment has no rate for the model that would run it'}
      </p>
      {plan.refusal !== null ? (
        // ADR-0053 §5 — refusal is said BEFORE any spend, and the button is
        // absent rather than offered-and-refused
        <div className="banner banner--warning">{plan.refusal}</div>
      ) : (
        <Button variant="primary" disabled={props.busy} onClick={props.onRun}>
          Run the check
        </Button>
      )}
    </Card>
  );
}

export function QaCheckerScreen() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const scope = useGroundingScope(projectId ?? '');
  const [drafts, setDrafts] = useState<SandboxDocument[]>([]);

  // ⚠ THE EDITOR ROUTE IS THIS ROUTE WITH ITS FIRST STEP PRE-FILLED. One
  // launcher, one run shape, one place the scope is stated (ADR-0053 §1) — so
  // the tool chip in the editor sets this parameter and nothing else.
  const bound = params.get('documentId');
  const [documentId, setDocumentId] = useState(bound ?? '');
  const [preset, setPreset] = useState<'full' | 'quick'>(DEFAULT_CHECK_PRESET);
  const [families, setFamilies] = useState<CheckFamily[]>([...CHECK_FAMILIES]);
  const [depth, setDepth] = useState<CorpusDepth>(DEFAULT_CORPUS_DEPTH);
  const [scopeVersionIds, setScopeVersionIds] = useState<string[]>([]);
  const [attached, setAttached] = useState<string[]>([]);

  const [plan, setPlan] = useState<ToolPlan | null>(null);
  const [result, setResult] = useState<QaCheckRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .sandboxDocuments(projectId)
      .then((res) => setDrafts(res.items))
      .catch(() => setDrafts([]));
  }, [projectId]);

  /** Any change to the answers discards the PLAN and keeps the ANSWERS. */
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPlan(null);
    setResult(null);
    setError(null);
  };

  /** A preset sets the families and the depth TOGETHER — one honest choice. */
  const choosePreset = (id: 'full' | 'quick') => {
    const chosen = CHECK_PRESETS.find((entry) => entry.id === id)!;
    setPreset(id);
    setFamilies([...chosen.families]);
    setDepth(chosen.depth);
    setPlan(null);
    setResult(null);
  };

  const toggleFamily = (family: CheckFamily) =>
    change(setFamilies)(
      families.includes(family) ? families.filter((f) => f !== family) : [...families, family],
    );

  const ready = documentId !== '' && families.length > 0;
  const body = () => ({
    sandboxDocumentId: documentId,
    families,
    depth,
    scopeVersionIds,
    attachedDocumentIds: attached,
  });

  const seePlan = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .qaCheckPlan(projectId, body())
      .then((res) => setPlan(res.plan))
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  const run = () => {
    if (projectId === undefined) return;
    setBusy(true);
    setError(null);
    void api
      .qaCheckRun(projectId, body())
      .then(setResult)
      .catch((problem: Error) => setError(problem.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="content">
      <h1 className="page">QA checker</h1>
      <p className="page-sub">
        Read a draft against the writing rules that bind it and the project record it rests on. You
        see the plan, and what it will cover, before anything is spent.
      </p>

      <Card>
        <Field label="Which draft">
          <SelectInput
            value={documentId}
            onChange={change(setDocumentId)}
            options={[
              { value: '', label: 'Choose a draft…' },
              ...drafts.map((draft) => ({ value: draft.id, label: draft.title })),
            ]}
          />
        </Field>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {/* a run covers ONE document (ADR-0053 §1): a set sweep produces a
              report, which the checker deliberately is not */}
          A check covers one document. Its findings are marks in that draft, not a report about
          several.
        </p>
      </Card>

      <Card>
        <strong>How hard to look</strong>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {CHECK_PRESETS.map((entry) => (
            <Button
              key={entry.id}
              variant={preset === entry.id ? 'primary' : undefined}
              onClick={() => choosePreset(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {CHECK_PRESETS.find((entry) => entry.id === preset)?.description}
        </p>
        {/* the presets set the families and the depth together and STAY
            individually adjustable — a preset is a starting point, not a mode */}
        <div style={{ marginTop: 8 }}>
          {CHECK_FAMILY_CATALOGUE.map((entry) => (
            <label key={entry.family} style={{ display: 'block', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={families.includes(entry.family)}
                onChange={() => toggleFamily(entry.family)}
              />{' '}
              <strong>{entry.label}</strong>
              {entry.execution === 'code' && (
                <>
                  {' '}
                  <Badge tone="neutral">No AI</Badge>
                </>
              )}
              <div style={{ color: 'var(--text-muted)', marginLeft: 22 }}>{entry.description}</div>
            </label>
          ))}
        </div>
        {families.includes('corpus_accuracy') && (
          <Field label="How the project record is searched">
            <SelectInput
              value={depth}
              onChange={(value) => change(setDepth)(value === 'quick' ? 'quick' : 'full')}
              options={[
                { value: 'full', label: 'Statement by statement (slower, catches buried figures)' },
                { value: 'quick', label: 'Once per section (faster, will miss a buried figure)' },
              ]}
            />
          </Field>
        )}
      </Card>

      <Card>
        <strong>Check against library documents</strong>
        <LibraryScopeCopy />
        {/* assembled, not filtered: an unreachable document is ABSENT, never
            greyed, so the picker cannot reveal that it exists (ADR-0053 §8) */}
        {scope === null || scope.sources.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Nothing in this project’s library is in scope, so the accuracy check has nothing to
            check against. The plan will say so.
          </p>
        ) : (
          scope.sources.map((source: GroundingSource) => (
            <label key={source.containerId} style={{ display: 'block', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={scopeVersionIds.includes(source.versionId)}
                onChange={() =>
                  change(setScopeVersionIds)(
                    scopeVersionIds.includes(source.versionId)
                      ? scopeVersionIds.filter((id) => id !== source.versionId)
                      : [...scopeVersionIds, source.versionId],
                  )
                }
              />{' '}
              <span className="mono">{source.documentReference}</span>{' '}
              {source.title !== null && <span>{source.title}</span>}
            </label>
          ))
        )}
      </Card>

      <Card>
        <strong>Attach a document</strong>
        <AttachedCopy />
        {drafts
          .filter((draft) => draft.id !== documentId)
          .map((draft) => (
            <label key={draft.id} style={{ display: 'block', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={attached.includes(draft.id)}
                onChange={() =>
                  change(setAttached)(
                    attached.includes(draft.id)
                      ? attached.filter((id) => id !== draft.id)
                      : [...attached, draft.id],
                  )
                }
              />{' '}
              {draft.title}
            </label>
          ))}
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {/* stated rather than left as a dead affordance — uploading a file
              here is not built, and a control that looked available and did
              nothing would be worse than its absence */}
          Uploading a file straight into a check is not built yet. Put it in your working area
          first, and it appears here.
        </p>
      </Card>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" disabled={!ready || busy} onClick={seePlan}>
          See the plan
        </Button>
      </div>

      {error !== null && <div className="banner banner--warning">{error}</div>}

      {plan !== null && <CheckPlanCard plan={plan} busy={busy} onRun={run} />}

      {result !== null && (
        <Card>
          <strong>What was checked</strong>
          {/* 🔒 THE SAME SHAPE AS THE PLAN'S SENTENCE (ADR-0053 §5). This is the
              only thing distinguishing a clean result from an unexamined one,
              so it sits BESIDE the count rather than under it: "no findings"
              must always read as "no findings in what was read". */}
          <p>
            <strong>Covered:</strong> {result.coverage}
          </p>
          <p>
            {result.findings.length === 0
              ? 'No findings in what was read — the sentence above is what that claim rests on.'
              : `${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}, anchored in the draft.`}
          </p>
          <p>
            <Link to={`/projects/${projectId}/editor/${documentId}`}>
              Open the draft to work through them
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}
