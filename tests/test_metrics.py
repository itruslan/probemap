import json
import pathlib

import pytest
import pytest_mock

import metrics


# ---------------------------------------------------------------------------
# Pure functions
# ---------------------------------------------------------------------------


class TestPromqlEscape:
    def test_plain_value(self) -> None:
        assert metrics._promql_escape_label_value("hello") == "hello"

    def test_double_quote(self) -> None:
        assert metrics._promql_escape_label_value('say "hi"') == 'say \\"hi\\"'

    def test_backslash(self) -> None:
        assert metrics._promql_escape_label_value("a\\b") == "a\\\\b"

    def test_both(self) -> None:
        assert metrics._promql_escape_label_value('a\\"b') == 'a\\\\\\"b'

    def test_empty(self) -> None:
        assert metrics._promql_escape_label_value("") == ""


class TestBuildProbeSuccessSelector:
    def test_empty_returns_empty(self) -> None:
        assert metrics.build_probe_success_selector([], [], {}) == ""

    def test_single_job(self) -> None:
        sel = metrics.build_probe_success_selector(["blackbox"], [], {})
        assert sel == '{job=~"blackbox"}'

    def test_multiple_jobs(self) -> None:
        sel = metrics.build_probe_success_selector(["a", "b"], [], {})
        assert 'job=~"a|b"' in sel

    def test_project_pairs(self) -> None:
        sel = metrics.build_probe_success_selector([], [("env", "prod")], {})
        assert 'env="prod"' in sel

    def test_filter_rules_eq(self) -> None:
        cfg = {"metric_filter_rules": [{"label": "env", "value": "prod", "op": "eq"}]}
        sel = metrics.build_probe_success_selector([], [], cfg)
        assert 'env="prod"' in sel

    def test_filter_rules_re(self) -> None:
        cfg = {"metric_filter_rules": [{"label": "env", "value": "pr.*", "op": "re"}]}
        sel = metrics.build_probe_success_selector([], [], cfg)
        assert 'env=~"pr.*"' in sel

    def test_filter_rules_ne(self) -> None:
        cfg = {"metric_filter_rules": [{"label": "env", "value": "dev", "op": "ne"}]}
        sel = metrics.build_probe_success_selector([], [], cfg)
        assert 'env!="dev"' in sel

    def test_filter_rules_nre(self) -> None:
        cfg = {"metric_filter_rules": [{"label": "env", "value": "dev.*", "op": "nre"}]}
        sel = metrics.build_probe_success_selector([], [], cfg)
        assert 'env!~"dev.*"' in sel

    def test_skips_invalid_rules(self) -> None:
        cfg = {"metric_filter_rules": ["not-a-dict", {"label": "", "value": "x", "op": "eq"}]}
        sel = metrics.build_probe_success_selector([], [], cfg)
        assert sel == ""

    def test_escapes_special_chars_in_value(self) -> None:
        sel = metrics.build_probe_success_selector([], [("svc", 'a"b')], {})
        assert '\\"' in sel


class TestConsensusLabels:
    def test_empty_returns_empty(self) -> None:
        assert metrics._consensus_labels([], set()) == {}

    def test_single_metric(self) -> None:
        result = metrics._consensus_labels([{"env": "prod", "job": "bx"}], {"job"})
        assert result == {"env": "prod"}

    def test_consistent_label(self) -> None:
        ms = [{"env": "prod"}, {"env": "prod"}]
        assert metrics._consensus_labels(ms, set()) == {"env": "prod"}

    def test_inconsistent_label_excluded(self) -> None:
        ms = [{"env": "prod"}, {"env": "staging"}]
        assert "env" not in metrics._consensus_labels(ms, set())

    def test_denylist_excluded(self) -> None:
        ms = [{"job": "bx", "env": "prod"}]
        result = metrics._consensus_labels(ms, {"job"})
        assert "job" not in result
        assert result["env"] == "prod"

    def test_empty_value_excluded(self) -> None:
        ms = [{"env": ""}, {"env": ""}]
        assert metrics._consensus_labels(ms, set()) == {}


class TestApplyKindRules:
    def test_no_rules_returns_none(self) -> None:
        assert metrics._apply_kind_rules({"app": "nginx"}, []) is None

    def test_first_match_wins(self) -> None:
        rules = [
            {"label": "app", "value": "nginx", "kind": "web"},
            {"label": "app", "value": "nginx", "kind": "proxy"},
        ]
        assert metrics._apply_kind_rules({"app": "nginx"}, rules) == "web"

    def test_no_match_returns_none(self) -> None:
        rules = [{"label": "app", "value": "redis", "kind": "db"}]
        assert metrics._apply_kind_rules({"app": "nginx"}, rules) is None

    def test_skips_invalid_rule(self) -> None:
        rules = ["not-a-dict", {"label": "", "value": "x", "kind": "k"}]
        assert metrics._apply_kind_rules({"app": "x"}, rules) is None

    def test_label_missing_from_service(self) -> None:
        rules = [{"label": "tier", "value": "db", "kind": "database"}]
        assert metrics._apply_kind_rules({"app": "pg"}, rules) is None


