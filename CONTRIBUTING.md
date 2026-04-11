# Участие в разработке

## Перед отправкой PR

1. **Backend**: `uv sync --group dev`, затем `make test` и `make lint` из корня репозитория.
2. **Frontend**: из каталога `frontend` — `npm ci`, `npm run lint`, `npm run build`.

Команды совпадают с job **backend** и **frontend** в `.github/workflows/ci.yml`.

## Тесты Python

- Тесты лежат в `tests/`, для кода, который трогает файлы, используйте фикстуру `data_dir` из `tests/conftest.py`.
- Для моков — `pytest-mock` (`mocker`), не `unittest.mock`.

## Что не коммитить

- Файлы с секретами: `.env`, локальные overrides (см. `.gitignore`).
- Случайные дампы прод-данных из каталога данных, если в вашей команде они не считаются частью репозитория.

## Архитектура

Краткий обзор и схемы потоков — в [.claude/architecture.md](.claude/architecture.md).
