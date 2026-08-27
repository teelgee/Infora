# SPIKE — locator extraction (T-270)

> **✅ Closed 2026-08-04 by T-271**, which built the recommendation below:
> `start_offset` / `end_offset` on `version_chunks` (migration 0039), the
> paragraph index derived from them, the verbatim passage taken at the span
> rather than searched for, and the version-grain degrade when a span does not
> resolve. **Two of the five recommended items were deliberately left to their
> own tickets** and are not defects: the heading-number split is **T-307** —
> the spike itself argues for a separate commit, because re-chunking moves
> embeddings and the eval seed set should measure the change — and PDF input is
> **T-305, built 2026-08-27**. The findings below are the reasoning, kept as the
> record of *why* offsets are stored rather than recovered.
>
> **T-305 settled the scope question this spike left open** (*"whether page is
> worth having at all before a PDF path exists"*) by building the path, and it
> vindicated the recommendation: page needed **no schema change**, because the
> extractor writes a page separator into the text and page is then the same
> derivation as paragraph. It also **diverged from this document in one place,
> deliberately** — the PDF row below calls an extractor "a real dependency", and
> the ticket hand-wrote one instead, following `upload.ts`'s zip reader and
> `xlsx.ts`'s workbook reader rather than taking a rendering engine into a
> deployable meant to run in a sovereign tier. The finding stands; the sourcing
> judgement was the build's to make.
>
> **Status: findings, 2026-08-01. Research, not build.** T-270 is a spike: it
> blocks nothing and produces findings, not code. It exists because
> non-negotiable 1 — *no assertion without provenance*, where provenance means
> "a document, a version, and **either a locator or the verbatim passage**" —
> is **partly outstanding at the Ask MVP**, and the board says so. Citations
> resolve at **version grain** today. A version-level citation on a 200-page
> chapter is one nobody opens, and a citation nobody can check is functionally
> an uncited claim.
>
> This document answers T-270's three questions — *what locator is reliably
> extractable per format*, *where the verbatim-passage fallback applies*, and
> *what to do about a quote spanning a chunk boundary* — and recommends what
> T-271 should build. **It closes when T-271 lands.**

## What the pipeline does today

Three files, and the whole locator problem lives in the seam between them.

| | |
| --- | --- |
| [`upload.ts`](../../../apps/api/src/upload.ts) — `docxToText` | walks `word/document.xml`, emits one `\n` per `<w:p>`, strips every other tag |
| [`chunker.ts`](../../../packages/data/src/chunker.ts) — `chunkText` | splits on `/(?<=[.!?])\s+/`, trims each sentence, packs greedily to 1,200 characters, joins with a single space |
| [`ingest.ts`](../../../packages/data/src/ingest.ts) — `ingestVersions` | writes `{ versionId, chunkIndex, content, embedding }` |

`Chunk` is `{ index, content }`. **There is no offset, no page, no paragraph
and no section anywhere in the pipeline** — and, critically, nothing that was
discarded and could be recovered later.

## Finding 1 — a chunk is not a substring of its version

The first thing anyone will try is recovering a locator by searching for the
chunk's text inside `versions.content`. It does not work, and the reason is
not obvious from reading the chunker.

Run against a five-line document with ordinary formatting (`maxChars` reduced
to 60 to force boundaries):

```
source: "1. Introduction\nThis chapter describes the noise assessment.  It follows the NPS.\n\n2. Method\nMonitoring ran for two weeks.\tSurvey points were selected per BS 4142."

chunk 0  "1. Introduction\nThis chapter describes the noise assessment."       substring? true
chunk 1  "It follows the NPS. 2. Method\nMonitoring ran for two weeks."        substring? FALSE
chunk 2  "Survey points were selected per BS 4142."                           substring? true
```

**Whitespace between sentences is rewritten; whitespace inside one survives.**
The splitter consumes the run of whitespace after a terminator and the packer
rejoins with exactly one space, so the double space after *"assessment."* and
the blank line before *"2. Method"* both become `" "`. The `\n` between
*"2. Method"* and *"Monitoring"* survives untouched, because it does not follow
a `.` and was never a split point.

The consequence is precise: **`indexOf(chunk.content)` returns `-1` on any
chunk whose interior crossed a paragraph break.** Which is most of them, in a
real document. Any locator scheme that reconstructs offsets after the fact is
building on this, and it is sand.

## Finding 2 — heading numbers are read as sentence terminators

Visible in the same output: chunk 1 opens *"It follows the NPS. 2. Method"*.
The `SENTENCE_BREAK` regex fires after the `2.` of a numbered heading, so a
heading is split from its own section and glued to the tail of the preceding
paragraph.

This is a **retrieval-quality** finding rather than a locator one, and it is
worth recording separately because it will be blamed on the embedding model.
A chunk that ends *"…the NPS. 2. Method"* embeds as a sentence about the NPS
followed by a stray fragment, and the section heading that would have made the
chunk findable is attached to the wrong body of text.

It also matters to locators for one specific reason: **numbered headings are
the most useful locator a consenting document has** — "ES Chapter 12, §12.4.7"
is what a planner writes in a comment — and the chunker currently destroys the
one signal that would let a heading be associated with the text beneath it.

## Finding 3 — a cross-boundary quote is in no chunk *and* in no version

T-270 names this as the open engineering case. It is worse than it looks.

The chunker packs whole sentences, so **a sentence never spans a chunk
boundary** — that part is fine. But a *claim* routinely rests on two adjacent
sentences, and a model quoting across the join produces text that appears in
neither chunk. Taking the tail of chunk 0 and the head of chunk 1 from the run
above:

```
cross-boundary quote present in any single chunk?  false
cross-boundary quote present in versions.content?  false   ← the surprise
```

It is absent from the version too, because of Finding 1: the join the model
saw was reconstructed by the packer and never existed in the source. So the
obvious fallback — *"if the quote is not in a chunk, look in the version"* —
fails on exactly the case it was introduced to handle.

## What is extractable, per format

The formats are those [v1.md](../v1.md) admits: *text-extractable only, an
unsupported document failing loudly and per-document; scanned-PDF OCR out.*

| Format | Status today | Best reliable locator | Verdict |
| --- | --- | --- | --- |
| **docx** | converted ([`docxToText`](../../../apps/api/src/upload.ts)) | **paragraph index** — `<w:p>` boundaries are already walked and already emit `\n` | ✅ available for the cost of not throwing it away |
| **docx** | — | **page number** | ❌ **impossible. A docx has no pages.** Pagination is computed by the *viewer* from fonts, margins and printer metrics; the file contains no page boundaries at all. Any "page 14" from a Word source is an invention |
| **docx** | — | **numbered section (§12.4.7)** | ⚠️ only where the number is *typed into the text*. List-numbering in `<w:numPr>` is resolved by Word at render time and is not in the file as a string; extracting it means implementing Word's numbering algebra |
| **PDF (text-extractable)** | **no ingest path at all** — PDF exists only as an output rendition ([`renditions.ts`](../../../apps/api/src/renditions.ts) `textToPdf`) | **page number**, first-class and exact | ❌ blocked on a PDF text extractor, which is a real dependency, not a refactor |
| **PDF (scanned)** | — | — | ❌ out of V1 by ruling |
| **xlsx** | uploaded, not converted (`unsupported_conversion`) | **sheet + cell range** | ❌ no extraction path |
| **pptx** | uploaded, not converted | **slide number** | ❌ no extraction path |

**The finding that matters commercially is the PDF row.** A real scheme's
100–500 documents are overwhelmingly PDF — issued deliverables, Advice Notes,
Decision Letters, consultee responses — and page number is the locator a
planner actually uses. There is no PDF *input* path today at all. Sizing the
corpus at 100–500 documents (v1.md) and citing to a locator (v1.md's own
journey) cannot both be true through the docx path alone.

## Recommendation for T-271

**Store a character-offset range on `version_chunks`, and derive everything
else from it.** Three reasons, in order of weight:

1. **It is exact, and it is the only thing that is.** Every other locator —
   paragraph, section, page — is a *view* of a position in the text. Store the
   position; compute the view.
2. **It is format-agnostic.** A locator scheme built per format needs a new
   branch for every format admitted; an offset needs none, and each format then
   contributes a *mapping* from offsets to its own vocabulary.
3. **It is nearly free, and only available now.** The chunker knows where each
   sentence came from at the moment it packs it. Findings 1 and 3 are both
   consequences of throwing that away and trying to recover it afterwards —
   and both disappear if it is simply kept. This is a change to `Chunk`, not a
   rewrite of the chunker.

Then, in order:

- **`chunk.start` / `chunk.end` into `versions.content`**, carried through
  ingest to two new `version_chunks` columns. A migration, drawn in
  [data-model.md](../data-model.md) first.
- **Paragraph index derived from the offset**, by counting `\n` before
  `chunk.start`. Free, because `docxToText` already emits exactly one per
  `<w:p>`, and it is a locator a reader can act on — the source panel can
  scroll to it.
- **The verbatim fallback verified against `versions.content`, at the
  offsets** rather than by searching. Findings 1 and 3 say a search cannot be
  trusted; the offsets make the search unnecessary.
- **A quote that cannot be located degrades to version grain, flagged** —
  never shipped as an unfindable quote. The board's own words: *"a quote that
  cannot be found is worse than none, because it looks checkable."* The
  cross-boundary case resolves naturally: the locator is the **span from the
  first chunk's start to the last chunk's end**, which is a real range in the
  real document even though the model's rendering of the join was not.
- **Fix the heading-number split** (Finding 2) while the chunker is open. It is
  a three-character lookahead — do not split on `.` when it is preceded by a
  digit and followed by whitespace and a capitalised word — and it improves
  retrieval independently of locators.

**Explicitly out of T-271, and each needs its own ticket:** a PDF text
extraction path (the commercially significant one), xlsx and pptx extraction,
and Word numbering resolution for `<w:numPr>` sections.

## What this spike does *not* settle

- **Whether page is worth having at all before a PDF path exists.** It is the
  locator planners name, and it is unavailable from the only format Infora
  currently converts. That is a scope question for the ingest work, not an
  engineering one.
- **Rendering.** How a locator displays in a citation chip, and how the source
  panel scrolls to it, is T-296's business.
- **Retrieval-quality consequences of re-chunking.** Fixing Finding 2 changes
  chunk boundaries, which changes embeddings, which changes what retrieval
  returns. The eval seed set (T-259) is the instrument for measuring that, and
  it should be run before and after — which is a reason to do it in its own
  commit rather than folded into the offset change.

## Where this leaves non-negotiable 1

Still partly outstanding, and now with a shape. The **verbatim-passage** half
is achievable for docx immediately once offsets are stored. The **locator**
half is achievable at paragraph grain for docx immediately, at section grain
only where the author typed the number, and at page grain **not at all** until
there is a PDF input path. The board should stop describing the gap as
"locators" and start describing it as **"offsets now, pages later"**.
