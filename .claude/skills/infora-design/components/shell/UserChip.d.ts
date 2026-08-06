/** The signed-in user; opens personal settings. */
export interface UserChipProps {
  initials: string;
  name: string;
  onClick?: () => void;
}
export function UserChip(props: UserChipProps): JSX.Element;
