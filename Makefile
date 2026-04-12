.PHONY: up down docker-up docker-down test fmt help

## Start backend + frontend in dev mode
up:
	@bash -c 'set -a; [ -f .env ] && . ./.env; set +a; \
	  trap "kill 0" INT TERM EXIT; \
	  uv run uvicorn main:app --reload --app-dir backend & \
	  (cd frontend && npm run dev) & \
	  wait'

## Stop backend + frontend dev processes
down:
	-lsof -ti :8000 | xargs kill -9 2>/dev/null
	-lsof -ti :5173 | xargs kill -9 2>/dev/null
	-pkill -9 -f "uvicorn main:app" 2>/dev/null
	-pkill -9 -f "vite" 2>/dev/null

## Start Docker Compose (build if needed)
docker-up:
	docker compose up --build -d

## Stop Docker Compose
docker-down:
	docker compose down

## Run tests
test:
	uv run pytest

## Fix lint and format issues
fmt:
	uv run ruff check --fix backend tests
	uv run ruff format backend tests

## Show this help
help:
	@awk '/^## /{desc=substr($$0,4); next} /^[a-zA-Z][a-zA-Z0-9_-]*:/{print sprintf("  %-12s %s", substr($$1,1,length($$1)-1), desc); desc=""}' $(MAKEFILE_LIST)
