"""Storage backend abstraction: LocalBackend (filesystem) and S3Backend (S3-compatible).

Usage:
    from storage import get_store
    store = get_store()
    text = store.read_text("config.json")
    store.write_text("config.json", json.dumps(data, indent=2))

Keys are relative paths, e.g.:
    "config.json"
    "projects.json"
    "layouts/{project_id}.json"
    "icons/{name}.svg"
"""

from __future__ import annotations

import os
import pathlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Local filesystem backend
# ---------------------------------------------------------------------------


class LocalBackend:
    def __init__(self, base_dir: str) -> None:
        self._base = pathlib.Path(base_dir)

    def _path(self, key: str) -> pathlib.Path:
        return self._base / key

    def read_text(self, key: str) -> str | None:
        try:
            return self._path(key).read_text(encoding="utf-8")
        except FileNotFoundError:
            return None

    def write_text(self, key: str, content: str) -> None:
        """Atomic write via temp file + os.replace."""
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        try:
            tmp.write_text(content, encoding="utf-8")
            os.replace(tmp, p)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise

    def read_bytes(self, key: str) -> bytes | None:
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError:
            return None

    def write_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:  # noqa: ARG002
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def delete(self, key: str) -> bool:
        p = self._path(key)
        if p.exists():
            p.unlink()
            return True
        return False

    def list_prefix(self, prefix: str) -> list[str]:
        base = self._base / prefix
        if not base.exists():
            return []
        if base.is_file():
            return [prefix]
        return sorted(
            str(p.relative_to(self._base)).replace("\\", "/")
            for p in base.rglob("*")
            if p.is_file()
        )


# ---------------------------------------------------------------------------
# S3-compatible backend (requires boto3)
# ---------------------------------------------------------------------------


class S3Backend:
    def __init__(
        self,
        bucket: str,
        prefix: str = "",
        endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        region: str = "us-east-1",
    ) -> None:
        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for S3 storage. Install it with: uv add boto3"
            ) from exc

        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(retries={"max_attempts": 3, "mode": "standard"}),
        )

    def _s3key(self, key: str) -> str:
        return f"{self._prefix}/{key}" if self._prefix else key

    def _strip_prefix(self, s3key: str) -> str:
        if self._prefix and s3key.startswith(self._prefix + "/"):
            return s3key[len(self._prefix) + 1 :]
        return s3key

    def _is_not_found(self, exc: Exception) -> bool:
        try:
            from botocore.exceptions import ClientError

            if isinstance(exc, ClientError):
                return exc.response["Error"]["Code"] in ("NoSuchKey", "404", "NoSuchBucket")
        except ImportError:
            pass
        return False

    def read_text(self, key: str) -> str | None:
        data = self.read_bytes(key)
        return data.decode("utf-8") if data is not None else None

    def write_text(self, key: str, content: str) -> None:
        self.write_bytes(key, content.encode("utf-8"), "application/json")

    def read_bytes(self, key: str) -> bytes | None:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=self._s3key(key))
            return resp["Body"].read()
        except Exception as exc:
            if self._is_not_found(exc):
                return None
            raise

    def write_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=self._s3key(key),
            Body=data,
            ContentType=content_type,
        )

    def delete(self, key: str) -> bool:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=self._s3key(key))
            return True
        except Exception:
            return False

    def list_prefix(self, prefix: str) -> list[str]:
        full_prefix = self._s3key(prefix)
        try:
            paginator = self._client.get_paginator("list_objects_v2")
            keys: list[str] = []
            for page in paginator.paginate(Bucket=self._bucket, Prefix=full_prefix):
                for obj in page.get("Contents", []):
                    keys.append(self._strip_prefix(obj["Key"]))
            return sorted(keys)
        except Exception:
            return []


# ---------------------------------------------------------------------------
# Module-level backend (initialized once; replaceable in tests)
# ---------------------------------------------------------------------------

_backend: LocalBackend | S3Backend | None = None


def get_store() -> LocalBackend | S3Backend:
    global _backend
    if _backend is None:
        _backend = _init_backend()
    return _backend


def _init_backend() -> LocalBackend | S3Backend:
    import settings

    if settings.S3_BUCKET:
        return S3Backend(
            bucket=settings.S3_BUCKET,
            prefix=settings.S3_PREFIX,
            endpoint_url=settings.S3_ENDPOINT,
            access_key=settings.S3_ACCESS_KEY,
            secret_key=settings.S3_SECRET_KEY,
            region=settings.S3_REGION,
        )
    return LocalBackend(settings.DATA_DIR)
