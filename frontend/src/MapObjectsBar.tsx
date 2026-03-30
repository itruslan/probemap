import {
  FaBox,
  FaExpand,
  FaLock,
  FaMagnifyingGlassMinus,
  FaMagnifyingGlassPlus,
  FaObjectGroup,
  FaUnlock,
} from "react-icons/fa6";
import { useI18n } from "./i18n";

type Props = {
  onAddArea: () => void;
  onAddCustom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  /** Как у стандартных Controls: переключение «замка» — перетаскивание, связи, выделение */
  canvasInteractive: boolean;
  onToggleCanvasInteraction: () => void;
  readOnly?: boolean;
};

export function MapObjectsBar({
  onAddArea,
  onAddCustom,
  onZoomIn,
  onZoomOut,
  onFitView,
  canvasInteractive,
  onToggleCanvasInteraction,
  readOnly,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="map-objects-floating">
      <div className="map-objects-stack">
        <section className="map-objects-toolbar__panel" aria-label={t("mapObjectsTitle")}>
          <div className="map-objects-toolbar__inner" role="toolbar" aria-orientation="vertical">
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={readOnly}
              onClick={onAddArea}
              title={`${t("mapObjectsTitle")}: ${t("contextAddArea")}`}
              aria-label={t("contextAddArea")}
            >
              <FaObjectGroup className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={readOnly}
              onClick={onAddCustom}
              title={`${t("mapObjectsTitle")}: ${t("contextAddNode")}`}
              aria-label={t("contextAddNode")}
            >
              <FaBox className="map-objects-toolbar__icon" aria-hidden />
            </button>
          </div>
        </section>

        <section className="map-objects-toolbar__panel" aria-label={t("mapCanvasActions")}>
          <div className="map-objects-toolbar__inner" role="toolbar" aria-orientation="vertical">
            <button
              type="button"
              className="map-objects-toolbar__btn"
              onClick={onZoomIn}
              title={t("mapZoomIn")}
              aria-label={t("mapZoomIn")}
            >
              <FaMagnifyingGlassPlus className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              onClick={onZoomOut}
              title={t("mapZoomOut")}
              aria-label={t("mapZoomOut")}
            >
              <FaMagnifyingGlassMinus className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              onClick={onFitView}
              title={t("mapFitView")}
              aria-label={t("mapFitView")}
            >
              <FaExpand className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={readOnly}
              onClick={onToggleCanvasInteraction}
              title={canvasInteractive ? t("mapLockInteraction") : t("mapUnlockInteraction")}
              aria-label={canvasInteractive ? t("mapLockInteraction") : t("mapUnlockInteraction")}
            >
              {canvasInteractive ? (
                <FaUnlock className="map-objects-toolbar__icon" aria-hidden />
              ) : (
                <FaLock className="map-objects-toolbar__icon" aria-hidden />
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
