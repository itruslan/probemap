# Probemap

Визуализация топологии сервисов по результатам **blackbox_exporter**: живой граф на canvas с опросом **VictoriaMetrics** (или совместимого Prometheus API).

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Python 3.11+, FastAPI, httpx, uvicorn |
| Frontend | React 19, TypeScript, Vite, React Flow (`@xyflow/react`) |
| Данные | JSON в каталоге данных (`config`, проекты, раскладки, иконки) |

## Требования

- [uv](https://docs.astral.sh/uv/) (Python 3.11+)
- Node.js **22** и npm (как в Docker-сборке фронтенда)

## Быстрый старт (разработка)

```bash
cp .env.example .env   # при необходимости поправьте переменные
uv sync --group dev
cd frontend && npm ci && cd ..
make dev               # backend :8000 + Vite :5173, /api проксируется
```

Остановка: `Ctrl+C` в терминале с `make dev`.

По отдельности:

```bash
make run              # только API
make run-frontend     # только Vite (прокси на :8000)
```

## Тесты и качество кода

```bash
make test    # uv run pytest
make lint    # ruff check + ruff format --check
make fmt     # автоисправление ruff
```

Во фронтенде:

```bash
cd frontend && npm run lint && npm run build
```

На GitHub те же шаги выполняются в **GitHub Actions** (`.github/workflows/ci.yml`).

## Docker

```bash
docker compose up --build
```

Переменные см. в `docker-compose.yml` и `.env.example` (в т.ч. `PROBEMAP_DATASOURCE_URL`, `PROBEMAP_HOST_PORT`).

## Документация в репозитории

| Файл | Назначение |
|------|------------|
| [CLAUDE.md](CLAUDE.md) | соглашения, команды, структура фронтенда |
| [.claude/architecture.md](.claude/architecture.md) | потоки данных, модули, label map |
| [.claude/smells/backend.smells.md](.claude/smells/backend.smells.md) | известные технические долги backend |
| [CONTRIBUTING.md](CONTRIBUTING.md) | как участвовать и что проверять перед PR |

## Лицензия

[MIT](LICENSE)
