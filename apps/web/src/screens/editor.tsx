// The Editor surface (T-082) per the legacy mockup docs/design/mockups-legacy/editor.html (removed 2026-08-04; in git history)
// (historical build reference — superseded by design-tokens.json/design-rules.md): the
// document canvas with manual editing via PATCH (no Suggestion, no Signal,
// no ceremony), pending Suggestions rendered as proposed blocks with their
// citations, and the right panel's Chat and Suggestions tabs — Chat reuses
// the Ask composer bound to this document; the Insert tab is post-skeleton.
// Resolution lives in the callout itself with reprompt-to-refine stacking
// (T-091, ruled 2026-07-09); the panel tab is the read-only queue.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import type {
  Finding,
  MeResponse,
  PlanRow,
  ReviewComment,
  ReviewCycle,
  Round,
  Run,
  SandboxComment,
  SandboxDocument,
  Suggestion,
} from '@infora/contracts';
import {
  Archive,
  Check,
  FileText,
  LayoutTemplate,
  MessageSquare,
  PenLine,
  Presentation,
  RefreshCw,
  Snowflake,
  ArrowUpFromLine,
  LockOpen,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  ChatComposer,
  CitedProse,
  Markdown,
  Modal,
  NumBadge,
  SectionLabel,
  Table,
  TextArea,
  WithheldNotice,
} from '@infora/ui';
import type { ChatComposerHandle } from '@infora/ui';
import { api } from '../api';
import { useAiFeaturesOff } from '../ai-features';
import { FindingsPanel } from '../findings-panel';
import { describeApiError, errorCode } from '../api-errors';
import { CommentsPanel } from '../comments-panel';
import { ComposerSources } from '../composer-sources';
import { Presence } from '../presence';
import { WorkingSet } from '../working-set';
import { useMe } from '../session';
import { PromotionWindow } from '../promotion-window';
import { SourceModal } from '../source-modal';
import { formatDate, formatDateTime, sandboxLifecycleBadge } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

