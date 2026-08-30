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
  DocumentCreationRunResponse,
  GroundingSource,
  Sandbox,
  ToolSummary,
  ToolPlan,
} from '@infora/contracts';
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
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {tools.map((tool) => (
            <Card key={tool.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong>{tool.label}</strong>
                {tool.state === 'unbuilt' && <Badge tone="neutral">Not built yet</Badge>}
              </div>
              <p style={{ marginTop: 4 }}>{tool.description}</p>
              {tool.state === 'available' && tool.href !== undefined ? (
                <Link to={tool.href}>Open</Link>
              ) : (
                <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{tool.waitsOn}</p>
              )}
            </Card>
          ))}
        </div>
      )}
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
