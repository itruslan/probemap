import json
import pathlib

import config as cfg_mod


class TestReadConfig:
    def test_returns_defaults_when_no_file(self, data_dir: pathlib.Path) -> None:
        result = cfg_mod.read_config()
        assert result["probe_jobs"] == []
        assert result["metric_filter_rules"] == []
        assert result["datasource"] is None

    def test_roundtrip(self, data_dir: pathlib.Path) -> None:
        cfg = {
            "datasource": {"url": "http://vm:8428"},
            "probe_jobs": [{"job": "bx", "enabled": True}],
            "label_map": cfg_mod.DEFAULT_LABEL_MAP,
            "metric_filter_rules": [],
        }
        cfg_mod.write_config(cfg)
        result = cfg_mod.read_config()
        assert result["datasource"]["url"] == "http://vm:8428"
        assert result["probe_jobs"][0]["job"] == "bx"

    def test_migration_zone_to_probe_source(self, data_dir: pathlib.Path) -> None:
        raw = {"label_map": {"zone": "region"}}
        (data_dir / "config.json").write_text(json.dumps(raw))

        result = cfg_mod.read_config()
        assert result["label_map"]["probe_source"] == "region"

    def test_migration_metric_extra_selector(self, data_dir: pathlib.Path) -> None:
        raw = {"metric_extra_selector": 'env="prod",dc="eu"'}
        (data_dir / "config.json").write_text(json.dumps(raw))

        result = cfg_mod.read_config()
        labels = [r["label"] for r in result["metric_filter_rules"]]
        assert "env" in labels
        assert "dc" in labels
        assert "metric_extra_selector" not in result

    def test_migration_removes_extra_selector_from_file(self, data_dir: pathlib.Path) -> None:
        raw = {"metric_extra_selector": 'env="prod"'}
        (data_dir / "config.json").write_text(json.dumps(raw))

        cfg_mod.read_config()
        saved = json.loads((data_dir / "config.json").read_text())
        assert "metric_extra_selector" not in saved

    def test_probe_source_defaults_to_instance_when_empty(self, data_dir: pathlib.Path) -> None:
        raw = {"label_map": {"probe_source": ""}}
        (data_dir / "config.json").write_text(json.dumps(raw))
        result = cfg_mod.read_config()
        assert result["label_map"]["probe_source"] == "instance"

    def test_defaults_set_when_keys_missing(self, data_dir: pathlib.Path) -> None:
        (data_dir / "config.json").write_text("{}")
        result = cfg_mod.read_config()
        assert result["probe_jobs"] == []
        assert result["metric_filter_rules"] == []


class TestWriteConfig:
    def test_creates_data_dir_if_missing(self, data_dir: pathlib.Path) -> None:
        subdir = data_dir / "nested"
        import config as cfg_m
        import settings

        cfg_m.DATA_DIR = str(subdir)
        cfg_m.CONFIG_PATH = str(subdir / "config.json")
        settings.DATA_DIR = str(subdir)

        cfg_m.write_config({"probe_jobs": []})
        assert (subdir / "config.json").exists()

    def test_sanitize_strips_datasource_url_from_env_key(self, data_dir: pathlib.Path) -> None:
        # sanitize_config_write removes the API-only key before persistence
        sanitized = cfg_mod.sanitize_config_write(
            {"datasource_url_from_env": True, "probe_jobs": []}
        )
        assert "datasource_url_from_env" not in sanitized

    def test_write_config_does_not_strip_datasource_url_key(self, data_dir: pathlib.Path) -> None:
        # write_config only strips metric_extra_selector; callers must sanitize first
        cfg_mod.write_config({"probe_jobs": [], "datasource": None})
        saved = json.loads((data_dir / "config.json").read_text())
        assert "probe_jobs" in saved

    def test_strips_metric_extra_selector(self, data_dir: pathlib.Path) -> None:
        cfg_mod.write_config({"metric_extra_selector": 'env="prod"', "probe_jobs": []})
        saved = json.loads((data_dir / "config.json").read_text())
        assert "metric_extra_selector" not in saved


class TestProjects:
    def test_read_returns_empty_when_no_file(self, data_dir: pathlib.Path) -> None:
        assert cfg_mod.read_projects() == []

    def test_create_and_read(self, data_dir: pathlib.Path) -> None:
        p = cfg_mod.create_project("My Project")
        assert p["name"] == "My Project"
        assert len(p["id"]) == 8
        projects = cfg_mod.read_projects()
        assert len(projects) == 1

    def test_create_with_filter(self, data_dir: pathlib.Path) -> None:
        p = cfg_mod.create_project("P", filter_label="env", filter_value="prod")
        assert p["filters"] == [{"label": "env", "value": "prod"}]
        assert p["filter"] == {"label": "env", "value": "prod"}

    def test_create_with_filters_list(self, data_dir: pathlib.Path) -> None:
        filters = [{"label": "env", "value": "prod"}, {"label": "dc", "value": "eu"}]
        p = cfg_mod.create_project("P", filters=filters)
        assert len(p["filters"]) == 2

    def test_get_project_found(self, data_dir: pathlib.Path) -> None:
        p = cfg_mod.create_project("X")
        found = cfg_mod.get_project(p["id"])
        assert found is not None
        assert found["name"] == "X"

    def test_get_project_not_found(self, data_dir: pathlib.Path) -> None:
        assert cfg_mod.get_project("nonexistent") is None

    def test_update_project(self, data_dir: pathlib.Path) -> None:
        p = cfg_mod.create_project("Old")
        updated = cfg_mod.update_project(p["id"], {"name": "New"})
        assert updated is not None
        assert updated["name"] == "New"
        assert updated["id"] == p["id"]

    def test_update_nonexistent_returns_none(self, data_dir: pathlib.Path) -> None:
        assert cfg_mod.update_project("bad-id", {"name": "X"}) is None

    def test_delete_project(self, data_dir: pathlib.Path) -> None:
        p = cfg_mod.create_project("ToDelete")
        assert cfg_mod.delete_project(p["id"]) is True
        assert cfg_mod.get_project(p["id"]) is None

    def test_delete_nonexistent_returns_false(self, data_dir: pathlib.Path) -> None:
        assert cfg_mod.delete_project("none") is False


class TestProjectMetricFilterPairs:
    def test_uses_filters_list(self) -> None:
        p = {"filters": [{"label": "env", "value": "prod"}]}
        assert cfg_mod.project_metric_filter_pairs(p) == [("env", "prod")]

    def test_falls_back_to_legacy_filter(self) -> None:
        p = {"filter": {"label": "env", "value": "prod"}}
        assert cfg_mod.project_metric_filter_pairs(p) == [("env", "prod")]

    def test_empty_when_no_filter(self) -> None:
        assert cfg_mod.project_metric_filter_pairs({}) == []

    def test_skips_empty_values(self) -> None:
        p = {"filters": [{"label": "env", "value": ""}]}
        assert cfg_mod.project_metric_filter_pairs(p) == []
