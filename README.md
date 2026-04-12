# probemap

[![CI](https://github.com/itruslan/probemap/actions/workflows/ci.yml/badge.svg)](https://github.com/itruslan/probemap/actions/workflows/ci.yml)

Live service topology map built on [blackbox_exporter](https://github.com/prometheus/blackbox_exporter) probe results. Pulls `probe_success` from [VictoriaMetrics](https://victoriametrics.com/) (or any Prometheus-compatible API) and renders a drag-and-drop canvas with real-time status.

## Features

- **Live status** — nodes turn green/red/grey based on `probe_success` polled every 30 s
- **Multiple projects** — each project has its own canvas and service filter
- **Custom objects** — add freeform nodes with custom icons and labels alongside monitored services
- **Areas** — group nodes into resizable labeled zones
- **Endpoint links** — attach a URL to any node, auto-filled from metric labels
- **Path tracing** — highlight a route through the graph
- **Admin / viewer roles** — set `PROBEMAP_ADMIN_PASSWORD` to enable read-only viewer access
- **Docker-ready** — single `docker compose up --build`

## Quick start

```bash
cp .env.example .env          # set PROBEMAP_DATASOURCE_URL
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000).

## Configuration

All options are set via environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PROBEMAP_DATASOURCE_URL` | — | VictoriaMetrics / Prometheus URL |
| `PROBEMAP_ADMIN_PASSWORD` | — | If set, enables admin/viewer split; unset = no auth |
| `PROBEMAP_DATA_DIR` | `./data` | Directory for config, projects, layouts, icons |
| `PROBEMAP_HOST_PORT` | `8000` | Host port for `docker compose` |
| `PROBEMAP_LOG_LEVEL` | `info` | Log level (`debug` / `info` / `warning`) |
| `PROBEMAP_CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |
| `PROBEMAP_S3_ENDPOINT` | — | S3-compatible endpoint (MinIO, AWS S3, etc.) |
| `PROBEMAP_S3_BUCKET` | — | S3 bucket name; enables S3 storage when set |
| `PROBEMAP_S3_ACCESS_KEY` | — | S3 access key |
| `PROBEMAP_S3_SECRET_KEY` | — | S3 secret key |
| `PROBEMAP_S3_REGION` | `us-east-1` | S3 region |
| `PROBEMAP_S3_PREFIX` | — | Key prefix inside the bucket (optional) |

After first start, open Settings to point probemap at your datasource and configure probe jobs.

## Development

Requirements: [uv](https://docs.astral.sh/uv/) (Python 3.11+), Node.js 22.

```bash
cp .env.example .env
uv sync --group dev
uv run pre-commit install
cd frontend && npm ci && cd ..
make up           # backend :8000 + Vite :5173
```

```bash
make test         # pytest
make fmt          # ruff autofix + format
cd frontend && npm run lint && npm run build
```

## License

[MIT](LICENSE)
