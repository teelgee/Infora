// @infora/ui — shared React kit + design tokens (T-049). Components emit the
// mockups' class vocabulary; apps import './styles.css' once for the chrome.
export { badgeTone, color, font, radius } from './tokens';
export type { BadgeTone } from './tokens';
export {
  Badge,
  Button,
  Card,
  Chip,
  CitationChip,
  CommandBar,
  MadeCard,
  OutChip,
  SectionLabel,
  WithheldNotice,
} from './primitives';
export { ProjectSwitcher, Rail, RailNav, RailSpacer, UserChip, WorkspaceZone } from './rail';
export type { RailNavItem } from './rail';
export { NumBadge, SuggestionCard } from './suggestion-card';
export { RunTrace } from './run-trace';
export { Markdown } from './markdown';
