/** Интервал автообновления данных мониторинга на канвасе (сек), шаг 30. */
export const POLL_INTERVAL_OPTIONS_SEC = [30, 60, 90, 120] as const;

export const POLL_INTERVAL_STORAGE_KEY = "probemap_poll_interval_sec";

export function readPollIntervalSec(): (typeof POLL_INTERVAL_OPTIONS_SEC)[number] {
  const raw = localStorage.getItem(POLL_INTERVAL_STORAGE_KEY);
  const n = Number.parseInt(raw ?? "", 10);
  if (POLL_INTERVAL_OPTIONS_SEC.includes(n as (typeof POLL_INTERVAL_OPTIONS_SEC)[number])) {
    return n as (typeof POLL_INTERVAL_OPTIONS_SEC)[number];
  }
  return 30;
}
