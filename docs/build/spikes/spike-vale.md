# Spike — should the deterministic style checks run on Vale?

*(T-430, commissioned by the Knowledge session — ADR-0054 decision 9 — and
run by the co-captain 2026-09-01, against the tree and the tool's own
documentation. Evaluation only; nothing is integrated.)*

**In plain terms:** when a firm's or a project's writing rules are loaded,
most of them — use this word not that one, never write this phrase, keep
headings in this form, keep sentences under a limit — can be enforced by
ordinary code, no AI involved. Vale is a well-known free tool that does
exactly this kind of checking from configuration files, and the question
was whether we should run our rule checking on it instead of writing our
own. The answer this spike reaches: **not now — but shape our stored rules
so switching to it later is cheap, and one small change to the rule shape
now is what keeps that promise.** Vale would genuinely help with two of
our four deterministic rule kinds, but everything expensive around it —
feeding it text, mapping its answers back to exact places in a draft,
keeping one firm's rules away from another's, and stating what a run
covered — we would have to build ourselves anyway, and those parts are
most of the work.

**Recommendation: adopt later, behind our own rule shape.** Gate:
the moment a pilot firm wants to import an existing Vale-format style
package, or the accepted rule sets outgrow simple term-and-pattern
matching (nested scoping, casing families, language variants) — whichever
comes first. Cost of this path: a small matcher of our own now (a few
hundred lines against a shape we control), plus the one rule-shape change
below. Cost of adopting now instead: binary vendoring, version pinning,
config compilation to Vale's YAML, and a supply-chain review — for an
engine that covers half our rule kinds. Cost of never adopting: we
re-implement, over years, a rule vocabulary Vale's community has already
debugged.

---

## The eight questions

**1. Coverage — Vale expresses two of our four deterministic kinds
cleanly, and the other two poorly or not at all.**

- **Term rules → Vale `substitution`, clean.** A swap map of undesired →
  preferred terms, case handling (`ignorecase`, `matchcase`), regex keys,
  and an `exceptions` list. This is Vale's core competence.
- **Pattern rules → Vale `existence`, clean.** Regex tokens with a
  message, severity, scope and exceptions.
- **Structure rules → poor.** Vale's `capitalization` covers heading-case
  styles, and `sequence`/`consistency` cover narrow cases, but our
  structure rules compare a draft against *its own template* (missing
  sections, placeholder text) — Vale has no concept of a required
  document shape. This stays ours (and is already built: the completeness
  check).
- **Measured rules → poor for our semantics.** Vale has `metric` and
  `readability` checks, but they are pass/fail against thresholds — and
  our ruling is that readability is scored per section against a project
  target with outliers flagged, **never pass/fail** (ADR-0053 §2). Ours
  is already built and already right. Not worth moving.

On the two properties every rule of ours carries: **scope** maps well —
Vale scopes rules to markup elements (`heading`, `paragraph`, `sentence`,
`list`, `blockquote`, `table.cell` …) and supports **negated scopes**
(`~blockquote & ~heading`), verified in its scoping documentation.
**Exceptions map only halfway**, and that is the finding that matters —
see question 8.

**2. Integration shape — subprocess per run, per-run private directory;
a sidecar is the wrong shape for us.**

Vale is a single static Go binary reading a `.vale.ini` plus a styles
directory from disk. The right integration: spawn per run, handing it a
**per-run temporary directory** (created `0700`, unique path under the
run's own working area, written from the rules already resolved for this
requester through the one assembly gateway, deleted in a `finally`). The
wall argument: the configuration is *generated from* an access-resolved
read — the same query the checker already does — so the directory never
contains anything the requester could not already read, exists only for
the life of the run, and is never a shared path two organisations could
both reach. A long-lived sidecar would invert that: rules resident in a
process across runs and requesters is precisely the shared surface we
never build. At our volume (a handful of checks a day, ADR-0053's own
sizing), process spawn cost is irrelevant.

**3. Anchoring — lossless, and cheap, because of a decision already
made.** Vale reports line and column spans over the text it was handed,
relative to that text. Our sections already carry **character offsets
into the document's own content** (`DraftSection.start`/`end`,
qa-sections.ts — T-271's locator grain). Handing Vale a section's exact
stored text and adding `section.start` plus a newline-offset index maps
every Vale span to a document-grain locator with no loss. One caveat to
verify at adoption: Vale must be handed the text as plain prose (format
`.txt`), not asked to re-parse our content as markdown — its markup
parsing can otherwise report positions against elements rather than raw
offsets. The JSON output shape (per-file alerts with line, span, check
name, message, severity) is asserted here from prior experience of the
tool, not from the docs fetched — verify at adoption.

