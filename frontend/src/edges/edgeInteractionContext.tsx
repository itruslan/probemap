import { createContext, useContext } from "react";

export interface EdgeInteractionValue {
  openEditor: (edgeId: string) => void;
  /** Ложь при заморозке метрик или заблокированном канвасе — только просмотр подсказки. */
  editable: boolean;
}

const defaultValue: EdgeInteractionValue = {
  openEditor: () => {},
  editable: false,
};

export const EdgeInteractionContext = createContext<EdgeInteractionValue>(defaultValue);

export function useEdgeInteraction() {
  return useContext(EdgeInteractionContext);
}
