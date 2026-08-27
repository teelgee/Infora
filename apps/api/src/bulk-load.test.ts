// T-303 acceptance, against the live dev database. The load itself is the easy
// half; the two obligations the ticket actually turns on are the ones tested
// hardest here:
//
//   * **a partial load is resumable** — re-running neither duplicates what
//     landed nor leaves half-landed documents unindexed; and
//   * **it says what it did not load** — per document, by name, with a reason,
//     and loudly enough that a 460-of-500 load cannot read as a success.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isVersionIndexed } from '@infora/data';
import { createDb, schema as s, withProjectScope } from '@infora/db';
import { bulkLoad, describeReport, referenceFor } from './bulk-load';
import { textToDocx, textToPdf } from './renditions';
import { buildXlsx } from './xlsx';
import { fakeRouter, FAKE_EMBED_MODEL } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();

const stamp = Date.now();
let projectId: string;
let organisationId: string;
let directory: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t303 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t303 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  directory = mkdtempSync(join(tmpdir(), 'infora-bulk-'));
});

afterAll(async () => {
  rmSync(directory, { recursive: true, force: true });
  await pool.end();
});

const write = (name: string, bytes: Buffer) => writeFileSync(join(directory, name), bytes);

/**
 * "Is it indexed" is asked through @infora/data, because the grounding index
 * has one reader by construction (source-rules.mjs RULE 1) and a test in
 * apps/api is not it — the same rule the implementation obeys.
 */
const indexed = (versionId: string) => isVersionIndexed(db, router, versionId, projectId);

/** a scan: pages, an image, no text layer. The V1 ruling's refusal case. */
const scannedPdf = () =>
  Buffer.from(
    `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 3 >>
stream
q Q
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF
`,
    'latin1',
  );

