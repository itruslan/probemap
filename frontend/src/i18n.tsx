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
    /** Экран 424 и шаг «ещё нет датасорса / не выбраны таргеты» — заголовок и кнопка-CTA */
    datasourceSetupTitle: "Настроить датасорс",
    mapUnavailableBody:
      "Укажите и сохраните URL источника метрик (Prometheus-совместимый API), выберите job и сохраните шаг таргетов — без этого карта и проекты не заработают.",

    servicesTitle: "Сервисы",
    servicesPaletteHelpAria: "Справка по панели сервисов",
    tooltipInfoAria: "Подсказка",
    searchPlaceholder: "Поиск…",
    nothingFound: "Ничего не найдено",
    paletteSectionServices: "Сервисы",
    paletteSectionResources: "Ресурсы",
    paletteAdd: "Добавить",
    paletteObject: "Объект",
    onboardingTitle: "Создайте проект",
    onboardingTitlePrereq: "Сначала настройте источник метрик",
    onboardingBody:
      "У каждого проекта свой холст и своя раскладка. Задайте фильтры по лейблам — в палитре останутся только подходящие сервисы, затем добавляйте их на карту через «Добавить», ПКМ по карте или плавающую панель.",
    onboardingBodyWait: "Проверяем сохранённый конфиг и доступность источника…",
    onboardingBlockedWizard:
      "В настройках сохраните URL, выберите нужные job и нажмите «Сохранить» на шаге таргетов. Пока мастер не завершён, создавать проект нельзя — на карте не на что опираться.",
    onboardingBlockedMetrics:
      "Источник не указан, не сохранён в конфиге или сейчас не отвечает. Откройте настройки, проверьте URL кнопкой «Проверить» и сохраните конфигурацию.",
    onboardingViewerTitle: "Проектов пока нет",
    onboardingViewerBody: "Создавать проекты может только администратор. Когда проект появится — он отобразится здесь автоматически.",
    monitoringHint:
      "Слева — сервисы из мониторинга. Добавьте на карту кнопкой «Добавить».\nПКМ по пустому месту карты — область и сервис.\nПлавающая панель на карте — инструменты и масштаб.",

    mapObjectsTitle: "Панель инструментов",
    mapCanvasActions: "Действия",
    mapZoomIn: "Увеличить",
    mapZoomOut: "Уменьшить",
    mapFitView: "Показать всё на экране",
    mapUndo: "Отменить",
    mapRedo: "Повторить",
    mapLockInteraction: "Заблокировать перетаскивание, связи и выделение",
    mapUnlockInteraction: "Снова разрешить перетаскивание, связи и выделение",
    mapSelectMode: "Режим выделения",
    mapPanMode: "Режим навигации",

    hintsTitle: "Горячие клавиши",
    hintsPan: "Панорама",
    hintsZoom: "Масштаб",
    hintsSelectNode: "Выбрать узел",
    hintsMultiSelect: "Мульти-выбор",
    hintsDelete: "Удалить",
    hintsUndo: "Отменить",
    hintsRedo: "Повторить",
    hintsEscape: "Сбросить / выйти",
    hintsClickDrag: "Тащить",
    hintsClickNode: "ЛКМ",
    hintsDrag: "Тащить",

    groupColor: "Цвет области",
    groupColorCustom: "Свой цвет",
    groupColorReset: "Без цвета",
    paletteArea: "Область",
    paletteContainer: "Группа",

    edgeEditTitle: "Связь между компонентами",
    edgeProtocol: "Протокол",
    edgeProtocolPlaceholder: "https, grpc, wireguard…",
    edgePort: "Порт",
    edgeDescription: "Описание",
    edgeDescriptionPlaceholder: "Например: туннель до офиса, health-check VIP",
    edgeNoMetadata: "Нет описания — карандаш или двойной клик",
    edgeEditAria: "Редактировать описание связи",

    monitoringTitle: "МОНИТОРИНГ",
    monitoringSummary: "Пробы: {ok}/{total}",
    monitoringSourcesCoverage: "Blackbox: {present}/{expected}",
    monitoringSourcesToggleHint:
      "Источники: тапните, чтобы учитывать / не учитывать",
    monitoringIgnoreSourceOn: "Не учитывать",
    monitoringIgnoreSourceOff: "Учитывать",
    endpointTitle: "КОНЕЧНАЯ ТОЧКА",
    endpointPlaceholder: "https://...",
    endpointPickLabel: "из лейбла",
    endpointClickToAdd: "Нажмите, чтобы указать адрес (URL)…",
    endpointOpenInNewTab: "Открыть в новой вкладке",
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
    apiErrorNetwork:
      "Нет связи с сервером. Проверьте сеть и что бэкенд запущен.",
    apiErrorDatasourceUnavailable:
      "Источник метрик (VictoriaMetrics / Prometheus) недоступен, не отвечает или вернул ошибку. Проверьте URL в настройках, сеть и что VM/Prometheus запущены.",
    metricsStaleOverlay:
      "Живые метрики недоступны. Показано последнее удачное состояние; правка карты отключена до восстановления связи.",
    apiLoadErrorHint:
      "Карта временно недоступна. Используйте «Повторить» в панели уведомления выше.",
    apiLoadRetry: "Повторить",
    apiLoadDismiss: "Скрыть",

    deleteProjectConfirm: "Удалить проект «{name}»?",
    projectConfigure: "Настроить проект",
    projectSelect: "Выбрать проект",
    projectDelete: "Удалить проект",
    projectExport: "Экспорт",
    projectImport: "Импорт",
    projectImportError: "Не удалось импортировать: файл повреждён или неверного формата.",
    projectTrash: "Корзина",

    trashTitle: "Корзина проектов",
    trashEmpty: "Корзина пуста",
    trashDeletedAt: "Удалён",
    trashRestore: "Восстановить",
    trashDeletePermanently: "Удалить навсегда",
    trashConfirmDelete: "Удалить?",
    trashHint: "Удаление из корзины — безвозвратно.",

    projectTitle: "Проект",
    projectTitleNew: "Новый проект",

    cancel: "Отмена",
    delete: "Удалить",
    emDash: "—",

    /** Настройки — секции и тексты */
    settingsDatasourceIntro:
      "Источник — Prometheus-совместимый API. Сначала сохраните URL — затем откроется выбор job и остальные настройки.",
    settingsCheckHint:
      "«Проверить» только проверяет доступность API по этому адресу; probemap не подключает источник, пока вы не нажмёте «Сохранить» под полем URL.",
    settingsNeedRecheckHint:
      "Текущий URL в поле не совпадает с адресом, с которого подгружены списки. Сохраните URL заново или верните прежнее значение.",
    settingsJobsStepHint:
      "Отметьте нужные job и нажмите «Сохранить» — без этого шага дальнейшие настройки не откроются. Можно сохранить и без выбранных job (если список пуст или вы отключите всё осознанно).",
    settingsJobsLoading: "Загружаем список job…",
    settingsJobsEmptyVm:
      "В метриках probe_success не найдено ни одного job — проверьте blackbox / scrape.",
    settingsName: "Название",
    settingsUrlApi: "URL API",
    settingsUrlPlaceholder: "https://victoria-metrics.example:8428",
    settingsUrlFromEnvHint:
      "Адрес API задан переменной окружения PROBEMAP_DATASOURCE_URL и имеет приоритет над значением в config.json. Поле URL ниже только для просмотра; имя источника и остальные шаги настроек по-прежнему сохраняются в конфиг.",

    settingsSectionDatasource: "ИСТОЧНИК МЕТРИК",
    settingsSectionJobs: "ТАРГЕТЫ BLACKBOX (ЛЕЙБЛ JOB)",
    settingsJobsA: "Из метрик ",
    settingsJobsB: " берутся значения стандартного лейбла ",
    settingsJobsC:
      " (как в Prometheus: имя scrape job). Отметьте, какие job учитывать при сборе списка сервисов в палитре.",
    settingsJobSources: "источники:",

    settingsSectionFilter: "ФИЛЬТР МЕТРИК",
    settingsFilterIntro:
      "Строки конструктора добавляются в селектор вместе с выбранными job; несколько строк — логическое И в PromQL.\n\nБез правил в запросе остаются только job и (при открытом проекте) фильтр проекта.",
    settingsPresetEnvProd: "+ environment=prod",
    settingsPresetEnvStaging: "+ environment≠staging",
    settingsPresetTeam: "+ team =~ platform.*",
    settingsFilterClear: "Очистить правила",
    settingsFilterAddRule: "+ Добавить условие",
    settingsFilterLabelOption: "лейбл",
    settingsFilterValuePlaceholder: "prod или .*",
    settingsSelectorPreviewTitle: "Превью селектора",
    settingsSelectorPreviewHint:
      "Фрагмент, который уходит в запросы к probe_success на сервере. Для вида «проект» к нему добавляются лейблы фильтра проекта.",
    settingsSectionLabelMap: "СООТВЕТСТВИЕ ЛЕЙБЛОВ",
    settingsLabelMapIntro:
      "Выберите реальные имена лейблов из вашего источника метрик — они должны совпадать с тем, что отдаёт blackbox / scrape.",
    settingsLabelNotSet: "— не задано —",
    settingsClose: "Закрыть",

    labelMapServiceTitle: "Имя сервиса",
    labelMapServiceHint:
      "Лейбл в probe_success, по которому таргеты собираются в одну карточку на карте. Чаще всего service (иногда instance).",
    labelMapPortTitle: "Порт",
    labelMapPortHint:
      "Лейбл с портом или иным идентификатором проверяемой цели (конечной точки).",
    labelMapProbeSourceTitle: "Источник пробы",
    labelMapProbeSourceHint:
      "Лейбл, различающий инстансы blackbox (экспортёра). Обычно instance — адрес:порт процесса blackbox; при необходимости pod, hostname и т.п.",
    labelMapModuleTitle: "Модуль пробы",
    labelMapModuleHint:
      "Лейбл с именем модуля blackbox (http_2xx, icmp …); по нему определяется тип проверки (http / icmp / tcp).",
    labelMapEndpointTitle: "Конечная точка",
    labelMapEndpointHint:
      "Необязательно. Лейбл метрики, значение которого автоматически подставляется как адрес конечной точки на карте. Например: target, instance, url. Если у сервиса такого лейбла нет — адрес можно задать вручную на узле.",
    labelMapNameLabelsHint:
      "Необязательно. Дополнительные лейблы для составного имени узла. Значения объединяются через « · ». Например: service + component → auth · api. По умолчанию используется только лейбл «Сервис».",
    labelMapNameLabelsAdd: "Добавить лейбл",

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
    projectCreateBlockedDatasource:
      "Сначала сохраните URL источника метрик в настройках.",
    projectCreateBlockedWizard:
      "В настройках сохраните шаг выбора job (таргеты).",

    defaultGroupLabel: "Область",
    defaultServiceLabel: "Сервис",
    defaultContainerLabel: "Группа",
    containerEmpty: "Перетащите сервис или объект сюда",
    doubleClickToEdit: "Двойной клик — редактировать",
    tooltipPath: "Путь",
    tooltipDescription: "Описание",
    tooltipEndpoint: "Эндпоинт",

    deleteConfirmLead: "Введите",
    deleteConfirmTail: "для подтверждения:",
    copyName: "Копировать название",
    nameCopied: "Скопировано",
    deleteFromMapPlaceholder: "подтверждение",

    iconSectionBuiltin: "ИКОНКИ",
    iconSectionCustom: "ЗАГРУЖЕННЫЕ ИКОНКИ",
    iconSectionCustomHint:
      "SVG, PNG или WebP. После загрузки иконки появятся в сетке выбора иконки у каждого узла и действия.",
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
    pathTraceClearAria: "Сбросить трассировку пути",
    pathTraceAria: "Показать связанные узлы",
    pathTraceLabel: "путь",

    loginModalTitle: "Войти как администратор",
    loginPasswordPlaceholder: "Пароль",
    loginSubmit: "Войти",
    logoutSubmit: "Выйти",
    loginError: "Неверный пароль",
    loginButtonAria: "Войти как администратор",
    logoutButtonAria: "Выйти из режима администратора",
    logoutConfirmTitle: "Выйти из режима администратора?",
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
    datasourceSetupTitle: "Configure datasource",
    mapUnavailableBody:
      "Enter and save your metrics datasource URL (Prometheus-compatible API), pick jobs, and save the targets step — without that, the map and projects cannot work.",

    servicesTitle: "Services",
    servicesPaletteHelpAria: "Services panel help",
    tooltipInfoAria: "Help tooltip",
    searchPlaceholder: "Search…",
    nothingFound: "Nothing found",
    paletteSectionServices: "Services",
    paletteSectionResources: "Resources",
    paletteAdd: "Add",
    paletteObject: "Object",
    onboardingTitle: "Create a project",
    onboardingTitlePrereq: "Set up the metrics source first",
    onboardingBody:
      "Each project has its own canvas and layout. Set label filters — only matching services appear in the palette — then add them with «Add», the canvas context menu, or the floating toolbar.",
    onboardingBodyWait: "Checking saved config and datasource reachability…",
    onboardingBlockedWizard:
      "In settings, save the URL, pick the jobs you need, and click «Save» on the targets step. Until the setup wizard is finished you cannot create a project — there is no metric data to build on.",
    onboardingBlockedMetrics:
      "The datasource is missing, not saved in config, or not responding. Open settings, verify the URL with «Check», and save the configuration.",
    onboardingViewerTitle: "No projects yet",
    onboardingViewerBody: "Only an administrator can create projects. Once a project is created it will appear here automatically.",
    monitoringHint:
      "Monitored services on the left. Use «Add» to place one on the map.\nRight‑click empty canvas for area and service.\nThe floating toolbar — tools and zoom.",

    mapObjectsTitle: "Toolbar",
    mapCanvasActions: "Actions",
    mapZoomIn: "Zoom in",
    mapZoomOut: "Zoom out",
    mapFitView: "Fit to screen",
    mapUndo: "Undo",
    mapRedo: "Redo",
    mapLockInteraction: "Lock dragging, connections, and selection",
    mapUnlockInteraction: "Unlock dragging, connections, and selection",
    mapSelectMode: "Select mode",
    mapPanMode: "Pan mode",

    hintsTitle: "Keyboard shortcuts",
    hintsPan: "Pan canvas",
    hintsZoom: "Zoom",
    hintsSelectNode: "Select node",
    hintsMultiSelect: "Multi-select",
    hintsDelete: "Delete selected",
    hintsUndo: "Undo",
    hintsRedo: "Redo",
    hintsEscape: "Deselect / exit mode",
    hintsClickDrag: "Drag",
    hintsClickNode: "Click",
    hintsDrag: "Drag",

    groupColor: "Group color",
    groupColorCustom: "Custom color",
    groupColorReset: "No color",
    paletteArea: "Area",
    paletteContainer: "Group",

    edgeEditTitle: "Link between components",
    edgeProtocol: "Protocol",
    edgeProtocolPlaceholder: "https, grpc, wireguard…",
    edgePort: "Port",
    edgeDescription: "Description",
    edgeDescriptionPlaceholder: "e.g. tunnel to office, VIP health check",
    edgeNoMetadata: "No description — pencil or double-click",
    edgeEditAria: "Edit link details",

    monitoringTitle: "MONITORING",
    monitoringSummary: "Probes: {ok}/{total}",
    monitoringSourcesCoverage: "Blackbox: {present}/{expected}",
    monitoringSourcesToggleHint: "Sources: tap to include / ignore",
    monitoringIgnoreSourceOn: "Ignore",
    monitoringIgnoreSourceOff: "Include",
    endpointTitle: "ENDPOINT",
    endpointPlaceholder: "https://...",
    endpointPickLabel: "from label",
    endpointClickToAdd: "Click to add endpoint...",
    endpointOpenInNewTab: "Open in new tab",
    descriptionTitle: "DESCRIPTION",
    actionsTitle: "ACTIONS",
    labelsTitle: "LABELS",
    noData: "No data",

    datasourceStatusOk:
      "Datasource is reachable (VictoriaMetrics / Prometheus)",
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
    apiErrorNetwork:
      "Cannot reach the server. Check your network and that the backend is running.",
    apiErrorDatasourceUnavailable:
      "The metrics datasource (VictoriaMetrics / Prometheus) is unreachable, not responding, or returned an error. Check the URL in settings, network, and that VM/Prometheus is up.",
    metricsStaleOverlay:
      "Live metrics are unavailable. Showing the last successful snapshot; editing is disabled until the connection is restored.",
    apiLoadErrorHint:
      "The map is temporarily unavailable. Use «Retry» in the banner above.",
    apiLoadRetry: "Retry",
    apiLoadDismiss: "Dismiss",

    deleteProjectConfirm: 'Delete project "{name}"?',
    projectConfigure: "Configure project",
    projectSelect: "Select project",
    projectDelete: "Delete project",
    projectExport: "Export",
    projectImport: "Import",
    projectImportError: "Failed to import: file is corrupted or in wrong format.",
    projectTrash: "Trash",

    trashTitle: "Project trash",
    trashEmpty: "Trash is empty",
    trashDeletedAt: "Deleted",
    trashRestore: "Restore",
    trashDeletePermanently: "Delete permanently",
    trashConfirmDelete: "Delete?",
    trashHint: "Permanently deleted projects cannot be recovered.",

    projectTitle: "Project",
    projectTitleNew: "New project",

    cancel: "Cancel",
    delete: "Delete",
    emDash: "—",

    settingsDatasourceIntro:
      "The datasource is a Prometheus-compatible API. Save the URL first — then job selection and the rest of the settings will appear.",
    settingsCheckHint:
      "«Check» only verifies that the API responds at this URL; probemap does not use the datasource until you click «Save» below the URL field.",
    settingsNeedRecheckHint:
      "The URL in the field does not match the address used to load the lists. Save the URL again or restore the previous value.",
    settingsJobsStepHint:
      "Select the jobs you need and click «Save» — advanced settings stay hidden until this step. You may save with none selected if the list is empty or you intend to disable all jobs.",
    settingsJobsLoading: "Loading job list…",
    settingsJobsEmptyVm:
      "No job labels found in probe_success — check blackbox / scrape configuration.",
    settingsName: "Name",
    settingsUrlApi: "API URL",
    settingsUrlPlaceholder: "https://victoria-metrics.example:8428",
    settingsUrlFromEnvHint:
      "The API URL is set via PROBEMAP_DATASOURCE_URL and overrides config.json. The URL field below is read-only; the datasource name and the rest of the settings are still saved to the config file.",

    settingsSectionDatasource: "METRICS SOURCE",
    settingsSectionJobs: "BLACKBOX TARGETS (JOB LABEL)",
    settingsJobsA: "From ",
    settingsJobsB: " metrics we read the standard ",
    settingsJobsC:
      " label (Prometheus scrape job name). Choose which jobs to include when building the palette service list.",
    settingsJobSources: "sources:",

    settingsSectionFilter: "METRIC FILTER",
    settingsFilterIntro:
      "Builder rows are merged into the selector with the selected jobs; multiple rows are AND in PromQL.\n\nWith no rules, only jobs and (when a project is open) the project filter apply.",
    settingsPresetEnvProd: "+ environment=prod",
    settingsPresetEnvStaging: "+ environment≠staging",
    settingsPresetTeam: "+ team =~ platform.*",
    settingsFilterClear: "Clear rules",
    settingsFilterAddRule: "+ Add condition",
    settingsFilterLabelOption: "label",
    settingsFilterValuePlaceholder: "prod or .*",
    settingsSelectorPreviewTitle: "Selector preview",
    settingsSelectorPreviewHint:
      "Fragment sent in probe_success queries on the server. In project view, project filter labels are added too.",
    settingsSectionLabelMap: "LABEL MAPPING",
    settingsLabelMapIntro:
      "Pick label names as they appear in your metrics source; they must match what blackbox / scrape exports.",
    settingsLabelNotSet: "— not set —",
    settingsClose: "Close",

    labelMapServiceTitle: "Service name",
    labelMapServiceHint:
      "Label in probe_success used to group targets into one card on the map. Usually service (sometimes instance).",
    labelMapPortTitle: "Port",
    labelMapPortHint: "Label holding the port or another endpoint identifier.",
    labelMapProbeSourceTitle: "Probe source",
    labelMapProbeSourceHint:
      "Label that distinguishes blackbox exporter instances. Often instance (blackbox host:port); alternatively pod, hostname, etc.",
    labelMapModuleTitle: "Probe module",
    labelMapModuleHint:
      "Label with the blackbox module name (http_2xx, icmp, …); used to infer http / icmp / tcp.",
    labelMapEndpointTitle: "Endpoint",
    labelMapEndpointHint:
      "Optional. The metric label whose value is automatically used as the node's endpoint on the map. E.g.: target, instance, url. If a service lacks this label, the endpoint can be set manually on the node.",
    labelMapNameLabelsHint:
      "Optional. Extra labels to form a composite node name. Values are joined with \" · \". E.g.: service + component → auth · api. By default only the Service label is used.",
    labelMapNameLabelsAdd: "Add label",

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
    projectCreateBlockedDatasource:
      "Save the metrics datasource URL in settings first.",
    projectCreateBlockedWizard:
      "Finish the job (targets) step in settings and save it.",

    defaultGroupLabel: "Area",
    defaultServiceLabel: "Service",
    defaultContainerLabel: "Group",
    containerEmpty: "Drag a service or object here",
    doubleClickToEdit: "Double-click to edit",
    tooltipPath: "Path",
    tooltipDescription: "Description",
    tooltipEndpoint: "Endpoint",

    deleteConfirmLead: "Type",
    deleteConfirmTail: "to confirm:",
    copyName: "Copy name",
    nameCopied: "Copied",
    deleteFromMapPlaceholder: "confirmation",

    iconSectionBuiltin: "ICONS",
    iconSectionCustom: "UPLOADED ICONS",
    iconSectionCustomHint:
      "SVG, PNG or WebP. Uploaded icons appear in the icon picker grid for every node and action.",
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
    pathTraceClearAria: "Clear path trace",
    pathTraceAria: "Show connected nodes",
    pathTraceLabel: "trace",

    loginModalTitle: "Log in as admin",
    loginPasswordPlaceholder: "Password",
    loginSubmit: "Log in",
    logoutSubmit: "Log out",
    loginError: "Wrong password",
    loginButtonAria: "Log in as admin",
    logoutButtonAria: "Log out from admin",
    logoutConfirmTitle: "Exit admin mode?",
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
    const v =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
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
