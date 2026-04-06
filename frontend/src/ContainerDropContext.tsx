import { createContext, useContext } from "react";

export interface ContainerDropState {
  containerId: string;
  insertIndex: number;
  nodeLabel: string;
}

export const ContainerDropContext = createContext<ContainerDropState | null>(null);

export function useContainerDrop(): ContainerDropState | null {
  return useContext(ContainerDropContext);
}
