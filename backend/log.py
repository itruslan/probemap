"""Logging setup for probemap.

Auto-detects format:
  - TTY (dev terminal) → human-readable
  - non-TTY (Docker / CI) → JSON (one object per line)

Override: PROBEMAP_LOG_FORMAT=json|text
"""

import json
import logging
import sys

import settings

_SETUP_DONE = False


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        obj: dict = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            obj["exc"] = self.formatException(record.exc_info)
        return json.dumps(obj, ensure_ascii=False)


def setup() -> None:
    global _SETUP_DONE
    if _SETUP_DONE:
        return
    _SETUP_DONE = True

    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    fmt_env = settings.LOG_FORMAT
    if fmt_env == "json":
        use_json = True
    elif fmt_env == "text":
        use_json = False
    else:
        use_json = not sys.stderr.isatty()

    handler = logging.StreamHandler(sys.stderr)
    if use_json:
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-8s %(name)s  %(message)s", "%H:%M:%S")
        )

    root = logging.getLogger()
    root.setLevel(level)
    # Remove default handlers added by uvicorn before our setup runs
    root.handlers.clear()
    root.addHandler(handler)

    # Silence noisy uvicorn access log in favour of our own if needed
    logging.getLogger("uvicorn.access").propagate = True


def get(name: str = "probemap") -> logging.Logger:
    return logging.getLogger(name)
