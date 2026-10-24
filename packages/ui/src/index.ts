// @infora/ui — shared React kit + design tokens. Components emit a fixed
// class vocabulary styled from docs/design/design-tokens.json (via
// tokens.generated.css); apps import './styles.css' once for the chrome.
export { designTokens } from './tokens';
export type { DesignTokenName } from './tokens';
export {
  Badge,
  badgeTone,
  Button,
  Card,
  Chip,
  CommandBar,
  IconButton,
  MadeCard,
  OutChip,
  RuleCard,
  SectionLabel,
  SourceChip,
  WithheldNotice,
} from './primitives';
export type { BadgeTone } from './primitives';
export { ProjectSwitcher, Rail, RailNav, RailSpacer, UserChip, WorkspaceZone } from './rail';
export type { RailNavItem } from './rail';
export { AppFrame, CollapseToggle, Pane, PaneHeader, ResizeGrip } from './app-frame';
export { Prose } from './prose';
// T-468 — the card that opens on hover/focus (the source card's frame)
export { HoverCard, hoverCardReducer } from './hover-card';
export { WorkingSetLine } from './working-set-line';
export { DropdownMenu, DropdownMenuItem } from './dropdown-menu';
export { Modal, Drawer } from './dialog';
// T-421 — SegmentedControl: a pick-one-of-two-or-three drawn as one control
// rather than a row of buttons (design-rules §B)
export { Field, TextInput, TextArea, SegmentedControl, segmentStep, SelectInput, Combobox } from './form';
// T-470 — the keyboard-first multi-select behind the scope control
export { MultiPicker, filterPickerGroups, multiPickerStep } from './multi-picker';
export type { PickerGroup, PickerOption, PickerStep } from './multi-picker';
export { Table } from './table';
export { Skeleton } from './skeleton';
export { ProjectCard } from './project-card';
export { NumBadge, SuggestionCard } from './suggestion-card';
export { RunTrace } from './run-trace';
// T-293 — the progress rail, driven by plan step states and never by a timer
export { ProgressRail } from './progress-rail';
// T-294 — the completion footer: the orchestration mode in words, always
// visible, plus the plan, the per-step cost and the citation manifest
export { CompletionFooter, formatStepCost } from './completion-footer';
// T-370 — the "what the agent did" receipt, designed once and reused by every
// administrative agent (ADR-0027's S10 amendment). No caller yet: nothing
// adopts the direct-execution lane until this substrate exists.
export { AgentReceipt } from './agent-receipt';
export { GapMarkerLine, Markdown } from './markdown';
export { CitedProse } from './cited-prose';
// T-460 — the register: one table grammar for every list of documents
export { Register } from './register';
export type { RegisterColumn, RegisterFilterChip, RegisterProps, RegisterSort } from './register';
// T-455 — the lifecycle vocabulary: one label table for where a document is
export { LIFECYCLE_LABELS, LifecycleBadge, lifecycleBadge } from './lifecycle';
export type { LifecyclePosition } from './lifecycle';
export { ChatBubble, ChatComposer } from './chat-composer';
export type { ChatComposerHandle } from './chat-composer';
export { PageIntro } from './page-intro';
export { ToastProvider, useToast } from './toast';
export type { ToastInput } from './toast';
