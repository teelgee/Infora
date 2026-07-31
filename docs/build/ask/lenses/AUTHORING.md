# Writing a Lens

**For the planning and environmental specialists who own this layer, not for
engineers.** You do not need to be able to code to write a Lens. You do need to
be precise, because these files change how Infora answers every question.

---

## What a Lens is

A Lens is how an answer *reads*. Same project, same documents, same permissions
— but a planner, an engineer, a project manager and a communications lead each
need a different answer to the same question. The Lens is what makes that
happen.

**A Lens never changes what someone can see.** That is worth reading twice. If
you write a Lens that says "do not mention the cost information", it will not
work and it should not work — access is controlled elsewhere, by the access
layer, and a Lens has no power over it. If someone can see a document, every
Lens can use it. If they cannot, no Lens can.

---

## The shape of a file

One file per Lens, in this directory, named after its `id`. Copy an existing one
and edit it — `planning-environmental.yaml` is the fullest example.

Indentation matters. Two spaces, never tabs. A line starting with `#` is a note
to humans and is ignored.

### The fields

**`id`** — a short name with hyphens, never changed once it exists.
**`label`** — what appears on the chip in the interface. Two or three words.
**`description`** — one sentence, shown when someone is choosing a Lens.
**`status`** — `active` (live) or `draft` (only in test environments).
**`version`** — increase this by one whenever you change anything. It is how we
tell which version of a Lens produced which answer.

**`register`** — three settings that control the language:
- `jargon`: `peer` (use it freely), `explained` (use it, then explain it) or
  `avoided` (find another way to say it).
- `acronyms`: `unexpanded` (DCO stays DCO), `first-use-expanded` (Development
  Consent Order (DCO), then DCO) or `avoided`.
- `reading_level`: a sentence or two describing who this reader is and what they
  already know. Be concrete. "Assumes fluency in the EIA Regulations" is useful;
  "technical" is not.

**`default_depth`** — `high`, `medium` or `low`. High means the reader wants the
reasoning. Low means summary first, detail only if asked.

**`answer_shape`** — a list, in order, of what the answer contains. The first
item is what the answer *leads with*, and this is the single most important
field in the file. It is the difference between an answer that lands and one
that has to be re-read.

**`default_output`** — `prose`, `table`, `bullet-brief`, `draft-text` or
`qa-pairs`.

**`citation_display`** — `inline` (in the text), `footnote` (at the bottom) or
`appendix` (collected at the end).

**`clarifying_bias`** — in order, what Infora should ask about first when a
question is too vague to answer well. Write these as the things this person is
always implicitly assuming. A planner means a particular document version; a
project manager means a particular deadline.

**`escalation_language`** — the actual phrases to use when flagging risk to this
reader. Write real sentences, not categories. "the ExA is likely to probe this"
teaches the system something; "flag risks appropriately" does not.

**`preferred_workers`** — which of Infora's workers this Lens tends to need. A
hint, not a permission. Naming one the user is not entitled to changes nothing.

**`prohibitions`** — the things this Lens must never do. See below; this is the
field that does the most work.

**`example_exchanges`** — two or three real questions with a sketch of the right
answer and a note on what each demonstrates. These become tests. A Lens cannot
go `active` without them.

---

## Writing good prohibitions

Prohibitions are where a Lens earns its keep, and where a vague one does damage.

**Write the specific error, not the general virtue.** "Be accurate" prohibits
nothing. "Never conflate PEIR with ES" prohibits a specific, real, damaging
mistake that a non-specialist system makes constantly.

**Write the ones that come from experience.** The best prohibitions are the
mistakes you have actually seen a junior colleague make, or had to correct in a
draft. "Never treat a REAC commitment as discretionary" is on the planning Lens
because that error has consequences at examination.

**Say what to do instead, where there is something.** "Never describe an
assessment as compliant — describe what it does and does not contain against the
test" is more useful than the prohibition alone, because it gives the system
somewhere to go.

**You cannot switch off the shared rules.** Every Lens always cites its sources,
always separates what a document says from what Infora infers, always flags
superseded documents, and never gives an unqualified professional opinion. A
prohibition that tries to undo one of those will be rejected when the file
loads, and the message will tell you which rule you hit.

---

## Testing your Lens

1. Put it in this directory with `status: draft` and open Ask in a test
   environment. Draft Lenses do not appear for real users.
2. Ask it the questions from your `example_exchanges`. Does the answer lead with
   the right thing? Is the register right for the reader you have in mind?
3. Ask it something it should refuse or qualify. Does it hold the line?
4. Ask it something vague. Does it ask the clarifying question your reader would
   actually want asked?
5. When it is right, change `status` to `active` and raise it for review.

If the file will not load, the error message names the file, the field and what
is wrong with it. If it does not, that is a bug in Infora, not in your file —
please report it.

---

## Changing a Lens that is already live

Increase `version` by one. Say what you changed and why in the commit or the
ticket. Answers already produced keep the Lens version that produced them, so
history is not rewritten by an edit.

If a change makes a Lens behave worse, the eval results will show it per
category before it reaches anyone. That is what the example exchanges are for.

---

## When it is not a Lens

Some things feel like a Lens and are not:

- **"It should search different documents for this reader."** That is retrieval
  scoping or a codified workflow, not a Lens. Raise it as a workflow.
- **"This reader shouldn't see X."** That is the access layer. A Lens cannot and
  must not do it.
- **"Our firm words things differently."** That is organisation house style,
  which is a separate layer and an open design question. Raise it, do not build
  it into a Lens.
- **"This is a whole process, not a way of answering."** That is a workflow.
  Write it as one.
