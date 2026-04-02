import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaChevronDown, FaPen } from "react-icons/fa6";
import type { Project } from "./api";
import { useI18n } from "./i18n";

type Props = {
  projects: Project[];
  activeProject: Project | null;
  onChange: (project: Project) => void;
  /** Настройки выбранного в списке проекта (карандаш в строке) */
  onConfigureProject?: (project: Project) => void;
  /** Создать проект — внизу выпадающего списка */
  onCreateProject?: () => void;
};

export function ProjectSelect({ projects, activeProject, onChange, onConfigureProject, onCreateProject }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 220 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 260);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({ top: r.bottom + 6, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const opts = { capture: true };
    document.addEventListener("pointerdown", onDown, opts);
    document.addEventListener("mousedown", onDown, opts);
    return () => {
      document.removeEventListener("pointerdown", onDown, opts);
      document.removeEventListener("mousedown", onDown, opts);
    };
  }, [open]);

  const label = activeProject?.name ?? "";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t("projectSelect")}
        onClick={() => setOpen((o) => !o)}
        className="probemap-project-select-trigger"
      >
        <span className="probemap-project-select-trigger__label">
          {label}
        </span>
        <FaChevronDown
          aria-hidden
          style={{
            flexShrink: 0,
            width: 14,
            height: 14,
            opacity: 0.55,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={t("projectSelect")}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 5000,
              maxHeight: "min(320px, calc(100vh - 24px))",
              overflowY: "auto",
              padding: "6px 0",
              borderRadius: 8,
              border: "1.5px solid var(--probemap-border)",
              background: "var(--probemap-modal-bg)",
              boxShadow: "0 10px 40px rgba(15, 23, 42, 0.12)",
              boxSizing: "border-box",
            }}
          >
            {projects.map((p) => {
              const selected = activeProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={selected}
                  className={
                    selected
                      ? "probemap-project-menu__row probemap-project-menu__row--selected"
                      : "probemap-project-menu__row"
                  }
                >
                  <button
                    type="button"
                    className={
                      selected
                        ? "probemap-project-menu__name-btn probemap-project-menu__name-btn--selected"
                        : "probemap-project-menu__name-btn"
                    }
                    onClick={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                  {onConfigureProject && (
                    <button
                      type="button"
                      className="probemap-project-menu__configure"
                      title={t("projectConfigure")}
                      aria-label={`${t("projectConfigure")}: ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigureProject(p);
                        setOpen(false);
                      }}
                    >
                      <FaPen style={{ width: 14, height: 14 }} aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}
            {onCreateProject && (
              <>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  style={{
                    height: 1,
                    margin: "4px 0",
                    background: "var(--probemap-border)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onCreateProject();
                    setOpen(false);
                  }}
                  className="probemap-btn probemap-btn--slate probemap-btn--lg probemap-btn--block"
                  style={{
                    width: "calc(100% - 12px)",
                    margin: "0 6px 6px",
                    boxSizing: "border-box",
                    minHeight: 44,
                    textAlign: "center",
                  }}
                >
                  {t("projectAdd")}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
