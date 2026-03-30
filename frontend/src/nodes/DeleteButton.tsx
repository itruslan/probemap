import { useReactFlow } from "@xyflow/react";
import { TrashIcon } from "../TrashIcon";

export function DeleteButton({ nodeId }: { nodeId: string }) {
  const { deleteElements } = useReactFlow();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        deleteElements({ nodes: [{ id: nodeId }] });
      }}
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "none",
        background: "#ef4444",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,.3)",
      }}
    >
      <TrashIcon variantOnRed size={9} />
    </button>
  );
}
