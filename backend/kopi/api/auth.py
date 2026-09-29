"""Access-code sign-in and signed bearer tokens (HMAC-SHA256, no server-side state)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, status

from kopi.config import Settings

TOKEN_TTL = timedelta(hours=12)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue(key: str, subject: str, scope: str = "app", ttl: timedelta = TOKEN_TTL) -> tuple[str, datetime]:
    expires = datetime.now(UTC) + ttl
    payload = _b64(json.dumps({"sub": subject, "scope": scope, "exp": int(expires.timestamp())}).encode())
    signature = _b64(hmac.new(key.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}", expires


def verify(key: str, token: str) -> dict:
    try:
        payload, signature = token.split(".")
    except ValueError:
        raise ValueError("malformed token") from None
    expected = _b64(hmac.new(key.encode(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, signature):
        raise ValueError("bad signature")
    claims = json.loads(_unb64(payload))
    if claims["exp"] < datetime.now(UTC).timestamp():
        raise ValueError("expired")
    return claims


def check_code(settings: Settings, code: str) -> bool:
    return any(secrets.compare_digest(code, allowed) for allowed in settings.access_codes)


def require_token(request: Request) -> dict:
    """Dependency: when access codes are configured, every data route needs a valid token."""
    settings: Settings = request.app.state.settings
    if not settings.auth_required:
        return {"sub": "local", "scope": "app"}
    header = request.headers.get("authorization", "")
    token = header.removeprefix("Bearer ").strip()
    try:
        return verify(settings.signing_key or "", token)
    except (ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in with an access code") from None


Authed = Depends(require_token)
