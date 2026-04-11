import { createContext, useContext } from "react";

export interface ContainerDropState {
  containerId: string;
  insertIndex: number;
  nodeLabel: string;
  /** true when re-ordering an existing member (drag within the container) */
  reorderMode?: boolean;
}

export const ContainerDropContext = createContext<ContainerDropState | null>(null);

export function useContainerDrop(): ContainerDropState | null {
  return useContext(ContainerDropContext);
}
