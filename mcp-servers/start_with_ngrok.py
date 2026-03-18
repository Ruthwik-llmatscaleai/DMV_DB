import os
import subprocess
import time
import sys
from pyngrok import ngrok

# --- Configuration ---
PORT = 8000
VENV_PATH = "/Users/rajasekharbandreddy/Downloads/bq_mcp_test/venv"
PYTHON_EXEC = os.path.join(VENV_PATH, "bin", "python3")
MCP_SCRIPT = "/Users/rajasekharbandreddy/Downloads/bq_mcp_test/bq_mcp_server.py"

# --- Start MCP Server ---
print(f"Starting MCP Server on port {PORT}...")
# Use the venv's python to run the script
mcp_process = subprocess.Popen([PYTHON_EXEC, MCP_SCRIPT])

# Wait a moment for the server to start
time.sleep(2)

# --- Start ngrok Tunnel ---
print("Starting ngrok tunnel...")
try:
    # Open a HTTP tunnel on the specified port
    tunnel = ngrok.connect(PORT, "http")
    public_url = tunnel.public_url
    print(f"ngrok tunnel opened: {public_url}")
    print(f"MCP Endpoint: {public_url}/mcp")
    
    # Write the URL to a file so the agent/user can find it easily
    with open("/Users/rajasekharbandreddy/Downloads/bq_mcp_test/mcp_url.txt", "w") as f:
        f.write(f"{public_url}/mcp")

    print("\nKeep this process running to maintain the tunnel.")
    while True:
        if mcp_process.poll() is not None:
            print("MCP Server process terminated unexpectedly.")
            break
        time.sleep(5)
except Exception as e:
    print(f"Error starting ngrok: {e}")
finally:
    print("Shutting down...")
    mcp_process.terminate()
    ngrok.kill()
