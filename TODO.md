# probemap — backlog

Короткий список на будущее (не блокирует релизы).

## Как вести этот файл

- Невыполненные задачи — чекбоксы `- [ ]` с **критериями готовности** ниже по тексту.
- **Сделали задачу** → перенеси одну строку-резюме в раздел **«Сделано»** (сверху блока, с датой `YYYY-MM-DD` по желанию) и **сними чекбокс / удали блок** из backlog, чтобы список «что ещё делать» не дублировался.

---

## Концепция

ProbeMap тащит из Prometheus-совместимого датасорса метрику `probe_success` и пририсовывает статусы объектам на карте.

### Сущности на карте

| Сущность | ReactFlow type | Откуда | Мониторинг |
|----------|---------------|--------|------------|
| **Сервис** | `service` | Палитра → список из мониторинга | Да — HTTP/TCP/UDP |
| **Ресурс** | `service` | Палитра → список из мониторинга | Да — ICMP/TCP |
| **Объект** | `service` | Кнопка «+ Объект» (kind: custom) | Опционально (через matchServiceId) |
| **Область** | `group` | Кнопка «+ Область» | Нет |

Сервис и Ресурс приходят из VictoriaMetrics (probe_success). Объект — произвольный, имя и иконку задаёт пользователь. Область — визуальная зона для группировки, поддерживает parentId (дочерние ноды). Все стрелки можно соединять с любой стороной любого элемента.

---

## Сделано (недавно)

- **2026-04-11 — P1: MIT LICENSE.** `LICENSE` в корне, README обновлён.

- **2026-04-11 — D3: CI lint + test.** `.github/workflows/ci.yml` — backend (ruff check, ruff format --check, pytest) + frontend (npm ci, npm run lint, npm run build). Триггеры: push/PR в main/master.

- **2026-04-04 — feat(auth): admin/viewer roles.** `PROBEMAP_ADMIN_PASSWORD` env: не задан — все без ограничений; задан — viewer (read-only) без пароля, admin по паролю. In-memory токены (без БД), Bearer auth. Frontend: `AuthContext`, `LoginModal`, кнопка `admin` в шапке. Все write-эндпоинты защищены `Depends(auth.require_admin)`. Viewer: карта только для просмотра (нельзя соединять, перетаскивать, удалять).

- **2026-04-04 — fix(edges): sourceHandle/targetHandle не сохранялись.** После перезагрузки стрелки всегда оказывались в верхних точках. Добавлено сохранение/загрузка `sourceHandle`/`targetHandle` в `persistLayout` и `layoutRowToMapEdge`.

- **2026-04-04 — refactor(ServiceNode): hover = click.** Карточка при наведении и клике теперь одинакова. Убраны locked-only секции: sources toggle, структурные отличия панели. Кнопка «путь» показывается всегда (не только при locked). Editing через inline-клики (canEdit). Унификация `border-radius` кнопок: `6px` в базовом `.probemap-btn`, `borderRadius: 999` → `6` на кнопке «путь».

- **2026-04-03 — refactor(palette+canvas): убраны ПКМ, вкладки, типизированные группы.** Удалён `ContextMenu.tsx` и весь код ПКМ. Убраны `GROUP_KINDS`/`GroupKindDef`/`getGroupKindDef` — теперь одна универсальная «Область» (`type: "group"`) с handles на всех 4 сторонах. Удалены Objects tab и вкладки из палитры — единая панель: `[+ Область]` `[+ Объект]` → поиск → список сервисов. `GroupNodeData` упрощён до `{label, color}`. `ServiceNode` лейбл редактируется двойным кликом.

- **2026-04-03 — perf+a11y: React.memo, useMemo, debounce, ARIA.** `ServiceNode`/`GroupNode`/`Palette` — `React.memo`. `ServiceNode` — `useMemo` на probeRows, sourceAgg, blackboxOrder. `TopologyCanvas` — `onCanvas` в `useMemo`; `persistLayout` debounced 500ms. `Settings` — `role="dialog"`, ARIA. Tabs в `Palette` — `role="tablist"`, `role="tab"`, `aria-selected`.

- **2026-04-03 — fix(groups): z-index handles + area в палитре.** `GroupNode` HANDLE_STYLE `zIndex: 10` — handles выше child-нод. «Область» перенесена из `MapObjectsBar` в Objects tab палитры.

- **2026-04-03 — feat(groups): G1–G6 — типизированные группы с parentId + авто-импорт.** (Затем полностью упрощены — см. выше.)

- **2026-04-03 — feat(palette): H1 — вкладка «Объекты».** (Затем заменена единой панелью — см. выше.)

- **2026-04-04 — feat(logging): D2 — structured logging.** `log.py`: JSON/text форматтер, авто-детект TTY. `settings.py`: `PROBEMAP_LOG_LEVEL`, `PROBEMAP_LOG_FORMAT`. `main.py`: `log.setup()` при старте, логирует порт/data_dir/datasource, ошибки VM. `metrics.py`: `_log = log.get("probemap.metrics")`, debug/warning на каждый запрос к VictoriaMetrics.

- **2026-04-03 — fix(metrics): логирование ошибок VM с контекстом.**

