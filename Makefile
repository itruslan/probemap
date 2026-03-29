VM_URL ?= https://victoriametrics.itruslan.ru

.PHONY: run run-frontend test lint fmt help

## Start backend in dev mode
run:
	VM_URL=$(VM_URL) uv run uvicorn main:app --reload --app-dir backend

## Start frontend in dev mode (proxies /api to localhost:8000)
run-frontend:
	cd frontend && npm run dev

## Run tests
test:
	uv run pytest

## Lint and format check
lint:
	uv run ruff check backend tests
	uv run ruff format --check backend tests

## Fix lint issues
fmt:
	uv run ruff check --fix backend tests
	uv run ruff format backend tests

## Show this help
help:
	@awk '/^## /{desc=substr($$0,4); next} /^[a-zA-Z][a-zA-Z0-9_-]*:/{print sprintf("  %-14s %s", substr($$1,1,length($$1)-1), desc); desc=""}' $(MAKEFILE_LIST)
