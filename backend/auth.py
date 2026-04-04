"""Simple token-based admin auth.

When PROBEMAP_ADMIN_PASSWORD is not set, all requests are allowed (backward-compat).
When set, write endpoints require a valid Bearer token obtained via POST /api/auth/login.
Tokens are stored in-memory — cleared on server restart (user must re-login).
"""
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

import settings

_valid_tokens: set[str] = set()
_bearer = HTTPBearer(auto_error=False)


def create_token() -> str:
    token = secrets.token_hex(32)
    _valid_tokens.add(token)
    return token


def revoke_token(token: str) -> None:
    _valid_tokens.discard(token)


def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """FastAPI dependency: passes when auth not configured or token is valid."""
    if not settings.ADMIN_PASSWORD:
        return
    if creds is None or creds.credentials not in _valid_tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin access required",
            headers={"WWW-Authenticate": "Bearer"},
        )
