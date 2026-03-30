"""
Security Test Suite for Corrected MCP Architecture
===================================================
Validates all 5 security invariants from the corrected architecture.

Invariants Tested:
  1. No request bypasses authentication
  2. No response contains unmasked PII
  3. No function allows raw SQL execution
  4. All database access is parameterized
  5. Internal ports are not directly accessible

Run:
  MCP_AUTH_TOKEN=test-secret-token pytest tests/test_security.py -v
"""

import re
import ast
import sys
import socket
import inspect
import pathlib
import pytest

# Add parent dir (mcp-servers/) to sys.path so we can import modules
SERVERS_DIR = pathlib.Path(__file__).resolve().parent.parent
if str(SERVERS_DIR) not in sys.path:
    sys.path.insert(0, str(SERVERS_DIR))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def valid_token(monkeypatch):
    """Set and return the auth token via env var."""
    token = "test-secret-token-for-pytest"
    monkeypatch.setenv("MCP_AUTH_TOKEN", token)
    return token


@pytest.fixture
def auth_gateway_client(valid_token):
    """ASGI test client for the auth gateway."""
    # Re-import after setting env var
    import importlib
    if "auth_gateway" in sys.modules:
        importlib.reload(sys.modules["auth_gateway"])
    from auth_gateway import app
    from starlette.testclient import TestClient
    return TestClient(app)


@pytest.fixture
def sample_pii_values():
    """Known PII patterns that must NEVER appear in any response."""
    return [
        "alex.chen@example.com",
        "sarah.miller@example.com",
        "555-0101",
        "555-0102",
        "(555) 867-5309",
        "john.doe@gmail.com",
        "123-45-6789",
        "+1 415 555 0199",
    ]


# ═══════════════════════════════════════════════════════════════════════════
# 1. AUTHENTICATION — No request bypasses auth
# ═══════════════════════════════════════════════════════════════════════════

class TestAuthentication:
    """Every endpoint must reject requests without a valid Bearer token."""

    def test_missing_auth_header_returns_401(self, auth_gateway_client):
        resp = auth_gateway_client.post("/mcp", json={})
        assert resp.status_code == 401

    def test_empty_bearer_returns_401(self, auth_gateway_client):
        resp = auth_gateway_client.post(
            "/mcp", json={}, headers={"Authorization": "Bearer "}
        )
        assert resp.status_code in (401, 403)

    def test_wrong_token_returns_403(self, auth_gateway_client):
        resp = auth_gateway_client.post(
            "/mcp", json={}, headers={"Authorization": "Bearer wrong-token-value"}
        )
        assert resp.status_code == 403

    def test_basic_auth_scheme_rejected(self, auth_gateway_client):
        resp = auth_gateway_client.post(
            "/mcp", json={}, headers={"Authorization": "Basic dXNlcjpwYXNz"}
        )
        assert resp.status_code == 401

    def test_valid_token_passes(self, auth_gateway_client, valid_token):
        resp = auth_gateway_client.post(
            "/mcp", json={}, headers={"Authorization": f"Bearer {valid_token}"}
        )
        # Should NOT be blocked by auth (may get another error from upstream, that's fine)
        assert resp.status_code not in (401, 403)

    def test_token_not_hardcoded_in_source(self):
        """Scan all .py files to ensure no token string literal exists."""
        hardcoded_pattern = re.compile(
            r"""['"]zrok-secure-secret-token-123['"]""", re.IGNORECASE
        )
        violations = []
        for py_file in SERVERS_DIR.rglob("*.py"):
            if "venv" in str(py_file) or "__pycache__" in str(py_file):
                continue
            content = py_file.read_text(errors="ignore")
            if hardcoded_pattern.search(content):
                violations.append(str(py_file))
        assert violations == [], f"Hardcoded token found in: {violations}"

    def test_token_comparison_is_timing_safe(self):
        """The auth gateway must use hmac.compare_digest, not == or !=."""
        source = (SERVERS_DIR / "auth_gateway.py").read_text()
        assert "compare_digest" in source, \
            "Token comparison must use hmac.compare_digest for timing safety"


# ═══════════════════════════════════════════════════════════════════════════
# 2. PII MASKING — No response contains unmasked PII
# ═══════════════════════════════════════════════════════════════════════════

class TestPIIMasking:
    """The PII scrubber must catch PII by VALUE, not by field name."""

    def test_email_pattern_is_redacted(self):
        from pii_scrubber import scrub
        row = {"contact_info": "alex.chen@example.com", "city": "San Francisco"}
        result = scrub(row)
        assert "@" not in str(result.get("contact_info", ""))

    def test_phone_pattern_is_redacted(self):
        from pii_scrubber import scrub
        row = {"mobile": "555-0101", "name": "Test"}
        result = scrub(row)
        assert "555-0101" not in str(result.get("mobile", ""))

    def test_ssn_pattern_is_redacted(self):
        from pii_scrubber import scrub
        row = {"tax_id": "123-45-6789"}
        result = scrub(row)
        assert "123-45-6789" not in str(result.get("tax_id", ""))

    def test_pii_in_renamed_column_still_caught(self):
        from pii_scrubber import scrub
        row = {"x": "secret.user@corp.com", "y": "(408) 555-1234"}
        result = scrub(row)
        assert "@" not in str(result["x"]), "Email in aliased column was not caught"
        assert "555-1234" not in str(result["y"]), "Phone in aliased column was not caught"

    def test_scrubber_handles_none_and_non_string(self):
        from pii_scrubber import scrub
        row = {"age": 28, "active": True, "balance": 99.50, "notes": None}
        result = scrub(row)
        assert result["age"] == 28

    def test_bulk_scan_no_pii_leaks(self, sample_pii_values):
        from pii_scrubber import scrub
        for i, pii_val in enumerate(sample_pii_values):
            row = {f"field_{i}": pii_val}
            result = scrub(row)
            assert pii_val not in str(result), \
                f"PII value leaked through scrubber: {pii_val}"


