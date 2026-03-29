from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import layout
import metrics

app = FastAPI(title="pingmap")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/services")
async def get_services() -> dict[str, Any]:
    return await metrics.get_services()


@app.get("/api/layout")
def get_layout() -> dict[str, Any]:
    return layout.read()


@app.put("/api/layout")
def put_layout(body: dict[str, Any]) -> dict[str, str]:
    layout.write(body)
    return {"status": "ok"}
