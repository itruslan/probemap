import { FaTrash } from "react-icons/fa6";

/** Цвет корзины на светлом фоне (как в модалке проекта, но красный). */
export const TRASH_COLOR = "#ef4444";

type Props = {
  size?: number;
  /** белая корзина на красной кнопке */
  variantOnRed?: boolean;
  /** неактивное состояние (серый) */
  muted?: boolean;
};

/** Единый значок корзины (react-icons/fa6) по всему приложению */
export function TrashIcon({ size = 16, variantOnRed, muted }: Props) {
  const color = muted ? "var(--probemap-border-strong)" : variantOnRed ? "var(--probemap-on-accent)" : TRASH_COLOR;
  return (
    <FaTrash
      aria-hidden
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        display: "block",
        color,
        flexShrink: 0,
      }}
    />
  );
}
