# ADR-0054 - The **Knowledge section** is a rail item in every project holding **two shelves** — the firm's own and the project's; and a **style guide stops being a document the checker reads and becomes a set of typed rules a person accepted**, extracted from the uploaded standard, sorted by how each rule is enforced, versioned, and compiled into instructions differently for checking and for drafting

*In plain terms:* Infora has always been able to store a firm's drafting manual
and a project's style guide, and both tools already read them — but there has
never been a screen where anyone could load one, read one, or manage one. This
adds that screen: a **Knowledge** item in the left-hand menu of every project,
holding two shelves. One shelf is your firm's own material — its manual, its
saved starting outlines — private to your firm and the same on every project
you work on. The other is the project's — the writing standard the client sets,
which everyone on the scheme can read and only the client's senior person can
change.

The larger change is what a style guide *is*. Today it is a document the
checker reads as prose. From now on, uploading a written standard produces a
**list of rules**: Infora reads the document, pulls out the rules it contains,
sorts them into kinds, and shows them back for a person to correct, delete and
add to before any of it binds anybody. Where the uploaded standard is silent —
a guide written for public-facing material being used on a technical report —
Infora proposes the missing rules itself and marks them plainly as its own.
Nothing binds until the client's senior person accepts it. Anyone else on the
project may **propose** a change or an addition; that person decides.

Two things follow that matter to how it feels to use. Because the rules are
typed, most of them can be checked by ordinary code rather than by asking the
AI — which is free, exact, and gives the same answer every time. And because
the rules are separated from the document they came from, every rule keeps a
pointer back to the client's exact wording, so a finding can still quote what
the guide really says rather than Infora's summary of it.

**Status:** Accepted (owner-ruled 2026-09-01, the Knowledge session). **Closes
`Q-050`.** Extends **[ADR-0053](0053-the-checkers-run-and-the-executor-rule.md)**
§2, §3 and §5 and its addendum **A1** without reopening any of them: the ruled
check families are unchanged, the two style sources and their precedence are
unchanged, and the coverage statement is unchanged in kind. Extends
**[ADR-0048](0048-the-checker-findings-not-prose.md)** §5 (a finding may quote
a rule verbatim and never cites it) by giving the quotation a guaranteed
origin. References **ADR-0021** (the three channels), **ADR-0027** (code versus
model call, fixed per capability at design time), **ADR-0029** (the guiding-
over-informing precedence), **ADR-0033** (whole-project configuration is the
owner organisation's super user), **ADR-0046** §8 and **T-371** (the same
precedent), **ADR-0049** (the notification set), and **ADR-0053** §9 (privacy
is a property of the source's scope). Decided against
[v1.md](../../build/v1.md). **The authority corpus stays out of V1** and
nothing here reopens it.

**Context:** T-308 built the firm's rulebook store and recorded a scope call in
one line — *an org-admin door exists but no UI, and inventing one is not this
ticket*. T-397 built the project style guide and made the same call. T-414 built
saved starting outlines reachable only from inside the document creator. Three
stores, three sets of working routes, and **no screen in the product from which
a person can load, read or manage any of them**. The owner found this on
2026-09-01 by asking where the writing rules live.

The session opened expecting to rule two small things: where the section sits,
and whether a glossary is its own object. The owner re-cut the second question
into a larger design — the style guide as a set of extracted, reviewed,
accepted rules — and that is decision 2 below, with the glossary falling out
of it as one rule kind rather than a store of its own.

*What the session verified against the tree before agreeing with any record.*
The upload, list and delete routes exist for all three stores
([rulebook.ts](../../../apps/api/src/rulebook.ts),
[style-guide.ts](../../../apps/api/src/style-guide.ts)) and **no surface calls
any of them** except the checker's launcher, which lists style guides as
tick-boxes. The project rail
([project.tsx](../../../apps/web/src/screens/project.tsx)) carries no knowledge
item. The workspace rail
([workspace.tsx](../../../apps/web/src/screens/workspace.tsx)) already carries
one — `knowledge`, *"Your knowledge"* — as a note-only placeholder that has
never had anything behind it. And `/settings` is a **personal** page (T-092)
plus an org-admin enrolment panel (T-117), not project configuration.

**Decision:**

**1. Knowledge is its own rail item inside every project, and it holds two
shelves.** Not a panel in Settings: Settings is where a person changes their own
display name, theme and password, and a document that binds every firm on a
scheme is not a personal preference. The two shelves are **the firm's own** (its
drafting manual and playbooks, its saved starting outlines — org-private,
identical on every project) and **the project's** (the style guide or guides the
owner organisation has set, readable by every participant, changeable only by
the owner's super user, per T-397 as built).

