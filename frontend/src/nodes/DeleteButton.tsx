import { useI18n } from "../i18n";
import { TrashIcon } from "../TrashIcon";

export function DeleteButton({ nodeId, label }: { nodeId: string; label: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="probemap-btn probemap-btn--map-delete probemap-btn--map-delete--md"
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        width: 26,
        height: 26,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
      aria-label={t("delete")}
      title={t("delete")}
      onClick={(e) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent("delete-node-request", { detail: { id: nodeId, label } }));
      }}
    >
      <TrashIcon variantOnRed size={10} />
    </button>
  );
}
