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

# --- Helper: Kill existing process on port ---
def kill_port(port):
    try:
        import subprocess
        # Get PIDs using lsof
        output = subprocess.check_output(["lsof", "-t", "-i", f":{port}"])
        for pid in output.decode().split():
            print(f"Cleaning up existing process {pid} on port {port}...")
            os.system(f"kill -9 {pid}")
    except:
        pass

kill_port(PORT)

# --- Start MCP Server with Hot-Reloading (mcp-hmr) ---
print(f"Starting MCP Server on port {PORT} with hot-reloading...")
mcp_dir = os.path.dirname(MCP_SCRIPT)
env = os.environ.copy()
env["PYTHONPATH"] = mcp_dir + os.pathsep + env.get("PYTHONPATH", "")

# Open log file to capture stdout/stderr
log_file = open(os.path.join(mcp_dir, "mcp_server.log"), "a")

mcp_process = subprocess.Popen([
    PYTHON_EXEC, "-m", "mcp_hmr",
    "bq_mcp_server:mcp",
    "-t", "http",
    "--host", "0.0.0.0",
    "--port", str(PORT)
], cwd=mcp_dir, env=env, stdout=log_file, stderr=log_file)

# Cleanup helper to close log file
import atexit
atexit.register(lambda: log_file.close())

# Wait a moment for the server to start
time.sleep(2)

# --- Start ngrok Tunnel ---
print("Starting ngrok tunnel...")
try:
    # Open a HTTP tunnel on the specified port
    tunnel = ngrok.connect(PORT, "http")
    public_url = tunnel.public_url
    print(f"ngrok tunnel opened: {public_url}")
    print(f"Direct MCP URL: {public_url}")
    print(f"Legacy MCP URL: {public_url}/mcp")
    
    # Write the base URL to a file so the agent/user can find it easily
    with open("/Users/rajasekharbandreddy/Downloads/bq_mcp_test/mcp_url.txt", "w") as f:
        f.write(public_url)

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
