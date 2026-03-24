import sys
import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import StreamingResponse, JSONResponse
from starlette.background import BackgroundTask

app = Starlette()
TARGET_URL = "http://localhost:8000"
VALID_TOKEN = "zrok-secure-secret-token-123"

client = httpx.AsyncClient(base_url=TARGET_URL, timeout=None)

@app.route("/{path:path}", methods=["GET", "POST", "OPTIONS"])
async def proxy(request: Request):
    if request.method == "OPTIONS":
        return JSONResponse({"status": "ok"})
        
    auth_header = request.headers.get("Authorization")
    if not auth_header or auth_header != f"Bearer {VALID_TOKEN}":
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
        
    url = httpx.URL(path=request.url.path, query=request.url.query.encode("utf-8"))
    
    req = client.build_request(
        request.method,
        url,
        headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "authorization")},
        content=await request.body()
    )
    
    resp = await client.send(req, stream=True)
    
    return StreamingResponse(
        resp.aiter_raw(),
        status_code=resp.status_code,
        headers={k: v for k, v in resp.headers.items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding", "connection")},
        background=BackgroundTask(resp.aclose),
    )

if __name__ == "__main__":
    print("Starting secure Auth Proxy on port 8001 (Forwarding to 8000)...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
