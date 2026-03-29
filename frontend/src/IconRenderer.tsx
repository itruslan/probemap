import { resolveIcon } from "./icons";

interface Props {
  name?: string;
  size?: number;
}

export function IconRenderer({ name, size = 14 }: Props) {
  if (name?.startsWith("custom:")) {
    const id = name.slice(7);
    const BASE = import.meta.env.VITE_API_URL ?? "";
    return (
      <img
        src={`${BASE}/api/icons/${id}`}
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    );
  }
  const Icon = resolveIcon(name);
  return <Icon size={size} />;
}
