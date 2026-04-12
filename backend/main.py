import json
import pathlib
import re
import secrets as _secrets
from contextlib import asynccontextmanager
from typing import Any

import auth
import config as cfg_mod
import icons as icons_mod
import layout
import log
import metrics
import settings
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class LoginBody(BaseModel):
    password: str = Field(..., min_length=1)


class TestDatasourceBody(BaseModel):
    url: str = Field(..., min_length=1)


class DiscoverForUrlBody(BaseModel):
    url: str = Field(..., min_length=1)
    label_map: dict[str, Any] | None = None


class CreateProjectBody(BaseModel):
    name: str = Field(..., min_length=1)
    filter: dict[str, Any] | None = None
    filters: list[Any] | None = None


class UpdateProjectBody(BaseModel):
    name: str | None = None
    filters: list[Any] | None = None


log.setup()
_log = log.get()


@asynccontextmanager
async def _lifespan(app: FastAPI):  # noqa: ARG001
    c = cfg_mod.read_config()
    ds = c.get("datasource") or {}
    url = settings.DATASOURCE_URL or (ds.get("url") or "").strip()
    storage_info = (
        f"s3://{settings.S3_BUCKET}/{settings.S3_PREFIX}"
        if settings.S3_BUCKET
        else settings.DATA_DIR
    )
    _log.info(
        "probemap starting — port=%s storage=%s datasource=%s log_level=%s",
        settings.PORT,
        storage_info,
        url or "(not configured)",
        settings.LOG_LEVEL,
    )
    yield


