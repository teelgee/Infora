// T-283 — the Lens chip on the Ask composer.
//
// THE SENTENCE IN THE PICKER IS PART OF THE TICKET, not decoration: *"A Lens
// changes how answers are written. It does not change what you can see."* It
// sits in the panel itself and not in a tooltip, because the misconception it
// corrects — that picking a Lens narrows or widens what the agent can reach —
// is the one that would make a user trust the wrong thing, and a tooltip is
// read by nobody who was not already unsure.
//
// This is the chip form only. The full composer treatment — five chips, the
// Data-sources warning state, the Model pin — is T-292 and is post-MVP.
import { useEffect, useState } from 'react';
import type { LensSummary } from '@infora/contracts';
import { Chip, DropdownMenu, DropdownMenuItem } from '@infora/ui';
import { api } from './api';

export type LensChoice = { id: string; label: string } | null;

/**
 * Loads the deployment's Lenses once and reports the configured default.
 *
 * The default arrives from the server (`DEFAULT_LENS_ID`), never from a
 * constant here: which register a firm's people start in is a deployment
 * decision, and a hard-coded `planning-environmental` would make Infora's own
 * view of the modal user into everyone's.
 */
export function useLenses(): { lenses: LensSummary[]; defaultLensId: string | null; loaded: boolean } {
  const [state, setState] = useState<{ lenses: LensSummary[]; defaultLensId: string | null } | null>(
    null,
  );
  useEffect(() => {
    void api
      .lenses()
      .then(setState)
      // a deployment with no Lens layer is a valid deployment — it answers
      // under the shared core, which is what the product did before Lenses
      .catch(() => setState({ lenses: [], defaultLensId: null }));
  }, []);
  return { lenses: state?.lenses ?? [], defaultLensId: state?.defaultLensId ?? null, loaded: state !== null };
}

export function LensPicker(props: {
  lenses: LensSummary[];
  value: LensChoice;
  onChange: (choice: LensChoice) => void;
}) {
  if (props.lenses.length === 0) return null; // no Lens layer configured

  return (
    <DropdownMenu
      placement="top"
      trigger={(toggle) => (
        <Chip onClick={toggle} title="How answers are written — not what you can see">
          ◑ {props.value?.label ?? 'No Lens'}
        </Chip>
      )}
    >
      <DropdownMenuItem>
        <span style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.45 }}>
          A Lens changes how answers are written. It does not change what you can see.
        </span>
      </DropdownMenuItem>
      {props.lenses.map((lens) => (
        <DropdownMenuItem
          key={lens.id}
          onClick={() => props.onChange({ id: lens.id, label: lens.label })}
        >
          <span>
            <b>{lens.label}</b>
            {props.value?.id === lens.id && ' ✓'}
            <br />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{lens.description}</span>
          </span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onClick={() => props.onChange(null)}>
        <span>
          No Lens{props.value === null && ' ✓'}
          <br />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Answer in Infora&apos;s standard register.
          </span>
        </span>
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
