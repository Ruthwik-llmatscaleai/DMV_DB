#!/bin/bash
set -e

echo "🚀 Starting MCP Server on internal port ${MCP_PORT:-8000}..."
python bq_mcp_server.py &
MCP_PID=$!

# Give the internal server a moment to bind
sleep 2

echo "🔒 Starting Auth Gateway on external port ${PORT:-8080}..."
python auth_gateway.py

# If the gateway exits, clean up the background server
kill $MCP_PID 2>/dev/null