app = FastAPI(title="probemap", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _metrics_http_exception(e: RuntimeError) -> HTTPException:
    """424 — источник не настроен; 503 — VictoriaMetrics/Prometheus недоступен или ошибка запроса."""
    msg = str(e)
    if msg == "Datasource not configured":
        return HTTPException(status_code=424, detail=msg)
    if "VictoriaMetrics request failed" in msg:
        _log.warning("datasource error: %s", msg)
        return HTTPException(status_code=503, detail=msg)
    _log.error("metrics error: %s", msg, exc_info=e)
    return HTTPException(status_code=500, detail=msg)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness/readiness для оркестраторов (K8s и т.п.)."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@app.get("/api/auth/status")
def auth_status() -> dict[str, bool]:
    return {"required": settings.ADMIN_PASSWORD is not None}


@app.post("/api/auth/login")
def login(body: LoginBody) -> dict[str, str]:
    if not settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Auth not configured")
    if not _secrets.compare_digest(body.password.encode(), settings.ADMIN_PASSWORD.encode()):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": auth.create_token()}


@app.post("/api/auth/logout")
def api_logout(creds=Depends(auth._bearer)) -> dict[str, str]:
    if creds:
        auth.revoke_token(creds.credentials)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Global config
# ---------------------------------------------------------------------------


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return cfg_mod.read_config_for_api()


@app.put("/api/config", dependencies=[Depends(auth.require_admin)])
def put_config(body: dict[str, Any]) -> dict[str, str]:
    cfg_mod.write_config(cfg_mod.sanitize_config_write(body))
    return {"status": "ok"}


@app.post("/api/config/preview-selector")
def preview_metric_selector(body: dict[str, Any]) -> dict[str, str]:
    jobs: list[str] = []
    for j in body.get("probe_jobs") or []:
        if isinstance(j, dict) and j.get("job") and j.get("enabled"):
            jobs.append(str(j["job"]))
    pairs: list[tuple[str, str]] = []
    for x in body.get("project_filter_pairs") or []:
        if isinstance(x, dict):
            lb = (x.get("label") or "").strip()
            val = x.get("value")
            if lb and val is not None and str(val).strip() != "":
                pairs.append((lb, str(val).strip()))
    frag = metrics.build_probe_success_selector(jobs, pairs, body)
    example = f"probe_success{frag}" if frag else "probe_success"
    return {"selector": frag, "example": example}


@app.post("/api/config/test")
async def test_config(body: TestDatasourceBody) -> dict[str, Any]:
    ok = await metrics.test_datasource(body.url.strip())
    return {"ok": ok}


@app.get("/api/datasource/status")
async def datasource_status() -> dict[str, Any]:
    """Живой доступ к VictoriaMetrics (env override или сохранённый конфиг)."""
    c = cfg_mod.read_config()
    ds = c.get("datasource") or {}
    name = (ds.get("name") or "").strip() or None
    url = settings.DATASOURCE_URL or (ds.get("url") or "").strip()
    if not url:
        return {"configured": False, "ok": False, "name": name}
    ok = await metrics.test_datasource(url)
    return {"configured": True, "ok": ok, "name": name}


@app.get("/api/config/discover/jobs")
async def discover_jobs() -> list[dict[str, Any]]:
    try:
        return await metrics.discover_jobs()
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


@app.post("/api/config/discover/jobs")
async def discover_jobs_for_url(body: DiscoverForUrlBody) -> list[dict[str, Any]]:
    try:
        return await metrics.discover_jobs_for(body.url.strip(), body.label_map)
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


@app.get("/api/config/discover/labels")
async def discover_labels() -> list[str]:
    try:
        return await metrics.discover_labels()
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


@app.post("/api/config/discover/labels")
async def discover_labels_for_url(body: TestDatasourceBody) -> list[str]:
    try:
        return await metrics.discover_labels_for(body.url.strip())
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


@app.get("/api/projects")
def get_projects() -> list[dict[str, Any]]:
    return cfg_mod.read_projects()


@app.post("/api/projects", dependencies=[Depends(auth.require_admin)])
def post_project(body: CreateProjectBody) -> dict[str, Any]:
    ok, reason = cfg_mod.project_creation_allowed()
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    f = body.filter or {}
    return cfg_mod.create_project(body.name.strip(), f.get("label"), f.get("value"), body.filters)


@app.put("/api/projects/{project_id}", dependencies=[Depends(auth.require_admin)])
def put_project(project_id: str, body: UpdateProjectBody) -> dict[str, Any]:
    updated = cfg_mod.update_project(project_id, body.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@app.delete("/api/projects/{project_id}", dependencies=[Depends(auth.require_admin)])
def delete_project(project_id: str) -> dict[str, str]:
    if not cfg_mod.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "ok"}


@app.post("/api/projects/import", dependencies=[Depends(auth.require_admin)])
def import_project(payload: dict[str, Any]) -> dict[str, Any]:
    version = str(payload.get("probemap_export") or "")
    if version not in {"1"}:
        raise HTTPException(status_code=400, detail="Invalid or missing probemap_export version")
    return cfg_mod.import_project(payload, layout.write)


@app.get("/api/projects/trash", dependencies=[Depends(auth.require_admin)])
def get_trash() -> list[dict[str, Any]]:
    return cfg_mod.read_deleted_projects()


@app.post("/api/projects/{project_id}/restore", dependencies=[Depends(auth.require_admin)])
def restore_project(project_id: str) -> dict[str, Any]:
    restored = cfg_mod.restore_project(project_id)
    if restored is None:
        raise HTTPException(status_code=404, detail="Project not found in trash")
    return restored


@app.delete("/api/projects/{project_id}/permanent", dependencies=[Depends(auth.require_admin)])
def hard_delete_project(project_id: str) -> dict[str, str]:
    if not cfg_mod.hard_delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found in trash")
    return {"status": "ok"}


@app.get("/api/projects/{project_id}/export")
def export_project(project_id: str) -> Response:
    project = cfg_mod.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    layout_data = layout.read(project_id)
    payload = cfg_mod.build_export(project, layout_data)
    safe_name = re.sub(r"[^\w\-]", "_", project.get("name") or project_id)
    filename = f"probemap_{safe_name}.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/projects/{project_id}/filter-values")
async def project_filter_values(project_id: str, label: str | None = Query(None)) -> list[str]:
    project = cfg_mod.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    lab = (label or "").strip()
    if not lab:
        pairs = cfg_mod.project_metric_filter_pairs(project)
        lab = pairs[0][0] if pairs else ""
    if not lab:
        return []
    try:
        return await metrics.get_filter_values(lab)
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


