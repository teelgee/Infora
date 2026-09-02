// T-424/T-425 — THE RULES WORKBENCH, on screen (ADR-0054 decisions 2 and 3).
//
// *In plain terms: you name a writing standard, upload it (or don't), say which
// kinds of writing it has to cover, and press Create. Infora reads the document
// and shows you every rule it found, next to the exact words in your document
// it came from. You fix, delete and add. Then the client's senior person saves
// it, and that is the moment anybody is bound by it.*
//
// 🔒 **THE REVIEW STEP SITS BETWEEN EXTRACTION AND SAVING, ALWAYS** (decision
// 2). It is what makes the rules the client's rather than Infora's paraphrase
// of them. The extraction stores nothing, so there is no state on this screen
// that anything else can read — which is the structural version of the same
// rule.
//
// 🔒 **A ROW SHOWS ITS ORIGIN PLAINLY, AND AN EXTRACTED ROW SHOWS THE CLIENT'S
// OWN WORDING BESIDE IT** (decision 3). A typed rule renders with none and
// **does not fake one** — an invented quotation is worse than an absent one,
// which is T-305's rule for `page` and T-308's for an unnumbered clause,
// applied a third time.
//
// ⚖ **Accept-all is permitted**, deliberately and against the design session's
// own stress test — *"it is down to the client or the user to behave properly.
// We don't need to plan for that"* (owner, 2026-09-01). So there is no per-rule
// tick to clear: Save takes the list as it stands. This does **not** reopen
// ADR-0048 §3 or ADR-0053 §6, which govern accepting proposed changes into a
// **work product**; here the client is accepting their own configuration of
// their own standard.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  ExtractionReport,
  FindingSeverity,
  ProposedRule,
  RuleKind,
  RuleOrigin,
  RuleRegister,
  RuleSetVersion,
} from '@infora/contracts';
import {
  DOCUMENT_LANGUAGE_CATALOGUE,
  RULE_KINDS,
  RULE_SCOPES,
} from '@infora/contracts';
import { Badge, Button, Card, Field, IconButton, SectionLabel, SelectInput, TextArea, TextInput } from '@infora/ui';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { useMe } from '../session';

/** What each origin is CALLED on screen — never a code word, never an icon alone. */
export const ORIGIN_LABEL: Record<RuleOrigin, string> = {
  extracted: 'From your document',
  typed: 'Typed by a person',
  infora_proposed: 'Proposed by Infora',
};

/** And what each origin MEANS for what a finding will be able to say. */
export const ORIGIN_NOTE: Record<RuleOrigin, string> = {
  extracted: 'A finding from this rule quotes your guide’s own words.',
  typed: 'Nobody wrote this in the guide, so a finding from it quotes nothing.',
  infora_proposed:
    'Infora’s own baseline, not your guide. A finding from it says so, and it binds only because you accepted it.',
};

/** What each kind costs, in the words a client reads it in (decision 4). */
export const KIND_LABEL: Record<RuleKind, string> = {
  term: 'Term — settled by code',
  pattern: 'Pattern — settled by code',
  structure: 'Structure — settled by code',
  measured: 'Measured — arithmetic',
  judgement: 'Judgement — needs the AI',
};

const REGISTERS: { value: RuleRegister; label: string }[] = [
  { value: 'all', label: 'Every register' },
  ...DOCUMENT_LANGUAGE_CATALOGUE.map((option) => ({ value: option.value, label: option.label })),
];

// ── the create step ─────────────────────────────────────────────────────────

