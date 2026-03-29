import { createContext, useContext } from "react";

export const CollisionContext = createContext<Set<string>>(new Set());

export const useColliding = (id: string) => useContext(CollisionContext).has(id);
