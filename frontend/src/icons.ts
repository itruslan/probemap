import {
  FaBell,
  FaBolt,
  FaBuilding,
  FaChartLine,
  FaCloud,
  FaCode,
  FaCubes,
  FaDatabase,
  FaDisplay,
  FaFire,
  FaGears,
  FaGlobe,
  FaHardDrive,
  FaInbox,
  FaKey,
  FaLaptop,
  FaLayerGroup,
  FaLocationDot,
  FaLock,
  FaMicrochip,
  FaMobileScreen,
  FaNetworkWired,
  FaPlug,
  FaRocket,
  FaRoute,
  FaSatelliteDish,
  FaScaleBalanced,
  FaServer,
  FaShieldHalved,
  FaSitemap,
  FaTerminal,
  FaTowerBroadcast,
  FaUser,
  FaWifi,
  FaWrench,
} from "react-icons/fa6";
import type { IconType } from "react-icons";

export type { IconType };

/** Internet — иконка по умолчанию для сервисов и запасной вариант в IconRenderer */
export const DEFAULT_SERVICE_ICON_NAME = "FaGlobe";

/** Три куба (изометрия) — иконка области / группы по умолчанию */
export const DEFAULT_GROUP_ICON_NAME = "FaCubes";

export const FALLBACK_ICON: IconType = FaGlobe;

const ICON_MAP: Record<string, IconType> = {
  FaBell, FaBolt, FaBuilding, FaChartLine, FaCloud, FaCode, FaCubes,
  FaDatabase, FaDisplay, FaFire, FaGears, FaGlobe, FaHardDrive, FaInbox,
  FaKey, FaLaptop, FaLayerGroup, FaLocationDot, FaLock, FaMicrochip,
  FaMobileScreen, FaNetworkWired, FaPlug, FaRocket, FaRoute, FaSatelliteDish,
  FaScaleBalanced, FaServer, FaShieldHalved, FaSitemap, FaTerminal,
  FaTowerBroadcast, FaUser, FaWifi, FaWrench,
};

export function resolveIcon(name?: string): IconType {
  if (!name) return FALLBACK_ICON;
  return ICON_MAP[name] ?? FALLBACK_ICON;
}

export interface IconEntry { label: string; icon: string; }

/** Встроенные пресеты для карточки сервиса (тип `service`): только Internet; прочее — custom-загрузки. */
export const SERVICE_BUILTIN_ICONS: IconEntry[] = [{ label: "Internet", icon: "FaGlobe" }];

export const ALL_ICONS: IconEntry[] = [
  // Infrastructure
  { label: "Server",      icon: "FaServer"          },
  { label: "Hypervisor",  icon: "FaCubes"            },
  { label: "Cloud",       icon: "FaCloud"            },
  { label: "Network",     icon: "FaNetworkWired"     },
  { label: "DMZ",         icon: "FaShieldHalved"     },
  { label: "K8s",         icon: "FaLayerGroup"       },
  { label: "Location",    icon: "FaLocationDot"      },
  { label: "Building",    icon: "FaBuilding"         },
  { label: "Internet",    icon: "FaGlobe"            },
  { label: "Firewall",    icon: "FaFire"             },
  { label: "Wi-Fi",       icon: "FaWifi"             },
  { label: "Broadcast",   icon: "FaTowerBroadcast"   },
  { label: "Satellite",   icon: "FaSatelliteDish"    },
  { label: "CPU",         icon: "FaMicrochip"        },
  { label: "Storage",     icon: "FaHardDrive"        },
  // Services / Objects
  { label: "User",        icon: "FaUser"             },
  { label: "Database",    icon: "FaDatabase"         },
  { label: "Cache",       icon: "FaBolt"             },
  { label: "ALB",         icon: "FaScaleBalanced"    },
  { label: "NLB",         icon: "FaSitemap"          },
  { label: "Queue",       icon: "FaInbox"            },
  { label: "Frontend",    icon: "FaDisplay"          },
  { label: "Backend",     icon: "FaGears"            },
  { label: "Router",      icon: "FaRoute"            },
  { label: "Laptop",      icon: "FaLaptop"           },
  { label: "Mobile",      icon: "FaMobileScreen"     },
  { label: "Terminal",    icon: "FaTerminal"         },
  { label: "Code",        icon: "FaCode"             },
  { label: "Auth",        icon: "FaKey"              },
  { label: "Security",    icon: "FaLock"             },
  { label: "Deploy",      icon: "FaRocket"           },
  { label: "Alerts",      icon: "FaBell"             },
  { label: "Metrics",     icon: "FaChartLine"        },
  { label: "Tools",       icon: "FaWrench"           },
  { label: "Connector",   icon: "FaPlug"             },
];
