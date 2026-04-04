import { createContext, useContext } from "react";

type TraceContextValue = {
  tracedNodeId: string | null;
  toggleTrace: (id: string) => void;
  /** false when viewer mode (no admin token) or metrics stale */
  canEdit: boolean;
};

export const TraceContext = createContext<TraceContextValue>({
  tracedNodeId: null,
  toggleTrace: () => {},
  canEdit: true,
});

export function useTrace() {
  return useContext(TraceContext);
}
