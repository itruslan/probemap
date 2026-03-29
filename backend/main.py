from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import httpx

import config as cfg_mod
import icons as icons_mod
import layout
import metrics

app = FastAPI(title="probemap")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global config
# ---------------------------------------------------------------------------

@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return cfg_mod.read_config()


@app.put("/api/config")
def put_config(body: dict[str, Any]) -> dict[str, str]:
    cfg_mod.write_config(body)
    return {"status": "ok"}


@app.post("/api/config/test")
async def test_config(body: dict[str, Any]) -> dict[str, Any]:
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    ok = await metrics.test_datasource(url)
    return {"ok": ok}


@app.get("/api/config/discover/jobs")
async def discover_jobs() -> list[dict[str, Any]]:
    try:
        return await metrics.discover_jobs()
    except RuntimeError as e:
        raise HTTPException(status_code=424, detail=str(e))


@app.get("/api/config/discover/labels")
async def discover_labels() -> list[str]:
    try:
        return await metrics.discover_labels()
    except RuntimeError as e:
        raise HTTPException(status_code=424, detail=str(e))


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@app.get("/api/projects")
def get_projects() -> list[dict[str, Any]]:
    return cfg_mod.read_projects()


@app.post("/api/projects")
def post_project(body: dict[str, Any]) -> dict[str, Any]:
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    f = body.get("filter") or {}
    return cfg_mod.create_project(name, f.get("label"), f.get("value"))


@app.put("/api/projects/{project_id}")
def put_project(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    updated = cfg_mod.update_project(project_id, body)
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str) -> dict[str, str]:
    if not cfg_mod.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "ok"}


@app.get("/api/projects/{project_id}/filter-values")
async def project_filter_values(project_id: str) -> list[str]:
    project = cfg_mod.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    f = project.get("filter") or {}
    label = f.get("label")
    if not label:
        return []
    try:
        return await metrics.get_filter_values(label)
    except RuntimeError as e:
        raise HTTPException(status_code=424, detail=str(e))


@app.get("/api/projects/{project_id}/services")
async def project_services(project_id: str) -> dict[str, Any]:
    project = cfg_mod.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    f = project.get("filter") or {}
    try:
        return await metrics.get_services(
            filter_label=f.get("label"),
            filter_value=f.get("value"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=424, detail=str(e))


@app.get("/api/projects/{project_id}/layout")
def project_get_layout(project_id: str) -> dict[str, Any]:
    if cfg_mod.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return layout.read(project_id)


@app.put("/api/projects/{project_id}/layout")
def project_put_layout(project_id: str, body: dict[str, Any]) -> dict[str, str]:
    if cfg_mod.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    layout.write(project_id, body)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Legacy endpoints (alias → "default" project, no filter)
# ---------------------------------------------------------------------------

@app.get("/api/services")
async def get_services() -> dict[str, Any]:
    try:
        return await metrics.get_services()
    except RuntimeError as e:
        raise HTTPException(status_code=424, detail=str(e))


@app.get("/api/layout")
def get_layout() -> dict[str, Any]:
    return layout.read("default")


@app.put("/api/layout")
def put_layout(body: dict[str, Any]) -> dict[str, str]:
    layout.write("default", body)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Icons
# ---------------------------------------------------------------------------

@app.get("/api/icons")
def get_icons() -> dict[str, Any]:
    return {"icons": icons_mod.list_icons()}


@app.get("/api/icons/{name}")
def serve_icon(name: str) -> FileResponse:
    path = icons_mod.icon_path(name)
    if path is None:
        raise HTTPException(status_code=404, detail="Icon not found")
    return FileResponse(str(path), media_type=icons_mod.icon_mime(path))


@app.post("/api/icons")
async def upload_icon(name: str = Form(...), file: UploadFile = File(...)) -> dict[str, str]:
    data = await file.read()
    ext = "." + (file.filename or "x.svg").rsplit(".", 1)[-1].lower()
    icons_mod.save_icon(name, data, ext)
    return {"name": name, "url": f"/api/icons/{name}"}


@app.delete("/api/icons/{name}")
def delete_icon(name: str) -> dict[str, str]:
    if not icons_mod.delete_icon(name):
        raise HTTPException(status_code=404, detail="Icon not found")
    return {"status": "ok"}