describe('bulkLoad (T-303)', () => {
  it('admits a directory as reference material, ingesting each document once', async () => {
    write(`${stamp}-WA-ENV-NOI-012.pdf`, textToPdf('Noise', 'The level at receptor R7 is 54 dB.'));
    write(`${stamp}-Advice Note 9.docx`, textToDocx('The Inspectorate advises on adequacy.'));
    mkdirSync(join(directory, 'letters'), { recursive: true });
    writeFileSync(
      join(directory, 'letters', `${stamp}-Decision Letter.pdf`),
      textToPdf('Decision', 'Consent is granted subject to requirements.'),
    );

    const report = await bulkLoad({ db, router }, { projectId, organisationId, directory });
    expect(report.refused).toBe(0);
    expect(report.loaded).toBe(3); // sub-directories are walked

    const containers = await db
      .select()
      .from(s.containers)
      .where(eq(s.containers.projectId, projectId));
    expect(containers).toHaveLength(3);
    for (const container of containers) {
      // admitted directly to the library at live, so it grounds and rides every
      // existing pre-filter unchanged (ADR-0011)
      expect(container.inLibrary).toBe(true);
      expect(container.state).toBe('live');
      expect(container.scope).toBe('library');
      expect(container.producingOrganisationId).toBe(organisationId);
    }

    // ...and the distinguishing fact is an ABSENCE (T-304's ruling): no work
    // item, no new state, no marker column
    const workItems = await db.select().from(s.workItems).where(eq(s.workItems.projectId, projectId));
    expect(workItems).toHaveLength(0);

    // one genesis version each, current, carrying the extracted text
    const noise = containers.find((c) => c.documentReference?.includes('NOI-012'))!;
    const versions = await db.select().from(s.versions).where(eq(s.versions.containerId, noise.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]!.isCurrent).toBe(true);
    expect(versions[0]!.content).toContain('The level at receptor R7 is 54 dB.');

    // ingested once, and the chunks exist — a library row that answers nothing
    // is worse than an absent one, because the list says it is there. Read
    // inside the project scope: the index is under RLS and fails closed (T-247).
    expect(await indexed(versions[0]!.id)).toBe(true);

    // the native rendition is the file itself, so the Documents view opens the
    // real document rather than the extracted text
    const renditions = await db
      .select()
      .from(s.renditions)
      .where(eq(s.renditions.versionId, versions[0]!.id));
    expect(renditions).toHaveLength(1);
    expect(renditions[0]!.kind).toBe('native');
    expect(renditions[0]!.format).toBe('pdf');
  });

  it('is resumable: re-running duplicates nothing and reports what was already there', async () => {
    const before = await db.select().from(s.containers).where(eq(s.containers.projectId, projectId));
    const report = await bulkLoad({ db, router }, { projectId, organisationId, directory });
    expect(report.loaded).toBe(0);
    expect(report.present).toBe(3);
    expect(report.refused).toBe(0);
    const after = await db.select().from(s.containers).where(eq(s.containers.projectId, projectId));
    expect(after).toHaveLength(before.length);
  });

  it('FINISHES a document a previous run left in the library and unindexed', async () => {
    // the failure mode the resume check exists for: the container committed and
    // the embedding call then died. The row is in the library, the list shows
    // it, and it answers nothing. "Does a row exist" would call this done.
    const [container] = await db
      .select()
      .from(s.containers)
      .where(
        and(
          eq(s.containers.projectId, projectId),
          eq(s.containers.documentReference, `${stamp}-Advice Note 9`),
        ),
      );
    const [version] = await db
      .select()
      .from(s.versions)
      .where(eq(s.versions.containerId, container!.id));
    await withProjectScope(db, projectId, (tx) =>
      tx
        .delete(s.versionChunks)
        .where(
          and(
            eq(s.versionChunks.versionId, version!.id),
            eq(s.versionChunks.embeddingModelId, FAKE_EMBED_MODEL),
          ),
        ),
    );

    const report = await bulkLoad({ db, router }, { projectId, organisationId, directory });
    expect(report.reindexed).toBe(1);
    expect(report.present).toBe(2);
    expect(await indexed(version!.id)).toBe(true);
  });

  it('refuses per document and keeps going — the 460-of-500 failure', async () => {
    write(`${stamp}-Scanned Objection.pdf`, scannedPdf());
    write(`${stamp}-Consultation Register.xlsx`, Buffer.from('PK not really'));
    write(`${stamp}-Site Photos.zip`, Buffer.from('PK not a document'));
    write(`${stamp}-Late Response.pdf`, textToPdf('Late', 'Received after the deadline closed.'));
    // T-306 — a real workbook loads now; it used to be refused for want of an
    // extractor, and the corpus is the poorer for every register it missed
    write(
      `${stamp}-Requirements.xlsx`,
      buildXlsx([{ name: 'Requirements', rows: [['R7', 'A three metre acoustic barrier']] }]),
    );

    const report = await bulkLoad({ db, router }, { projectId, organisationId, directory });
    // the readable ones still land, which is the whole point of per-document
    expect(report.loaded).toBe(2);
    expect(report.refused).toBe(3);

    const reasons = Object.fromEntries(
      report.outcomes
        .filter((o) => o.status === 'refused')
        .map((o) => [o.reference, o.status === 'refused' ? o.reason : '']),
    );
    expect(reasons[`${stamp}-Scanned Objection`]).toBe('pdf_no_text');
    expect(reasons[`${stamp}-Consultation Register`]).toBe('unreadable_file');
    expect(reasons[`${stamp}-Site Photos`]).toBe('unsupported_format');
  });

  it('names every refused document again in the summary', async () => {
    // a 500-line log with forty refusals scattered through it is a log nobody
    // reads to the top of, so the summary repeats them and says plainly that
    // they are not in the corpus
    const summary = describeReport({
      loaded: 460,
      present: 0,
      reindexed: 0,
      refused: 2,
      outcomes: [
        { file: 'a.pdf', status: 'refused', reference: 'a', reason: 'pdf_no_text' },
        { file: 'b.xlsx', status: 'refused', reference: 'b', reason: 'xlsx_no_text' },
      ],
    });
    expect(summary).toContain('REFUSED 2');
    expect(summary).toContain('these documents are NOT in the corpus');
    expect(summary).toContain('a.pdf — pdf_no_text');
    expect(summary).toContain('b.xlsx — xlsx_no_text');
  });

  it('refuses a duplicate reference inside one load rather than picking one', async () => {
    const nested = join(directory, 'letters');
    writeFileSync(join(nested, `${stamp}-Late Response.pdf`), textToPdf('Late', 'A second copy.'));
    const report = await bulkLoad({ db, router }, { projectId, organisationId, directory });
    const duplicate = report.outcomes.find(
      (o) => o.status === 'refused' && o.reason === 'duplicate_reference_in_load',
    );
    expect(duplicate).toBeDefined();
    rmSync(join(nested, `${stamp}-Late Response.pdf`));
  });
});

describe('referenceFor (T-303)', () => {
  it('is the file name, which is what makes a re-run resumable', () => {
    expect(referenceFor('/corpus/letters/WA-ENV-NOI-012 Rev C.pdf')).toBe('WA-ENV-NOI-012 Rev C');
    expect(referenceFor('Advice Note 9.docx')).toBe('Advice Note 9');
  });
});
