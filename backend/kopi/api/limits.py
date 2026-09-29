"""Per-token rate limits, in memory, per container.

Kept deliberately simple: an access code gates the app, so the limits exist to stop one
browser tab or script from exhausting Claude and CPU, not to fight a determined attacker.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit, self.window = limit, window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        hits = self.hits[key]
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True


LIMITS = {
    "read": (240, 60.0),
    "overview": (40, 3600.0),
    "chat": (30, 3600.0),
}


def caller(request: Request) -> str:
    header = request.headers.get("authorization", "")
    return header.removeprefix("Bearer ").strip() or (request.client.host if request.client else "anonymous")


def limited(kind: str):
    """Dependency factory: `dependencies=[limited("read")]`."""
    from fastapi import Depends

    def check(request: Request) -> None:
        limiters: dict[str, RateLimiter] = request.app.state.limiters
        if not limiters[kind].allow(caller(request)):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"too many {kind} requests; slow down")

    return Depends(check)
