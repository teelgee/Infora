// T-053 — POST /suggestions/:suggestionId/resolution: the Signal endpoint.
// Scope rides the suggestion's home document (project + organisation,
// T-023); exactly one Signal per Suggestion — a second call is 409 conflict.
import { Hono } from 'hono';
import { resolveSuggestionBody } from '@infora/contracts';
import type { ApiError, ResolveSuggestionResponse } from '@infora/contracts';
import type { Db } from '@infora/db';
import { resolveSuggestion } from '@infora/orchestration';
import { resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';
import { toSandboxDocument } from './sandbox';

export function suggestionRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  app.post(
    '/suggestions/:suggestionId/resolution',
    resourceScope(deps, 'suggestionId', resourceHomes.suggestion),
    async (c) => {
      const body = resolveSuggestionBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json(
          { error: 'invalid', detail: "editedContent is required iff resolution is 'edited'" } satisfies ApiError,
          400,
        );
      }

      const result = await resolveSuggestion(deps.db, {
        suggestionId: c.req.param('suggestionId'),
        resolution: body.data.resolution,
        ...(body.data.editedContent !== undefined && { editedContent: body.data.editedContent }),
        resolvedByParticipantId: c.get('slice').participantId,
      });

      if (result.outcome === 'conflict') {
        return c.json(
          { error: 'conflict', detail: 'this suggestion is already resolved' } satisfies ApiError,
          409,
        );
      }
      return c.json(
        {
          signalId: result.signalId,
          ...(result.document !== null && { sandboxDocument: toSandboxDocument(result.document) }),
        } satisfies ResolveSuggestionResponse,
        201,
      );
    },
  );

  return app;
}
