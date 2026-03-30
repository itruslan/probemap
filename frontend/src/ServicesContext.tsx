import { createContext, useContext } from "react";
import type { Service } from "./api";

export interface ServicesContextValue {
  services: Service[];
  probe_sources: string[];
}

export const ServicesContext = createContext<ServicesContextValue>({
  services: [],
  probe_sources: [],
});

export const useServices = () => useContext(ServicesContext).services;
export const useProbeSources = () => useContext(ServicesContext).probe_sources;

