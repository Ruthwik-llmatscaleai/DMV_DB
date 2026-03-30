# ── MCP Server Container ─────────────────────────────────────────────────
# Runs the FastMCP protocol server (internal, port 8000) behind the
# Auth Gateway (external, $PORT from Cloud Run).
# ─────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make the entrypoint executable
RUN chmod +x entrypoint.sh

# Cloud Run injects $PORT; the Auth Gateway will bind to it.
# Default to 8080 for local Docker testing.
ENV PORT=8080
ENV MCP_PORT=8000

EXPOSE ${PORT}

ENTRYPOINT ["./entrypoint.sh"]