// T-090/T-101 — the Editor's landing page, per the owner's wireframe
// (2026-07-12): before the canvas, a create-from-new card row over the
// project's sandbox tree. One create path works today (a Word-bound prose
// document — the sandbox document, rendered to docx at promotion); Templates
// waits on the organisation-knowledge store and PowerPoint on the
// slide-shaped document type (the canonical-format theme, tracker). The
// tree has one root for now — the organisation's private project sandbox;
// shared/personal sandboxes and folders arrive with the sandbox drawer.
function EditorEntry() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<SandboxDocument[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    void api.sandboxDocuments(participant.projectId).then((res) => setDocs(res.items));
  }, [participant.projectId]);

  const open = (id: string) => void navigate(`/projects/${participant.projectId}/editor/${id}`);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === '') return;
    const doc = await api.createSandboxDocument(participant.projectId, title.trim());
    open(doc.id);
  }

  return (
    <div className="content">
      <h1 className="page">{participant.projectName}</h1>
      <p className="page-sub">
        Editor — start a document, or open one from the project&apos;s sandboxes; drafting with
        the agent happens on the canvas, against the document.
      </p>

      <SectionLabel>Create from new</SectionLabel>
      <div className="create-grid">
        <button className="create-card" onClick={() => setNaming((open_) => !open_)}>
          <div className="glyph"><FileText size={20} strokeWidth={2} /></div>
          <div className="name">Word document</div>
          <div className="note">A prose deliverable — drafts here, renders to Word at promotion</div>
        </button>
        <button
          className="create-card disabled"
          title="Arrives with the organisation-knowledge store — your firm's house style and templates"
        >
          <div className="glyph"><LayoutTemplate size={20} strokeWidth={2} /></div>
          <div className="name">From a template</div>
          <div className="note">Your organisation&apos;s templates — arrives with Your knowledge</div>
        </button>
        <button
          className="create-card disabled"
          title="A slide-shaped document type — arrives with the canonical-format decision (grill tracker)"
        >
          <div className="glyph"><Presentation size={20} strokeWidth={2} /></div>
          <div className="name">PowerPoint</div>
          <div className="note">Slide deck — arrives with the presentation document type</div>
        </button>
      </div>
      {naming && (
        <form onSubmit={(e) => void create(e)} className="command" style={{ marginTop: 10 }}>
          <span className="glyph"><FileText size={15} strokeWidth={2} /></span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="Name the document"
            style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', color: 'var(--text-primary)', background: 'transparent' }}
          />
          <Button size="sm" variant="primary" type="submit" disabled={title.trim() === ''}>
            Create ↵
          </Button>
        </form>
      )}

      <SectionLabel>Sandboxes</SectionLabel>
      <Table>
        <table>
          <tbody>
            <tr>
              <td colSpan={3} style={{ fontWeight: 600 }}>
                <span className="ficon"><Archive size={14} strokeWidth={2} /></span>
                {me.organisationName} — private project sandbox
              </td>
            </tr>
            {(docs ?? []).map((doc) => (
              <tr key={doc.id} onClick={() => open(doc.id)} style={{ cursor: 'pointer' }}>
                <td className="indent">
                  <span className="ficon"><FileText size={14} strokeWidth={2} /></span>
                  {doc.title}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {formatDateTime(doc.updatedAt)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Button size="sm" variant="quiet" onClick={() => open(doc.id)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {docs !== null && docs.length === 0 && (
              <tr>
                <td colSpan={3} className="indent" style={{ color: 'var(--text-muted)' }}>
                  Nothing here yet — create a document to start drafting.
                </td>
              </tr>
            )}
            <tr>
              <td colSpan={3} style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
                Shared and personal sandboxes — and folders — arrive with the sandbox drawer.
              </td>
            </tr>
          </tbody>
        </table>
      </Table>
    </div>
  );
}

// Edit a Suggestion's proposed content before accepting it — a real modal with
// a TextArea, replacing window.prompt (T-230).
function EditSuggestionModal(props: { suggestion: Suggestion; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(props.suggestion.content);
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Edit the proposed content"
      size="lg"
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={text.trim() === ''} onClick={() => props.onSave(text)}>
            Accept edited
          </Button>
        </>
      }
    >
      <TextArea value={text} onChange={setText} rows={12} />
    </Modal>
  );
}

export function EditorScreen() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<SandboxDocument | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  // toned, dismissible notices in place of window.alert (T-230/T-228)
  const [note, setNoteState] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  // T-373 — the promotion window, opened rather than the act fired bare
  const [promoting, setPromoting] = useState(false);
  const setNote = useCallback((text: string, tone: 'success' | 'error' = 'success') => setNoteState({ text, tone }), []);
  useEffect(() => {
    if (note?.tone !== 'success') return;
    const t = setTimeout(() => setNoteState(null), 5000);
    return () => clearTimeout(t);
  }, [note]);
  // editing a Suggestion's proposed content before accepting — a real modal, not window.prompt (T-230)
  const [editSuggestion, setEditSuggestion] = useState<Suggestion | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [comments, setComments] = useState<SandboxComment[]>([]); // T-112
  // T-311 — the marked-up edit. ONE list behind both views: the marks in the
  // canvas and the grouped-by-check panel are drawn from this, because a second
  // read would be a second answer to "what did the checker find".
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingBusy, setFindingBusy] = useState(false);
  const [drifted, setDrifted] = useState<string[]>([]);
  const [focusedFinding, setFocusedFinding] = useState<{ id: string; at: number } | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null); // T-132: the review to answer
  const [boundRow, setBoundRow] = useState<PlanRow | null>(null); // T-366: the read-through row
  const [panelTab, setPanelTab] = useState<'chat' | 'comments' | 'review' | 'checks'>('chat');
  const reviewDefaulted = useRef(false);
  const [draftAnchor, setDraftAnchor] = useState<string | null>(null); // captured canvas selection
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  // two-way linking (T-112): a canvas click on a highlight focuses its thread
  // in the panel; a panel click selects and scrolls to the text. `at` makes a
  // repeated click on the same thread re-trigger the focus.
  const [focusedThread, setFocusedThread] = useState<{ id: string; at: number } | null>(null);
  const [flashThread, setFlashThread] = useState<string | null>(null);
  const [chatLog, setChatLog] = useState<Array<{ id: number; who: 'user' | 'agent'; text: string; run?: Run }>>([]);
  const [pending, setPending] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null); // versionId (T-094)
  const [refining, setRefining] = useState<string | null>(null); // suggestion id (T-096)
  const [refineText, setRefineText] = useState('');
  const [previewing, setPreviewing] = useState(false); // canvas: write / preview (T-096)
  const canvasRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null); // the shared multiplayer thread (T-160)
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  // T-463 — the project's AI feature switches, for the launchers this screen carries
  const aiOff = useAiFeaturesOff(participant.projectId);
  const nextId = useRef(0);

  const load = useCallback(async () => {
    if (documentId === undefined) return;
    const [document, list, threads, marks] = await Promise.all([
      api.sandboxDocument(documentId),
      api.documentSuggestions(documentId),
      api.documentComments(documentId),
      // a failed read is not an empty finding list: rendering "nothing found"
      // off a request that did not answer is a claim we cannot make
      api.findings(documentId).catch(() => null),
    ]);
    setDoc(document);
    setContent(document.content);
    setDirty(false);
    setSuggestions(list.items);
    setComments(threads.items);
    if (marks !== null) setFindings(marks.items);
    // T-132: if this draft's container is in review, pull the cycle so an
    // issued round's comments can be answered here, beside the canvas
    const cyc = document.containerId
      ? await api.cycle(document.containerId).catch(() => null)
      : null;
    setCycle(cyc);
    // T-366 (ADR-0038 addendum): a bound draft READS THE ROW THROUGH — the
    // chrome shows the plan row's reference and title over the container link
    if (document.containerId) {
      const plan = await api.plan(participant.projectId).catch(() => null);
      setBoundRow(plan?.items.find((r) => r.containerId === document.containerId) ?? null);
    } else {
      setBoundRow(null);
    }
  }, [documentId, participant.projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // T-132: when an issued round is waiting on this draft, the review leads —
  // the agent pane steps aside to it (once; the author can tab back to Chat)
  useEffect(() => {
    const issued =
      cycle && cycle.state === 'active'
        ? [...cycle.rounds].reverse().find((r) => r.state === 'issued')
        : undefined;
    if (issued && issued.comments.length > 0 && !reviewDefaulted.current) {
      setPanelTab('review');
      reviewDefaulted.current = true;
    }
  }, [cycle]);

  // takes the value rather than reading state: the blur that triggers a save
  // can fire before React re-renders, and the closure's `content` would be
  // one keystroke stale — a fast type-then-click-away must not lose the edit
  async function save(value: string) {
    // a checked-out head is read-only — never fire a save that the API would 409
    if (documentId === undefined || doc === null || doc.headLocked || value === doc.content) return;
    const updated = await api.patchSandboxDocument(documentId, value);
    setDoc(updated);
    setContent(updated.content);
    setDirty(false);
  }

  // T-053: accept/edit/reject — one Signal per Suggestion; accept/edit lands
  // the content in the document, reject leaves it untouched
  async function resolve(suggestion: Suggestion, resolution: 'accepted' | 'edited' | 'rejected') {
    // "edit" opens a real modal (T-230); accept/reject apply directly
    if (resolution === 'edited') {
      setEditSuggestion(suggestion);
      return;
    }
    await api.resolveSuggestion(suggestion.id, resolution);
    await load();
  }

  async function commitEdit(suggestion: Suggestion, editedContent: string) {
    await api.resolveSuggestion(suggestion.id, 'edited', editedContent);
    await load();
    setEditSuggestion(null);
  }

  async function runAgainst(request: string) {
    if (pending || documentId === undefined) return;
    setChatLog((log) => [...log, { id: nextId.current++, who: 'user', text: request }]);
    setPending(true);
    abortRef.current = new AbortController();
    try {
      // the editor conversation is a document-bound multiplayer thread (T-160):
      // its prompts and responses are visible to the document's sandbox scope
      if (conversationRef.current === null) {
        conversationRef.current = (
          await api.createConversation(participant.projectId, undefined, documentId)
        ).conversationId;
        setConvId(conversationRef.current);
      }
      const run = await api.createRun(conversationRef.current, request, documentId, abortRef.current.signal);
      setChatLog((log) => [
        ...log,
        {
          id: nextId.current++,
          who: 'agent',
          text:
            run.suggestions.length > 0
              ? `Done — ${run.suggestions.length} suggestion${run.suggestions.length === 1 ? '' : 's'} on the document.`
              : (run.response ?? 'Nothing survived ground-check — no content was proposed.'),
          run,
        },
      ]);
      await load(); // the new Suggestion appears on the canvas and the panel
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setChatLog((log) => [
          ...log,
          {
            id: nextId.current++,
            who: 'agent',
            text: 'Cancelled — the wait was abandoned; the run itself still completes in the audit record. Reload the document to see any suggestion it produced.',
          },
        ]);
      } else {
        throw error;
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  const cancelRun = () => abortRef.current?.abort();

  // T-091/T-096: reprompt-to-refine — an inline dialog in the callout fires a
  // new run seeded with the pending proposal; the refined suggestion stacks
  // above the old one
  async function submitRefine(event: FormEvent, suggestion: Suggestion) {
    event.preventDefault();
    const refinement = refineText.trim();
    if (refinement === '') return;
    setRefining(null);
    setRefineText('');
    await runAgainst(
      `Refine the pending draft below.\n\nRefinement: ${refinement}\n\nThe pending draft:\n${suggestion.content}`,
    );
  }

  // T-096: the formatting toolbar writes markdown around the canvas
  // selection — the sandbox document *is* markdown text (see the
  // canonical-format theme on the grill tracker for true WYSIWYG)
  function applyFormat(action: (text: string, from: number, to: number) => { text: string; from: number; to: number }) {
    const area = canvasRef.current;
    if (area === null) return;
    const applied = action(area.value, area.selectionStart, area.selectionEnd);
    setContent(applied.text);
    setDirty(true);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(applied.from, applied.to);
    });
  }

  // the canvas grows with its text — the page scrolls, the textarea never
  // does (which also keeps the highlight mirror below in lockstep)
  useEffect(() => {
    const area = canvasRef.current;
    if (area === null) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }, [content, previewing]);

  // T-112: the Comment button (toolbar, or the bubble floating at the
  // selection) captures the canvas selection as the thread's advisory anchor
  // (no selection = a document-level comment) and opens the Comments tab
  function startComment(range?: { from: number; to: number }) {
    const area = canvasRef.current;
    const picked =
      range ??
      (area !== null && area.selectionStart !== area.selectionEnd
        ? { from: area.selectionStart, to: area.selectionEnd }
        : null);
    const selected = picked === null ? '' : content.slice(picked.from, picked.to).trim();
    setDraftAnchor(selected === '' ? null : selected);
    setSelection(null);
    setPanelTab('comments');
  }

  // T-112: a panel thread finds its span on the canvas — selected, scrolled
  // to (via its highlight mark) and flashed. Advisory, so a drifted quote
  // simply selects nothing.
  function locateThread(root: SandboxComment) {
    if (root.anchor === null) return;
    const area = canvasRef.current;
    if (area !== null) {
      const at = area.value.indexOf(root.anchor);
      if (at !== -1) {
        area.focus({ preventScroll: true });
        area.setSelectionRange(at, at + root.anchor.length);
      }
    }
    // closed threads paint no mark — the selection alone marks the spot
    document
      .querySelector(`mark[data-thread="${root.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashThread(root.id);
    window.setTimeout(() => setFlashThread((cur) => (cur === root.id ? null : cur)), 1400);
  }


  // ── T-311 — the reviewer's side of the marked-up edit ─────────────────────
  //
  // Every path reloads from the server rather than patching local state,
  // because an accepted fix REWRITES THE DRAFT: the canvas, every other mark's
  // offsets and the open count all move together, and a client that guessed at
  // the new text would paint the next mark in the wrong place.
  function locateFinding(finding: Finding) {
    const area = canvasRef.current;
    const { start, end } = finding.anchor.span;
    if (area !== null && area.value.slice(start, end) === finding.anchor.verbatim) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(start, end);
    }
    document
      .querySelector(`mark[data-thread="${finding.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashThread(finding.id);
    window.setTimeout(() => setFlashThread((cur) => (cur === finding.id ? null : cur)), 1400);
  }

  async function afterTriage(promise: Promise<{ driftedAnchors: string[] }>) {
    setFindingBusy(true);
    try {
      const result = await promise;
      setDrifted(result.driftedAnchors);
      await load();
    } catch (problem) {
      setNote(describeApiError(errorCode(problem)), 'error');
    } finally {
      setFindingBusy(false);
    }
  }

  const wrapWith = (mark: string) => (text: string, from: number, to: number) => ({
    text: `${text.slice(0, from)}${mark}${text.slice(from, to)}${mark}${text.slice(to)}`,
    from: from + mark.length,
    to: to + mark.length,
  });

  const prefixLines = (prefix: string) => (text: string, from: number, to: number) => {
    const lineStart = text.lastIndexOf('\n', from - 1) + 1;
    const block = text.slice(lineStart, to);
    const prefixed = block
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`))
      .join('\n');
    return {
      text: `${text.slice(0, lineStart)}${prefixed}${text.slice(to)}`,
      from: lineStart,
      to: lineStart + prefixed.length,
    };
  };

  if (documentId === undefined) return <EditorEntry />;
  if (doc === null) return null;

  // T-091, the refine-stack rule (ruled 2026-07-09): pending suggestions
  // stack newest-first; once one is accepted or edited, unaccepted ones
  // older than it leave the surface (the rows remain — append-only).
  const resolvedAt = suggestions.findIndex(
    (sg) => sg.signal !== undefined && sg.signal.resolution !== 'rejected',
  );
  const pendingSuggestions = suggestions.filter(
    (sg, at) => sg.signal === undefined && (resolvedAt === -1 || at < resolvedAt),
  );
  const openThreads = comments.filter(
    (c) => c.parentCommentId === null && c.status === 'open',
  ).length;

  // T-132: the issued round this draft must answer (latest issued while the
  // cycle is active). Its comments are the reviewer's record (Drawer 5) —
  // distinct from the working-draft threads above (Drawer 2).
  const reviewRound =
    cycle && cycle.state === 'active'
      ? ([...cycle.rounds].reverse().find((r) => r.state === 'issued') ?? null)
      : null;
  const reviewComments = reviewRound?.comments ?? [];
  const unansweredReview = reviewComments.filter((c) => c.response === null).length;
  const inReview = reviewComments.length > 0;

  // T-112: in-text highlights for open anchored threads — first occurrence,
  // overlaps skipped; advisory, so a drifted anchor simply paints nothing
  // (the same degrade rule as locate). Rendered on a mirror layer behind the
  // transparent-backed textarea, which never scrolls internally (it auto-
  // grows), so the two stay in lockstep.
  //
  // T-311 — the checker's marks ride the same mirror, and they anchor
  // DIFFERENTLY: a comment's anchor is an advisory quote searched for in the
  // text, where a finding carries real offsets (ADR-0048 §2). So a finding's
  // span is used directly and then VERIFIED against the words under it — if the
  // draft has been edited since the check ran, the mark simply is not painted,
  // which is the same degrade rule one grain more precisely.
  const anchorRanges: Array<{
    from: number;
    to: number;
    threadId: string;
    kind: 'thread' | 'finding';
    severity?: 'required' | 'advisory';
  }> = [];
  for (const c of comments) {
    if (c.parentCommentId !== null || c.status !== 'open' || c.anchor === null) continue;
    const at = content.indexOf(c.anchor);
    if (at === -1) continue;
    const to = at + c.anchor.length;
    if (!anchorRanges.some((r) => at < r.to && to > r.from)) {
      anchorRanges.push({ from: at, to, threadId: c.id, kind: 'thread' });
    }
  }
  for (const finding of findings) {
    if (finding.status !== 'open') continue;
    const { start, end } = finding.anchor.span;
    if (content.slice(start, end) !== finding.anchor.verbatim) continue;
    if (anchorRanges.some((r) => start < r.to && end > r.from)) continue;
    anchorRanges.push({
      from: start,
      to: end,
      threadId: finding.id,
      kind: 'finding',
      severity: finding.severity,
    });
  }
  anchorRanges.sort((a, b) => a.from - b.from);
  const openFindings = findings.filter((finding) => finding.status === 'open').length;

  return (
    <>
      {promoting && (
        <PromotionWindow
          document={doc}
          projectId={participant.projectId}
          onClose={() => setPromoting(false)}
          onPromoted={(r) => {
            setPromoting(false);
            void navigate(`/projects/${participant.projectId}/review/${doc.containerId}/cycle`, {
              state: { promoted: r.versionReference },
            });
          }}
        />
      )}
      {sourceOpen !== null && (
        <SourceModal versionId={sourceOpen} onClose={() => setSourceOpen(null)} />
      )}
      {editSuggestion && (
        <EditSuggestionModal
          suggestion={editSuggestion}
          onSave={(text) => void commitEdit(editSuggestion, text)}
          onClose={() => setEditSuggestion(null)}
        />
      )}
      <div className="topbar" style={{ position: 'static' }}>
        <span className="crumb">
          {/* T-098: where the document lives, clickable */}
          <a
            className="location-chip"
            title="Open the sandbox"
            onClick={() => void navigate(`/projects/${participant.projectId}/sandbox`)}
          >
            <Archive size={12} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
            {me.organisationName} — project sandbox
          </a>{' '}
          /{' '}
          {boundRow ? (
            <>
              <span className="mono" style={{ marginRight: 6 }}>{boundRow.documentReference}</span>
              <b title="A bound draft shows its plan row’s title — retitle it on the plan (ADR-0038)">
                {boundRow.workItem?.title ?? doc.title}
              </b>
            </>
          ) : (
            <b>{doc.title}</b>
          )}
        </span>
        <div className="right">
          {documentId !== undefined && <Presence documentId={documentId} />}
          {/* T-455 — the lifecycle badge, the same words as the sandbox row */}
          <Badge tone={sandboxLifecycleBadge(doc).tone}>{sandboxLifecycleBadge(doc).label}</Badge>
          {doc.headLocked && (
            <>
              <Badge tone="neutral">Checked out — read-only until released</Badge>
              <span title="Release the check-out — hands the pen back and unlocks the head (ADR-0032)">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    void api
                      .releaseDocument(doc.id)
                      .then(() => load())
                      .catch(() =>
                        setNote('Release refused — an open review round, or a check-out that isn’t yours to release.', 'error'),
                      )
                  }
                >
                  <LockOpen size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
                  Release
                </Button>
              </span>
            </>
          )}
          {!doc.headLocked && doc.origin === 'authored' && (
            <span title="Freeze the head into the document's org-private P-series (ADR-0032)">
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                void api
                  .freezeDocument(doc.id)
                  .then((f) => {
                    void load();
                    setNote(`Frozen as ${f.versionReference} in the internal series.`);
                  })
                  .catch(() => setNote('Freeze refused — a round may already be open.', 'error'))
              }
            >
              <Snowflake size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              Freeze
            </Button>
            </span>
          )}
          {/* T-373 — the reconfirming window, not a bare act (ADR-0008 addendum) */}
          {doc.containerId && !doc.headLocked && (
            <span title="Promote into the waiting container — reconfirm what is about to happen (ADR-0008)">
            <Button size="sm" variant="primary" onClick={() => setPromoting(true)}>
              <ArrowUpFromLine size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              Promote
            </Button>
            </span>
          )}
          {dirty && !doc.headLocked ? (
            <Button size="sm" variant="primary" onClick={() => void save(content)}>
              Save
            </Button>
          ) : (
            !doc.headLocked && <Badge tone="neutral">No document controls</Badge>
          )}
        </div>
      </div>

      {note !== null && (
        <div className={`banner banner--${note.tone}`} style={{ margin: '8px 0' }}>
          {note.text}
          <button className="modal-x" aria-label="Dismiss" onClick={() => setNoteState(null)} style={{ marginLeft: 'auto' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <div className="editor-layout">
        {/* T-132: in review-response mode the version under review sits
            read-only beside the editable canvas — the author edits toward
            vN+1 with the reviewed vN in view */}
        {inReview && reviewRound && (
          <ReferencePane
            versionId={reviewRound.versionId}
            versionReference={reviewRound.versionReference}
          />
        )}
        <div className="canvas">
          {/* T-096 — the formatting toolbar: markdown-honest word-processor
              controls; mousedown is swallowed so the selection (and the
              blur-save) are not disturbed */}
          <div className="format-bar" onMouseDown={(e) => e.preventDefault()}>
            <button title="Bold" style={{ fontWeight: 700 }} onClick={() => applyFormat(wrapWith('**'))}>
              B
            </button>
            <button title="Italic" style={{ fontStyle: 'italic' }} onClick={() => applyFormat(wrapWith('*'))}>
              I
            </button>
            <span className="rule" />
            <button title="Heading" onClick={() => applyFormat(prefixLines('## '))}>
              H2
            </button>
            <button title="Subheading" onClick={() => applyFormat(prefixLines('### '))}>
              H3
            </button>
            <span className="rule" />
            <button title="Bulleted list" onClick={() => applyFormat(prefixLines('- '))}>
              • List
            </button>
            <button title="Numbered list" onClick={() => applyFormat(prefixLines('1. '))}>
              1. List
            </button>
            <button title="Quote" onClick={() => applyFormat(prefixLines('> '))}>
              ❝ Quote
            </button>
            <span className="rule" />
            <button
              aria-label="Comment on the selection"
              title="Comment on the selection — or the document, when nothing is selected"
              onClick={() => startComment()}
            >
              <MessageSquare size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              Comment
            </button>
            {/* T-336 — THE TOOL CHIP, and it is NOT A SECOND FLOW. It opens the
                Tools launcher with this draft already chosen: the editor route
                is the Tools route with its first step pre-filled, so there is
                ONE run shape and ONE place the scope is stated (ADR-0053 §1).
                A checker that ran straight off this button would be a second
                launcher with no plan and no coverage statement. */}
            {/* T-463 — absent, not greyed, when the project has switched the checker off */}
            {!aiOff.has('qa_checker') && (
            <button
              aria-label="Check this draft"
              title="Check this draft — opens the QA checker with this document chosen"
              onClick={() =>
                void navigate(
                  `/projects/${participant.projectId}/tools/qa-check?documentId=${doc.id}`,
                )
              }
            >
              <Check size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
              Check
            </button>
            )}
            <span style={{ marginLeft: 'auto' }} />
            <button
              className={previewing ? undefined : 'active'}
              onClick={() => setPreviewing(false)}
            >
              Write
            </button>
            <button
              className={previewing ? 'active' : undefined}
              onClick={() => {
                void save(content);
                setPreviewing(true);
              }}
            >
              Preview
            </button>
          </div>
          <div className="doc-body">
            {previewing ? (
              <div style={{ minHeight: 260 }}>
                {content.trim() === '' ? (
                  <p style={{ color: 'var(--text-muted)' }}>Nothing to preview yet.</p>
                ) : (
                  <Markdown>{content}</Markdown>
                )}
              </div>
            ) : (
              <div className="canvas-stack">
                {/* highlights behind the text: the open threads' anchors */}
                {anchorRanges.length > 0 && (
                  <div className="canvas-mirror" aria-hidden>
                    {anchorRanges.map((range, at) => (
                      <span key={range.from}>
                        {content.slice(at === 0 ? 0 : anchorRanges[at - 1]!.to, range.from)}
                        <mark
                          data-thread={range.threadId}
                          data-kind={range.kind}
                          data-severity={range.severity}
                          className={[
                            range.kind === 'finding' ? 'mark--finding' : null,
                            flashThread === range.threadId ? 'flash' : null,
                          ]
                            .filter((name) => name !== null)
                            .join(' ') || undefined}
                        >
                          {content.slice(range.from, range.to)}
                        </mark>
                      </span>
                    ))}
                    {content.slice(anchorRanges[anchorRanges.length - 1]!.to)}
                  </div>
                )}
                <textarea
                  ref={canvasRef}
                  value={content}
                  readOnly={doc.headLocked}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                  }}
                  onSelect={(e) => {
                    const area = e.currentTarget;
                    setSelection(
                      area.selectionStart === area.selectionEnd
                        ? null
                        : { from: area.selectionStart, to: area.selectionEnd },
                    );
                  }}
                  onClick={(e) => {
                    // a plain click inside a highlight focuses its thread
                    const area = e.currentTarget;
                    if (area.selectionStart !== area.selectionEnd) return;
                    const caret = area.selectionStart;
                    const hit = anchorRanges.find((r) => caret >= r.from && caret <= r.to);
                    if (hit === undefined) return;
                    // two views of one set: clicking a mark opens the entry it
                    // belongs to, in whichever panel owns it
                    if (hit.kind === 'finding') {
                      setPanelTab('checks');
                      setFocusedFinding({ id: hit.threadId, at: Date.now() });
                      return;
                    }
                    setPanelTab('comments');
                    setFocusedThread({ id: hit.threadId, at: Date.now() });
                  }}
                  onBlur={(e) => void save(e.currentTarget.value)}
                  placeholder="Write here — manual editing has no ceremony: no Suggestion, no Signal."
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: 260,
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    overflow: 'hidden',
                    font: 'inherit',
                    lineHeight: 'inherit',
                    color: 'inherit',
                    background: 'transparent',
                  }}
                />
                {/* the comment bubble floats at the end of the selection */}
                {selection !== null && (
                  <div className="canvas-mirror caret">
                    {content.slice(0, selection.to)}
                    <span style={{ position: 'relative' }}>
                      <button
                        className="sel-comment"
                        aria-label="Comment on the selection"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => startComment(selection)}
                      >
                        <MessageSquare size={12} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
                        Comment
                      </button>
                    </span>
                  </div>
                )}
              </div>
            )}

            {pendingSuggestions.map((suggestion, at) => (
              <div key={suggestion.id} className={at === 0 ? 'proposed' : 'proposed stale'}>
                <div className="proposed-tag">
                  <NumBadge>{at + 1}</NumBadge>{' '}
                  {at === 0
                    ? `Suggestion · ${suggestion.kind} · pending your decision`
                    : 'earlier proposal · superseded by the one above, still resolvable'}
                </div>
                {/* each citation rides the claim it backs (T-095) */}
                <CitedProse
                  content={suggestion.content}
                  citations={suggestion.citations}
                  onOpenSource={setSourceOpen}
                />
                {suggestion.rationale.includes('withheld') &&
                  !suggestion.rationale.includes('nothing was withheld') && (
                    <WithheldNotice>{suggestion.rationale}</WithheldNotice>
                  )}
                <div className="proposed-actions">
                  <Button size="sm" variant="primary" onClick={() => void resolve(suggestion, 'accepted')}>
                    <Check size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
                    Accept
                  </Button>
                  <Button size="sm" onClick={() => void resolve(suggestion, 'edited')}>
                    <PenLine size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setRefining(refining === suggestion.id ? null : suggestion.id);
                      setRefineText('');
                    }}
                    disabled={pending}
                  >
                    <RefreshCw size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />
                    Refine
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void resolve(suggestion, 'rejected')}>
                    Reject
                  </Button>
                </div>
                {refining === suggestion.id && (
                  <form
                    onSubmit={(e) => void submitRefine(e, suggestion)}
                    className="command"
                    style={{ marginTop: 10, padding: '8px 12px' }}
                  >
                    <span className="glyph">↻</span>
                    <input
                      autoFocus
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRefining(null);
                      }}
                      placeholder="How should this proposal change?"
                      style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', fontSize: 12.5, background: 'transparent', color: 'var(--text-primary)' }}
                    />
                    <Button size="sm" variant="primary" type="submit" disabled={pending}>
                      Refine ↵
                    </Button>
                    <Button size="sm" variant="quiet" type="button" onClick={() => setRefining(null)}>
                      Cancel
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* T-098: the panel is the chat — proposals live inline in the
            document itself, resolved in their callouts. T-132: while an
            issued round is with this draft, the review leads and the agent
            steps aside to a tab. */}
        <div className="suggest-panel">
          <div className="panel-tabs">
            {inReview && (
              <a
                className={panelTab === 'review' ? 'active' : undefined}
                onClick={() => setPanelTab('review')}
              >
                Review{unansweredReview > 0 && ` (${unansweredReview})`}
              </a>
            )}
            <a
              className={panelTab === 'chat' ? 'active' : undefined}
              onClick={() => setPanelTab('chat')}
            >
              Chat
            </a>
            {/* T-112: working-draft comment threads live beside the chat */}
            <a
              className={panelTab === 'comments' ? 'active' : undefined}
              onClick={() => setPanelTab('comments')}
            >
              Comments
              {openThreads > 0 && ` (${openThreads})`}
            </a>
            {/* T-311: the checker's marks, grouped by the check that raised
                them. The tab is always present — an absent one would mean a
                draft that has never been checked and a draft whose check found
                nothing look the same. */}
            <a
              className={panelTab === 'checks' ? 'active' : undefined}
              onClick={() => setPanelTab('checks')}
            >
              Checks
              {openFindings > 0 && ` (${openFindings})`}
            </a>
            {pendingSuggestions.length > 0 && (
              <a style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                {pendingSuggestions.length} pending in the document
              </a>
            )}
          </div>

          {panelTab === 'review' && reviewRound ? (
            <ReviewResponsePanel round={reviewRound} onResponded={() => void load()} />
          ) : panelTab === 'checks' ? (
            <FindingsPanel
              findings={findings}
              busy={findingBusy}
              focused={focusedFinding}
              drifted={drifted}
              onLocate={locateFinding}
              onResolve={(finding, resolution, edited) =>
                void afterTriage(
                  api.resolveFinding(doc.id, finding.id, resolution, edited),
                )
              }
              onBulk={(action, findingIds) =>
                void afterTriage(api.bulkResolveFindings(doc.id, action, findingIds))
              }
            />
          ) : panelTab === 'comments' ? (
            <CommentsPanel
              documentId={doc.id}
              projectId={participant.projectId}
              meParticipantId={participant.participantId}
              comments={comments}
              onChanged={() => void load()}
              draftAnchor={draftAnchor}
              onClearDraftAnchor={() => setDraftAnchor(null)}
              onLocate={locateThread}
              focused={focusedThread}
            />
          ) : (
            <>
              {/* just the request and the reply — the run stays fully audited
                  server-side, readable on the work item (T-096) */}
              {chatLog.map((entry) => (
                <div key={entry.id} className={`msg ${entry.who}`} style={{ maxWidth: '100%' }}>
                  <div className="who">{entry.who === 'user' ? 'You' : 'Infora agent'}</div>
                  <div className="bubble" style={{ fontSize: 12.5 }}>
                    <Markdown>{entry.text}</Markdown>
                  </div>
                </div>
              ))}
              {pending && (
                <div className="msg agent" style={{ maxWidth: '100%' }}>
                  <div className="who">Infora agent</div>
                  <div className="bubble" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Working…
                  </div>
                </div>
              )}
              <WorkingSet conversationId={convId} />
              <div style={{ marginTop: 8 }}>
                <ChatComposer
                  ref={composerRef}
                  placeholder="Ask for a draft into this document"
                  pending={pending}
                  onSend={(request) => void runAgainst(request)}
                  onCancel={cancelRun}
                  fontSize={12.5}
                  sources={
                    <ComposerSources
                      projectId={participant.projectId}
                      onInsert={(snippet) => composerRef.current?.insert(snippet)}
                    />
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// T-132 — the version under review, read-only, beside the editable canvas:
// the author edits toward vN+1 with the reviewed vN in view.
function ReferencePane(props: { versionId: string; versionReference: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.version(props.versionId).then(
      (v) => live && setContent(v.content),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [props.versionId]);
  return (
    <div className="review-ref">
      <div className="ref-head">Version under review · {props.versionReference} · read-only</div>
      {failed && <p style={{ color: 'var(--text-muted)' }}>The reviewed version could not be read.</p>}
      {content !== null && <Markdown>{content}</Markdown>}
    </div>
  );
}

// T-132 — address the review here: the issued round's comments (Drawer 5, the
// reviewer's record — not the working-draft threads of Drawer 2) each get a
// response, then the author edits the canvas and re-promotes (⇧ Promote) to
// send vN+1 back. The T-124 author loop made a first-class editing surface.
function ReviewResponsePanel(props: { round: Round; onResponded: () => void }) {
  const { round } = props;
  const unanswered = round.comments.filter((c) => c.response === null).length;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <b>Round {round.number} — respond to the review</b>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
          {unanswered > 0
            ? `${unanswered} comment${unanswered === 1 ? '' : 's'} still to answer. Address each, edit the draft, then ⇧ Promote to send v${round.number + 1} back.`
            : `Every comment is answered — edit the draft as needed, then ⇧ Promote to send v${round.number + 1} back.`}
        </p>
      </div>
      {round.comments.map((comment) => (
        <ReviewCommentResponse key={comment.id} comment={comment} onResponded={props.onResponded} />
      ))}
    </div>
  );
}

function ReviewCommentResponse(props: { comment: ReviewComment; onResponded: () => void }) {
  const { comment } = props;
  const [responding, setResponding] = useState(false);
  const [body, setBody] = useState('');
  const [noChange, setNoChange] = useState(false);
  const [quote, setQuote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function record() {
    setBusy(true);
    setError(null);
    try {
      await api.respondToComment(
        comment.id,
        body.trim(),
        noChange ? { noChangeReason: reason.trim() } : { changeQuote: quote.trim() },
      );
      props.onResponded();
    } catch (e) {
      setError(describeApiError(errorCode(e)));
      setBusy(false);
    }
  }

  return (
    <div className="review-thread">
      <div style={{ fontSize: 12.5 }}>
        <b>{comment.author.name}</b>{' '}
        {comment.acceptanceCode && <Badge tone="info">{comment.acceptanceCode.code}</Badge>}{' '}
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {formatDate(comment.createdAt)}
        </span>
      </div>
      {comment.anchor?.quote && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11.5, fontStyle: 'italic' }}>
          “{comment.anchor.quote}”{comment.anchor.page !== undefined && ` — p.${comment.anchor.page}`}
        </div>
      )}
      <div style={{ fontSize: 12.5 }}>{comment.body}</div>
      {comment.response ? (
        <div className="review-response">
          <b>Your response</b> · {comment.response.body}
          {comment.response.noChangeReason ? (
            <span style={{ color: 'var(--text-muted)' }}> — no change: {comment.response.noChangeReason}</span>
          ) : (
            comment.response.nextVersionAnchor?.quote && (
              <span style={{ color: 'var(--text-muted)' }}>
                {' '}— change: <i>“{comment.response.nextVersionAnchor.quote}”</i>
              </span>
            )
          )}
        </div>
      ) : responding ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <textarea
            autoFocus
            placeholder="How is the comment addressed?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ ...refField, minHeight: 44 }}
          />
          {/* ADR-0004 — point at the change, or say explicitly none was made */}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={noChange}
              onChange={(e) => setNoChange(e.target.checked)}
            />
            No change was made
          </label>
          {noChange ? (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why no change was made…"
              style={refField}
            />
          ) : (
            <input
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="The revised passage that answers it — the link into the next version…"
              style={refField}
            />
          )}
          {error && <Badge tone="danger">{error}</Badge>}
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !body.trim() || (noChange ? !reason.trim() : !quote.trim())}
              onClick={() => void record()}
            >
              Record the response
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setResponding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="quiet" onClick={() => setResponding(true)}>
            Respond
          </Button>
        </div>
      )}
    </div>
  );
}

const refField = {
  font: 'inherit',
  fontSize: 12.5,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--control-sm)',
  padding: '6px 8px',
  background: 'var(--surface-pane)',
  color: 'var(--text-primary)',
} as const;
