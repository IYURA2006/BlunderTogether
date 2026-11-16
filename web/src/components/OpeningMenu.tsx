import { menuOpenings } from "../openings/openings";
import type { Opening } from "../openings/list";

interface Props {
  onLoad(opening: Opening): void;
}

// The value never changes from "", so after each choice the menu shows its
// label again and the same opening can be picked twice.
export function OpeningMenu({ onLoad }: Props) {
  function choose(name: string): void {
    const opening = menuOpenings.find((candidate) => candidate.name === name);
    if (opening) onLoad(opening);
  }

  return (
    <select
      className="btn menu"
      aria-label="Load an opening"
      value=""
      onChange={(event) => choose(event.target.value)}
    >
      <option value="" disabled>
        Load an opening
      </option>
      {menuOpenings.map((opening) => (
        <option key={opening.name} value={opening.name}>
          {opening.name}
        </option>
      ))}
    </select>
  );
}
