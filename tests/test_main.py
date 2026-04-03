import json
import pathlib

import config as cfg_mod
import httpx
import pytest
import pytest_mock
from fastapi.testclient import TestClient
from main import app


@pytest.fixture()
def client(data_dir: pathlib.Path) -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


class TestHealth:
    def test_returns_ok(self, client: TestClient) -> None:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


class TestGetConfig:
    def test_returns_default_config(self, client: TestClient) -> None:
        r = client.get("/api/config")
        assert r.status_code == 200
        data = r.json()
        assert "probe_jobs" in data
        assert "label_map" in data

    def test_returns_saved_config(self, client: TestClient, data_dir: pathlib.Path) -> None:
        cfg = {
            "datasource": {"url": "http://vm:8428"},
            "probe_jobs": [{"job": "bx", "enabled": True}],
            "label_map": cfg_mod.DEFAULT_LABEL_MAP,
            "metric_filter_rules": [],
        }
        (data_dir / "config.json").write_text(json.dumps(cfg))

        r = client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["datasource"]["url"] == "http://vm:8428"


class TestPutConfig:
    def test_saves_and_returns_ok(self, client: TestClient) -> None:
        payload = {
            "datasource": {"url": "http://vm:8428"},
            "probe_jobs": [],
            "label_map": cfg_mod.DEFAULT_LABEL_MAP,
            "metric_filter_rules": [],
        }
        r = client.put("/api/config", json=payload)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_strips_env_key_before_save(self, client: TestClient, data_dir: pathlib.Path) -> None:
        payload = {"datasource_url_from_env": True, "probe_jobs": []}
        client.put("/api/config", json=payload)
        saved = json.loads((data_dir / "config.json").read_text())
        assert "datasource_url_from_env" not in saved


class TestProjects:
    def test_create_and_list(
        self,
        client: TestClient,
        data_dir: pathlib.Path,
        mocker: pytest_mock.MockerFixture,
    ) -> None:
        mocker.patch("main.cfg_mod.project_creation_allowed", return_value=(True, ""))

        r = client.post(
            "/api/projects",
            json={"name": "Test Project", "filter_label": "env", "filter_value": "prod"},
        )
        assert r.status_code == 200
        p = r.json()
        assert p["name"] == "Test Project"

        r2 = client.get("/api/projects")
        assert r2.status_code == 200
        projects = r2.json()
        assert any(proj["name"] == "Test Project" for proj in projects)

    def test_create_blocked_when_datasource_missing(
        self,
        client: TestClient,
        mocker: pytest_mock.MockerFixture,
    ) -> None:
        mocker.patch(
            "main.cfg_mod.project_creation_allowed",
            return_value=(False, "datasource_not_configured"),
        )
        r = client.post("/api/projects", json={"name": "X"})
        assert r.status_code == 400
        assert r.json()["detail"] == "datasource_not_configured"

    def test_delete_project(
        self,
        client: TestClient,
        mocker: pytest_mock.MockerFixture,
    ) -> None:
        mocker.patch("main.cfg_mod.project_creation_allowed", return_value=(True, ""))
        r = client.post("/api/projects", json={"name": "ToDelete"})
        pid = r.json()["id"]

        r2 = client.delete(f"/api/projects/{pid}")
        assert r2.status_code == 200

    def test_delete_nonexistent_returns_404(self, client: TestClient) -> None:
        r = client.delete("/api/projects/nonexistent")
        assert r.status_code == 404


class TestGetServices:
    async def test_returns_503_when_vm_unavailable(
        self,
        client: TestClient,
        data_dir: pathlib.Path,
        config_with_datasource: dict,
        mocker: pytest_mock.MockerFixture,
    ) -> None:
        mocker.patch(
            "main.metrics.get_services",
            side_effect=RuntimeError("VictoriaMetrics request failed: conn error"),
        )
        project_id = cfg_mod.create_project("P", filter_label="env", filter_value="prod")["id"]
        r = client.get(f"/api/projects/{project_id}/services")
        assert r.status_code == 503

    async def test_returns_424_when_datasource_not_configured(
        self,
        client: TestClient,
        data_dir: pathlib.Path,
        mocker: pytest_mock.MockerFixture,
    ) -> None:
        mocker.patch(
            "main.metrics.get_services",
            side_effect=RuntimeError("Datasource not configured"),
        )
        project_id = cfg_mod.create_project("P")["id"]
        r = client.get(f"/api/projects/{project_id}/services")
        assert r.status_code == 424
