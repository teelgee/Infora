// T-445 — the playbook on screen (ADR-0056 §10): the firm's shelf in its
// workspace, the act of putting an app on it, and deploying one into a project.
//
// *In plain terms: three small surfaces. A shelf in your firm's workspace, beside
// its manuals and its saved outlines, holding the apps your colleagues kept as
// templates. A button on an app that keeps it there, with every row stripped
// out. And a picker in a project's Apps section that puts a fresh copy of one
// into that project.*
//
// 🔒 **NO PERMISSION IS COMPUTED HERE.** `maySave` on the shelf and `mayBuild`
// on an app are the server's answers. A screen that worked one out would be a
// second copy of the access rule, and the first disagreement between the copies
// is a button offered to somebody the API then refuses.
//
// 🔒 **THE SHELF SAYS WHAT TRAVELS, IN WORDS, EVERY TIME.** A person about to
// put their client's app on a shelf their colleagues read needs to know before
// they press it that no row goes with it — including the reference rows they
// typed in themselves. That sentence is on the save control and on the shelf,
// not in a tooltip, because the owner's rule is that a firm's template must be
// safe to hand to the next client without anybody having to remember why.
import { useCallback, useEffect, useState } from 'react';
import type { PlaybookRecord } from '@infora/contracts';
import { Badge, Button, Card, Field, SectionLabel, SelectInput, TextInput } from '@infora/ui';
import { api } from '../api';
import { ShelfList } from './knowledge';
import { formatDateTime } from './shared';

const countOf = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** What a shelf entry says about itself: who kept it, from what, and how big a
 * shape it is. The source project is named only when the server named it —
 * which it does only for somebody who is on that project themselves. */
function noteOf(playbook: PlaybookRecord): string {
  const where =
    playbook.savedFromAppName === null
      ? 'Supplied with Infora'
      : playbook.savedFromProjectName === null
        ? `Kept from ${playbook.savedFromAppName}`
        : `Kept from ${playbook.savedFromAppName} — ${playbook.savedFromProjectName}`;
  const shape = `${countOf(playbook.tableDeclarations.length, 'table')}, ${countOf(
    playbook.definition.interfaces.length,
    'screen',
  )}`;
  return `Version ${playbook.version} · ${shape} · ${where} · kept by ${playbook.savedByName} on ${formatDateTime(playbook.savedAt)}`;
}

/**
 * The firm's playbook shelf, in the workspace beside its manuals and its saved
 * outlines — the same kind of thing they are: the firm's own material, org-
 * private, the same on every project and belonging to none of them.
 */
export function PlaybookShelfPane() {
  const [items, setItems] = useState<PlaybookRecord[] | null>(null);
  const [maySave, setMaySave] = useState(false);

  useEffect(() => {
    void api
      .playbooks()
      .then((res) => {
        setItems(res.items);
        setMaySave(res.maySave);
      })
      // a failed read is not an empty shelf: rendering "nothing kept" off a
      // request that did not answer is a claim we cannot make
      .catch(() => setItems(null));
  }, []);

  return (
    <>
      <SectionLabel>Your firm’s templates</SectionLabel>
      <Card>
        <Badge tone="neutral">Org-private — the same on every project</Badge>
        <p className="page-sub">
          An app your firm built and kept, ready to put into the next project. A template holds the
          shape of the work — its tables and their columns, its screens, how often it runs, what its
          analysis asks — and <b>not one row of anybody’s data</b>, including the lookup rows your
          own people typed in. Deploying one makes a fresh app with empty tables, and the two never
          speak again afterwards.
        </p>
        {!maySave && (
          <p className="page-sub">
            Your organisation decides who among its own people may build apps, and it has not given
            you that. Ask an administrator at your firm.
          </p>
        )}
        <ShelfList
          heading="Kept apps"
          empty="Nothing kept yet. Open an app your firm built and choose “Keep this as a template”."
          items={items?.map((playbook) => ({
            key: playbook.id,
            title: playbook.suppliedByInfora ? `${playbook.name} — supplied` : playbook.name,
            note: noteOf(playbook),
          }))}
        />
      </Card>
    </>
  );
}

/**
 * Keeping an app as a template, from the app's own page.
 *
 * Rendered only where the server said this person may build this app: the same
 * answer that decides who edits and publishes it, because a template is the
 * firm's judgement about how its work is shaped and that is its builders' to
 * give away.
 */
export function SaveAsPlaybook(props: { appId: string; appName: string; mayBuild: boolean }) {
  const [name, setName] = useState(props.appName);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!props.mayBuild) return null;

  const keep = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.saveAppAsPlaybook(props.appId, { name: name.trim() });
      setNotice(
        `Kept on your firm’s shelf as “${res.playbook.name}”, version ${res.playbook.version}. Its tables travelled empty.`,
      );
    } catch {
      setNotice(
        'That could not be kept. An app needs at least one table before there is a shape to keep.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionLabel>Keep it for the next project</SectionLabel>
      <Card>
        <p className="page-sub">
          Keep this app as a template on your firm’s own shelf, in your workspace. The shape travels
          — the tables and their columns, whether each needs signing off, the screens, the schedule
          and the analysis prompt. <b>No rows travel</b>, whoever entered them and whichever table
          they are in, so what you keep carries nothing of this client into the next one. Keeping it
          again under the same name makes the next version, and changes nothing already deployed.
        </p>
        <div className="shelf-head" style={{ gap: 8 }}>
          <Field label="Call the template">
            <TextInput value={name} onChange={setName} />
          </Field>
          <Button onClick={() => void keep()} disabled={saving || name.trim() === ''}>
            Keep this as a template
          </Button>
        </div>
        {notice !== null && <p className="page-sub">{notice}</p>}
      </Card>
    </>
  );
}

/**
 * Deploying one of the firm's templates into this project.
 *
 * Rendered inside the project's Apps section, beside "create an app", because
 * that is what it is: the same act with the steps already filled in. The picker
 * is absent, not disabled, for somebody who may not build — the section above
 * it already decides that from the server's own answer.
 */
export function DeployFromPlaybook(props: { projectId: string; onDeployed: () => void }) {
  const [items, setItems] = useState<PlaybookRecord[]>([]);
  const [playbookId, setPlaybookId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .playbooks()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  if (items.length === 0) return null;
  const chosen = items.find((item) => item.id === playbookId);

  const deploy = async () => {
    setNotice(null);
    try {
      await api.deployPlaybook(props.projectId, { playbookId });
      setPlaybookId('');
      props.onDeployed();
    } catch {
      setNotice('That could not be deployed here.');
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p className="page-sub">
        Or start from one of your firm’s templates. It arrives as a new app of its own, with the
        same steps and <b>empty tables</b> — load your own lookup rows into it here. Nobody outside
        your firm can open it until you say so.
      </p>
      <div className="shelf-head" style={{ gap: 8 }}>
        <SelectInput
          value={playbookId}
          onChange={setPlaybookId}
          options={items.map((item) => ({
            value: item.id,
            label: `${item.name} — version ${item.version}`,
          }))}
          placeholder="From a template…"
        />
        <Button disabled={playbookId === ''} onClick={() => void deploy()}>
          Deploy it here
        </Button>
      </div>
      {chosen !== undefined && (
        <p className="page-sub">
          {countOf(chosen.tableDeclarations.length, 'table')} —{' '}
          {chosen.tableDeclarations.map((table) => table.name).join(', ')}. Kept by{' '}
          {chosen.savedByName}.
        </p>
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </div>
  );
}
