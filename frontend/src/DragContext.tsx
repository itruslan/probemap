import { createContext, useContext } from "react";

export const DragContext = createContext(false);

export function useIsDraggingOnCanvas() {
  return useContext(DragContext);
}