export function NewStyleGuideScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [registers, setRegisters] = useState<RuleRegister[]>(['technical']);
  const [fillGaps, setFillGaps] = useState(true);
  const [defaultSeverity, setDefaultSeverity] = useState<FindingSeverity>('required');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the review step's own state: proposed rules, and nothing stored anywhere
  const [guideId, setGuideId] = useState<string | null>(null);
  const [rules, setRules] = useState<ProposedRule[] | null>(null);
  const [report, setReport] = useState<ExtractionReport | null>(null);

  const create = async () => {
    if (projectId === undefined || title.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const guide = await api.createStyleGuide(projectId, title.trim(), file ?? undefined);
      const extracted = await api.extractRules(projectId, guide.id, {
        registers,
        fillGaps,
        defaultSeverity,
      });
      setGuideId(guide.id);
      setRules(extracted.rules);
      setReport(extracted.report);
    } catch {
      setError('That standard could not be read. Check the file, or start from nothing instead.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (projectId === undefined || guideId === null || rules === null) return;
    setBusy(true);
    try {
      await api.saveRuleSet(projectId, guideId, {
        rules: rules.map((rule) => ({
          kind: rule.kind,
          origin: rule.origin,
          statement: rule.statement,
          scope: rule.scope,
          exceptedContexts: rule.exceptedContexts,
          exceptedTerms: rule.exceptedTerms,
          register: rule.register,
          enforcement: rule.enforcement,
          severity: rule.severity,
          payload: rule.payload,
          ...(rule.clauseId !== undefined && { clauseId: rule.clauseId }),
        })),
      });
      void navigate(`/projects/${projectId}/knowledge/style-guides/${guideId}`);
    } catch {
      setError('The set could not be saved. Nothing has been changed.');
    } finally {
      setBusy(false);
    }
  };

  if (rules !== null && report !== null) {
    return (
      <div className="content">
        <h1 className="page">Review the rules</h1>
        <p className="page-sub">
          Every rule Infora found in <b>{title}</b>, next to the words it came from. Fix, delete and
          add — nothing binds anybody until you save.
        </p>
        <ExtractionReportNote report={report} />
        <RuleReview rules={rules} onChange={setRules} />
        <div className="card-actions">
          <Button variant="primary" disabled={busy || rules.length === 0} onClick={() => void save()}>
            Save — this is what binds
          </Button>
          <Link className="btn" to={`/projects/${projectId ?? ''}/knowledge`}>
            Cancel
          </Link>
        </div>
        {error !== null && <p className="page-sub">{error}</p>}
      </div>
    );
  }

  return (
    <div className="content">
      <h1 className="page">New style guide</h1>
      <p className="page-sub">
        Upload the standard you already have, or start from nothing. Either way Infora shows you a
        list of rules to correct before any of it binds anybody on this project.
      </p>
      <Card>
        <Field label="Name" hint="A project may hold several. This is what people will see it called.">
          <TextInput value={title} onChange={setTitle} />
        </Field>
        <Field
          label="Your written standard"
          hint="Optional. With no document, the set starts from Infora’s own baseline for the registers you pick."
        >
          <input
            type="file"
            accept=".docx,.pdf,.pptx,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field
          label="Registers this set must cover"
          hint="A rule tagged with a register the document creator does not use could never match a document, so these are the same three the creator asks for."
        >
          <div className="pick-list">
            {REGISTERS.map((option) => (
              <PickRow
                key={option.value}
                checked={registers.includes(option.value)}
                label={option.label}
                onToggle={() =>
                  setRegisters((chosen) =>
                    chosen.includes(option.value)
                      ? chosen.filter((each) => each !== option.value)
                      : [...chosen, option.value],
                  )
                }
              />
            ))}
          </div>
        </Field>
        <Field
          label="Where your standard is silent"
          hint="Infora proposes the missing rules from its own baseline, marked as its own. They bind only once you accept them."
        >
          <div className="pick-list">
            <PickRow
              checked={fillGaps}
              label="Fill the gaps"
              onToggle={() => setFillGaps((on) => !on)}
            />
          </div>
        </Field>
        <Field
          label="Default severity"
          hint="Whether these rules raise findings a reviewer must clear, or ones they may wave through. Overridable per rule at review."
        >
          <SelectInput
            value={defaultSeverity}
            onChange={(value) => setDefaultSeverity(value as FindingSeverity)}
            options={[
              { value: 'required', label: 'Required — must be cleared' },
              { value: 'advisory', label: 'Advisory — a reviewer may decline it' },
            ]}
          />
        </Field>
      </Card>
      <div className="card-actions">
        <Button
          variant="primary"
          disabled={busy || title.trim() === '' || registers.length === 0}
          onClick={() => void create()}
        >
          {busy ? 'Reading your standard…' : 'Create'}
        </Button>
        <Link className="btn" to={`/projects/${projectId ?? ''}/knowledge`}>
          Cancel
        </Link>
      </div>
      {error !== null && <p className="page-sub">{error}</p>}
    </div>
  );
}

/**
 * What the extraction actually managed — **the honest number first**.
 *
 * `withWording` is the one that matters: a set where it is zero is one whose
 * findings can never quote the guide, and the person who uploaded the document
 * should learn that here rather than from a finding that reads oddly six weeks
 * later. It is T-308's *"how many clauses can be quoted by number"* one store
 * along.
 */
export function ExtractionReportNote(props: { report: ExtractionReport }) {
  const { report } = props;
  if (report.nothingExtracted !== null) {
    return (
      <Card>
        <Badge tone="warning">Nothing came out of this document</Badge>
        <p className="page-sub">{report.nothingExtracted}</p>
      </Card>
    );
  }
  return (
    <Card>
      <p className="page-sub">
        {report.clausesRead} clause{report.clausesRead === 1 ? '' : 's'} read.{' '}
        <b>{report.withWording}</b> of {report.proposed} rule{report.proposed === 1 ? '' : 's'} can
        quote your guide’s own wording
        {report.gapFilled > 0
          ? `; ${report.gapFilled} more were proposed by Infora where your standard is silent.`
          : '.'}
      </p>
    </Card>
  );
}

// ── the review step ─────────────────────────────────────────────────────────

/**
 * **Rules common to every register first, then the register-specific ones**
 * (T-425). A reader is checking whether the set is right; the rules that apply
 * to everything they write are the ones they must get right first, and burying
 * them among register-specific rows is how a set gets skimmed.
 */
export function orderForReview(rules: readonly ProposedRule[]): ProposedRule[] {
  const rank = (rule: ProposedRule) => (rule.register === 'all' ? 0 : 1);
  return [...rules]
    .map((rule, at) => ({ rule, at }))
    .sort((a, b) => rank(a.rule) - rank(b.rule) || a.at - b.at)
    .map((entry) => entry.rule);
}

export function RuleReview(props: {
  rules: readonly ProposedRule[];
  onChange: (rules: ProposedRule[]) => void;
}) {
  const ordered = orderForReview(props.rules);
  const replace = (rule: ProposedRule, next: Partial<ProposedRule>) =>
    props.onChange(props.rules.map((each) => (each === rule ? { ...each, ...next } : each)));

  return (
    <>
      <SectionLabel>
        {props.rules.length} rule{props.rules.length === 1 ? '' : 's'}
      </SectionLabel>
      {ordered.map((rule, at) => (
        <RuleRow
          key={at}
          rule={rule}
          onChange={(next) => replace(rule, next)}
          onDelete={() => props.onChange(props.rules.filter((each) => each !== rule))}
        />
      ))}
      <div className="card-actions">
        <Button
          onClick={() =>
            props.onChange([
              ...props.rules,
              {
                kind: 'judgement',
                // 🔒 a rule a person adds here is `typed` and can never be
                // anything else: it has no clause behind it, and the store's
                // own CHECK refuses one
                origin: 'typed',
                statement: '',
                scope: 'sentence',
                exceptedContexts: [],
                exceptedTerms: [],
                register: 'all',
                enforcement: 'raises_findings',
                severity: 'advisory',
                payload: {},
              },
            ])
          }
        >
          Add a rule
        </Button>
      </div>
    </>
  );
}

export function RuleRow(props: {
  rule: ProposedRule;
  onChange: (next: Partial<ProposedRule>) => void;
  onDelete: () => void;
}) {
  const { rule } = props;
  return (
    <Card>
      <div className="rule-head">
        <Badge tone={rule.origin === 'extracted' ? 'info' : 'neutral'}>
          {ORIGIN_LABEL[rule.origin]}
        </Badge>
        <Badge tone="neutral">{KIND_LABEL[rule.kind]}</Badge>
        <Badge tone="neutral">
          {rule.register === 'all' ? 'Every register' : registerLabel(rule.register)}
        </Badge>
        <span className="rule-head-end">
          <IconButton variant="quiet" aria-label="Delete this rule" onClick={props.onDelete}>
            <Trash2 size={14} strokeWidth={2} />
          </IconButton>
        </span>
      </div>

      <Field label="The rule" hint={ORIGIN_NOTE[rule.origin]}>
        <TextArea
          rows={2}
          value={rule.statement}
          onChange={(statement) => props.onChange({ statement })}
        />
      </Field>

      {/* 🔒 decision 3, at the surface: the client's own wording beside an
          extracted rule, and NOTHING beside a rule that has none. There is no
          fallback branch here on purpose — a plausible blank is what makes an
          invented quotation possible. */}
      {rule.clauseWording !== undefined ? (
        <blockquote className="rule-wording">
          <span className="rule-wording-address">
            {rule.clause === null || rule.clause === undefined
              ? 'Your guide, unnumbered clause'
              : `Your guide, ${rule.clause}`}
          </span>
          {rule.clauseWording}
        </blockquote>
      ) : (
        <p className="rule-no-wording">
          No wording from your guide — a finding from this rule will say where it came from instead
          of quoting one.
        </p>
      )}

      <div className="rule-controls">
        <Field label="Applies to">
          <SelectInput
            value={rule.scope}
            onChange={(scope) => props.onChange({ scope: scope as ProposedRule['scope'] })}
            options={RULE_SCOPES.map((scope) => ({ value: scope, label: scope }))}
          />
        </Field>
        <Field label="Kind">
          <SelectInput
            value={rule.kind}
            onChange={(kind) => props.onChange({ kind: kind as RuleKind })}
            options={RULE_KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))}
          />
        </Field>
        {/* severity is overridable PER RULE at review — decision 2's own words,
            and the reason the set-wide default is only a default */}
        <Field label="Severity">
          <SelectInput
            value={rule.severity}
            onChange={(severity) => props.onChange({ severity: severity as FindingSeverity })}
            options={[
              { value: 'required', label: 'Required' },
              { value: 'advisory', label: 'Advisory' },
            ]}
          />
        </Field>
        <Field label="Enforcement">
          <SelectInput
            value={rule.enforcement}
            onChange={(enforcement) =>
              props.onChange({ enforcement: enforcement as ProposedRule['enforcement'] })
            }
            options={[
              { value: 'raises_findings', label: 'Raises findings' },
              { value: 'steers_only', label: 'Steers drafting only' },
            ]}
          />
        </Field>
      </div>

      {rule.exceptedTerms.length > 0 && (
        <p className="rule-exceptions">
          Leaves alone: {rule.exceptedTerms.join(', ')}
          {rule.exceptedContexts.length > 0
            ? ` · and anything inside ${rule.exceptedContexts.join(', ')}`
            : ''}
        </p>
      )}
      {rule.exceptedTerms.length === 0 && rule.exceptedContexts.length > 0 && (
        <p className="rule-exceptions">
          Leaves alone: anything inside {rule.exceptedContexts.join(', ')}
        </p>
      )}
    </Card>
  );
}

