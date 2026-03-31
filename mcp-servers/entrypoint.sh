#!/bin/bash
set -e

echo "🚀 Starting Secure BigQuery MCP Server on port ${PORT:-8080}..."
exec python -u bq_mcp_server.py
