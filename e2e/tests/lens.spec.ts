// T-283 acceptance — the Lens picker on Ask, and the guarantees around it.
//
// The browser half exists for one sentence in particular: *"A Lens changes how
// answers are written. It does not change what you can see."* It is required to
// be IN THE PICKER, not in a tooltip, because the misconception it corrects is
// the one that would make a user trust the wrong thing — and a tooltip is read
// by nobody who was not already unsure. A test that only checked the chip
// rendered would let that sentence be quietly moved into a `title=`.
import { expect, test } from '@playwright/test';
import type { ListLensesResponse, Run } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test('browser: the Lens chip is on the Ask composer, and says what a Lens does not do', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Wrenfield–Ashcombe 400kV Connection').click();

  await page.getByRole('link', { name: 'Ask' }).first().click();

  // the substrate configures `planning-environmental` as the default, so the
  // chip opens preselected — the default is CONFIG, and the chip reflects it
  const chip = page.getByTitle('How answers are written — not what you can see');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Planning & Environmental');

  await chip.click();
  // in the panel itself, not a tooltip
  await expect(
    page.getByText('A Lens changes how answers are written. It does not change what you can see.'),
  ).toBeVisible();

  // all four active Lenses, and the draft Commercial one nowhere — a real user
  // is never offered a Lens that ships deliberately unfinished
  const panel = page.locator('.dropdown-menu-item');
  for (const label of ['Planning & Environmental', 'Engineer', 'Project Manager', 'Communications']) {
    await expect(panel.filter({ hasText: label }).first()).toBeVisible();
  }
  await expect(panel.filter({ hasText: 'Commercial' })).toHaveCount(0);

  // switching re-labels the chip, which is the whole of "switching" on this
  // surface — it takes effect on the NEXT answer, never a past one
  await panel.filter({ hasText: 'Communications' }).first().click();
  await expect(chip).toContainText('Communications');
});

test('api: the Lens list is the deployment’s, and two turns may differ', async () => {
  const consultant = await ApiSession.login(SEEDED.consultant);
  const { lenses, defaultLensId } = await consultant.get<ListLensesResponse>('/lenses');

  expect(lenses.map((lens) => lens.id).sort()).toEqual([
    'communications',
    'engineer',
    'planning-environmental',
    'project-manager',
  ]);
  expect(defaultLensId).toBe('planning-environmental');
  // summaries only: prohibitions and worked exchanges are prompt material
  for (const lens of lenses) {
    expect(Object.keys(lens).sort()).toEqual(['description', 'id', 'label', 'version']);
  }

  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const { conversationId } = await consultant.post<{ conversationId: string }>(
    `/projects/${projectId}/conversations`,
    { surface: 'web' },
  );

  const question = 'What does the land quality assessment record?';
  const first = await consultant.post<Run>(`/conversations/${conversationId}/runs`, {
    request: question,
    lensId: 'planning-environmental',
  });
  const second = await consultant.post<Run>(`/conversations/${conversationId}/runs`, {
    request: question,
    lensId: 'communications',
  });

  // the pair: two answers that read differently, over one identical source set
  expect(first.response).not.toBe(second.response);
  const sources = (run: Run) =>
    run.steps
      .find((step) => step.type === 'retrieve')!
      .sourceSet.map((source) => JSON.stringify(source))
      .sort();
  expect(sources(first)).toEqual(sources(second));

  // an id the deployment does not carry is refused, not quietly defaulted
  const refused = await consultant.raw('post', `/conversations/${conversationId}/runs`, {
    request: question,
    lensId: 'commercial',
  });
  expect(refused.status()).toBe(400);

  await consultant.dispose();
});
