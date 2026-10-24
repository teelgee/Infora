// T-470 acceptance — the scope control, driven by keyboard alone, and the reach
// statement under the answer.
//
// *In plain terms: on Ask, scope a question to one discipline without touching
// the mouse (open the control, type three letters, press Enter), send it, and
// read under the answer how many documents it read. Then choose a scope that
// reaches nothing and see Send go off, with the reason beside it.*
import { expect, test } from '@playwright/test';
import type {
  ClassificationSchemeResponse,
  GetGroundingScopeResponse,
  MeResponse,
  ScopePreviewResponse,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

test('Ask: scope to one discipline by keyboard alone, send, read the reach; an empty scope turns Send off', async ({ page }) => {
  // ── arrange, through the API: one document the asker can ground on carries
  // the Geotechnical term, so the scope reaches something ────────────────────
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const owner = await ApiSession.login(SEEDED.owner);
  const projectId = (await eleanor.get<MeResponse>('/me')).participants[0]!.projectId;
  const scheme = await eleanor.get<ClassificationSchemeResponse>(`/projects/${projectId}/classification-scheme`);
  const discipline = scheme.facets.find((facet) => facet.key === 'discipline')!;
  const geotechnical = discipline.terms.find((term) => term.label === 'Geotechnical')!;
  const { sources } = await eleanor.get<GetGroundingScopeResponse>(`/projects/${projectId}/grounding-scope`);
  const preview = async (termId: string) =>
    eleanor.post<ScopePreviewResponse>(`/projects/${projectId}/scope-preview`, { scope: { termIds: [termId] } });

  // whichever organisation produced a document may classify it
  let classified = false;
  for (const source of sources) {
    for (const session of [eleanor, owner]) {
      const put = await session.raw('put', `/containers/${source.containerId}/classifications`, {
        facetId: discipline.id,
        termId: geotechnical.id,
      });
      if (put.status() === 204) classified = true;
      if (classified) break;
    }
    if (classified) break;
  }
  expect(classified).toBe(true);
  const reaches = await preview(geotechnical.id);
  expect(reaches.inScope).toBeGreaterThan(0);

  // a discipline nothing carries — the "reaches nothing" scope
  let emptyTerm: { label: string } | undefined;
  for (const term of discipline.terms) {
    if (term.id !== geotechnical.id && (await preview(term.id)).inScope === 0) {
      emptyTerm = term;
      break;
    }
  }
  expect(emptyTerm).toBeDefined();

  // ── the browser, by keyboard ─────────────────────────────────────────────
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: 'Ask' }).first().click();

  const chip = page.getByRole('button', { name: /Scope:/ });
  await expect(chip).toContainText('whole library');
  await chip.focus();

  // 1 open  2 type  3 Enter — then Esc, which only closes
  await page.keyboard.press('Enter');
  const search = page.getByRole('combobox', { name: 'Scope' });
  await expect(search).toBeFocused();
  await page.keyboard.type('geo');
  // typing narrows every group at once, and the discipline comes first
  await expect(page.getByRole('option').first()).toContainText('Geotechnical');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  // the preview line under the search says what the choice reaches
  await expect(page.getByRole('status').filter({ hasText: 'can be read' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  // the selection is kept, and the keyboard is back on the chip
  await expect(chip).toContainText('Geotechnical');
  await expect(chip).toBeFocused();

  // send, and read the sentence under the answer
  const composer = page.getByPlaceholder('Ask about the project');
  await composer.fill('What did the ground investigation record?');
  await composer.press('Enter');
  const reach = page.locator('.cf-reach').first();
  await expect(reach).toBeVisible({ timeout: 30_000 });
  const read = /Read (?:(\d+) documents?|no documents)/.exec((await reach.innerText()))!;
  expect(read).not.toBeNull();
  const documentsRead = read[1] === undefined ? 0 : Number(read[1]);
  // read ≤ in scope: the run cannot have read what the scope did not admit
  expect(documentsRead).toBeLessThanOrEqual(reaches.inScope);
  // …and the scope really narrowed: the preview said it left documents out, and
  // the answer's sentence says so too — so "read ≤ in scope" cannot pass on a
  // run that read nothing of a scope that excluded nothing (review fix)
  expect(reaches.leftOutByScope).toBeGreaterThan(0);
  await expect(reach).toContainText('left out');

  // ── clear it, then choose a scope that reaches nothing ───────────────────
  await chip.click();
  await page.getByRole('button', { name: 'Use the whole library' }).click();
  await expect(chip).toContainText('whole library');
  // the list stays open and the search keeps the keyboard
  await expect(search).toBeFocused();
  await page.keyboard.type(emptyTerm!.label);
  await expect(page.getByRole('option').first()).toContainText(emptyTerm!.label);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await expect(chip).toContainText('nothing to read');
  await composer.fill('What did the ground investigation record?');
  // Send is off, and the reason is printed beside it — not only refused later
  await expect(page.getByRole('button', { name: '↵' })).toBeDisabled();
  await expect(page.locator('.composer-blocked')).toContainText('Nothing to read in this scope');
  await composer.press('Enter');
  await expect(page.locator('.cf-reach')).toHaveCount(1); // no second answer was produced

  await eleanor.dispose();
  await owner.dispose();
});
