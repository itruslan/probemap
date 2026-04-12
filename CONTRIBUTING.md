# Участие в разработке

## Перед отправкой PR

1. **Backend**: `uv sync --group dev`, затем `make test` из корня репозитория.
2. **Frontend**: из каталога `frontend` — `npm ci`, `npm run lint`, `npm run build`.

Команды совпадают с job **backend** и **frontend** в `.github/workflows/ci.yml`.

## Pre-commit

В репозитории настроен pre-commit (ruff + ruff-format для backend/tests, eslint для frontend):

```bash
uv run pre-commit install   # один раз после клонирования
```

После этого lint и форматирование запускаются автоматически при `git commit`. Запустить вручную:

```bash
uv run pre-commit run --all-files
```

## Тесты Python

- Тесты лежат в `tests/`, для кода, который трогает файлы, используйте фикстуру `data_dir` из `tests/conftest.py`.
- Для моков — `pytest-mock` (`mocker`), не `unittest.mock`.

## Что не коммитить

- Файлы с секретами: `.env`, локальные overrides (см. `.gitignore`).
- Каталог `data/` — runtime-состояние, не часть репозитория.

## Архитектура

Краткий обзор и схемы потоков — в [.claude/architecture.md](.claude/architecture.md).
