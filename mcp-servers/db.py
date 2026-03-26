"""
Layer 3 — Database Access Layer
================================
Contains ONLY static SQL templates executed with parameterized queries.
Every query enforces `maximum_bytes_billed`.
Every result passes through the PII scrubber before returning.

NO f-strings with SQL keywords.
NO raw query passthrough.
"""

import os
from typing import Any, Dict, List, Optional
from google.cloud import bigquery
from pii_scrubber import scrub

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "genai-poc-424806")
DATASET_ID = "demo_mcp"
MAX_BYTES = int(os.environ.get("MAX_BYTES_BILLED", 100_000_000))  # 100MB default


def _client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT_ID)


def _run_parameterized(sql: str, params: list, scrub_results: bool = True) -> List[Dict[str, Any]]:
    """Internal helper: execute a static SQL string with parameters and cost ceiling."""
    job_config = bigquery.QueryJobConfig(
        query_parameters=params,
        maximum_bytes_billed=MAX_BYTES,
    )
    client = _client()
    job = client.query(sql, job_config=job_config)
    result = job.result()
    schema_fields = [f.name for f in (result.schema or [])]
    rows = [{name: row.get(name) for name in schema_fields} for row in result]
    if scrub_results:
        rows = [scrub(r) for r in rows]
    return rows


# ── Discovery Tools ──────────────────────────────────────────────────────

def list_datasets() -> List[str]:
    """List all datasets in the project."""
    client = _client()
    return [d.dataset_id for d in client.list_datasets()]


def list_tables(dataset_id: str) -> List[str]:
    """List all tables in a given dataset."""
    client = _client()
    return [t.table_id for t in client.list_tables(dataset_id)]


def get_table_schema(table_id: str, dataset_id: str = DATASET_ID) -> List[Dict[str, str]]:
    """Get column names/types for a table."""
    client = _client()
    table_ref = "{}.{}.{}".format(client.project or PROJECT_ID, dataset_id, table_id)
    table = client.get_table(table_ref)
    return [{"name": f.name, "field_type": f.field_type, "mode": f.mode} for f in table.schema]


# ── Sales Order Queries ──────────────────────────────────────────────────

_GET_ORDERS_SQL = """
    SELECT o.order_id, o.order_timestamp, o.order_amount,
           o.product_category, o.payment_method, o.quantity,
           c.customer_id, c.customer_name, c.age, c.city, c.region,
           c.loyalty_tier, c.email, c.phone_number
    FROM `{project}.{dataset}.SalesOrder` o
    JOIN `{project}.{dataset}.Customer` c ON o.customer_id = c.customer_id
    ORDER BY o.order_timestamp DESC
    LIMIT @limit
""".format(project=PROJECT_ID, dataset=DATASET_ID)

_GET_ORDER_BY_ID_SQL = """
    SELECT order_id, customer_id, product_id, quantity,
           order_timestamp, order_amount, product_category, payment_method
    FROM `{project}.{dataset}.SalesOrder`
    WHERE order_id = @order_id
""".format(project=PROJECT_ID, dataset=DATASET_ID)

_INSERT_ORDER_SQL = """
    INSERT INTO `{project}.{dataset}.SalesOrder`
    (order_id, customer_id, product_id, quantity, order_timestamp,
     order_amount, product_category, payment_method)
    VALUES (@order_id, @customer_id, @product_id, @quantity,
            CURRENT_TIMESTAMP(), @order_amount, @product_category, @payment_method)
""".format(project=PROJECT_ID, dataset=DATASET_ID)


def get_sales_orders(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve recent sales orders joined with customer data."""
    return _run_parameterized(
        _GET_ORDERS_SQL,
        [bigquery.ScalarQueryParameter("limit", "INT64", min(limit, 1000))],
    )


def get_order_by_id(order_id: str) -> List[Dict[str, Any]]:
    """Retrieve a single order by ID."""
    return _run_parameterized(
        _GET_ORDER_BY_ID_SQL,
        [bigquery.ScalarQueryParameter("order_id", "STRING", order_id)],
    )


def insert_sales_order(
    order_id: str,
    customer_id: str,
    product_id: int,
    quantity: int,
    order_amount: float,
    product_category: str,
    payment_method: str,
) -> str:
    """Insert a single sales order with full parameterization."""
    params = [
        bigquery.ScalarQueryParameter("order_id", "STRING", order_id),
        bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
        bigquery.ScalarQueryParameter("product_id", "INT64", product_id),
        bigquery.ScalarQueryParameter("quantity", "INT64", quantity),
        bigquery.ScalarQueryParameter("order_amount", "FLOAT64", order_amount),
        bigquery.ScalarQueryParameter("product_category", "STRING", product_category),
        bigquery.ScalarQueryParameter("payment_method", "STRING", payment_method),
    ]
    _run_parameterized(_INSERT_ORDER_SQL, params, scrub_results=False)
    return "Successfully inserted order {}".format(order_id)


# ── Customer Queries ─────────────────────────────────────────────────────

_GET_CUSTOMER_SQL = """
    SELECT customer_id, customer_name, age, city, region,
           signup_date, loyalty_tier, average_order_value,
           order_frequency, last_purchase_timestamp,
           email, phone_number
    FROM `{project}.{dataset}.Customer`
    WHERE customer_id = @customer_id
""".format(project=PROJECT_ID, dataset=DATASET_ID)

_LIST_CUSTOMERS_SQL = """
    SELECT customer_id, customer_name, age, city, region,
           loyalty_tier, email, phone_number
    FROM `{project}.{dataset}.Customer`
    ORDER BY customer_name
    LIMIT @limit
""".format(project=PROJECT_ID, dataset=DATASET_ID)


def get_customer_by_id(customer_id: str) -> List[Dict[str, Any]]:
    """Retrieve a single customer by ID (PII scrubbed)."""
    return _run_parameterized(
        _GET_CUSTOMER_SQL,
        [bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id)],
    )


def list_customers(limit: int = 50) -> List[Dict[str, Any]]:
    """List customers (PII scrubbed)."""
    return _run_parameterized(
        _LIST_CUSTOMERS_SQL,
        [bigquery.ScalarQueryParameter("limit", "INT64", min(limit, 1000))],
    )