**The firm's shelf is one shelf reached through two doors.** It also appears in
the organisation's own workspace, where **no project material is shown at all** —
which is what the workspace rail's existing `knowledge` placeholder becomes.
Because it is one shelf and not a copy per project, it is **marked as the
firm's own and the same on every project** wherever it renders; a consultant on
three schemes must not be able to believe they are editing a per-project copy.

**Standards, policy and legislation are not a third shelf.** They are loaded
into the project library as reference material, which is built (T-304), has a
screen, and already marks them as received rather than produced. The richer
curated authority shelf stays out of V1 exactly as ruled.

**2. A style guide is uploaded as a document and becomes an accepted set of
typed rules.** The upload does not change: people write standards as documents
and will keep doing so. What changes is what happens next.

**The journey, as the owner drew it 2026-09-01** — Knowledge, the project's
shelf, **New style guide**; **upload** the existing standard *or start from
nothing*; choose the **registers** it must cover; set the three parameters
below; **create**; **review**; **save**. Two things in that sequence are
decisions rather than screen order. **The upload is optional** — a client with
no written standard starts from Infora's baseline for the registers they picked
and edits it, which is the common case at the start of a scheme and would
otherwise have no door. And **the review step sits between extraction and
saving, always**: it is what makes the rules the client's rather than Infora's
paraphrase of them, and skipping it is what decision 3 exists to prevent.

