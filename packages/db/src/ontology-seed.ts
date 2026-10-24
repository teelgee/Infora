// Infora's default classification scheme (ADR-0045, T-240), grounded in
// Uniclass 2015 / ISO 19650 breakdown structures. COPIED into a project at
// creation — a copy, not a reference, so one project's edits never rewrite
// another's (the acceptance-code / naming-scheme pattern). A representative
// starter set, not the full ~5,000-code Uniclass tables: the owner extends it
// the way the naming scheme is extended (a producer proposes, the owner folds
// in). The recognised codes are the point — they are what let a classification
// (and the agent's claims built on it) be trusted on day one.
import type { Db } from './client.js';
import type { classificationFacetSource } from './schema/drawer6-ontology.js';
import { recheckDefaults } from './schema/drawer2-documents.js';
import { classificationFacets, classificationTerms } from './schema/drawer6-ontology.js';

type FacetSource = (typeof classificationFacetSource.enumValues)[number];

interface DefaultFacet {
  key: string;
  name: string;
  source: FacetSource;
  // a flat starter list; hierarchy (parent_term_id) is supported by the schema
  // and populated as the vocabulary is extended
  terms: { code: string; label: string }[];
}

// T-473 — how many months a confirmation of currency lasts, by document type
// code (migration 0079 inserts the same for projects that already exist), and
// the project-wide fallback for a document that is unclassified.
export const DEFAULT_RECHECK_MONTHS: Record<string, number> = { STD: 12, GDN: 12, LEG: 6, CRS: 24 };
export const FALLBACK_RECHECK_MONTHS = 12;

export const DEFAULT_CLASSIFICATION_SCHEME: DefaultFacet[] = [
  {
    // ISO 19650 / BS 1192 originator-discipline codes
    key: 'discipline',
    name: 'Discipline',
    source: 'iso_19650',
    terms: [
      { code: 'A', label: 'Architectural' },
      { code: 'C', label: 'Civil' },
      { code: 'S', label: 'Structural' },
      { code: 'G', label: 'Geotechnical' },
      { code: 'D', label: 'Drainage' },
      { code: 'M', label: 'Mechanical' },
      { code: 'E', label: 'Electrical' },
      { code: 'T', label: 'Transport / Highways' },
      { code: 'V', label: 'Environmental' },
      { code: 'Z', label: 'General / Multidiscipline' },
    ],
  },
  {
    // Uniclass 2015 Systems (Ss) table — infrastructure-relevant subset
    key: 'system',
    name: 'System (Uniclass Ss)',
    source: 'uniclass_2015',
    terms: [
      { code: 'Ss_15', label: 'Earthworks and remediation systems' },
      { code: 'Ss_20', label: 'Structural systems' },
      { code: 'Ss_25', label: 'Wall and barrier systems' },
      { code: 'Ss_30', label: 'Roof, floor and paving systems' },
      { code: 'Ss_37', label: 'Bridge and viaduct systems' },
      { code: 'Ss_50', label: 'Disposal and drainage systems' },
      { code: 'Ss_55', label: 'Piped supply systems' },
      { code: 'Ss_70', label: 'Electrical supply systems' },
      { code: 'Ss_80', label: 'Transport systems' },
    ],
  },
  {
    // ISO 19650 information-type codes (the document's form)
    key: 'document_type',
    name: 'Document type',
    source: 'iso_19650',
    terms: [
      { code: 'DR', label: 'Drawing' },
      { code: 'MO', label: 'Model' },
      { code: 'RP', label: 'Report' },
      { code: 'SP', label: 'Specification' },
      { code: 'SH', label: 'Schedule' },
      { code: 'CA', label: 'Calculation' },
      { code: 'CE', label: 'Certificate' },
      { code: 'CO', label: 'Correspondence' },
      // T-472 — the forms reference material takes (ADR-0011's addendum of
      // 2026-10-24); a data migration inserts the same four into every project
      // that already exists (0078), so the two cannot drift
      { code: 'STD', label: 'Standard' },
      { code: 'GDN', label: 'Guidance' },
      { code: 'LEG', label: 'Legislation' },
      { code: 'CRS', label: 'Consultee response' },
    ],
  },
  {
    // RIBA Plan of Work / ISO 19650 project stages
    key: 'phase',
    name: 'Project stage',
    source: 'iso_19650',
    terms: [
      { code: '0', label: 'Strategic definition' },
      { code: '1', label: 'Preparation and briefing' },
      { code: '2', label: 'Concept design' },
      { code: '3', label: 'Spatial coordination' },
      { code: '4', label: 'Technical design' },
      { code: '5', label: 'Manufacturing and construction' },
      { code: '6', label: 'Handover' },
      { code: '7', label: 'Use' },
    ],
  },
  {
    // work packages are inherently project-specific — the facet ships empty and
    // the owner populates it (the TIDP work-breakdown), so it is 'custom'
    key: 'work_package',
    name: 'Work package',
    source: 'custom',
    terms: [],
  },
];

// Copy the default scheme into one project. Idempotent per (project, facet key)
// by the schema's unique index — a second call throws rather than duplicating.
export async function seedProjectOntology(db: Db, projectId: string): Promise<void> {
  for (const [facetIndex, facet] of DEFAULT_CLASSIFICATION_SCHEME.entries()) {
    const [row] = await db
      .insert(classificationFacets)
      .values({
        projectId,
        key: facet.key,
        name: facet.name,
        source: facet.source,
        sortOrder: facetIndex,
      })
      .returning();
    if (facet.terms.length > 0) {
      const terms = await db
        .insert(classificationTerms)
        .values(
          facet.terms.map((term, termIndex) => ({
            facetId: row!.id,
            code: term.code,
            label: term.label,
            sortOrder: termIndex,
          })),
        )
        .returning();
      if (facet.key === 'document_type') {
        const intervals = terms.flatMap((term) => {
          const months = DEFAULT_RECHECK_MONTHS[term.code];
          return months === undefined ? [] : [{ projectId, termId: term.id, intervalMonths: months }];
        });
        if (intervals.length > 0) await db.insert(recheckDefaults).values(intervals);
      }
    }
  }
  await db.insert(recheckDefaults).values({ projectId, termId: null, intervalMonths: FALLBACK_RECHECK_MONTHS });
}
