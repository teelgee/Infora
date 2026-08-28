// T-182 / T-185 — the create-folder-structure builder, driven in the browser: a
// super-user lays out a nested tree with an interactive builder (a name field per
// folder, a subfolder button to nest, no whitespace to manage) and creates the
// whole structure at once (ADR-0040). Templates are a deliberate follow-up.
import { expect, test } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

test('a super-user builds a nested folder structure with the interactive builder', async ({ page }) => {
  await loginAs(page, SEEDED.consultant); // elevated super-user of Calder & Hale
  await page.getByRole('link', { name: /Sandbox/ }).click();

  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const sb = page.getByRole('dialog');
  await sb.getByPlaceholder('e.g. Ecology working area').fill(`Structure e2e ${Date.now()}`);
  await sb.getByRole('button', { name: 'Next' }).click(); // wizard step 1 → people (private default)
  await sb.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sb).toBeHidden();

  await page.getByRole('button', { name: /Folder structure/ }).click();
  const builder = page.getByRole('dialog');
  await expect(builder).toBeVisible();
  const names = builder.getByPlaceholder('Folder name');

  // Environmental (root) with two children, then Engineering (root) — no indentation
  await names.nth(0).fill('Environmental');
  await builder.getByRole('button', { name: 'Add a subfolder inside Environmental' }).click();
  await names.nth(1).fill('Ecology');
  await builder.getByRole('button', { name: 'Add a subfolder inside Environmental' }).click();
  await names.nth(2).fill('Noise');
  await builder.getByRole('button', { name: 'Add folder', exact: true }).click();
  await names.nth(3).fill('Engineering');

  const create = builder.getByRole('button', { name: /Create 4 folders/ });
  await expect(create).toBeVisible();
  await create.click();
  await expect(builder).toBeHidden();

  // the top-level folders are in the tree, and the nesting is real
  await expect(page.getByRole('button', { name: 'Environmental', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Engineering', exact: true })).toBeVisible();
  await page.getByRole('row').filter({ hasText: 'Environmental' }).getByRole('button', { name: 'Expand folder' }).click();
  await expect(page.getByRole('button', { name: 'Ecology', exact: true })).toBeVisible();
});

// T-363 (S6) — the no-model plan seed: "Propose from the plan's disciplines"
// prefills the builder from the org's own plan rows; the super user edits and
// confirms; the same deterministic endpoint executes.
test('the builder proposes a structure from the plan’s disciplines — editable before creating', async ({ page }) => {
  // the seed derives from the org's own disciplined plan rows — make one
  const stamp = Date.now();
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  await eleanor.post(`/projects/${projectId}/plan`, {
    documentReference: `T363-${stamp}`,
    title: 'Seed source row',
    metadata: { discipline: 'ECV' },
  });
  await eleanor.dispose();

  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();

  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const sb = page.getByRole('dialog');
  await sb.getByPlaceholder('e.g. Ecology working area').fill(`Seed e2e ${Date.now()}`);
  await sb.getByRole('button', { name: 'Next' }).click();
  await sb.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sb).toBeHidden();

  await page.getByRole('button', { name: /Folder structure/ }).click();
  const builder = page.getByRole('dialog');
  await builder.getByRole('button', { name: /Propose from the plan/ }).click();

  // T-369 — the disciplined row created above surfaces as a labelled candidate
  // folder, SOMEWHERE in the list. This used to assert on `.first()`, which is a
  // position this test does not own: the seed derives one candidate per distinct
  // discipline on the whole organisation's plan, ordered, so any sibling suite
  // that plans a discipline sorting ahead of ECV — `slice-a2-ui.spec.ts` plans a
  // CCA row, and CCA leads the default scheme's list — displaced it. The
  // assertion was the defect, not the ordering: pinning execution order would
  // only hide the same fragility in the next test that seeds a discipline.
  // Controlled inputs carry the value as a DOM property, hence toHaveValue.
  const names = builder.getByPlaceholder('Folder name');
  await expect
    .poll(async () =>
      (await names.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).some((v) =>
        /ECV/.test(v),
      ),
    )
    .toBe(true);
  await expect(builder.getByRole('button', { name: /Create \d+ folder/ })).toBeEnabled();
  // still an editable proposal, not an act — cancel leaves nothing behind
  await builder.getByRole('button', { name: 'Cancel' }).click();
  await expect(builder).toBeHidden();
});

// T-364 (S6, ADR-0027 propose-confirm) — the agent half, driven in the browser
// against the deterministic substrate: a free-form ask fills the SAME builder,
// the super user edits it, and the existing deterministic endpoint creates it.
test('the builder’s agent proposes a tree from a free-form ask; the super user edits then confirms', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();

  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const sb = page.getByRole('dialog');
  await sb.getByPlaceholder('e.g. Ecology working area').fill(`Agent e2e ${Date.now()}`);
  await sb.getByRole('button', { name: 'Next' }).click();
  await sb.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sb).toBeHidden();

  await page.getByRole('button', { name: /Folder structure/ }).click();
  const builder = page.getByRole('dialog');
  await builder.getByPlaceholder(/Describe the structure/).fill('one area per discipline, survey and reporting inside each');
  // exact: the plan-seed button (T-363) is also named 'Propose from the plan…'
  await builder.getByRole('button', { name: 'Propose', exact: true }).click();

  // proposed into the builder — nothing created yet, and it is editable
  const names = builder.getByPlaceholder('Folder name');
  await expect(names.first()).toHaveValue('Environmental');
  await expect(page.getByRole('button', { name: 'Environmental', exact: true })).toHaveCount(0);
  await names.first().fill('Environmental — renamed by hand');

  await builder.getByRole('button', { name: /Create \d+ folders/ }).click();
  await expect(builder).toBeHidden();
  // the confirmed tree is what landed, edit and all
  await expect(page.getByRole('button', { name: 'Environmental — renamed by hand', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Geotechnical', exact: true })).toBeVisible();
});
