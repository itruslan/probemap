"""Simple token-based admin auth.

When PROBEMAP_ADMIN_PASSWORD is not set, all requests are allowed (backward-compat).
When set, write endpoints require a valid Bearer token obtained via POST /api/auth/login.

Tokens are stateless: `nonce.hmac(password, nonce)` — валидируются подписью, без
серверного состояния, поэтому переживают рестарты пода (деплой новой версии не
разлогинивает и не ломает молча автосохранение). Logout заносит токен в
in-memory blacklist (теряется на рестарте — приемлемо, отзыв «навсегда» = смена пароля).
"""

import hashlib
import hmac
import secrets

import settings
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_revoked_tokens: set[str] = set()
_bearer = HTTPBearer(auto_error=False)


def _sign(nonce: str) -> str:
    return hmac.new(
        settings.ADMIN_PASSWORD.encode(),
        f"probemap-admin:{nonce}".encode(),
        hashlib.sha256,
    ).hexdigest()


def create_token() -> str:
    nonce = secrets.token_hex(16)
    return f"{nonce}.{_sign(nonce)}"


def _is_valid(token: str) -> bool:
    if token in _revoked_tokens:
        return False
    nonce, _, sig = token.partition(".")
    if not nonce or not sig:
        return False
    return hmac.compare_digest(sig, _sign(nonce))


def revoke_token(token: str) -> None:
    _revoked_tokens.add(token)


def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """FastAPI dependency: passes when auth not configured or token is valid."""
    if not settings.ADMIN_PASSWORD:
        return
    if creds is None or not _is_valid(creds.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin access required",
            headers={"WWW-Authenticate": "Bearer"},
        )
