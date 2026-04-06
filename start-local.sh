#!/bin/bash
# =============================================================
# DMV DB Connect — Local Development Startup
# =============================================================
# Starts all services needed for local development:
#   1. Salesforce MCP Bridge (port 8002)
#   2. Backend server (port 3001)
#   3. Vite dev server (port 5173/5174)
#
# Usage:
#   ./start-local.sh           — start backend + frontend only
#   ./start-local.sh --sf      — also start Salesforce bridge
#
# After starting with --sf, run in another terminal:
#   zrok share public http://localhost:8002
# Then add the zrok URL + /sse as a connector in the UI.
# =============================================================

set -e
cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    kill $(jobs -p) 2>/dev/null
    wait 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT

# 1. Optionally start SF bridge
if [[ "$1" == "--sf" ]]; then
    echo -e "${GREEN}[1/3] Starting Salesforce MCP Bridge on port 8002...${NC}"
    node mcp-sf-bridge.js &
    sleep 2
    echo -e "${YELLOW}  → Remember to run 'zrok share public http://localhost:8002' in another terminal${NC}"
    echo -e "${YELLOW}  → Then add the zrok URL + /sse as a connector in the UI${NC}"
    echo ""
fi

# 2. Start backend
echo -e "${GREEN}[2/3] Starting backend server on port 3001...${NC}"
node server.js &
sleep 1

# 3. Start frontend
echo -e "${GREEN}[3/3] Starting Vite dev server...${NC}"
npm run dev &

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo -e "${GREEN}  Frontend: http://localhost:5173${NC}"
echo -e "${GREEN}  Backend:  http://localhost:3001${NC}"
if [[ "$1" == "--sf" ]]; then
echo -e "${GREEN}  SF Bridge: http://localhost:8002/sse${NC}"
fi
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "Press Ctrl+C to stop all services."

wait
