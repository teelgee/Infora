// T-243 — the ontology surface (ADR-0045): a deliverable's classification and
// its typed relationship edges, inline in the plan row detail. Classification is
// an editable per-facet field, badged "suggested" while an agent proposal is
// unconfirmed; edges are listed with confirm / retire, and a small form proposes
// a new one. The thin confirmation surface (Fork 3) — no graph explorer here.
// Reads and writes go through the access-resolved API; a non-producer simply
// sees read-only. No window.prompt; semantic tokens only.
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, SelectInput, useToast } from '@infora/ui';
import type {
  ContainerClassificationRead,
  ContainerRelationshipRead,
  DocumentRelationshipType,
  ImpactItem,
  PlanRow,
} from '@infora/contracts';
import { api } from './api';

const RELATIONSHIP_LABELS: Record<DocumentRelationshipType, string> = {
  supersedes: 'Supersedes',
  references: 'References',
  responds_to: 'Responds to',
  is_part_of: 'Is part of',
  derived_from: 'Derived from',
};
const RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_LABELS) as DocumentRelationshipType[];

const CITED_BY_KIND: Record<ImpactItem['kind'], string> = {
  draft: 'Draft',
  run: 'Answer',
  'library-version': 'Revision',
};

/** T-474 — what the requester may see that rests on the document; nothing is drawn when nothing does. */
export function CitedByList(props: { items: ImpactItem[] }) {
  if (props.items.length === 0) return null;
  return (
    <>
      <span className="field-label">Cited by</span>
      <div style={{ display: 'grid', gap: 6 }} aria-label="Cited by">
        {props.items.map((item) => (
          <div key={`${item.kind}-${item.id}`} style={{ display: 'grid', gap: 2, fontSize: 12.5 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 72 }}>{CITED_BY_KIND[item.kind]}</span>
              <span style={{ flex: 1 }}>{item.title}</span>
              <span style={{ color: 'var(--text-muted)' }}>{new Date(item.at).toLocaleDateString('en-GB')}</span>
            </div>
            {item.kind === 'library-version' ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 11.5, paddingLeft: 80 }}>
                may rest on this — a draft of theirs cited it before the revision was issued
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function SuggestedBadge() {
  return (
    <span
      style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        padding: '0 5px',
        marginLeft: 6,
      }}
    >
      suggested
    </span>
  );
}

export function OntologyPanel(props: { containerId: string; projectId: string; editable: boolean }) {
  const toast = useToast();
  const { containerId, projectId, editable } = props;
  const [facets, setFacets] = useState<
    Array<{ id: string; key: string; name: string; terms: Array<{ id: string; code: string; label: string }> }>
  >([]);
  const [classifications, setClassifications] = useState<ContainerClassificationRead[]>([]);
  const [relationships, setRelationships] = useState<ContainerRelationshipRead[]>([]);
  const [targets, setTargets] = useState<PlanRow[]>([]);
  // T-474 — what this requester may see that rests on the document; their own
  // organisation's work and library revisions they can read, never a total
  const [citedBy, setCitedBy] = useState<ImpactItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [newTarget, setNewTarget] = useState('');
  const [newType, setNewType] = useState<DocumentRelationshipType>('references');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [scheme, cc, rel] = await Promise.all([
      api.classificationScheme(projectId),
      api.containerClassifications(containerId),
      api.containerRelationships(containerId),
    ]);
    setFacets(
      scheme.facets.map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        terms: f.terms.filter((t) => t.retiredAt === null).map((t) => ({ id: t.id, code: t.code, label: t.label })),
      })),
    );
    setClassifications(cc.items);
    setRelationships(rel.items);
    void api.containerCitedBy(containerId).then(
      (r) => setCitedBy(r.items),
      () => setCitedBy([]),
    );
  }, [projectId, containerId]);

  useEffect(() => {
    void reload();
    void api
      .plan(projectId)
      .then((r) => setTargets(r.items.filter((x) => x.containerId !== containerId)))
      .catch(() => setTargets([]));
  }, [reload, projectId, containerId]);

  const classFor = (facetId: string) => classifications.find((c) => c.facetId === facetId);

  async function setClass(facetId: string, termId: string) {
    if (!termId) return;
    // T-465 — optimistic: the facet shows the chosen term at once and rolls back
    // on refusal; Undo puts the previous term back (the first term under a facet
    // cannot be unset — a classification has no delete — and the toast says so)
    const previous = classFor(facetId);
    const before = classifications;
    const facet = facets.find((f) => f.id === facetId);
    const term = facet?.terms.find((t) => t.id === termId);
    if (facet && term) {
      setClassifications((cs) => [
        ...cs.filter((c) => c.facetId !== facetId),
        { id: previous?.id ?? `optimistic-${facetId}`, containerId, facetId, termId, proposed: false, setByParticipantId: null, updatedAt: new Date().toISOString(), facetKey: facet.key, termCode: term.code, termLabel: term.label },
      ]);
    }
    setBusy(true);
    try {
      await api.setClassification(containerId, facetId, termId);
      await reload();
      toast(
        previous
          ? {
              text: `${facet?.name ?? 'Classification'}: ${term?.label ?? termId}.`,
              tone: 'success',
              undo: async () => {
                await api.setClassification(containerId, facetId, previous.termId);
                await reload();
              },
            }
          : { text: `${facet?.name ?? 'Classification'}: ${term?.label ?? termId} — the first term under a facet cannot be unset, only changed.`, tone: 'success' },
      );
    } catch {
      setClassifications(before);
      setError('That classification was refused.');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch {
      setError('That change could not be applied.');
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    if (!newTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api.proposeRelationship(containerId, newTarget, newType);
      setNewTarget('');
      await reload();
    } catch {
      setError('That edge already exists, or could not be proposed.');
    } finally {
      setBusy(false);
    }
  }

  const targetRef = (id: string) => targets.find((t) => t.containerId === id)?.documentReference ?? '';

  return (
    <div style={{ display: 'grid', gap: 14, borderTop: '1px solid var(--border-default)', paddingTop: 12, marginTop: 4 }}>
      <span className="field-label">Classification</span>
      <div style={{ display: 'grid', gap: 8 }}>
        {facets.map((f) => {
          const current = classFor(f.id);
          return (
            <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <span style={{ flex: '0 0 150px', color: 'var(--text-secondary)', fontSize: 12, paddingBottom: 8 }}>
                {f.name}
                {current?.proposed && <SuggestedBadge />}
              </span>
              <div style={{ flex: 1 }}>
                <SelectInput
                  value={current?.termId ?? ''}
                  onChange={(v) => void setClass(f.id, v)}
                  placeholder="—"
                  disabled={!editable || busy || f.terms.length === 0}
                  options={f.terms.map((t) => ({ value: t.id, label: `${t.code} — ${t.label}` }))}
                />
              </div>
            </div>
          );
        })}
        {facets.length === 0 && <span className="field-hint">No classification scheme on this project yet.</span>}
      </div>

      <span className="field-label">Relationships</span>
      <div style={{ display: 'grid', gap: 6 }}>
        {relationships.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 14 }}>{r.direction === 'outgoing' ? '→' : '←'}</span>
            <span style={{ flex: 1 }}>
              {RELATIONSHIP_LABELS[r.type]} <strong>{r.otherDocumentReference}</strong>
              {r.proposed && <SuggestedBadge />}
            </span>
            {editable && r.proposed && (
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => void act(() => api.confirmRelationship(r.id))}>
                Confirm
              </Button>
            )}
            {editable && (
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => void act(() => api.retireRelationship(r.id))}>
                {r.proposed ? 'Reject' : 'Retire'}
              </Button>
            )}
          </div>
        ))}
        {relationships.length === 0 && <span className="field-hint">No relationships yet.</span>}
      </div>

      <CitedByList items={citedBy} />

      {editable && targets.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Field label="Propose a relationship">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: '0 0 160px' }}>
                <SelectInput
                  value={newType}
                  onChange={(v) => setNewType(v as DocumentRelationshipType)}
                  options={RELATIONSHIP_TYPES.map((t) => ({ value: t, label: RELATIONSHIP_LABELS[t] }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <SelectInput
                  value={newTarget}
                  onChange={setNewTarget}
                  placeholder="Choose a deliverable…"
                  options={targets.map((t) => ({ value: t.containerId, label: t.documentReference ?? '(no reference)' }))}
                />
              </div>
              <Button size="sm" variant="primary" disabled={busy || !newTarget} onClick={() => void propose()}>
                Propose
              </Button>
            </div>
          </Field>
          {newTarget && <span className="field-hint">Proposes {RELATIONSHIP_LABELS[newType].toLowerCase()} {targetRef(newTarget)} — confirm it to make it live.</span>}
        </div>
      )}
      {error && <span style={{ color: 'var(--danger, #b91c1c)', fontSize: 12 }}>{error}</span>}
    </div>
  );
}