- **2026-04-02 — feat(endpoint): Endpoint на узле.** Поле `endpoint` в `ServiceNodeData`; на карточке — серая строка под названием; в панели — секция ENDPOINT: ссылка / редактирование; Settings → `endpoint_label` — авто-подстановка из лейбла метрики.

- **2026-04-02 — feat(palette): цвет выделения по статусу.** `probeNodeStatus()`, `probeStatusMap`, CSS-переменные `--sel-ring/g1/g2`, `--palette-row-accent`; синий заменён на цвет статуса везде.

- **2026-04-02 — feat(Settings): кастомные иконки — сетка.** MY ICONS: иконки и «+» в единой сетке 36×36, форма под сеткой. `IconPicker.tsx` удалён.

- **2026-04-02 — F2–F6, refactor(kinds), C1–C2, B1–B2, A1–A3, Фазы 1–4, Docker:** см. историю коммитов.

---

## Блок P — Подготовка к публикации

> P1 закрыт — см. «Сделано».

### [ ] P2. Вычистить `data/` из git

Каталог `data/` — runtime-состояние (config, layouts, projects, icons). Сейчас трекается в git, `config.json` содержит реальный URL `victoriametrics.itruslan.ru`.

- **Что сделать:** добавить `data/` в `.gitignore`; удалить из индекса (`git rm -r --cached data/`); добавить `data/.gitkeep` или `data/config.example.json` с placeholder URL.
- **Готово когда:** `git ls-files data/` пуст; `.gitignore` содержит `data/`; есть пример конфигурации.

### [ ] P3. Вычистить AI-артефакты из git

`.qoder/`, `.qwen/`, `.tool-versions` трекаются в git — это артефакты AI-ассистентов, не нужны в публичном репо.

- **Что сделать:** добавить в `.gitignore`: `.qoder/`, `.qwen/`, `.tool-versions`; удалить из индекса.
- **Готово когда:** `git ls-files .qoder/ .qwen/ .tool-versions` пуст.

### [ ] P4. Убрать внутренние planning-документы

`GITHUB_SETUP_PLAN.md` — внутренний план, не нужен в публичном репо.

- **Что сделать:** удалить `GITHUB_SETUP_PLAN.md` из репо; убрать ссылку из README.md.
- **Готово когда:** файл не в git; README не ссылается на него.

---

## Блок V — Визуальные баги

### [ ] V1. Смещение кончика стрелки / начала линии от handle

Кончик стрелки (polygon) и линия ребра `getSmoothStepPath` соединяются в одной точке `(targetX, targetY)`, из-за чего линия «просвечивает» через тело стрелки. На source-конце линия стартует от центра handle-круга, а не от его края.

- Попробовать: укорачивать `getSmoothStepPath` до основания стрелки (`targetX + dx, targetY + dy` на `ARROW` пикселей в сторону источника) — убирает перекрытие линии и polygon.
- Если не помогает — исследовать `markerEnd` SVG-маркер как альтернативу polygon.
- **Готово когда:** кончик стрелки точно совпадает с handle без видимого «просвечивания» линии.

---

## Блок D — Инфраструктура и эксплуатация

> D3 (CI: lint + test) — закрыт, см. «Сделано».

### [ ] D4. CI: Docker build + push

- **Что сделать:** при push тега `v*` — собрать образ и push в GHCR.
- **Зависимость:** D3 (сделан).
- **Готово когда:** `git tag v0.2.0 && git push --tags` → образ в registry.

### [ ] D5. Frontend code-splitting

Frontend бандл — 2.1 MB (один чанк). Vite выдаёт warning.

- **Что сделать:** `React.lazy` + `Suspense` для Settings, dynamic import для ReactFlow.
- **Готово когда:** ни один чанк не превышает 500 KB; build без warning.

---

## Блок E — Данные и хранение

### [ ] E1. Soft delete проектов + восстановление

- **Готово когда:** `DELETE` не стирает безвозвратно; есть список «удалённые»; восстановление доступно.

### [ ] E2. Import / export проекта

- **Готово когда:** один JSON-файл (имя, фильтры, раскладка, `service_configs`); round-trip import/export.

### [ ] E3. S3-совместимое хранилище для артефактов

- **Готово когда:** endpoint/bucket/credentials через env; чтение/запись раскладок; fallback с `data/`.

### [ ] E4. Опционально: дубли по `matchServiceId` в старых раскладках

- **Готово когда:** при загрузке раскладки не появляется второй узел на тот же каталожный id из-за `matchServiceId`.

---

## Блок F — UX-улучшения (не блокирующее)

### [ ] F1. Стрелка как аннотационный объект

- **Готово когда:** на карте можно добавить свободную стрелку/аннотацию, не привязанную к нодам; сохраняется в раскладке.

---

## Блок H — Панель объектов и поиск

### [ ] H2. Поиск по ресурсам и эндпоинтам на карте

Текущий поиск в палитре ищет только по `name` сервиса из мониторинга. Нет способа найти узел на карте по его endpoint-у или лейблу.

- **Что сделать:** расширить или сделать отдельный режим «найти на карте» — по endpoint/лейблу подсвечивать узел на холсте (scroll-to + выделение).
- **Готово когда:** вводишь URL → узел с этим endpoint-ом подсвечивается на карте.
