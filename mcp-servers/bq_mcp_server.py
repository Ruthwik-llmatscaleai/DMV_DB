"""
Layer 2 — MCP Protocol Server (Secured)
========================================
Exposes ONLY predefined, named tools via FastMCP.

Removed:
  ❌ execute_unrestricted_sql
  ❌ insert_record (generic raw insert)

All tools delegate to db.py which handles parameterization and PII scrubbing.
Binds to 127.0.0.1 only — not accessible from external networks.
"""

import os
from typing import Any, Dict, List
from fastmcp import FastMCP
import db

INSTRUCTIONS = """
You are a BigQuery data assistant.
1. Use 'list_datasets' and 'list_tables' tools for discovery.
2. Use 'get_table_schema' to inspect columns before querying.
3. Use the specific query tools (get_sales_orders, get_customer_by_id, etc.) to retrieve data.
4. Use 'insert_sales_order' to create new orders.
5. You do NOT have access to run arbitrary SQL. Only the tools listed here are available.
"""

mcp = FastMCP(
    "secure-bigquery-mcp",
    instructions=INSTRUCTIONS
)


# ── Discovery Tools ──────────────────────────────────────────────────────

@mcp.tool()
def list_datasets() -> List[str]:
    """List all available datasets in the current BigQuery project."""
    return db.list_datasets()


@mcp.tool()
def list_tables(dataset_id: str) -> List[str]:
    """List all tables in a specific BigQuery dataset."""
    return db.list_tables(dataset_id)


@mcp.tool()
def get_table_schema(table_id: str, dataset_id: str = "demo_mcp") -> List[Dict[str, str]]:
    """Get the schema (columns, types, modes) of a specific BigQuery table."""
    return db.get_table_schema(table_id, dataset_id)


# ── Sales Order Tools ────────────────────────────────────────────────────

@mcp.tool()
def get_sales_orders(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve recent sales orders joined with customer data. Max 1000."""
    return db.get_sales_orders(limit=limit)


@mcp.tool()
def get_order_by_id(order_id: str) -> List[Dict[str, Any]]:
    """Retrieve a single sales order by its order_id."""
    return db.get_order_by_id(order_id)


@mcp.tool()
def insert_sales_order(
    order_id: str,
    customer_id: str,
    product_id: int,
    quantity: int,
    order_amount: float,
    product_category: str,
    payment_method: str,
) -> str:
    """Insert a new sales order. All fields are required."""
    return db.insert_sales_order(
        order_id=order_id,
        customer_id=customer_id,
        product_id=product_id,
        quantity=quantity,
        order_amount=order_amount,
        product_category=product_category,
        payment_method=payment_method,
    )


# ── Customer Tools ───────────────────────────────────────────────────────

@mcp.tool()
def get_customer_by_id(customer_id: str) -> List[Dict[str, Any]]:
    """Retrieve a single customer by customer_id. PII fields are automatically redacted."""
    return db.get_customer_by_id(customer_id)


@mcp.tool()
def list_customers(limit: int = 50) -> List[Dict[str, Any]]:
    """List customers. PII fields are automatically redacted. Max 1000."""
    return db.list_customers(limit=limit)


# ── Entry Point ──────────────────────────────────────────────────────────

# Usage: uvicorn bq_mcp_server:mcp.app --host 0.0.0.0 --port $PORT
if (__name__ == "__main__"):
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    print(f"🚀 Starting MCP Server v2.2 on 0.0.0.0:{port}")
    uvicorn.run(mcp.app, host="0.0.0.0", port=port)
