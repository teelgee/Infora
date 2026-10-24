// T-460 — the saved-views menu on a register's toolbar.
//
// *In plain terms: "Views" lists the ways you and your firm have saved this
// list — pick one and the list sets itself up that way; "Save current view…"
// keeps the way it is set up now under a name, for you or for the firm; your
// own views can be removed.*
//
// A saved view is a named filter, never an access object (CONTEXT.md): the
// menu applies it by handing the screen its stored query, and the screen
// re-reads through the same access-resolved reads as always. Shared views
// carry their maker's name, so a colleague knows whose way of looking it is.
import { useEffect, useState } from 'react';
import type { SavedView, SavedViewRegister } from '@infora/contracts';
import { Button, DropdownMenu, DropdownMenuItem, Field, Modal, TextInput } from '@infora/ui';
import { api } from './api';

export function SavedViewsMenu(props: {
  projectId: string;
  register: SavedViewRegister;
  /** the list's current query, as the screen would restore it */
  current: Record<string, unknown>;
  onApply: (filter: Record<string, unknown>) => void;
  /** the view the screen currently shows, if it came from one */
  activeName?: string | null;
}) {
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api
      .savedViews(props.projectId, props.register)
      .then((r) => setViews(r.items))
      .catch(() => setViews([]));
  useEffect(() => {
    void load();
    // the list is keyed on the project and the register; `load` is stable per render of those
  }, [props.projectId, props.register]);

  return (
    <>
      <DropdownMenu
        align="end"
        fixed
        trigger={(toggle) => (
          <Button size="sm" variant="quiet" onClick={toggle} aria-label="Saved views">
            Views{props.activeName ? ` · ${props.activeName}` : ''}
          </Button>
        )}
      >
        {(views ?? []).map((v) => (
          <DropdownMenuItem key={v.id} onClick={() => props.onApply({ ...v.filter, view: v.name })}>
            {v.name}
            {v.shared && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11.5, marginLeft: 6 }}>
                {v.mine ? 'shared with your firm' : `${v.savedBy.name}'s, shared`}
              </span>
            )}
          </DropdownMenuItem>
        ))}
        {views !== null && views.length === 0 && (
          // T-464 — a note, never a menu item that does nothing
          <span className="field-hint" style={{ display: 'block', padding: '6px 10px' }}>
            No saved views yet
          </span>
        )}
        <DropdownMenuItem onClick={() => setSaving(true)}>Save current view…</DropdownMenuItem>
        {(views ?? []).some((v) => v.mine) && (
          <DropdownMenuItem
            onClick={() => {
              const mine = (views ?? []).filter((v) => v.mine);
              const target = mine.find((v) => v.name === props.activeName) ?? mine[0];
              if (!target) return;
              void api.deleteSavedView(target.id).then(load);
            }}
          >
            Remove {props.activeName && (views ?? []).some((v) => v.mine && v.name === props.activeName) ? `“${props.activeName}”` : 'my first view'}
          </DropdownMenuItem>
        )}
      </DropdownMenu>
      {saving && (
        <SaveViewModal
          projectId={props.projectId}
          register={props.register}
          filter={props.current}
          onClose={() => setSaving(false)}
          onSaved={() => {
            setSaving(false);
            return load();
          }}
        />
      )}
    </>
  );
}

/**
 * The "save under a name" dialog, shared by the register toolbars and (T-470)
 * the scope control. It saves whatever `filter` it is handed to the `register`
 * and says nothing about what that filter means — a view is a way of looking,
 * never a way in.
 */
export function SaveViewModal(props: {
  projectId: string;
  register: SavedViewRegister;
  filter: Record<string, unknown>;
  onClose: () => void;
  /** called after the view is stored; the caller re-reads its list */
  onSaved: () => void | Promise<unknown>;
  title?: string;
  /** the line under the name box */
  hint?: string;
  placeholder?: string;
}) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = () => {
    setBusy(true);
    setProblem(null);
    void api
      .createSavedView(props.projectId, { register: props.register, name: name.trim(), filter: props.filter, shared })
      .then(() => props.onSaved())
      .catch(() => setProblem('That name is already one of your views here — choose another.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title ?? 'Save this view'}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || name.trim() === ''} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <Field
          label="Name"
          hint={props.hint ?? 'What you searched, the filters, the sort and the hidden columns are kept under it.'}
        >
          <TextInput value={name} onChange={setName} placeholder={props.placeholder ?? 'e.g. Geotech, live'} />
        </Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with everyone at your organisation on this project
        </label>
        <span className="field-hint">A view is a way of looking, never a way in: it shows people what they could already see.</span>
        {problem && <span className="field-hint">{problem}</span>}
      </div>
    </Modal>
  );
}
