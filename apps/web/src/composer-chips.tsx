// T-292 — the Ask composer's scope chips: **Data sources**, **Tools** and
// **Context**. The Lens chip is T-283's `LensPicker` and sits beside these; the
// **Model** chip stays where T-100 left it, as a placeholder, because a
// user-facing model picker is `Q-021` and is not ruled.
//
// The Data sources chip is the one that matters, and its warning state is the
// reason it exists: **a grounded answer over an empty scope is the single most
// misleading state Ask can be in**, because it looks exactly like a good one —
// the answer arrives, it is fluent, and nothing on the screen says it rested on
// nothing. So the chip states "no sources in scope" in a warning tone rather
// than showing a plausible zero.
//
// Two properties are load-bearing and both live on the server:
//
//   1. **The list cannot show a document the answer could not have used.** It
//      is `GET /projects/:id/grounding-scope`, computed from the SAME
//      `liveLibraryFilter` both arms of the assembly gateway run — not the
//      library list, which is a different question since the ADR-0011 rider.
//   2. **Refinement NARROWS, never widens.** The chosen ids ride the run
//      request and are intersected into the grounded pre-filter's own `and()`
//      through T-248's attenuation, so this is a relevance control and not an
//      access one. Nothing here is trusted: an id this client invented would
//      remove, exactly as a real one does.
import { useEffect, useState } from 'react';
import type { GroundingSource } from '@infora/contracts';
import { Chip, DropdownMenu, DropdownMenuItem } from '@infora/ui';
import { api } from './api';

export type GroundingScope = {
  sources: GroundingSource[];
  assemblyTokenBudget: number;
} | null;

/** One read per project, shared by both chips — they are one question. */
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

export function DataSourcesChip(props: {
  scope: GroundingScope;
  /** the refined subset; empty = not narrowed (T-248's `absent ≠ empty`) */
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const { scope } = props;
  const total = scope?.sources.length ?? 0;
  const narrowed = props.selected.length > 0;
  const label =
    scope === null
      ? '▤ Data sources'
      : total === 0
        ? '▤ No sources in scope'
        : narrowed
          ? `▤ ${props.selected.length} of ${total} sources`
          : `▤ ${total} source${total === 1 ? '' : 's'}`;

  // the zero case is a statement, not a menu: there is nothing to refine, and
  // a dropdown offering an empty list would read as a loading failure
  if (scope !== null && total === 0) {
    return (
      <Chip
        tone="warning"
        disabled
        title="Nothing in this project's library is in scope for a grounded answer — an answer now would rest on model knowledge alone."
      >
        {label}
      </Chip>
    );
  }

  return (
    <DropdownMenu
      placement="top"
      trigger={(toggle) => (
        <Chip
          onClick={toggle}
          title="The documents a grounded answer can draw on. Narrowing is a relevance control — it never widens what you can reach."
        >
          {label}
        </Chip>
      )}
    >
      <DropdownMenuItem>
        <span style={{ color: 'var(--text-muted)' }}>
          Narrowing changes relevance, never reach.
        </span>
      </DropdownMenuItem>
      {(scope?.sources ?? []).map((source) => {
        const on = props.selected.includes(source.containerId);
        return (
          <DropdownMenuItem
            key={source.containerId}
            onClick={() =>
              props.onChange(
                on
                  ? props.selected.filter((id) => id !== source.containerId)
                  : [...props.selected, source.containerId],
              )
            }
          >
            <span style={{ marginRight: 6 }}>{on ? '☑' : '☐'}</span>
            <span className="mono">{source.documentReference}</span>
            {source.title !== null && <span style={{ marginLeft: 6 }}>{source.title}</span>}
          </DropdownMenuItem>
        );
      })}
      {narrowed && (
        <DropdownMenuItem onClick={() => props.onChange([])}>Use every source</DropdownMenuItem>
      )}
    </DropdownMenu>
  );
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