@app.get("/api/config/metric-label-values")
async def metric_label_values(label: str = Query(..., min_length=1)) -> list[str]:
    try:
        return await metrics.get_filter_values(label)
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


@app.get("/api/projects/{project_id}/services")
async def project_services(project_id: str) -> dict[str, Any]:
    project = cfg_mod.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    pairs = cfg_mod.project_metric_filter_pairs(project)
    try:
        return await metrics.get_services(filter_pairs=pairs)
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e


@app.get("/api/projects/{project_id}/layout")
def project_get_layout(project_id: str) -> dict[str, Any]:
    if cfg_mod.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return layout.read(project_id)


@app.put("/api/projects/{project_id}/layout", dependencies=[Depends(auth.require_admin)])
def project_put_layout(project_id: str, body: dict[str, Any]) -> dict[str, str]:
    if cfg_mod.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    layout.write(project_id, body)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Legacy endpoints (alias → "default" project, no filter)
# ---------------------------------------------------------------------------


_DEPRECATION_HEADERS = {
    "Deprecation": "true",
    "Link": '</api/projects>; rel="successor-version"',
}


@app.get("/api/services")
async def get_services() -> JSONResponse:
    try:
        data = await metrics.get_services()
    except RuntimeError as e:
        raise _metrics_http_exception(e) from e
    return JSONResponse(content=data, headers=_DEPRECATION_HEADERS)


@app.get("/api/layout")
def get_layout() -> JSONResponse:
    return JSONResponse(content=layout.read("default"), headers=_DEPRECATION_HEADERS)


@app.put("/api/layout", dependencies=[Depends(auth.require_admin)])
def put_layout(body: dict[str, Any]) -> JSONResponse:
    layout.write("default", body)
    return JSONResponse(content={"status": "ok"}, headers=_DEPRECATION_HEADERS)


# ---------------------------------------------------------------------------
# Icons
# ---------------------------------------------------------------------------


@app.get("/api/icons")
def get_icons() -> dict[str, Any]:
    return {"icons": icons_mod.list_icons()}


@app.get("/api/icons/{name}")
def serve_icon(name: str) -> Response:
    if not icons_mod.sanitize_icon_name(name):
        raise HTTPException(status_code=400, detail="Invalid icon name")
    result = icons_mod.read_icon(name)
    if result is None:
        raise HTTPException(status_code=404, detail="Icon not found")
    data, mime = result
    return Response(content=data, media_type=mime)


_ICON_MAX_BYTES = 512 * 1024  # 512 KB


@app.post("/api/icons", dependencies=[Depends(auth.require_admin)])
async def upload_icon(name: str = Form(...), file: UploadFile = File(...)) -> dict[str, str]:
    ext = "." + (file.filename or "x.svg").rsplit(".", 1)[-1].lower()
    if ext not in icons_mod.ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    data = await file.read(_ICON_MAX_BYTES + 1)
    if len(data) > _ICON_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Icon file too large (max 512 KB)")
    safe_name = icons_mod.sanitize_icon_name(name)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid icon name")
    icons_mod.save_icon(safe_name, data, ext)
    return {"name": safe_name, "url": f"/api/icons/{safe_name}"}


@app.delete("/api/icons/{name}", dependencies=[Depends(auth.require_admin)])
def delete_icon(name: str) -> dict[str, str]:
    if not icons_mod.sanitize_icon_name(name):
        raise HTTPException(status_code=400, detail="Invalid icon name")
    if not icons_mod.delete_icon(name):
        raise HTTPException(status_code=404, detail="Icon not found")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Static frontend (production: serves built frontend from PROBEMAP_STATIC_DIR)
# Must be last — catches all non-API routes for SPA fallback.
# ---------------------------------------------------------------------------

if settings.STATIC_DIR and pathlib.Path(settings.STATIC_DIR).is_dir():
    app.mount("/", StaticFiles(directory=settings.STATIC_DIR, html=True), name="static")
