import json
import pathlib

import pytest


@pytest.fixture()
def data_dir(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> pathlib.Path:
    """Redirect all storage I/O to a temp directory."""
    import storage as storage_mod
    from storage import LocalBackend

    backend = LocalBackend(str(tmp_path))
    monkeypatch.setattr(storage_mod, "_backend", backend)
    monkeypatch.setenv("PROBEMAP_DATASOURCE_URL", "")

    import settings

    monkeypatch.setattr(settings, "DATASOURCE_URL", None)

    return tmp_path


@pytest.fixture()
def config_with_datasource(data_dir: pathlib.Path) -> dict:
    import config as cfg_mod

    cfg = {
        "datasource": {"url": "http://vm:8428"},
        "probe_jobs": [{"job": "blackbox", "enabled": True}],
        "label_map": cfg_mod.DEFAULT_LABEL_MAP,
        "metric_filter_rules": [],
    }
    (data_dir / "config.json").write_text(json.dumps(cfg))
    return cfg


@pytest.fixture()
def fake_vm_status_series() -> list[dict]:
    return [
        {
            "metric": {
                "service": "api",
                "port": "443",
                "instance": "dc1",
                "module": "https_2xx",
                "job": "blackbox",
                "env": "prod",
            },
            "value": [1700000000, "1"],
        },
        {
            "metric": {
                "service": "api",
                "port": "443",
                "instance": "dc2",
                "module": "https_2xx",
                "job": "blackbox",
                "env": "prod",
            },
            "value": [1700000000, "0"],
        },
    ]


@pytest.fixture()
def fake_vm_duration_series() -> list[dict]:
    return [
        {
            "metric": {
                "service": "api",
                "port": "443",
                "instance": "dc1",
                "module": "https_2xx",
                "job": "blackbox",
            },
            "value": [1700000000, "0.123"],
        },
    ]