**4. Determinism — achievable, but only by vendoring.** Vale is a
matcher over regexes; for a pinned binary and a generated config, the
same text yields the same findings. What breaks it is upgrades: Vale
releases change matching behaviour (fixes to word boundaries, scope
parsing), so an upgrade can raise different findings over unchanged text.
That is acceptable **only if** the binary version is pinned per
deployment (vendored with a checksum, never fetched at build time), the
version is recorded on the run the way the model id already is, and an
upgrade is a deliberate act with a re-baseline — the same discipline the
embedding model already has (each pinned model is its own index). The
declared-workflow promise (same inputs, same steps) is about the plan,
which Vale never touches; findings are outputs, and output drift on
upgrade is the same class of event as a model version change, handled the
same recorded way.

**5. Security — the script rule is real, and "disabled" must be by
construction, not configuration.** Vale has a `script` check type running
Tengo (a Go-embedded scripting language). The documentation shows **no
global switch to disable script checks** — so the guarantee cannot be a
setting. It has to be structural: *we generate every style file from our
own stored rules, and the generator has no code path that emits a script
check* — pinned by a test that fails if the compiler ever emits
`extends: script`, plus a belt-and-braces scan of the generated styles
directory before spawn. Vale's `Packages` feature (remote style
downloads) must simply never be invoked — a normal `vale` run does not
touch the network; only the separate `vale sync` command does, and
nothing in our integration would call it. Supply chain: a single MIT
static Go binary, vendored and checksummed, no runtime network, run as an
unprivileged subprocess — compatible with the pilot substrate's posture
(ADR-0047), but it is a **new third-party executable in the runtime** and
therefore a line item in the deployment tier review and the dependency
audit, not a quiet addition.

**6. Coverage statement — Vale cannot say what it examined; we can say
it for it, fully.** Vale's output is findings only: no per-run inventory
of which rules ran over which text. Alone, that would be disqualifying
(a clean result indistinguishable from an unexamined one). But in this
integration *we* author the config per run from the resolved rule set
and *we* hand it the sections — so the coverage statement ("N term rules
and M pattern rules over K sections") is computed from what we gave it,
before the run, exactly as ADR-0053 §5 requires, and restated after. The
one thing we cannot state from Vale itself is a rule that silently
failed to load; mitigation is `vale ls-config`-style verification of the
generated config at spawn, or treating a config parse error as a run
refusal. Buildable, but it is *our* build — Vale contributes nothing to
it.

**7. Honest cost — adopting now removes the smallest part of the work.**
What must be built regardless of engine: the rule compiler (typed rules →
engine input), the per-run config/workspace management and cleanup, the
offset mapping, the contextual-exception handling (question 8), the
coverage statement, version pinning and the audit line. What Vale
replaces: the innermost matching loop — term swaps and pattern hits over
a string — which for two rule kinds is a few hundred lines with a
well-understood shape. The trade at V1 scale: take on a binary,
its lifecycle and its supply-chain surface, to avoid the easiest
few hundred lines in the stack. That trade inverts later, when rule sets
grow past what a small matcher should own — which is exactly what the
gate above watches for.

**8. The escape hatch — one field breaks the clean mapping, and it is
cheap to fix now.** The rule shape's kinds map: term → `substitution`,
pattern → `existence`, structure/measured → stay ours either way. Scope
maps if — **and only if** — the rule shape's scope vocabulary uses
markup-element terms Vale also understands (heading, paragraph, list,
quotation/blockquote, table) rather than invented names. **The break is
the exceptions field.** Ours says *where a rule does not apply* — "not
inside quotations, proper names, references". Vale's `exceptions` is a
**list of literal tokens**, not contexts; its contextual exclusion lives
in a different place (negated scopes for markup elements, `TokenIgnores`/
`BlockIgnores` config regexes for inline patterns). A single mixed
exceptions field would therefore not survive the engine swap. **The fix,
now, in the rule shape:** split exceptions into two typed halves —
**excepted terms** (a token list: proper names, defined abbreviations →
maps directly to Vale `exceptions`) and **excepted contexts** (an
enumerated set: quotations, references, code, headings → maps to negated
scopes and TokenIgnores, or to a masking pass in our own matcher). With
that split, adoption later is an engine swap; without it, it is a
migration of every accepted rule.

---

## Decision asked of nobody: what this spike does not reopen

The five rule kinds, the review-and-accept flow, and judgement rules
costing a model call are the Knowledge session's rulings and stand.
Readability's never-pass-fail semantics (ADR-0053 §2) stand. This spike
only evaluated the engine underneath four of the kinds.

## Follow-on — both done with this spike's landing

- **The rule-shape fix is applied**, not ticketed: ADR-0054's exceptions
  field is split into excepted contexts and excepted terms, and the scope
  vocabulary gains `paragraph` and `list` (which decision 4's own example
  rule needed anyway) — amended in the same review that landed this spike,
  before any rule exists to migrate. T-423 and CONTEXT.md carry the same
  split.
- **The deferred-register entry exists**: *Vale as the deterministic rule
  engine* — gate: a pilot firm asks to import an existing Vale-format
  package, or accepted rule sets outgrow the in-house matcher. The
  authorisation for the entry is the spike brief itself, which named a
  deferred entry as one of its two permitted outcomes.
