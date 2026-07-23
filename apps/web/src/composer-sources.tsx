// T-100 — the source row under every chat composer, the Harvey pattern the
// owner named. One source works today: picking a library document inserts
// its reference code, which retrieval's lexical arm already honours (T-031).
// The rest are honest placeholders, each naming what it waits on — attached
// sources (post-skeleton), standard prompts (to be developed), response style
// (predetermined styles set by the project/organisation — T-107, design on
// the tracker), web search (provider — infra session), sandbox search
// (ADR-0011 ruling, tracker) and model choice (multi-model routing behind
// the Router seam, ADR-0028 §9).
import { useEffect, useState } from 'react';
import type { LibraryItem } from '@infora/contracts';
import { Chip, DropdownMenu, DropdownMenuItem } from '@infora/ui';
import { api } from './api';

export function ComposerSources(props: { projectId: string; onInsert: (snippet: string) => void }) {
  const [wantsItems, setWantsItems] = useState(false);
  const [items, setItems] = useState<LibraryItem[] | null>(null);

  useEffect(() => {
    if (!wantsItems || items !== null) return;
    void api.library(props.projectId).then((res) => setItems(res.items));
  }, [wantsItems, items, props.projectId]);

  return (
    <>
      <DropdownMenu
        placement="top"
        trigger={(toggle) => (
          <Chip
            onClick={() => {
              setWantsItems(true);
              toggle();
            }}
            title="Name a library document — retrieval honours its reference"
          >
            ▤ From the library
          </Chip>
        )}
      >
        {(items ?? []).map((item) => (
          <DropdownMenuItem key={item.containerId} onClick={() => props.onInsert(`per ${item.documentReference}`)}>
            <span className="mono">{item.documentReference}</span>
          </DropdownMenuItem>
        ))}
        {items !== null && items.length === 0 && (
          <DropdownMenuItem>No live documents in this project&apos;s library.</DropdownMenuItem>
        )}
      </DropdownMenu>
      <Placeholder glyph="＋" label="Attach a file" waitsOn="attached sources arrive post-skeleton" />
      <Placeholder glyph="≡" label="Prompts" waitsOn="standard prompts — to be developed" />
      <Placeholder
        glyph="✒"
        label="Style"
        waitsOn="respond in a set style — predetermined styles from the project/organisation, to be designed (tracker)"
      />
      <Placeholder glyph="◍" label="Web search" waitsOn="arrives with the search provider (infra session)" />
      <Placeholder
        glyph="▧"
        label="Sandbox search"
        waitsOn="needs a ruling — the AI never grounds on the sandbox (ADR-0011)"
      />
      <Placeholder
        glyph="✳"
        label="Model"
        waitsOn="model choice — multi-model routing behind the Router seam (ADR-0028 §9)"
      />
    </>
  );
}

function Placeholder(props: { glyph: string; label: string; waitsOn: string }) {
  return (
    <Chip disabled title={props.waitsOn}>
      {props.glyph} {props.label}
    </Chip>
  );
}
