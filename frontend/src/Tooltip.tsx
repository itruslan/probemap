import { createPortal } from "react-dom";
import { FaCircleQuestion } from "react-icons/fa6";

const TOOLTIP_Z = 2147483000;
const VIEW_PAD = 10;

/** Центр подсказки (translateX(-50%)), чтобы блок не выходил за края окна */
function clampTooltipCenterX(centerX: number, maxTooltipWidthPx: number): number {
  if (typeof window === "undefined") return centerX;
  const half = maxTooltipWidthPx / 2;
  const min = VIEW_PAD + half;
  const max = window.innerWidth - VIEW_PAD - half;
  if (max <= min) return window.innerWidth / 2;
  return Math.min(Math.max(centerX, min), max);
}

type HoverTooltipProps = {
  label: string;
  targetEl: HTMLElement;
  /** Несколько строк (текст с \\n из i18n) */
  multiline?: boolean;
  /** По умолчанию над элементом; для узкой панели снизу удобнее */
  placement?: "above" | "below";
  /** С pointer-events: auto — наведение на саму подсказку (см. Palette) */
  onInteractiveEnter?: () => void;
  onInteractiveLeave?: () => void;
};

export function HoverTooltip({
  label,
  targetEl,
  multiline = false,
  placement = "above",
  onInteractiveEnter,
  onInteractiveLeave,
}: HoverTooltipProps) {
  const rect = targetEl.getBoundingClientRect();
  const below = placement === "below";
  const interactive = Boolean(multiline && (onInteractiveEnter || onInteractiveLeave));
  const maxTooltipW = multiline ? 268 : 360;
  const anchorX = clampTooltipCenterX(rect.left + rect.width / 2, maxTooltipW);
  const base = {
    position: "fixed" as const,
    left: anchorX,
    background: "var(--probemap-tooltip-bg)",
    color: "var(--probemap-tooltip-text)",
    fontSize: 11,
    padding: multiline ? "8px 10px" : "3px 7px",
    borderRadius: 6,
    pointerEvents: interactive ? ("auto" as const) : ("none" as const),
    zIndex: TOOLTIP_Z,
    boxShadow: "0 4px 16px rgba(0,0,0,.45)",
    lineHeight: 1.4,
    whiteSpace: multiline ? "pre-wrap" : "nowrap",
    maxWidth: multiline ? 268 : undefined,
    border: "1px solid rgba(255,255,255,0.12)",
  };
  const pos = below
    ? { ...base, top: rect.bottom + 6, transform: "translateX(-50%)" }
    : { ...base, top: rect.top - 6, transform: "translate(-50%, -100%)" };

  return createPortal(
    <div style={pos} onMouseEnter={onInteractiveEnter} onMouseLeave={onInteractiveLeave}>
      {label}
    </div>,
    document.body,
  );
}

/** Единая кнопка-подсказка (?), используется в Settings, ProjectModal и везде где нужен ? */
export function HelpIcon({
  aria,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  aria: string;
  onMouseEnter: (el: HTMLButtonElement) => void;
  onMouseLeave: () => void;
  onClick?: (el: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      className="probemap-help-btn"
      aria-label={aria}
      onMouseEnter={(e) => onMouseEnter(e.currentTarget)}
      onMouseLeave={onMouseLeave}
      onClick={onClick ? (e) => onClick(e.currentTarget) : undefined}
    >
      <FaCircleQuestion aria-hidden style={{ width: 11, height: 11, display: "block" }} />
    </button>
  );
}
