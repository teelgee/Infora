// T-487 — test support: give a test's app the one thing the publish gate now
// asks for that most of these suites never drew.
//
// *In plain terms: Infora will not open an app that has no table to fill in or
// no screen to open (walk defect 11). The older suites that publish an app to
// test scope, rows, runs or exports declared a table and nothing else; this
// puts a plain stand-in screen on such an app, with the "who may open it"
// question answered, so they carry on testing what they were written to test.*
//
// Never deployed: imported by tests only.
import type { GetAppResponse } from '@infora/contracts';

type Request = (path: string, init?: RequestInit) => Response | Promise<Response>;

/** The stand-in screen's id — answered as "who may open it" below. */
export const STAND_IN_SCREEN_ID = 'stand-in';

/**
 * Put a stand-in screen on the app's working copy when it has none, with its
 * who-may-open question answered (open to everyone the app is open to), so the
 * gate has a screen and no open question. A no-op when the app already has one.
 */
export async function addStandInScreen(request: Request, cookie: string, appId: string): Promise<void> {
  const current = (await (await request(`/apps/${appId}`, { headers: { cookie } })).json()) as GetAppResponse;
  const working = current.app.definition!;
  if (working.interfaces.length > 0) return;
  const saved = await request(`/apps/${appId}/definition`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      definition: {
        ...working,
        interfaces: [
          { id: STAND_IN_SCREEN_ID, label: 'Stand-in screen', appTableId: null, openToOrganisationIds: [], source: null },
        ],
        answeredQuestions: [...working.answeredQuestions, `who-may-open:${STAND_IN_SCREEN_ID}`],
      },
    }),
  });
  if (saved.status !== 200) throw new Error(`the stand-in screen was refused: ${saved.status}`);
}