// ── the saved set ───────────────────────────────────────────────────────────

export function StyleGuideScreen() {
  const { projectId, styleGuideId } = useParams();
  const me = useMe();
  const participant = me.participants.find((p) => p.projectId === projectId);
  const [set, setSet] = useState<RuleSetVersion | null | undefined>(undefined);

  useEffect(() => {
    if (projectId === undefined || styleGuideId === undefined) return;
    void api
      .currentRuleSet(projectId, styleGuideId)
      .then((res) => setSet(res.set))
      .catch(() => setSet(null));
  }, [projectId, styleGuideId]);

  const mayCurate = participant?.membershipRole === 'owner' && participant.elevated === true;

  return (
    <div className="content">
      <h1 className="page">Style guide</h1>
      {set === undefined ? (
        <p className="page-sub">Loading…</p>
      ) : set === null ? (
        <p className="page-sub">
          This guide has no accepted rules yet. Until a set is saved, nothing in it binds anybody.
        </p>
      ) : (
        <SavedRuleSet set={set} mayReadBrief={mayCurate} />
      )}
    </div>
  );
}

export function SavedRuleSet(props: { set: RuleSetVersion; mayReadBrief: boolean }) {
  const { set } = props;
  return (
    <>
      <p className="page-sub">
        Version {set.version}, accepted by {set.acceptedBy.name} on{' '}
        {new Date(set.acceptedAt).toLocaleDateString('en-GB')}. {set.rules.length} rule
        {set.rules.length === 1 ? '' : 's'} bind every organisation on this project.
      </p>
      <SectionLabel>The rules</SectionLabel>
      {set.rules.map((rule) => (
        <Card key={rule.id}>
          <div className="rule-head">
            <Badge tone={rule.origin === 'extracted' ? 'info' : 'neutral'}>
              {ORIGIN_LABEL[rule.origin]}
            </Badge>
            <Badge tone={rule.severity === 'required' ? 'warning' : 'neutral'}>
              {rule.severity === 'required' ? 'Required' : 'Advisory'}
            </Badge>
            <Badge tone="neutral">{KIND_LABEL[rule.kind]}</Badge>
          </div>
          <p className="rule-statement">{rule.statement}</p>
          {rule.clauseWording !== undefined && (
            <blockquote className="rule-wording">
              <span className="rule-wording-address">
                {rule.clause === null || rule.clause === undefined
                  ? 'Your guide, unnumbered clause'
                  : `Your guide, ${rule.clause}`}
              </span>
              {rule.clauseWording}
            </blockquote>
          )}
        </Card>
      ))}
    </>
  );
}

/** One tick, the sandbox wizard's row exactly — the kit's own list affordance. */
function PickRow(props: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="pick-row">
      <input type="checkbox" checked={props.checked} onChange={props.onToggle} />
      <span className="pick-name">{props.label}</span>
    </label>
  );
}

const registerLabel = (register: RuleRegister) =>
  DOCUMENT_LANGUAGE_CATALOGUE.find((option) => option.value === register)?.label ?? register;
