// T-292 — the Ask composer's chips: **Tools** and **Context**, and the one read
// of the grounding scope they and the scope control share. The Lens chip is
// T-283's `LensPicker` and sits beside these; the **Model** chip stays where
// T-100 left it, as a placeholder, because a user-facing model picker is `Q-021`
// and is not ruled.
//
// **The Data sources chip is gone (T-470).** Its job — say what the answer may
// draw on, and say "no sources in scope" in a warning tone when it is nothing,
// because a grounded answer over an empty scope is the most misleading state
// Ask can be in — moved into the one `ScopeControl`, which keeps that warning.
// What stays true here is the read both use: `GET /projects/:id/grounding-scope`,
// computed from the SAME `liveLibraryFilter` both arms of the assembly gateway
// run, so a list can never show a document the answer could not have used.
import { useEffect, useState } from 'react';
import type { GetGroundingScopeResponse } from '@infora/contracts';
import { Chip } from '@infora/ui';
import { api } from './api';

export type GroundingScope = GetGroundingScopeResponse | null;

/** One read per project, shared by the chips and the scope control — they are one question. */
export function useGroundingScope(projectId: string): GroundingScope {
  const [scope, setScope] = useState<GroundingScope>(null);
  useEffect(() => {
    setScope(null);
    void api
      .groundingScope(projectId)
      .then(setScope)
      // a failed read is NOT zero sources: the warning state is a claim about
      // the corpus, and a claim we could not check must not be made
      .catch(() => setScope(null));
  }, [projectId]);
  return scope;
}

/**
 * Tools — a **pointer, never a launcher**.
 *
 * `Q-030`'s owner steer put the V1 tool set in the rail's Tools section, and
 * how a declared workflow is launched from the composer is not ruled. Pinning a
 * workflow from here would bias classification, which is a real design with a
 * real ticket (**T-334**) queued behind T-309's executor ruling. Until then the
 * honest chip says where tools live and does not pretend to start one.
 */
export function ToolsChip() {
  return (
    <Chip
      disabled
      title="Tools live in the rail's Tools section. Pinning a codified workflow from the composer waits on T-334, which is queued behind the executor ruling (Q-030/Q-031)."
    >
      ⚙ Tools
    </Chip>
  );
}

/**
 * Context — informational, and deliberately says less than the design sketch.
 *
 * The sketch reads "budget consumed against the assembly budget". The budget is
 * a real deployment fact and is reported here; **consumption is not on the
 * record** — `AssembledInput.budget` never reaches a Step row, so no answer can
 * be asked what it spent. Rendering a consumed figure would mean computing one
 * client-side from something that is not it, which is the failure mode the
 * coverage note and the null-cost rule were both written against. So the chip
 * states the budget and says the rest is not recorded.
 */
export function ContextChip(props: { scope: GroundingScope }) {
  if (props.scope === null) return null;
  return (
    <Chip
      disabled
      title="Every turn assembles its working input inside this budget, grounded material first (ADR-0029 §5). What a given answer consumed of it is not recorded on the run."
    >
      ◱ Context · {props.scope.assemblyTokenBudget.toLocaleString()} tokens
    </Chip>
  );
}
