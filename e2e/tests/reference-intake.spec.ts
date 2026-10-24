// T-472 — reference material dropped on the library becomes titled, classified
// library documents after ONE review pass; nothing is in the library, or
// readable by a run, before a person confirms it; and the record names who.
//
// "Fifty" in the ticket's done-when is the SHAPE of the walk, not the test's
// count: the owner drops a batch, watches the count line, checks one table once
// and confirms the lot. Three small files make the same walk in seconds; the
// unit suite covers the per-row reporting a larger batch leans on.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ClassificationSchemeResponse, ContainerClassificationsResponse } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';
import { textPdf } from './support/pdf';
import { sweepReferenceIntake } from './support/sweep-reference-intake';

test.describe.configure({ mode: 'serial' });

// T-484 — this spec adds "T472-…" reference documents, and on a long-lived
// local database they would pile up ahead of the seeded documents. It sweeps any
// left by an earlier or crashed run before it starts and removes its own at the
// end, through the product's own doors (reject, withdraw, library removal).
test.beforeAll(async () => {
  await sweepReferenceIntake();
});
test.afterAll(async () => {
  await sweepReferenceIntake();
});

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

/** pages, an image, no text layer — a scan */
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

const stamp = Date.now();
const pdf = (name: string, text: string) => ({ name, mimeType: 'application/pdf', buffer: textPdf([text]) });

test('three PDFs dropped on the library become three titled, classified rows after one review pass, and the record names who confirmed them', async ({ page }) => {
  const files = [
    pdf(`T472-noise-standard-${stamp}.pdf`, 'Construction noise limits for the scheme are set out below.'),
    pdf(`T472-ecology-guidance-${stamp}.pdf`, 'Guidance on protected species surveys.'),
    pdf(`T472-air-quality-${stamp}.pdf`, 'Dust and air quality monitoring requirements.'),
  ];
  const corrected = `Ecology survey guidance (corrected ${stamp})`;

  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project library/ }).click();

  // ── drop the files: one request each, and a count line fed from the answers ──
  await page.getByLabel('Reference material files').setInputFiles(files);
  await expect(page.getByRole('status', { name: 'Reference material upload' })).toContainText('3 of 3 uploaded');

  // NOTHING IS IN THE LIBRARY YET: the register does not list them
  await page.getByRole('searchbox', { name: 'Search Project library' }).fill(`T472-noise-standard-${stamp}`);
  // let the search settle (it is a server call) before asserting an absence
  await expect(page).toHaveURL(/q=T472-noise-standard/);
  await expect(page.getByText('Filtered', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('table', { name: 'Project library' })).not.toContainText(`T472-noise-standard-${stamp}`);

  // ── the intake screen: proposals filled in, with the AI's own word beside each ──
  await page.getByRole('button', { name: /^Intake/ }).click();
  await expect(page).toHaveURL(/\/library\/intake$/);
  const table = page.getByRole('table', { name: 'Reference material intake' });
  const first = files[0]!.name;
  await expect(table.getByLabel(`Title for ${first}`)).toHaveValue(`T472 noise standard ${stamp}`);
  await expect(table.getByLabel(`Document type for ${first}`).locator('option:checked')).toHaveText('Standard');
  await expect(table.getByLabel(`Discipline for ${first}`).locator('option:checked')).toHaveText('Environmental');
  const firstRow = table.getByRole('row').filter({ hasText: first });
  await expect(firstRow.getByText('confident')).toBeVisible();
  await expect(firstRow.getByText('likely')).toBeVisible();

  // ── one review pass: correct one title, change one term, tick the three, confirm together ──
  await table.getByLabel(`Title for ${files[1]!.name}`).fill(corrected);
  await table.getByLabel(`Document type for ${files[1]!.name}`).selectOption({ label: 'Guidance' });
  for (const f of files) await table.getByLabel(`Select ${f.name}`).check();
  await page.getByRole('button', { name: 'Confirm selected' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Confirmed 3' })).toBeVisible();
  for (const f of files) await expect(table.getByLabel(`Select ${f.name}`)).toHaveCount(0);

  // ── three titled rows in the library ──
  await page.getByRole('button', { name: 'Back to the library' }).click();
  await page.getByRole('searchbox', { name: 'Search Project library' }).fill(`T472`);
  const library = page.getByRole('table', { name: 'Project library' });
  await expect(library).toContainText(corrected);
  await expect(library).toContainText(`T472 noise standard ${stamp}`);
  await expect(library).toContainText(`T472 air quality ${stamp}`);

  // ── classified, and the classification names the person ──
  const api = await ApiSession.login(SEEDED.owner);
  const me = await api.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const listing = await api.get<{ items: Array<{ containerId: string; documentReference: string }> }>(
    `/projects/${projectId}/library/search?q=${encodeURIComponent(`T472`)}&pageSize=50`,
  );
  const mine = files.map((f) => listing.items.find((i) => i.documentReference === f.name.replace(/\.pdf$/, ''))!);
  for (const row of mine) expect(row, 'every dropped file is in the library').toBeDefined();
  const scheme = await api.get<ClassificationSchemeResponse>(`/projects/${projectId}/classification-scheme`);
  const termLabel = new Map(scheme.facets.flatMap((f) => f.terms.map((t) => [t.id, t.label] as const)));
  const labelsOf = async (containerId: string) => {
    const read = await api.get<ContainerClassificationsResponse>(`/containers/${containerId}/classifications`);
    return read.items.map((c) => termLabel.get(c.termId)).sort();
  };
  expect(await labelsOf(mine[0]!.containerId)).toEqual(['Environmental', 'Standard']);
  expect(await labelsOf(mine[1]!.containerId)).toEqual(['Environmental', 'Guidance']); // corrected by the person
  await api.dispose();

  // ── the document page says who put it there ──
  await library.getByText(corrected).click();
  await page.getByRole('radiogroup', { name: 'Document page sections' }).getByRole('radio', { name: 'Activity' }).click();
  await expect(page.getByRole('list', { name: 'Activity' })).toContainText(/Added to the library by Rachel Bowen on /);
});

test('a scanned PDF is accepted, marked in the queue, and — once confirmed — held in the library as not citable', async ({ page }) => {
  const name = `T472-scan-${stamp}.pdf`;
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project library/ }).click();
  await page.getByLabel('Reference material files').setInputFiles([{ name, mimeType: 'application/pdf', buffer: scannedPdf() }]);
  await expect(page.getByRole('status', { name: 'Reference material upload' })).toContainText('1 of 1 uploaded · 1 with no readable text');

  await page.getByRole('button', { name: /^Intake/ }).click();
  const table = page.getByRole('table', { name: 'Reference material intake' });
  const row = table.getByRole('row').filter({ hasText: name });
  await expect(row.getByText('A scan — no text layer')).toBeVisible();
  await expect(row.getByText(/No proposal — no readable text/)).toBeVisible();
  await row.getByRole('button', { name: `Confirm ${name}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'held but not citable' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to the library' }).click();
  await page.getByRole('searchbox', { name: 'Search Project library' }).fill(`T472-scan-${stamp}`);
  const library = page.getByRole('table', { name: 'Project library' });
  const held = library.getByRole('row').filter({ hasText: `T472-scan-${stamp}` });
  await expect(held.getByText('Not citable — no readable text')).toBeVisible();
  await expect(held.getByText('A scan — no text layer')).toBeVisible();
});
