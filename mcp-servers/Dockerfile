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

# Cloud Run injects $PORT; the server will bind to it directly.
ENV PORT=8080

EXPOSE ${PORT}

ENTRYPOINT ["./entrypoint.sh"]
