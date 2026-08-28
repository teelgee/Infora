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
  SectionLabel,
  SourceChip,
  WithheldNotice,
} from './primitives';
export type { BadgeTone } from './primitives';
export { ProjectSwitcher, Rail, RailNav, RailSpacer, UserChip, WorkspaceZone } from './rail';
export type { RailNavItem } from './rail';
export { AppFrame, CollapseToggle, Pane, PaneHeader, ResizeGrip } from './app-frame';
export { Prose } from './prose';
export { DropdownMenu, DropdownMenuItem } from './dropdown-menu';
export { Modal, Drawer } from './dialog';
export { Field, TextInput, TextArea, SelectInput, Combobox } from './form';
export { Table } from './table';
export { Skeleton } from './skeleton';
export { ProjectCard } from './project-card';
export { NumBadge, SuggestionCard } from './suggestion-card';
export { RunTrace } from './run-trace';
// T-370 — the "what the agent did" receipt, designed once and reused by every
// administrative agent (ADR-0027's S10 amendment). No caller yet: nothing
// adopts the direct-execution lane until this substrate exists.
export { AgentReceipt } from './agent-receipt';
export { Markdown } from './markdown';
export { CitedProse } from './cited-prose';
export { ChatBubble, ChatComposer } from './chat-composer';
export type { ChatComposerHandle } from './chat-composer';
