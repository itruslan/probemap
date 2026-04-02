import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaGlobe, FaObjectGroup } from "react-icons/fa6";
import { LuPlus } from "react-icons/lu";
import type { Service } from "./api";
import { useI18n, type Lang } from "./i18n";
import { NODE_KINDS, KIND_GROUPS, type NodeKindDef } from "./nodeKinds";

interface Props {
  x: number;
  y: number;
  services: Service[];
  onAddArea: () => void;
  onAddService: (svc: Service) => void;
  onAddComponent: (kindDef: NodeKindDef) => void;
  onClose: () => void;
}

const MENU_W = 188;
const SUB_W = 200;

const KIND_GROUP_I18N: Record<string, string> = {
  actor: "kindGroupActor",
  network: "kindGroupNetwork",
  entry: "kindGroupEntry",
  cluster: "kindGroupCluster",
  service: "kindGroupService",
  managed: "kindGroupManaged",
  other: "kindGroupOther",
};

export function ContextMenu({ x, y, services, onAddArea, onAddService, onAddComponent, onClose }: Props) {
  const { t, lang } = useI18n();
  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);
  const [subY, setSubY] = useState(0);
  const [showSub, setShowSub] = useState<"service" | "component" | false>(false);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      const inMain = mainRef.current?.contains(e.target as Node);
      const inSub = subRef.current?.contains(e.target as Node);
      const inComp = compRef.current?.contains(e.target as Node);
      if (!inMain && !inSub && !inComp) onClose();
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
        className="probemap-context-menu"
        style={{ top, left, width: MENU_W }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Row
          icon={<FaObjectGroup size={13} />}
          label={t("contextAddArea")}
          onClick={() => { onAddArea(); onClose(); }}
          onMouseEnter={() => setShowSub(false)}
        />
        <Row
          icon={<FaGlobe size={13} />}
          label={t("contextAddService")}
          arrow
          active={showSub === "service"}
          onMouseEnter={(e) => { setSubY(e.currentTarget.getBoundingClientRect().top); setShowSub("service"); }}
        />
        <Row
          icon={<LuPlus size={13} />}
          label={t("contextAddComponent")}
          arrow
          active={showSub === "component"}
          onMouseEnter={(e) => { setSubY(e.currentTarget.getBoundingClientRect().top); setShowSub("component"); }}
        />
      </div>

      {showSub === "service" && (
        <div
          ref={subRef}
          className="probemap-context-menu probemap-context-menu--sub"
          style={{
            top: Math.min(subY, window.innerHeight - 300),
            left: subLeft,
            width: SUB_W,
          }}
        >
          {services.length > 0 &&
            services.map((svc) => (
              <Row
                key={svc.id}
                label={svc.name}
                onClick={() => { onAddService(svc); onClose(); }}
              />
            ))}
          {services.length === 0 && (
            <div className="probemap-context-menu__empty">{t("contextAllServicesOnCanvas")}</div>
          )}
        </div>
      )}

      {showSub === "component" && (
        <div
          ref={compRef}
          className="probemap-context-menu probemap-context-menu--sub"
          style={{
            top: Math.min(subY, window.innerHeight - 400),
            left: subLeft,
            width: SUB_W,
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {KIND_GROUPS.filter((g) => g.key !== "service").map((group) => {
            const items = NODE_KINDS.filter((k) => k.group === group.key && !k.menuHidden);
            if (!items.length) return null;
            return (
              <div key={group.key}>
                <div className="probemap-context-menu__group-label">
                  {t(KIND_GROUP_I18N[group.key] as never)}
                </div>
                {items.map((kindDef) => (
                  <Row
                    key={kindDef.kind}
                    label={kindDef.label[lang as Lang]}
                    onClick={() => { onAddComponent(kindDef); onClose(); }}
                  />
                ))}
              </div>
            );
          })}
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
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
}) {
  const rowClass = [
    "probemap-context-menu__row",
    active && "probemap-context-menu__row--active",
    hint && "probemap-context-menu__row--hint",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={rowClass}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      aria-expanded={arrow ? active : undefined}
      aria-haspopup={arrow ? "menu" : undefined}
    >
      <span className="probemap-context-menu__row-inner">
        {icon != null && (
          <span
            className={`probemap-context-menu__icon${hint ? " probemap-context-menu__icon--offset" : ""}`}
          >
            {icon}
          </span>
        )}
        <span className="probemap-context-menu__label-col">
          <span className="probemap-context-menu__label-text">{label}</span>
          {hint ? <span className="probemap-context-menu__hint-text">{hint}</span> : null}
        </span>
      </span>
      {arrow ? <span className="probemap-context-menu__arrow" aria-hidden>›</span> : null}
    </button>
  );
}