**Exactly three parameters at creation, and deliberately no more:** a **name**
(a project may hold several, and T-397's store has always allowed it); whether
**Infora fills the gaps** (decision 5, default on, one tick for a client who
wants only their own rules); and the **default severity** — whether these rules
raise findings a reviewer must clear or ones they may wave through, set once
for the set and overridable per rule at review, on ADR-0048's existing
two-level severity. *Considered and left out: which document types a set
applies to, and spelling variety — the first is a second axis nobody has asked
for (decision 5), the second is a pattern rule.*

**After saving, the compiled brief is readable** (decision 6): the client's
super user can see what the drafting AI is actually told. It costs nothing,
because the brief is compiled at save time regardless.

- **Infora extracts the rules** the document contains, sorted into the kinds
  decision 4 sets out, and presents them for review.
- **A person edits, deletes and adds**, then the **owner organisation's super
  user saves**. The saved set is what binds. Nothing binds before that.
- **Anyone on the project may propose** a change or an addition; the owner's
  super user accepts or declines it.
- **Bulk acceptance is permitted**, deliberately and against the session's own
  stress test — *"it is down to the client or the user to behave properly; we
  don't need to plan for that"* (owner, 2026-09-01). This does **not** reopen
  ADR-0048 §3 or ADR-0053 §6: those govern a reviewer accepting proposed
  changes into a **work product**, where accepting prose unread is the failure.
  Here the artefact being accepted is the client's own configuration of their
  own standard, and the person accepting it is its author's own organisation.

**3. Provenance is a property of every rule, and there are exactly three
origins.** Once Infora restructures a written standard, the rule the checker
enforces is no longer the words the client wrote. ADR-0048 §5 lets a finding
quote a rule verbatim; a machine paraphrase quoted as the client's rule would
make that guarantee false while looking identical on screen. So:

- An **extracted** rule keeps a pointer to the exact wording in the uploaded
  document it came from. The wording is shown beside it on the review screen and
  is what a finding quotes. **The uploaded document stays attached and
  readable**, and remains the thing a person can go and check.
- A rule **typed by a person** has no such wording. Its findings say so rather
  than quoting anything — an invented quotation is worse than an absent one,
  which is T-305's rule for `page` and T-308's for an unnumbered clause,
  applied a third time.
- A rule **proposed by Infora** (decision 5) likewise has no client wording. It
  is marked as Infora's own on the review screen and in any finding it raises,
  and it binds only because a person accepted it.

**A proposal is visible to its author, that person's own organisation, and the
owner organisation — never to another firm on the project.** A rival learning
which rules a competitor is arguing about is the ethical-wall breach nobody
thinks of as crossing the wall, on ADR-0048 §6's precedent.

**4. Rules are typed by HOW THEY ARE ENFORCED, not by what they are about**
*(Claude's call, owner-delegated 2026-09-01: "this needs some thought by you")*.
A taxonomy by subject — tone, punctuation, grammar, terminology — reads tidily
and tells the machine nothing, because "tone" holds both a rule a computer
settles instantly and a rule needing judgement. Sorting by enforcement fixes
three things at once: what a check costs, how reliable it is, and whether its
fix reaches ADR-0053 §6's bulk lane.

| Kind | What it holds | Enforced by |
| --- | --- | --- |
| **Term** | a wording to use, the wordings it replaces, a plain definition | code — exact match |
| **Pattern** | a convention with no judgement in it (date form, unit spacing, no contractions, sentence-case headings) | code — pattern with exceptions |
| **Structure** | what a document must contain and in what order | code — against the outline |
| **Measured** | a number with a target (sentence length, a readability target) | code — arithmetic |
| **Judgement** | anything a computer cannot settle (prefer the active voice, one idea per paragraph, no unexplained jargon) | **a model call — the only kind that costs one** |

**The glossary is the term kind, not a separate store.** This is how the
session's original fork resolved: a glossary is a list of term rules with
definitions, and giving it its own store would have produced two answers to
what a writing rule is.

**Every rule additionally carries three things**, and the first two are what
make a deterministic check accurate rather than noisy:

- **Scope — what it applies to:** the whole document, a section, a sentence, a
  heading, a caption, a table. This is ADR-0053's *the unit of work is a
  property of each check* applied one level down, at rule grain, and it is what
  lets the planner batch correctly.
- **Exceptions — where it does not apply:** inside quotations, inside proper
  names, inside references. Without this, *use "scheme", not "project"* fires on
  the Project Board and on every quoted document title, and the consultant
  switches the check off.
- **Whether it raises findings, or only steers drafting.** Real standards
  contain aspirations — *write with the reader in mind* — that cannot be
  checked. Marked drafting-only, they improve the writing and generate no noise
  nobody can act on. Marking them enforceable would be a silent lie about what
  the check covers, which is the thing ADR-0053 §5 exists to prevent.

**None of this changes ADR-0053 §2's ruled check families.** The kinds *route
into* them: term, pattern and judgement rules report through the **style
guide** check, structure rules through **completeness**, measured rules through
**readability** (scored with outliers flagged, never pass/fail — §2 unchanged).
The consequence worth naming is that **the writing check gets cheaper and more
certain the more of a guide is structured**: today every style rule is a model
judgement; under this, four kinds out of five are code.

**5. A rule carries a register, and Infora fills the gaps where the uploaded
guide is silent** *(owner-ruled 2026-09-01)*. A rule applies to technical
writing, to non-technical writing, to plain English, or to all of them — the
same three answers ADR-0053 addendum A1 already asks for at the creator's
launcher. The common real case is a standard written for public-facing
consultation material being used on a technical report: it simply has no
phrasing rules for the register in hand.

**The register vocabulary is `DOCUMENT_LANGUAGES`, unchanged, and this is a
decision rather than a detail** *(recommended by Claude with the collision
named, and **owner-ruled 2026-09-01**: "let's stick with what you've
identified we've already got")*. The owner's own words for the registers were
*technical, non-technical, public communications*, and the third has a foot in
each of the creator's two existing lists — it is `simple-english` on
[`DOCUMENT_LANGUAGES`](../../../packages/contracts/src/creator.ts) and
`external-document` on `DOCUMENT_PURPOSES`. A rule tagged with a word the
launcher does not use **can never match a document**, so the gap-filling would
fail silently, which is the failure mode this ADR refuses everywhere else. So
rules carry **one axis, the Language list the launcher already ships** —
technical, non-technical, simple English — plus **all**, and *public
communications* is simple English. **Purpose is deliberately not a second
axis:** it would double every rule's applicability and the review screen with
it, and no client has asked. Named here so that when one does, it is a known
extension rather than a rediscovered problem.

So **Infora proposes the missing rules per register, from its own baseline of
good technical writing rather than from the client's document**, at upload,
alongside the extraction. They are proposals like every other rule — marked as
Infora's own (decision 3), binding only once accepted, and never able to claim
the client's guide said something it did not.

**A1's precedence is unchanged and now fires far less often.** A style guide
still wins on terms and vocabulary while the author's Language answer wins on
register, and the plan still states both — but a guide that carries a version
per register produces fewer clashes for that rule to settle.

**6. Rules become instructions two different ways, because checking and
drafting are two different jobs** *(Claude's call, owner-delegated)*.

**For checking.** The four deterministic kinds never reach a model at all. For
judgement rules the method is fixed: **one atomic statement per rule, phrased so
it can be answered yes or no, with its scope bounded**, and a verdict returned
per rule rather than a free-form opinion. Two obligations bundled into one rule
get conflated and agreement drops sharply; splitting them and forcing a binary
answer is worth roughly twenty percentage points of agreement in the published
work on rubric-graded evaluation. **So the extraction's real work is
splitting** — a clause that says three things becomes three rules. Each
judgement rule carries its statement, optionally one example that passes and one
that fails, and returns findings keyed to it with the offending words quoted,
which is what lets a finding name *this rule, from your guide's clause 4.2,
these words*.

**For drafting.** The whole rule set is **not** handed to the drafting model.
This is not a claim that a model cannot cope — current models follow long
constraint lists far better than they did a year ago — but that when one *is*
dropped it is dropped **silently**, and the rules compete for room with the
author's brief and the bound sources, which is the same squeeze that made
ADR-0053 §5 split rather than drop. So:

- **Term and pattern rules are applied after generation**, not asked for in the
  prompt: the system normalises the text the agent has just written. **This is
  not the checker acquiring a write path** and ADR-0048 §3 is untouched — it
  reaches only the model's own fresh output, inside the invoker's own sandbox,
  before any human has seen it. It **never** touches text a person wrote.
- **Judgement rules are compiled once into a short written brief when the rule
  set is saved**, not rebuilt per draft. Same rules in, same brief out — so it
  stays a declared workflow's kind of guarantee — and the owner's super user can
  read exactly what the AI is told.
- **Term rules also go in as a short list** of preferred wordings, which models
  follow well when it is short.

**7. The rule set is versioned; every run records the version it used, once, on
the run.** *(Owner-ruled 2026-09-01, correcting the session's own first
phrasing.)* A check run and a drafting run each store the rule-set version they
ran against. **The version is stamped on the run and never on each finding**,
and **it is stored rather than displayed** — the owner ruled explicitly against
a screen that repeats *checked against style guide v3* down a list of findings.
ADR-0053 §2's per-finding `checkFamily` is a different field and is unaffected:
it names which check raised a finding, which is what groups them.

**8. `Q-050` closes: nobody is told when the rules change.** No notification,
no banner, no mark on a document. ADR-0049's set is unchanged and gains nothing.
The tracker's recommendation — tell the lead reviewer of every in-flight
deliverable — is **superseded** by the design that replaced it: under decision 2
rules change one at a time and often, so a message per change is precisely the
tray everybody learns to ignore, which is the failure ADR-0049 §2 was written
to avoid. Decision 7's stored version is what answers *which rules was this
checked against* after the fact.

**One exception, and it is not a broadcast:** the person who **proposed** a rule
change is told when it is accepted or declined. That is a reply to their own
act, the same shape as an `@`-mention, and it reaches one person who is already
waiting for an answer.

**9. Vale is the reference for the rule vocabulary, not a dependency in V1**
*(Claude's call, and deliberately open to being overturned — see the spike,
T-430).* [Vale](https://vale.sh) is an MIT-licensed prose linter whose roughly
twelve rule types collapse into decision 4's five kinds; the taxonomy above is
shaped to match it, which is the point. It is **not adopted for V1**, for three
reasons: it covers only the deterministic half and nothing of judgement rules,
anchoring, permissions or the wall; integrating it means per-run configuration
written to disk (**a wall surface**), mapping its line-and-column offsets back
to our locators, and managing a subprocess — machinery that must exist either
way; and one of its rule types executes scripts supplied by configuration,
which is a door not worth opening on a platform holding two competitors'
material. **The stored rule shape maps one-for-one onto its rule types**, so
adopting it later is an engine swap rather than a redesign — and would also make
importing a published standard rule pack a real option. The spike evaluates
exactly this and may overturn it.

**Consequences:** `Q-050` closes. The three stores gain their first surfaces —
**Slice Knowledge, T-422–T-430**. `project_style_guides` gains a rule set
beside its clauses; the clause store is **not replaced**, because an extracted
rule points at a clause and ADR-0048 §5's verbatim quotation resolves through
it. **A migration is required** and is drawn in
[data-model.md](../../build/data-model.md) drawer 7 before it is written, per
the standing rule. **Named people ride it** — who loaded a standard, who
proposed a rule, who accepted one — registered in
[personal-data.md](../personal-data.md) in the commit that builds it. The
checker's style-guide check stops being wholly a model call and becomes four
code checks plus one model call, which **improves coverage** in ADR-0053 §5's
sense at lower cost. The workspace rail's `knowledge` placeholder stops being a
note. **The authority corpus is not reopened.** No new open question is raised.

**Considered and not taken.** *The Knowledge section inside Settings* — Settings
is personal, and filing a document that binds forty people behind a personal
preferences page makes it hard to find and reads as optional configuration.
*The firm's shelf only in the workspace, with the project linking across* — put
as the alternative to the owner and declined: the shelf appears in both places,
labelled as one shelf. *A glossary as its own store* — the session's own
opening recommendation, collapsed once the owner re-cut the style guide into
typed rules, because the glossary is one of those types. *A terminology check
that is a model call so it can read context* — rejected; the exceptions field
of decision 4 is the cheaper and more reliable answer to the same false-positive
problem. *Blocking bulk acceptance of extracted rules* — put to the owner with
the 5pm-accept-all stress test and declined by ruling. *A visible mark on a
document saying it was last checked against older rules*, and *a change history
on the Knowledge page* — both recommended by the session and both declined:
decision 7 stores the fact and shows nothing. *Notifying the lead reviewer of
every in-flight deliverable on an amendment* — `Q-050`'s own tracker
recommendation, superseded by decision 8. *Adopting Vale now* — decision 9, and
the spike may reverse it.

**Open — not decided here.** **Whether the firm's own manual gets the same
extract-and-accept treatment as the project's style guide.** The machinery is
built once and would work identically, and the reused clause parser means there
is no second shape to fight; the session did not put it to the owner and no
ticket assumes it. **Whether a rule set can be exported**, so a client can take
their structured standard away — a real request the moment somebody has curated
one, and unasked so far.
