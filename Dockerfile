# ---- Stage 1: build frontend ----
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npx vite build

# ---- Stage 2: production ----
FROM python:3.11-slim AS production
WORKDIR /app

# Install uv
RUN pip install uv --no-cache-dir

# Install Python dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

# Copy backend
COPY backend/ backend/

# Copy built frontend
COPY --from=frontend /build/dist/ static/

# Persistent data volume
VOLUME /app/data

ENV PROBEMAP_DATA_DIR=/app/data \
    PROBEMAP_STATIC_DIR=/app/static \
    PROBEMAP_PORT=8000 \
    PROBEMAP_CORS_ORIGINS=* \
    PROBEMAP_LOG_LEVEL=info

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "backend"]