class TestModuleToType:
    @pytest.mark.parametrize(
        "module,expected",
        [
            ("http_2xx", "http"),
            ("https_2xx", "http"),
            ("icmp", "icmp"),
            ("ping", "icmp"),
            ("udp_check", "udp"),
            ("dns_tcp", "dns"),
            ("tcp_connect", "tcp"),
            ("TCP_PLAIN", "tcp"),
        ],
    )
    def test_module_mapping(self, module: str, expected: str) -> None:
        assert metrics._module_to_type(module) == expected


class TestServiceProbeKind:
    def test_http_returns_service(self) -> None:
        ports = [{"probe_types": ["http", "icmp"]}]
        assert metrics._service_probe_kind(ports) == "service"

    def test_icmp_only_returns_resource(self) -> None:
        ports = [{"probe_types": ["icmp"]}]
        assert metrics._service_probe_kind(ports) == "resource"

    def test_dns_returns_resource(self) -> None:
        ports = [{"probe_types": ["dns"]}]
        assert metrics._service_probe_kind(ports) == "resource"

    def test_tcp_returns_service(self) -> None:
        ports = [{"probe_types": ["tcp"]}]
        assert metrics._service_probe_kind(ports) == "service"

    def test_empty_ports_returns_service(self) -> None:
        assert metrics._service_probe_kind([]) == "service"

    def test_no_probe_types_key(self) -> None:
        ports = [{}]
        assert metrics._service_probe_kind(ports) == "service"


# ---------------------------------------------------------------------------
# Async functions (httpx mocked)
# ---------------------------------------------------------------------------


class TestGetServices:
    async def test_returns_services_and_probe_sources(
        self,
        mocker: pytest_mock.MockerFixture,
        data_dir: pathlib.Path,
        config_with_datasource: dict,
        fake_vm_status_series: list[dict],
        fake_vm_duration_series: list[dict],
    ) -> None:
        mock_query = mocker.patch(
            "metrics._query",
            side_effect=[fake_vm_status_series, fake_vm_duration_series],
        )

        result = await metrics.get_services()

        assert "services" in result
        assert "probe_sources" in result
        services = result["services"]
        assert len(services) == 1
        assert services[0]["name"] == "api"
        assert mock_query.call_count == 2

    async def test_warn_status_when_mixed_results(
        self,
        mocker: pytest_mock.MockerFixture,
        data_dir: pathlib.Path,
        config_with_datasource: dict,
        fake_vm_status_series: list[dict],
        fake_vm_duration_series: list[dict],
    ) -> None:
        mocker.patch(
            "metrics._query",
            side_effect=[fake_vm_status_series, fake_vm_duration_series],
        )

        result = await metrics.get_services()
        svc = result["services"][0]
        assert svc["ports"][0]["status"] == "warn"

    async def test_runtime_error_on_query_failure(
        self,
        mocker: pytest_mock.MockerFixture,
        data_dir: pathlib.Path,
        config_with_datasource: dict,
    ) -> None:
        mocker.patch("metrics._query", side_effect=RuntimeError("VictoriaMetrics request failed: conn"))

        with pytest.raises(RuntimeError, match="VictoriaMetrics request failed"):
            await metrics.get_services()


class TestDiscoverJobsFor:
    async def test_returns_jobs_with_sources(
        self, mocker: pytest_mock.MockerFixture
    ) -> None:
        series = [
            {"metric": {"job": "blackbox", "instance": "dc1"}},
            {"metric": {"job": "blackbox", "instance": "dc2"}},
            {"metric": {"job": "other"}},
        ]
        mocker.patch("metrics._query", return_value=series)

        result = await metrics.discover_jobs_for("http://vm:8428")

        assert len(result) == 2
        bx = next(r for r in result if r["job"] == "blackbox")
        assert sorted(bx["probe_sources"]) == ["dc1", "dc2"]

    async def test_raises_on_empty_url(self) -> None:
        with pytest.raises(RuntimeError, match="Datasource not configured"):
            await metrics.discover_jobs_for("")


class TestTestDatasource:
    async def test_returns_true_on_200(
        self, mocker: pytest_mock.MockerFixture
    ) -> None:
        mock_resp = mocker.MagicMock()
        mock_resp.status_code = 200
        mock_client = mocker.AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = False
        mock_client.get.return_value = mock_resp
        mocker.patch("metrics.httpx.AsyncClient", return_value=mock_client)

        assert await metrics.test_datasource("http://vm:8428") is True

    async def test_returns_false_on_exception(
        self, mocker: pytest_mock.MockerFixture
    ) -> None:
        import httpx

        mock_client = mocker.AsyncMock()
        mock_client.__aenter__.side_effect = httpx.ConnectError("refused")
        mocker.patch("metrics.httpx.AsyncClient", return_value=mock_client)

        assert await metrics.test_datasource("http://bad:9999") is False
