import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaObjectGroup, FaBox } from "react-icons/fa6";
import type { Service } from "./api";
import { useI18n } from "./i18n";

export interface CatalogItem {
  kind: string;
  label: string;
  icon: string;
}

interface Props {
  x: number;
  y: number;
  services: Service[];
  onAddArea: () => void;
  onAddObject: () => void;
  onAddNoMetricsService: () => void;
  onAddService: (svc: Service) => void;
  onClose: () => void;
}

const MENU_W = 188;
const SUB_W = 200;

export function ContextMenu({ x, y, services, onAddArea, onAddObject, onAddNoMetricsService, onAddService, onClose }: Props) {
  const { t } = useI18n();
  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subY, setSubY] = useState(0);
  const [showSub, setShowSub] = useState(false);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      const inMain = mainRef.current?.contains(e.target as Node);
      const inSub = subRef.current?.contains(e.target as Node);
      if (!inMain && !inSub) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouse, true);
    document.addEventListener("contextmenu", onMouse, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouse, true);
      document.removeEventListener("contextmenu", onMouse, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - 100);
  const subLeft = Math.min(left + MENU_W, window.innerWidth - SUB_W - 8);

  return createPortal(
    <>
      <div
        ref={mainRef}
        style={{
          position: "fixed", top, left,
          zIndex: 1000,
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,.12)",
          width: MENU_W,
          padding: "4px 0",
          fontSize: 13,
          color: "#0f172a",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Row
          icon={<FaObjectGroup size={13} />}
          label={t("contextAddArea")}
          onClick={() => { onAddArea(); onClose(); }}
          onMouseEnter={() => setShowSub(false)}
        />
        <Row
          icon={<FaBox size={13} />}
          label={t("contextAddNode")}
          arrow
          active={showSub}
          onClick={() => { onAddObject(); onClose(); }}
          onMouseEnter={(e) => { setSubY(e.currentTarget.getBoundingClientRect().top); setShowSub(true); }}
        />
      </div>

      {showSub && (
        <div
          ref={subRef}
          style={{
            position: "fixed",
            top: Math.min(subY, window.innerHeight - 300),
            left: subLeft,
            zIndex: 1001,
            background: "#fff",
            border: "1.5px solid #e2e8f0",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,.12)",
            width: SUB_W,
            padding: "4px 0",
            fontSize: 13,
            color: "#0f172a",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {services.length > 0 && (
            <>
              {services.map((svc) => (
                <Row
                  key={svc.id}
                  label={svc.name}
                  onClick={() => { onAddService(svc); onClose(); }}
                />
              ))}
              <div style={{ height: 1, background: "#e2e8f0", margin: "6px 10px" }} />
            </>
          )}
          {services.length === 0 && (
            <div style={{ padding: "8px 14px 6px", color: "#94a3b8", fontSize: 12, lineHeight: 1.35 }}>
              {t("contextAllOnCanvas")}
            </div>
          )}
          <Row
            label={t("contextWithoutMetrics")}
            hint={t("contextCustomHint")}
            onClick={() => { onAddNoMetricsService(); onClose(); }}
          />
        </div>
      )}
    </>,
    document.body
  );
}

function Row({
  icon, label, hint, arrow, active, onMouseEnter, onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  arrow?: boolean;
  active?: boolean;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: hint ? "7px 14px" : "6px 14px",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        background: active ? "#f1f5f9" : "",
        justifyContent: "space-between",
      }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = ""; }}
      onMouseOver={(e) => { if (onClick || arrow) e.currentTarget.style.background = "#f1f5f9"; }}
      onMouseOut={(e) => { if (!active) e.currentTarget.style.background = ""; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0, flex: 1 }}>
        {icon != null && (
          <span style={{ color: "#64748b", display: "flex", flexShrink: 0, marginTop: hint ? 2 : 0 }}>{icon}</span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ color: "#0f172a", lineHeight: 1.25 }}>{label}</span>
          {hint && (
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, lineHeight: 1.2 }}>{hint}</span>
          )}
        </div>
      </div>
      {arrow && <span style={{ color: "#94a3b8", fontSize: 11, flexShrink: 0, alignSelf: "center" }}>›</span>}
    </div>
  );
}