# ═══════════════════════════════════════════════════════════════════════════
# 3. RAW SQL EXECUTION — Must be completely impossible
# ═══════════════════════════════════════════════════════════════════════════

class TestNoRawSQL:
    """The MCP server must NOT expose any tool that accepts raw SQL strings."""

    def test_no_execute_sql_tool_exists(self):
        from bq_mcp_server import mcp
        import asyncio
        tools = asyncio.run(mcp._tool_manager.get_tools())
        tool_names = list(tools.keys()) if isinstance(tools, dict) else [t.name for t in tools]
        forbidden = {"execute_unrestricted_sql", "execute_sql", "run_query", "raw_query"}
        overlap = forbidden & set(tool_names)
        assert overlap == set(), f"Forbidden SQL tools still registered: {overlap}"

    def test_no_tool_accepts_query_parameter(self):
        from bq_mcp_server import mcp
        import asyncio
        tools = asyncio.run(mcp._tool_manager.get_tools())
        tool_items = tools.values() if isinstance(tools, dict) else tools
        for tool in tool_items:
            # Extract parameter names from the tool's schema
            param_names = set()
            if hasattr(tool, 'parameters') and tool.parameters:
                if hasattr(tool.parameters, 'properties') and tool.parameters.properties:
                    param_names = set(tool.parameters.properties.keys())
                elif isinstance(tool.parameters, dict) and 'properties' in tool.parameters:
                    param_names = set(tool.parameters['properties'].keys())
            param_names_lower = {p.lower() for p in param_names}
            dangerous = {"query", "sql", "statement", "raw_sql"}
            overlap = dangerous & param_names_lower
            assert overlap == set(), \
                f"Tool '{tool.name}' accepts dangerous param(s): {overlap}"

    def test_db_module_has_no_raw_query_function(self):
        import db as db_mod
        public_functions = [
            name for name, obj in inspect.getmembers(db_mod)
            if inspect.isfunction(obj) and not name.startswith("_")
        ]
        forbidden = {"execute_raw", "execute_sql", "run_query", "execute_unrestricted_sql"}
        overlap = forbidden & set(public_functions)
        assert overlap == set(), f"Raw SQL functions found in db.py: {overlap}"


# ═══════════════════════════════════════════════════════════════════════════
# 4. PARAMETERIZATION — All DB access uses ScalarQueryParameter
# ═══════════════════════════════════════════════════════════════════════════

class TestParameterization:
    """Every query in db.py must use parameterized execution, never f-strings with user data."""

    def test_no_fstring_sql_in_db_module(self):
        """Parse db.py AST to ensure no f-strings contain SQL keywords."""
        db_source = SERVERS_DIR / "db.py"
        tree = ast.parse(db_source.read_text())

        sql_keywords = {"SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE"}
        violations = []

        for node in ast.walk(tree):
            if isinstance(node, ast.JoinedStr):  # f-string
                for val in node.values:
                    if isinstance(val, ast.Constant) and isinstance(val.value, str):
                        upper = val.value.upper()
                        for kw in sql_keywords:
                            if kw in upper:
                                violations.append(
                                    f"Line {node.lineno}: f-string contains '{kw}'"
                                )
        assert violations == [], \
            f"db.py uses f-strings with SQL keywords (injection risk):\n" + "\n".join(violations)

    def test_all_queries_use_query_parameters(self):
        db_source = SERVERS_DIR / "db.py"
        content = db_source.read_text()
        query_calls = re.findall(r"client\.query\(([^)]+)\)", content)
        for call in query_calls:
            assert "job_config" in call, \
                f"client.query() called without job_config: client.query({call})"

    def test_max_bytes_billed_enforced(self):
        db_source = SERVERS_DIR / "db.py"
        content = db_source.read_text()
        config_blocks = re.findall(
            r"QueryJobConfig\(([^)]*)\)", content, re.DOTALL
        )
        for block in config_blocks:
            assert "maximum_bytes_billed" in block, \
                f"QueryJobConfig missing maximum_bytes_billed: QueryJobConfig({block})"


# ═══════════════════════════════════════════════════════════════════════════
# 5. NETWORK SECURITY — Internal ports not directly accessible
# ═══════════════════════════════════════════════════════════════════════════

class TestNetworkSecurity:
    """Internal services must bind to 127.0.0.1, not 0.0.0.0."""

    def test_mcp_server_binds_to_localhost_only(self):
        source = (SERVERS_DIR / "bq_mcp_server.py").read_text()
        assert '0.0.0.0' not in source, \
            "MCP server binds to 0.0.0.0 — must use 127.0.0.1 to prevent bypass"

    def test_auth_gateway_binds_to_localhost_only(self):
        source = (SERVERS_DIR / "auth_gateway.py").read_text()
        assert '0.0.0.0' not in source, \
            "Auth gateway binds to 0.0.0.0 — must use 127.0.0.1 to prevent bypass"

    def test_port_8000_not_reachable_externally(self):
        """Port 8000 must refuse connections from non-loopback interfaces."""
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
        finally:
            s.close()

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex((lan_ip, 8000))
        sock.close()
        assert result != 0, \
            f"Port 8000 is reachable at {lan_ip}:8000 — auth bypass possible"

    def test_env_file_in_gitignore(self):
        gitignore = SERVERS_DIR.parent / ".gitignore"
        if gitignore.exists():
            content = gitignore.read_text()
            assert ".env" in content, ".env is not in .gitignore — secrets at risk"
        else:
            pytest.fail(".gitignore does not exist — secrets at risk")
