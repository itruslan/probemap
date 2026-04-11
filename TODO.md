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

- **2026-04-11 — V1: стрелка ребра + линия без «просвечивания».** `DeletableEdge`: смещение начала `getSmoothStepPath` от **source** handle (как уже было для target) + небольшой `STROKE_JOIN_PAD` у длины пути.

- **2026-04-11 — fix(trash): TrashModal показывал «Корзина пуста» вместо ошибки.** Добавлен `error` state + `.catch()` в `useEffect`; при 401/сетевой ошибке выводится текст ошибки.

- **2026-04-11 — P1–P4: подготовка к публикации.** MIT LICENSE, упрощён README, data/ убрана из git (config.example.json с placeholder), .gitignore расширен (data/, .qoder/, .qwen/, .tool-versions), удалены CONTRIBUTING.md / frontend/README.md / GITHUB_SETUP_PLAN.md / .tool-versions.

- **2026-04-11 — E3: S3-совместимое хранилище.** `storage.py`: `LocalBackend` + `S3Backend` (boto3). Все данные (config, projects, layouts, icons) через абстракцию. Env: `PROBEMAP_S3_*`. Fallback на `data/` без конфига.

- **2026-04-11 — E1: soft delete + корзина + восстановление.** `deleted_at` на проектах, `GET /api/projects/trash`, `POST /api/projects/{id}/restore`, `DELETE /api/projects/{id}/permanent`. UI: TrashModal, счётчик в ProjectSelect.

- **2026-04-11 — E2: import/export проекта.** `GET /api/projects/{id}/export` → `probemap_*.json` (name, filters, layout + service_configs). `POST /api/projects/import` → создаёт проект из файла. UI: кнопка Export в ProjectModal, Import в ProjectSelect.

- **2026-04-11 — D4: CI release — Docker build + push GHCR.** `.github/workflows/release.yml`: триггер `v*`, Buildx + GHA-кеш, теги `v0.x.x` / `0.x` / `latest` в `ghcr.io/itruslan/probemap`.

- **2026-04-11 — D3: CI lint + test.** `.github/workflows/ci.yml` — backend (ruff check, ruff format --check, pytest) + frontend (npm ci, npm run lint, npm run build). Триггеры: push/PR в main/master.

- **2026-04-04 — feat(auth): admin/viewer roles.** `PROBEMAP_ADMIN_PASSWORD` env: не задан — все без ограничений; задан — viewer (read-only) без пароля, admin по паролю. In-memory токены (без БД), Bearer auth. Frontend: `AuthContext`, `LoginModal`, кнопка `admin` в шапке. Все write-эндпоинты защищены `Depends(auth.require_admin)`. Viewer: карта только для просмотра (нельзя соединять, перетаскивать, удалять).

- **2026-04-04 — fix(edges): sourceHandle/targetHandle не сохранялись.** После перезагрузки стрелки всегда оказывались в верхних точках. Добавлено сохранение/загрузка `sourceHandle`/`targetHandle` в `persistLayout` и `layoutRowToMapEdge`.

- **2026-04-04 — refactor(ServiceNode): hover = click.** Унификация карточки при наведении и клике. Кнопка «путь» показывается всегда. Editing через inline-клики (canEdit). `border-radius: 6px` на всех кнопках.

- **2026-04-03 — refactor(palette+canvas): убраны ПКМ, вкладки, типизированные группы.** Удалён `ContextMenu.tsx`. Одна универсальная «Область» (`type: "group"`) с handles на всех 4 сторонах. Единая палитра: `[+ Область]` `[+ Объект]` → поиск → список сервисов. `ServiceNode` лейбл редактируется двойным кликом.

- **2026-04-04 — feat(logging): D2 — structured logging.** `log.py`: JSON/text форматтер, авто-детект TTY. `settings.py`: `PROBEMAP_LOG_LEVEL`, `PROBEMAP_LOG_FORMAT`. Debug/warning на каждый запрос к VictoriaMetrics.

- **2026-04-02 — feat(endpoint): Endpoint на узле.** Поле `endpoint` в `ServiceNodeData`; ссылка под названием; Settings → `endpoint_label` авто-подстановка.

- **2026-04-02 — F2–F6, refactor(kinds), C1–C2, B1–B2, A1–A3, Фазы 1–4, Docker:** см. историю коммитов.

---

## Блок V — Визуальные баги

> Открытых задач нет (V1 — см. «Сделано»).

## Блок D — Инфраструктура и эксплуатация

> D2, D3, D4 — закрыты.

### [ ] D5. Frontend code-splitting

Frontend бандл — 2.1 MB (один чанк). Vite выдаёт warning.

- **Что сделать:** `React.lazy` + `Suspense` для Settings, dynamic import для ReactFlow.
- **Готово когда:** ни один чанк не превышает 500 KB; build без warning.

---

## Блок H — Панель объектов и поиск

### [ ] H2. Поиск по эндпоинтам на карте

Текущий поиск ищет только по `name` из мониторинга. Нет способа найти узел по endpoint-у или лейблу.

- **Что сделать:** режим «найти на карте» — по endpoint/лейблу scroll-to + выделение узла.
- **Готово когда:** вводишь URL → узел с этим endpoint-ом подсвечивается на карте.
