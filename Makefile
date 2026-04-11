.PHONY: run run-frontend dev kill test lint fmt help

## Start backend in dev mode
run:
	uv run uvicorn main:app --reload --app-dir backend

## Start frontend in dev mode (proxies /api to localhost:8000)
run-frontend:
	cd frontend && npm run dev

## Start backend + frontend together
dev:
	@trap 'kill 0' INT TERM EXIT; \
	(uv run uvicorn main:app --reload --app-dir backend) & \
	(cd frontend && npm run dev) & \
	wait

## Kill backend and frontend dev processes
kill:
	-lsof -ti :8000 | xargs kill -9 2>/dev/null
	-lsof -ti :5173 | xargs kill -9 2>/dev/null
	-pkill -9 -f "uvicorn main:app" 2>/dev/null
	-pkill -9 -f "vite" 2>/dev/null

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
