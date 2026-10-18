# ADR-0058 — Tools run, apps hold: the split, and workflows named as the tools half's completion

**Status:** Accepted (owner-directed 2026-09-09 and 2026-10-18; designed and recorded by Claude on the owner's delegated authority, 2026-10-18 — every ruling below is flagged for the owner's veto in Session AC's record).

**In plain terms:** Infora has two different kinds of thing on offer, and until
now they shared one shelf and one word. A **tool** is something you *run*: it
does one piece of work — drafts a document, checks one, answers a question —
and what lasts is its output, which lands in the project's record. An **app**
is somewhere you *go*: a standing place that holds tables of data belonging to
the firms that typed it, screens different firms open, and an acceptance step
where a row changes hands. Tools do the work; apps hold it. This ADR records
that split, moves apps off the Tools shelf into their own place, and names —
without designing — the thing the tools half is still missing: saved,
shareable **workflows**, built the way the owner saw and liked in Nomic's
product.

**Context.** The owner studied Nomic's documentation (the full walk is
[docs/reference/nomic-docs-review.md](../../reference/nomic-docs-review.md) —
context, never authority) after Nomic's strategic round with Aurecon and
Arcadis, and directed the split on 2026-09-09: *"tools are effectively
workflows described by nomic. configurable steps that we want an agent to
perform parts of - like creating a document or QA'ing a document. apps perhaps
are different."* The vocabulary was half-there already: `CONTEXT.md` has said
since 2026-07-13 that *workflow* is the engine's term for a codified sequence
and *tool* is its packaged, launchable surface. What was missing was the other
half of the cut — that an app is **not** a tool at all — and the name for the
tools half's missing piece.

## Decisions

**1. The cut is run-versus-hold, and it is the test for every borderline
case.** A tool runs: its configuration may be elaborate, an agent may perform
parts of it, but when it finishes, what persists is an output in the record —
a draft in a sandbox, findings on a document, a cited answer. An app stands:
it holds app tables whose rows are stamped with the organisation that entered
them, interfaces, an acceptance flow; its runs (the insight) are small acts
inside a standing thing. **Rows accumulating under the wall → app. An output
into the record → tool.** A job that looks like both splits naturally — a
submittal *register* is an app; a review pass over one submittal is a tool
act.

**2. Apps leave the Tools shelf.** The Tools surface holds what you run — the
creator, the checker, Ask — and apps get their own section of the project,
beside it, as the standing places they are. This is navigation and words, not
architecture: ADR-0056 already made the app a third kind of project thing, so
nothing about access, storage or the predicates moves. (The exact navigation
lands with the agent-led builder rebuild, T-448–T-450.)

**3. Workflows are named as the tools half's completion — and deliberately
not designed here.** What the tools half lacks, exactly as the Nomic evidence
framed it, is a **saved, named, versioned, shareable way of running work**: a
firm's "how we check a flood risk assessment", with its instructions, attached
standards, input slots, who may run it and who may edit it, drafts that change
nothing until released. That object — and its builder, which should mimic
Nomic's two-panel shape (an agent drives the conversation and fills the
configuration; the form always shows the state; the human confirms; the agent
is barred from the sensitive fields) — is a slice of its own with its own
design session, entered on the board's deferred register. Ruling it here,
inside an app-builder redesign, would be two big decisions in one sitting,
each getting half the attention. The old Slice F note ("building your own
happens in the Tools surface") is this slice's ancestor and is reconciled by
that session, not silently.

**4. The two halves keep exactly one door, already ruled.** A tool's output
enters the record; app data reaches drafting and Ask only through the
record's own doors (ADR-0021's 2026-09-04 addendum, ADR-0011's addendum).
The split adds no new boundary and reopens no ruling about the wall.

## Considered and not taken

*Three words — tools, Ask, apps* (Ask fits "run" imperfectly, being a question
rather than a sequence; but a third top-level word costs more than the wrinkle,
so tools admit both one-shot acts and stepped acts). *Designing the workflow
object in this ADR* (declined for the attention reason in decision 3).
*Leaving apps as "the fourth tool"* (declined by the owner's direction — the
split is the point).

## Consequences

`CONTEXT.md`'s **Tool** and **App** entries gain dated notes carrying the
run-versus-hold cut; **App** stops calling itself one of the Tools surface's
kinds. The board's deferred register gains **Workflows and the workflow
builder** (gated on its own design session, after the agent-led builder
lands), which absorbs the two candidates the Nomic challenge pass raised:
saved tool configurations, and "keep this finished task as the way we do it".
The app builder's own redesign — agent-led, reversing the first addendum's
ruling 6 — is ADR-0056's third dated addendum, recorded the same day. The
pitch sentence follows the cut: *tools do the work, apps hold it, and teams
extend both themselves.*
