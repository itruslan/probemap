import {
  FaArrowPointer,
  FaArrowsUpDownLeftRight,
  FaExpand,
  FaLock,
  FaMagnifyingGlassMinus,
  FaMagnifyingGlassPlus,
  FaRotateLeft,
  FaRotateRight,
  FaUnlock,
} from "react-icons/fa6";
import { useI18n } from "./i18n";
import type { ReactNode } from "react";

type Props = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Как у стандартных Controls: переключение «замка» — перетаскивание, связи, выделение */
  canvasInteractive: boolean;
  onToggleCanvasInteraction?: () => void;
  /** Режим выделения рамкой (вместо пана) */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  /** Метрики устарели — панель недоступна */
  readOnly?: boolean;
  /** Замок включён: нельзя добавлять объекты с панели; разблокировка по кнопке замка */
  addBlocked?: boolean;
  /** Метрики/API недоступны — отключить зум и замок (только просмотр карты из кэша) */
  freezeToolbar?: boolean;
};

export function MapObjectsBar({
  onZoomIn,
  onZoomOut,
  onFitView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  canvasInteractive,
  onToggleCanvasInteraction,
  selectMode,
  onToggleSelectMode,
  readOnly,
  freezeToolbar,
}: Props) {
  const { t } = useI18n();
  const toolbarDead = Boolean(readOnly || freezeToolbar);

  const Btn = ({
    label,
    title,
    disabled,
    active,
    onClick,
    children,
  }: {
    label: string;
    title: string;
    disabled?: boolean;
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
  }) => (
    <div className="map-objects-toolbar__btnwrap">
      <button
        type="button"
        className={`map-objects-toolbar__btn${active ? " map-objects-toolbar__btn--active" : ""}`}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
      </button>
      <div className="map-objects-toolbar__label" aria-hidden>
        {label}
      </div>
    </div>
  );

  return (
    <div className="map-objects-floating">
      <div className="map-objects-stack">
        <section className="map-objects-toolbar__panel" aria-label={t("mapCanvasActions")}>
          <div className="map-objects-toolbar__inner" role="toolbar" aria-orientation="vertical">
            {onToggleSelectMode && canvasInteractive && (
              <Btn
                label={selectMode ? t("mapPanMode") : t("mapSelectMode")}
                title={selectMode ? t("mapPanMode") : t("mapSelectMode")}
                active={selectMode}
                onClick={onToggleSelectMode}
              >
                {selectMode ? (
                  <FaArrowsUpDownLeftRight className="map-objects-toolbar__icon" aria-hidden />
                ) : (
                  <FaArrowPointer className="map-objects-toolbar__icon" aria-hidden />
                )}
              </Btn>
            )}
            <Btn
              label={t("mapUndo")}
              title={`${t("mapCanvasActions")}: ${t("mapUndo")}`}
              disabled={toolbarDead || !canUndo}
              onClick={onUndo}
            >
              <FaRotateLeft className="map-objects-toolbar__icon" aria-hidden />
            </Btn>
            <Btn
              label={t("mapRedo")}
              title={`${t("mapCanvasActions")}: ${t("mapRedo")}`}
              disabled={toolbarDead || !canRedo}
              onClick={onRedo}
            >
              <FaRotateRight className="map-objects-toolbar__icon" aria-hidden />
            </Btn>
            <Btn
              label={t("mapZoomIn")}
              title={`${t("mapCanvasActions")}: ${t("mapZoomIn")}`}
              disabled={toolbarDead}
              onClick={onZoomIn}
            >
              <FaMagnifyingGlassPlus className="map-objects-toolbar__icon" aria-hidden />
            </Btn>
            <Btn
              label={t("mapZoomOut")}
              title={`${t("mapCanvasActions")}: ${t("mapZoomOut")}`}
              disabled={toolbarDead}
              onClick={onZoomOut}
            >
              <FaMagnifyingGlassMinus className="map-objects-toolbar__icon" aria-hidden />
            </Btn>
            <Btn
              label={t("mapFitView")}
              title={`${t("mapCanvasActions")}: ${t("mapFitView")}`}
              disabled={toolbarDead}
              onClick={onFitView}
            >
              <FaExpand className="map-objects-toolbar__icon" aria-hidden />
            </Btn>
            {onToggleCanvasInteraction && (
              <Btn
                label={canvasInteractive ? t("mapUnlockInteraction") : t("mapLockInteraction")}
                title={canvasInteractive ? t("mapLockInteraction") : t("mapUnlockInteraction")}
                disabled={readOnly || freezeToolbar}
                onClick={onToggleCanvasInteraction}
              >
                {canvasInteractive ? (
                  <FaUnlock className="map-objects-toolbar__icon" aria-hidden />
                ) : (
                  <FaLock className="map-objects-toolbar__icon map-objects-toolbar__icon--lock-active" aria-hidden />
                )}
              </Btn>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

