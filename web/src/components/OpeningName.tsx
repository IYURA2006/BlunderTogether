interface Props {
  name: string | null;
}

export function OpeningName({ name }: Props) {
  if (name === null) return null;
  return <p className="opening-name">{name}</p>;
}
