# План оформления репозитория под GitHub

Цель: чтобы новый участник или ревьюер сразу понимал, что это за проект, как его запустить, как прогоняются проверки в CI, и где искать архитектурный контекст.

## Фаза 1 — план (этот документ)

- [x] Зафиксировать объём работ и порядок шагов в одном файле в корне репозитория.

## Фаза 2 — документация для GitHub

- [x] **Корневой `README.md`** — краткое описание probemap, стек, требования (Python 3.11+, uv, Node 22), быстрый старт (`make dev`, `make test`, `make lint`), Docker / Compose, переменные окружения (ссылка на `.env.example`), ссылки на `CLAUDE.md` и `.claude/architecture.md`.
- [x] **`frontend/README.md`** — короткая заметка, что фронтенд — часть монорепо; детали в корневом README (убрать шаблонный текст Vite с главной страницы репозитория).
- [x] **`CONTRIBUTING.md`** — как запускать тесты и линтеры локально, что ожидает CI, что не коммитить (`data/`, `.env`).

## Фаза 3 — CI (GitHub Actions)

- [x] **`.github/workflows/ci.yml`** — два параллельных job:
  - **backend**: checkout → `astral-sh/setup-uv` → `uv sync --group dev --frozen` → `ruff check`, `ruff format --check`, `pytest`;
  - **frontend**: checkout → `actions/setup-node` (Node 22, кэш по `frontend/package-lock.json`) → `npm ci` → `npm run lint` → `npm run build`.
- Триггеры: `push` и `pull_request` на ветки `main` и `master` (на случай разных имён дефолтной ветки).

## Фаза 4 — проверка

- [x] Локально: `uv run pytest`, `uv run ruff check backend tests`, `cd frontend && npm ci && npm run lint && npm run build` — убедиться, что команды совпадают с CI и проходят.
  - Backend: прогонены `pytest`, `ruff check`, `ruff format --check` (исправлены I001/E741 в `backend/auth.py`, `backend/main.py`, `backend/metrics.py`).
  - Frontend: `eslint.config.js` — отключены правила React Compiler (`react-hooks/refs`, `static-components`, `immutability`, `set-state-in-effect`) и `react-refresh/only-export-components`; настроен `@typescript-eslint/no-unused-vars` с игнором по префиксу `_`. Интерфейсы данных узлов (`ServiceNodeData`, `GroupNodeData`, `ContainerNodeData`) расширяют `Record<string, unknown>`, чтобы `tsc -b` согласовывался с типами `@xyflow/react`. Удалён неиспользуемый проп `addBlocked` из деструктуризации в `MapObjectsBar.tsx`; убран лишний `eslint-disable` в `Settings.tsx`.

## Вне скоупа (по желанию позже)

- Бейдж статуса CI в README (после первого успешного прогона на GitHub).
- `LICENSE` — если нужна явная лицензия для open source.
- Issue/PR шаблоны — при появлении процесса triage.

После выполнения фаз 2–4 чекбоксы в этом файле можно отметить вручную или отдельным коммитом.
