import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "ru" | "en";

const STORAGE_KEY = "probemap_lang";

/** Все ключи должны быть в ru и en. */
const STRINGS = {
  ru: {
    probemap: "probemap",
    settings: "Настройки",
    projectAdd: "Создать проект",
    settingsOpen: "Открыть настройки",
    themeLight: "Светлая тема",
    themeDark: "Тёмная тема",
    themeToggleAria: "Переключить светлую или тёмную тему",
    mapUnavailableTitle: "Карта пока недоступна",
    mapUnavailableBody:
      "Укажите источник метрик (VictoriaMetrics), нажмите «Проверить» в настройках и сохраните.\nЗатем создайте проект при необходимости.",

    servicesTitle: "Сервисы",
    servicesPaletteHelpAria: "Справка по панели сервисов",
    searchPlaceholder: "Поиск…",
    nothingFound: "Ничего не найдено",
    paletteAdd: "Добавить",
    onboardingTitle: "Создайте проект",
    onboardingBody:
      "У каждого проекта свой холст и своя раскладка. Задайте фильтры по лейблам — в палитре останутся только подходящие сервисы, затем добавляйте их на карту через «Добавить», ПКМ по карте или плавающую панель.",
    monitoringHint:
      "Слева — сервисы из мониторинга. Добавьте на карту кнопкой «Добавить».\nПКМ по пустому месту карты — область и сервис.\nПлавающая панель на карте — инструменты и масштаб.",

    mapObjectsTitle: "Панель инструментов",
    mapCanvasActions: "Действия",
    mapZoomIn: "Увеличить",
    mapZoomOut: "Уменьшить",
    mapFitView: "Показать всё на экране",
    mapLockInteraction: "Заблокировать перетаскивание, связи и выделение",
    mapUnlockInteraction: "Снова разрешить перетаскивание, связи и выделение",

    contextAddArea: "Добавить область",
    contextAddService: "Добавить сервис",
    contextAllServicesOnCanvas: "Все сервисы из мониторинга уже на карте",

    monitoringTitle: "МОНИТОРИНГ",
    monitoringSummary: "Пробы: {ok}/{total}",
    monitoringSourcesCoverage: "Blackbox: {present}/{expected}",
    descriptionTitle: "ОПИСАНИЕ",
    actionsTitle: "ДЕЙСТВИЯ",
    labelsTitle: "МЕТКИ",
    noData: "Нет данных",

    datasourceStatusOk: "Датасорс отвечает (VictoriaMetrics / Prometheus)",
    datasourceStatusBad: "Датасорс не отвечает или недоступен",
    datasourceStatusUnknown: "URL источника не сохранён — откройте настройки",
    ok: "OK",
    uiOk: "ОК",
    fail: "Сбой",

    refresh: "Обновить",
    refreshPendingAria: "Идёт обновление данных",
    pollDataInterval: "Авто",
    pollIntervalSecondsSuffix: " с",
    save: "Сохранить",
    saved: "Сохранено",
    loading: "Загрузка…",

    apiErrorHttp: "Не удалось загрузить данные (HTTP {status}).",
    apiErrorNetwork: "Нет связи с сервером. Проверьте сеть и что бэкенд запущен.",
    apiErrorDatasourceUnavailable:
      "Источник метрик (VictoriaMetrics / Prometheus) недоступен, не отвечает или вернул ошибку. Проверьте URL в настройках, сеть и что VM/Prometheus запущены.",
    metricsStaleOverlay:
      "Живые метрики недоступны. Показано последнее удачное состояние; правка карты отключена до восстановления связи.",
    apiLoadErrorHint: "Карта временно недоступна. Используйте «Повторить» в панели уведомления выше.",
    apiLoadRetry: "Повторить",
    apiLoadDismiss: "Скрыть",

    deleteProjectConfirm: "Удалить проект «{name}»?",
    projectConfigure: "Настроить проект",
    projectSelect: "Выбрать проект",
    projectDelete: "Удалить проект",

    projectTitle: "Проект",
    projectTitleNew: "Новый проект",

    cancel: "Отмена",
    delete: "Удалить",
    emDash: "—",

    /** Настройки — секции и тексты */
    settingsDatasourceIntro:
      "Prometheus-совместимый API (VictoriaMetrics). Без URL карта и списки лейблов работать не будут — это нормально до первой настройки.",
    settingsName: "Название",
    settingsUrlApi: "URL API",
    settingsUrlPlaceholder: "https://victoria-metrics.example:8428",

    settingsSectionDatasource: "ИСТОЧНИК МЕТРИК",
    settingsSectionJobs: "ТАРГЕТЫ BLACKBOX (ЛЕЙБЛ JOB)",
    settingsJobsA: "Из метрик ",
    settingsJobsB: " берутся значения стандартного лейбла ",
    settingsJobsC:
      " (как в Prometheus: имя scrape job). Отметьте, какие job учитывать при сборе списка сервисов в палитре.",
    settingsJobsEmpty: "Сначала укажите URL и нажмите «Проверить», чтобы подтянуть список job.",
    settingsJobSources: "источники:",

    settingsSectionFilter: "ОБЩИЙ ФИЛЬТР (КОНСТРУКТОР)",
    settingsFilterIntro:
      "Условия добавляются к селектору вместе с выбранными job и (для проекта) с его лейблами. Несколько строк — логическое И в PromQL.",
    settingsPresetEnvProd: "+ environment=prod",
    settingsPresetEnvStaging: "+ environment≠staging",
    settingsPresetTeam: "+ team =~ platform.*",
    settingsFilterClear: "Очистить правила",
    settingsFilterNoRules:
      "Правил пока нет — метрики фильтруются только по job (и по проекту, если задан).",
    settingsFilterAddRule: "+ Добавить условие",
    settingsFilterLabelOption: "лейбл",
    settingsFilterValuePlaceholder: "prod или .*",
    settingsSelectorPreviewTitle: "ПРЕВЬЮ СЕЛЕКТОРА",
    settingsSelectorPreviewHint:
      "Именно такой фрагмент подставляется в запросы к probe_success (как на сервере). Для проекта к нему добавятся лейблы фильтра проекта.",
    settingsSectionRawPromql: "ДОПОЛНИТЕЛЬНО (СЫРОЙ PROMQL)",
    settingsRawPromqlIntro:
      "Необязательно. Вставляется в конец селектора через запятую после правил конструктора. Для сложных выражений, если конструктора не хватает.",
    settingsRawPromqlPlaceholder: 'например: cluster="eu-1"',
    settingsSectionLabelMap: "КАК ЧИТАТЬ ЛЕЙБЛЫ МЕТРИК",
    settingsLabelMapIntro:
      "После «Проверить» можно выбрать реальные имена лейблов из VictoriaMetrics. Они должны совпадать с тем, что отдаёт ваш blackbox / scrape.",
    settingsLabelNotSet: "— не задано —",
    settingsClose: "Закрыть",

    labelMapServiceTitle: "Имя сервиса на карте (лейбл в метриках)",
    labelMapServiceHint:
      "Лейбл метрики, по которому группируются таргеты в одну карточку сервиса (часто service или instance).",
    labelMapPortTitle: "Порт / endpoint",
    labelMapPortHint: "Лейбл с номером порта или идентификатором проверяемого endpoint.",
    labelMapProbeSourceTitle: "Источник пробы (инстанс blackbox)",
    labelMapProbeSourceHint:
      "Лейбл в метриках, по которому различаются отдельные blackbox/экспортёры. Часто instance (адрес:порт процесса blackbox). Можно указать pod, hostname и т.д.",
    labelMapModuleTitle: "Модуль blackbox",
    labelMapModuleHint:
      "Лейбл с именем модуля пробы (http_2xx, icmp и т.д.) — по нему определяется тип http/icmp/tcp.",
    labelMapUrlTitle: "URL (необязательно)",
    labelMapUrlHint: "Если нужен отдельный лейбл с адресом цели; можно оставить пустым.",

    opEq: "= равно",
    opRe: "=~ regex",
    opNe: "!= не",
    opNre: "!~ не regex",

    testChecking: "Проверка…",
    testCheck: "Проверить",
    testOk: "✓ OK",
    testFail: "✗ Нет связи",

    placeholderEnvironment: "environment",

    /** Проект */
    projectIntro:
      "Один тип сервисов на карте. Условия по лейблам из VictoriaMetrics (как в PromQL): все выбранные пары должны совпасть. Лейблы подгружаются после настройки источника данных.",
    projectNameLabel: "Название проекта",
    projectNamePlaceholder: "Например: Production",
    projectFilterSection: "Фильтр по лейблам метрик",
    projectFilterHint:
      "Пусто — показать все сервисы из выбранных job. Несколько строк — пересечение условий (AND).",
    projectOptionLabel: "— лейбл —",
    projectOptionValue: "— значение —",
    projectPlaceholderProd: "prod",
    projectPlaceholderFirstLabel: "сначала лейбл",
    projectRemoveCondition: "Удалить условие",
    projectAddCondition: "+ Условие (ещё лейбл)",

    defaultGroupLabel: "Область",
    defaultServiceLabel: "Сервис",

    deleteConfirmLead: "Введите",
    deleteConfirmTail: "для подтверждения:",
    copyName: "Копировать название",
    nameCopied: "Скопировано",
    deleteFromMapPlaceholder: "подтверждение",

    iconSectionBuiltin: "ИКОНКИ",
    iconSectionCustom: "МОИ ИКОНКИ",
    iconNamePlaceholder: "Название *",
    iconNameRequiredError: "Введите название",
    iconUpload: "+ Загрузить иконку",

    iconChange: "Сменить иконку",
    iconAdd: "Добавить иконку",
    layerBack: "На слой назад",
    layerForward: "На слой вперёд",
    layerOrder: "Слой {n}/{total}",
    layerBackShort: "back",
    layerForwardShort: "front",

    descriptionPlaceholder: "Описание...",
    descriptionSaveHintBefore: "Нажмите ",
    descriptionSaveHintAfter: " для сохранения",
    descriptionClickToAdd: "Нажмите, чтобы добавить описание...",
    actionNamePlaceholder: "Название",
    actionUrlPlaceholder: "https://...",
    actionOpenTo: "Перейти к {label}",
    removeFromCanvas: "Удалить с карты",
    changeIconTitle: "Сменить иконку",

    ellipsis: "…",
  },
  en: {
    probemap: "probemap",
    settings: "Settings",
    projectAdd: "Create project",
    settingsOpen: "Open settings",
    themeLight: "Light theme",
    themeDark: "Dark theme",
    themeToggleAria: "Switch light or dark theme",
    mapUnavailableTitle: "Map is unavailable yet",
    mapUnavailableBody:
      "Specify the metrics source (VictoriaMetrics), click «Check» in settings, and save.\nThen create a project if needed.",

    servicesTitle: "Services",
    servicesPaletteHelpAria: "Services panel help",
    searchPlaceholder: "Search…",
    nothingFound: "Nothing found",
    paletteAdd: "Add",
    onboardingTitle: "Create a project",
    onboardingBody:
      "Each project has its own canvas and layout. Set label filters — only matching services appear in the palette — then add them with «Add», the canvas context menu, or the floating toolbar.",
    monitoringHint:
      "Monitored services on the left. Use «Add» to place one on the map.\nRight‑click empty canvas for area and service.\nThe floating toolbar — tools and zoom.",

    mapObjectsTitle: "Toolbar",
    mapCanvasActions: "Actions",
    mapZoomIn: "Zoom in",
    mapZoomOut: "Zoom out",
    mapFitView: "Fit to screen",
    mapLockInteraction: "Lock dragging, connections, and selection",
    mapUnlockInteraction: "Unlock dragging, connections, and selection",

    contextAddArea: "Add area",
    contextAddService: "Add service",
    contextAllServicesOnCanvas: "All monitored services are already on the canvas",

    monitoringTitle: "MONITORING",
    monitoringSummary: "Probes: {ok}/{total}",
    monitoringSourcesCoverage: "Blackbox: {present}/{expected}",
    descriptionTitle: "DESCRIPTION",
    actionsTitle: "ACTIONS",
    labelsTitle: "LABELS",
    noData: "No data",

    datasourceStatusOk: "Datasource is reachable (VictoriaMetrics / Prometheus)",
    datasourceStatusBad: "Datasource is unreachable or not responding",
    datasourceStatusUnknown: "Datasource URL is not saved — open Settings",
    ok: "OK",
    uiOk: "OK",
    fail: "Fail",

    refresh: "Refresh",
    refreshPendingAria: "Refreshing data",
    pollDataInterval: "Auto",
    pollIntervalSecondsSuffix: " s",
    save: "Save",
    saved: "Saved",
    loading: "Loading…",

    apiErrorHttp: "Could not load data (HTTP {status}).",
    apiErrorNetwork: "Cannot reach the server. Check your network and that the backend is running.",
    apiErrorDatasourceUnavailable:
      "The metrics datasource (VictoriaMetrics / Prometheus) is unreachable, not responding, or returned an error. Check the URL in settings, network, and that VM/Prometheus is up.",
    metricsStaleOverlay:
      "Live metrics are unavailable. Showing the last successful snapshot; editing is disabled until the connection is restored.",
    apiLoadErrorHint: "The map is temporarily unavailable. Use «Retry» in the banner above.",
    apiLoadRetry: "Retry",
    apiLoadDismiss: "Dismiss",

    deleteProjectConfirm: 'Delete project "{name}"?',
    projectConfigure: "Configure project",
    projectSelect: "Select project",
    projectDelete: "Delete project",

    projectTitle: "Project",
    projectTitleNew: "New project",

    cancel: "Cancel",
    delete: "Delete",
    emDash: "—",

    settingsDatasourceIntro:
      "Prometheus-compatible API (VictoriaMetrics). Without a URL the map and label lists will not work — that is expected until you finish setup.",
    settingsName: "Name",
    settingsUrlApi: "API URL",
    settingsUrlPlaceholder: "https://victoria-metrics.example:8428",

    settingsSectionDatasource: "METRICS SOURCE",
    settingsSectionJobs: "BLACKBOX TARGETS (JOB LABEL)",
    settingsJobsA: "From ",
    settingsJobsB: " metrics we read the standard ",
    settingsJobsC:
      " label (Prometheus scrape job name). Choose which jobs to include when building the palette service list.",
    settingsJobsEmpty: "Enter the URL and click «Check» first to load the job list.",
    settingsJobSources: "sources:",

    settingsSectionFilter: "GLOBAL FILTER (BUILDER)",
    settingsFilterIntro:
      "Conditions are appended to the selector together with selected jobs and (for a project) its labels. Multiple rows are combined with logical AND in PromQL.",
    settingsPresetEnvProd: "+ environment=prod",
    settingsPresetEnvStaging: "+ environment≠staging",
    settingsPresetTeam: "+ team =~ platform.*",
    settingsFilterClear: "Clear rules",
    settingsFilterNoRules:
      "No rules yet — metrics are filtered by job only (and by the project filter if set).",
    settingsFilterAddRule: "+ Add condition",
    settingsFilterLabelOption: "label",
    settingsFilterValuePlaceholder: "prod or .*",
    settingsSelectorPreviewTitle: "SELECTOR PREVIEW",
    settingsSelectorPreviewHint:
      "This exact fragment is used in probe_success queries (same as on the server). Project filter labels are added on top for project views.",
    settingsSectionRawPromql: "EXTRA (RAW PROMQL)",
    settingsRawPromqlIntro:
      "Optional. Appended to the end of the selector after builder rules, comma-separated. For advanced expressions when the builder is not enough.",
    settingsRawPromqlPlaceholder: 'e.g. cluster="eu-1"',
    settingsSectionLabelMap: "HOW TO READ METRIC LABELS",
    settingsLabelMapIntro:
      "After «Check» you can pick real label names from VictoriaMetrics. They must match what your blackbox / scrape exposes.",
    settingsLabelNotSet: "— not set —",
    settingsClose: "Close",

    labelMapServiceTitle: "Service name on the map (metric label)",
    labelMapServiceHint:
      "Metric label used to group targets into one service card (often service or instance).",
    labelMapPortTitle: "Port / endpoint",
    labelMapPortHint: "Label for port number or endpoint identifier.",
    labelMapProbeSourceTitle: "Probe source (blackbox instance)",
    labelMapProbeSourceHint:
      "Label that distinguishes blackbox exporters in metrics. Often instance (host:port of the blackbox process). May be pod, hostname, etc.",
    labelMapModuleTitle: "Blackbox module",
    labelMapModuleHint:
      "Label for the probe module name (http_2xx, icmp, …) — used to infer http/icmp/tcp type.",
    labelMapUrlTitle: "URL (optional)",
    labelMapUrlHint: "Separate label for target URL if needed; can be left empty.",

    opEq: "= equals",
    opRe: "=~ regex",
    opNe: "!= not",
    opNre: "!~ not regex",

    testChecking: "Checking…",
    testCheck: "Check",
    testOk: "✓ OK",
    testFail: "✗ No connection",

    placeholderEnvironment: "environment",

    projectIntro:
      "One service type on the map. Conditions use labels from VictoriaMetrics (like PromQL): every selected pair must match. Labels load after the datasource is configured.",
    projectNameLabel: "Project name",
    projectNamePlaceholder: "e.g. Production",
    projectFilterSection: "Metric label filter",
    projectFilterHint:
      "Empty — show all services from selected jobs. Multiple rows — intersection (AND).",
    projectOptionLabel: "— label —",
    projectOptionValue: "— value —",
    projectPlaceholderProd: "prod",
    projectPlaceholderFirstLabel: "label first",
    projectRemoveCondition: "Remove condition",
    projectAddCondition: "+ Another condition",

    defaultGroupLabel: "Area",
    defaultServiceLabel: "Service",

    deleteConfirmLead: "Type",
    deleteConfirmTail: "to confirm:",
    copyName: "Copy name",
    nameCopied: "Copied",
    deleteFromMapPlaceholder: "confirmation",

    iconSectionBuiltin: "ICONS",
    iconSectionCustom: "MY ICONS",
    iconNamePlaceholder: "Name *",
    iconNameRequiredError: "Enter a name",
    iconUpload: "+ Upload icon",

    iconChange: "Change icon",
    iconAdd: "Add icon",
    layerBack: "Send backward",
    layerForward: "Bring forward",
    layerOrder: "Layer {n}/{total}",
    layerBackShort: "back",
    layerForwardShort: "front",

    descriptionPlaceholder: "Description...",
    descriptionSaveHintBefore: "Press ",
    descriptionSaveHintAfter: " to save",
    descriptionClickToAdd: "Click to add a description...",
    actionNamePlaceholder: "Name",
    actionUrlPlaceholder: "https://...",
    actionOpenTo: "Open {label}",
    removeFromCanvas: "Remove from map",
    changeIconTitle: "Change icon",

    ellipsis: "…",
  },
} as const;

export type I18nKey = keyof (typeof STRINGS)["ru"];

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return v === "en" ? "en" : "ru";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      lang,
      setLang: (next) => {
        // Не триггерить лишний ре-рендер и побочные эффекты, если язык уже выбран
        setLang((prev) => (prev === next ? prev : next));
      },
      t: (key) => STRINGS[lang][key] ?? STRINGS.ru[key] ?? String(key),
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n must be used inside I18nProvider");
  return v;
}
