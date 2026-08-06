/**
 * The workspace/project switcher. Its menu is a `DropdownMenu` at overlay
 * elevation — make sure the open menu is not clipped by the rail.
 */
export interface ProjectSwitcherProps {
  name: string;
  /** Two-letter organisation initials. */
  initials: string;
  onClick?: () => void;
}
export function ProjectSwitcher(props: ProjectSwitcherProps): JSX.Element;
