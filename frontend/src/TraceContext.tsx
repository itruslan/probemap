import { createContext, useContext } from "react";

type TraceContextValue = {
  tracedNodeId: string | null;
  toggleTrace: (id: string) => void;
};

export const TraceContext = createContext<TraceContextValue>({
  tracedNodeId: null,
  toggleTrace: () => {},
});

export function useTrace() {
  return useContext(TraceContext);
}
