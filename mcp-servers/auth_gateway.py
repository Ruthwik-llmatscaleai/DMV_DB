"""
Layer 1 — Auth Gateway
=======================
Sits in front of the MCP server (port 8000) and enforces:
  - Bearer token authentication (loaded from $MCP_AUTH_TOKEN env var)
  - Timing-safe comparison using hmac.compare_digest
  - Rate limiting (60 requests/minute per IP)

Binds to 127.0.0.1:8001 — only reachable via zrok tunnel, not external networks.
"""

import os
import hmac
import time
from collections import defaultdict

import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route
from starlette.background import BackgroundTask

# ── Configuration ────────────────────────────────────────────────────────

VALID_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")
if not VALID_TOKEN:
    raise RuntimeError("MCP_AUTH_TOKEN environment variable is required")

TARGET_URL = "http://127.0.0.1:{}".format(os.environ.get("MCP_PORT", 8000))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_PER_MIN", 60))

# ── Rate Limiter ─────────────────────────────────────────────────────────

_request_log = defaultdict(list)   # ip -> [timestamps]


def _is_rate_limited(ip: str) -> bool:
    now = time.time()
    window = now - 60
    # Prune old entries
    _request_log[ip] = [t for t in _request_log[ip] if t > window]
    if len(_request_log[ip]) >= RATE_LIMIT:
        return True
    _request_log[ip].append(now)
    return False


# ── ASGI Proxy ───────────────────────────────────────────────────────────

client = httpx.AsyncClient(base_url=TARGET_URL, timeout=None)


async def proxy(request: Request):
    # 1. Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if _is_rate_limited(client_ip):
        return JSONResponse(
            {"error": "Too Many Requests", "message": "Rate limit exceeded"},
            status_code=429,
        )

    # 2. Authentication
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    provided_token = auth_header[7:]  # strip "Bearer "
    if not provided_token:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    if not hmac.compare_digest(provided_token, VALID_TOKEN):
        return JSONResponse({"error": "Forbidden"}, status_code=403)

    # 3. Forward to MCP server
    url = httpx.URL(path=request.url.path, query=request.url.query.encode("utf-8"))
    forwarded_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "authorization")
    }
    body = await request.body()

    req = client.build_request(request.method, url, headers=forwarded_headers, content=body)
    resp = await client.send(req, stream=True)

    return StreamingResponse(
        resp.aiter_raw(),
        status_code=resp.status_code,
        headers={
            k: v for k, v in resp.headers.items()
            if k.lower() not in ("content-encoding", "content-length", "transfer-encoding", "connection")
        },
        background=BackgroundTask(resp.aclose),
    )


# ── ASGI App ─────────────────────────────────────────────────────────────

app = Starlette(routes=[Route("/{path:path}", proxy, methods=["GET", "POST", "OPTIONS"])])

if __name__ == "__main__":
    print("Auth Gateway on 127.0.0.1:8001 → forwarding to {}".format(TARGET_URL))
    uvicorn.run(app, host="127.0.0.1", port=8001)
