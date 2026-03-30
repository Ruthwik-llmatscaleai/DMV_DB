#!/bin/bash

# Ensure we exit on failure
set -e

# Configuration
export GOOGLE_CLOUD_PROJECT="genai-poc-424806"
export MCP_AUTH_TOKEN="zrok-secure-secret-token-123"

# Path to the shared Python virtual environment created in bq_mcp_test
PYTHON_BIN="/Users/rajasekharbandreddy/Downloads/bq_mcp_test/venv/bin/python3"

echo "================================================="
echo "🔒 STARTING SECURE DMV ATLAS MCP PIPELINE"
echo "================================================="

cd "$(dirname "$0")"

# 1. Start the internal FastMCP server (Port 8000)
echo "[1/3] Starting internal protocol server on port 8000..."
$PYTHON_BIN bq_mcp_server.py > /dev/null 2>&1 &
MCP_PID=$!

# 2. Start the Auth Gateway (Port 8001)
echo "[2/3] Starting Auth Gateway on port 8001..."
$PYTHON_BIN auth_gateway.py > /dev/null 2>&1 &
GATEWAY_PID=$!

# Trap Ctrl+C (SIGINT) to automatically kill the python background processes
trap "echo 'Shutting down servers...'; kill $MCP_PID $GATEWAY_PID; exit" EXIT

# Give the servers a second to bind to the ports
sleep 2

# 3. Start Zrok tunnel exposing ONLY the Auth Gateway (Port 8001)
echo "[3/3] Starting Zrok Public Tunnel targeting port 8001..."
echo "-------------------------------------------------"
echo "👇 COPY THE ZROK URL BELOW AND PASTE IT INTO ATLAS 👇"
zrok share public localhost:8001 --headless
