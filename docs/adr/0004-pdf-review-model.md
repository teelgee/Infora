# ADR-0004 - PDF review model: PDF is the authoritative review rendition; in-PDF anchored comments; mandatory response links

**Status:** Accepted.

**Context:** Deliverables exist as native files (Word, PowerPoint, Excel), but reviewing and recording need a fixed artifact that does not drift between versions, and comments need real anchors rather than typed location descriptions. Making review work inside native Word for promoted deliverables is hard and is out of scope for build 1.

**Decision:** For build 1, the promoted version is reviewed as a PDF in a native Infora viewer. The PDF is the authoritative reviewed-and-recorded rendition; the native source file lives in the same document-reference container as the asset the client owns and reuses, and Infora binds the PDF to the native file at promotion. Reviewers comment by highlighting text or dropping a point on the PDF; each comment carries that anchor into the DRR as a callout showing the referenced region. Because the version is a frozen snapshot, anchors never drift. A consultant response must link to a specific section of the next version's PDF; the only alternative is an explicit no-change response with a reason. Review inside native Word is deferred.

**Consequences:** Comment re-anchoring is avoided by anchoring to immutable per-version PDFs. The DRR is a table of anchored comments, responses and codes across versions. Reviewers move into the Infora PDF viewer; the Word add-in is a consultant authoring surface, not a reviewer capture path, in build 1. Point-drop covers PDF pages with no text layer (scans, drawings). Mandatory response links yield comment-to-resolution labelled pairs as moat data.
