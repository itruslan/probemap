import { createPortal } from "react-dom";

export function HoverTooltip({ label, targetEl }: { label: string; targetEl: HTMLElement }) {
  const rect = targetEl.getBoundingClientRect();
  return createPortal(
    <div style={{
      position: "fixed",
      left: rect.left + rect.width / 2,
      top: rect.top - 6,
      transform: "translate(-50%, -100%)",
      background: "#1e293b", color: "#f1f5f9",
      fontSize: 11, padding: "3px 7px", borderRadius: 4,
      whiteSpace: "nowrap", pointerEvents: "none", zIndex: 9999,
      boxShadow: "0 2px 6px rgba(0,0,0,.3)",
    }}>
      {label}
    </div>,
    document.body
  );
}
