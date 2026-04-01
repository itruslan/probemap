import {
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
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  /** Как у стандартных Controls: переключение «замка» — перетаскивание, связи, выделение */
  canvasInteractive: boolean;
  onToggleCanvasInteraction: () => void;
  /** Метрики устарели — панель недоступна */
  readOnly?: boolean;
  /** Замок включён: нельзя добавлять объекты с панели; разблокировка по кнопке замка */
  addBlocked?: boolean;
  /** Метрики/API недоступны — отключить зум и замок (только просмотр карты из кэша) */
  freezeToolbar?: boolean;
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
  addBlocked,
  freezeToolbar,
}: Props) {
  const { t } = useI18n();
  const cannotAdd = Boolean(readOnly || addBlocked);
  const toolbarDead = Boolean(readOnly || freezeToolbar);

  return (
    <div className="map-objects-floating">
      <div className="map-objects-stack">
        <section className="map-objects-toolbar__panel" aria-label={t("mapObjectsTitle")}>
          <div className="map-objects-toolbar__inner" role="toolbar" aria-orientation="vertical">
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={cannotAdd}
              onClick={onAddArea}
              title={`${t("mapObjectsTitle")}: ${t("contextAddArea")}`}
              aria-label={t("contextAddArea")}
            >
              <FaObjectGroup className="map-objects-toolbar__icon" aria-hidden />
            </button>
          </div>
        </section>

        <section className="map-objects-toolbar__panel" aria-label={t("mapCanvasActions")}>
          <div className="map-objects-toolbar__inner" role="toolbar" aria-orientation="vertical">
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={toolbarDead}
              onClick={onZoomIn}
              title={`${t("mapCanvasActions")}: ${t("mapZoomIn")}`}
              aria-label={t("mapZoomIn")}
            >
              <FaMagnifyingGlassPlus className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={toolbarDead}
              onClick={onZoomOut}
              title={`${t("mapCanvasActions")}: ${t("mapZoomOut")}`}
              aria-label={t("mapZoomOut")}
            >
              <FaMagnifyingGlassMinus className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={toolbarDead}
              onClick={onFitView}
              title={`${t("mapCanvasActions")}: ${t("mapFitView")}`}
              aria-label={t("mapFitView")}
            >
              <FaExpand className="map-objects-toolbar__icon" aria-hidden />
            </button>
            <button
              type="button"
              className="map-objects-toolbar__btn"
              disabled={readOnly || freezeToolbar}
              onClick={onToggleCanvasInteraction}
              title={canvasInteractive ? t("mapLockInteraction") : t("mapUnlockInteraction")}
              aria-label={canvasInteractive ? t("mapLockInteraction") : t("mapUnlockInteraction")}
            >
              {canvasInteractive ? (
                <FaUnlock className="map-objects-toolbar__icon" aria-hidden />
              ) : (
                <FaLock className="map-objects-toolbar__icon map-objects-toolbar__icon--lock-active" aria-hidden />
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
