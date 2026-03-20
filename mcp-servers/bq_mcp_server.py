import os
from typing import Any, Dict, List, Optional
from google.cloud import bigquery
from fastmcp import FastMCP

# Define specialized instructions to ensure the LLM uses BigQuery-compatible SQL
# and prefers the provided metadata tools over raw 'SHOW' statements.
INSTRUCTIONS = """
You are a BigQuery expert. 
1. BigQuery does NOT support 'SHOW TABLES' or 'SHOW DATABASES'. 
2. Use 'list_datasets' and 'list_tables' tools for discovery.
3. If you must use raw SQL for metadata, query 'INFORMATION_SCHEMA.TABLES' or 'INFORMATION_SCHEMA.SCHEMATA'.
4. Always use Standard SQL syntax (e.g., use backticks `project.dataset.table` for table names).
"""

mcp = FastMCP(
    "custom-bigquery-unrestricted",
    instructions=INSTRUCTIONS
)

def _bq_client() -> bigquery.Client:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        # Fallback to default project if possible
        return bigquery.Client()
    return bigquery.Client(project=project)

@mcp.tool()
def list_datasets() -> List[str]:
    """List all available datasets in the current BigQuery project."""
    client = _bq_client()
    datasets = list(client.list_datasets())
    return [d.dataset_id for d in datasets]

@mcp.tool()
def list_tables(dataset_id: str) -> List[str]:
    """List all tables in a specific BigQuery dataset."""
    client = _bq_client()
    tables = list(client.list_tables(dataset_id))
    return [t.table_id for t in tables]

@mcp.tool()
def execute_unrestricted_sql(
    query: str, maximum_bytes_billed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Execute arbitrary BigQuery Standard SQL (DDL/DML/SELECT).
    WARNING: This intentionally does not restrict writes.
    
    Note: DO NOT use 'SHOW' statements. Use INFORMATION_SCHEMA for metadata if needed.
    """
    client = _bq_client()
    job_config = None
    if maximum_bytes_billed is not None:
        job_config = bigquery.QueryJobConfig(maximum_bytes_billed=maximum_bytes_billed)
    
    # Simple syntax check/patch for common LLM mistakes
    query_clean = query.strip()
    if query_clean.upper().startswith("SHOW "):
        raise ValueError("BigQuery does not support 'SHOW' statements. Use 'list_datasets', 'list_tables', or query 'INFORMATION_SCHEMA'.")

    job = client.query(query_clean, job_config=job_config)
    result = job.result()
    rows: List[Dict[str, Any]] = []
    schema_fields = [f.name for f in (result.schema or [])]
    for row in result:
        rows.append({name: row.get(name) for name in schema_fields})
    return {
        "project": client.project,
        "job_id": job.job_id,
        "statement_type": getattr(job, "statement_type", None),
        "total_bytes_processed": getattr(job, "total_bytes_processed", None),
        "total_bytes_billed": getattr(job, "total_bytes_billed", None),
        "num_dml_affected_rows": getattr(job, "num_dml_affected_rows", None),
        "rows": rows,
    }

@mcp.tool()
def get_table_schema(table_id: str, dataset_id: str = "demo_mcp") -> List[Dict[str, str]]:
    """Get the schema (columns, types, modes) of a specific BigQuery table. Use this to find out what columns are needed for a table."""
    client = _bq_client()
    project = client.project or "genai-poc-424806"
    table_ref = f"{project}.{dataset_id}.{table_id}"
    
    try:
        table = client.get_table(table_ref)
        return [{"name": f.name, "field_type": f.field_type, "mode": f.mode} for f in table.schema]
    except Exception as e:
        return [{"error": str(e)}]

@mcp.tool()
def insert_record(table_id: str, row_data: Dict[str, Any], dataset_id: str = "demo_mcp") -> str:
    """
    Insert a single record into a BigQuery table. 
    `row_data` must be a dictionary mapping column names to values. 
    Make sure to check the table schema first using get_table_schema.
    For IDs, you can generate random/timestamp values if NOT NULL.
    """
    client = _bq_client()
    project = client.project or "genai-poc-424806"
    
    if not row_data:
        return "Error: row_data cannot be empty."
        
    columns = list(row_data.keys())
    query_params = []
    param_names = []
    
    for idx, col in enumerate(columns):
        param_name = f"param_{idx}"
        param_names.append(f"@{param_name}")
        val = row_data[col]
        # Infer type for ScalarQueryParameter
        if isinstance(val, int):
            bq_type = "INT64"
        elif isinstance(val, float):
            bq_type = "FLOAT64"
        elif isinstance(val, bool):
            bq_type = "BOOL"
        else:
            bq_type = "STRING"
            val = str(val)
            
        query_params.append(bigquery.ScalarQueryParameter(param_name, bq_type, val))
        
    cols_str = ", ".join(columns)
    vals_str = ", ".join(param_names)
    
    query = f"""
    INSERT INTO `{project}.{dataset_id}.{table_id}` 
    ({cols_str})
    VALUES ({vals_str})
    """
    
    job_config = bigquery.QueryJobConfig(query_parameters=query_params)
    
    try:
        job = client.query(query, job_config=job_config)
        job.result() # Wait for completion
        return f"Successfully inserted record into {table_id}."
    except Exception as e:
        return f"Error inserting record: {str(e)}"

if __name__ == "__main__":
    port = 8000
    mcp.run(
        transport="http",
        host="0.0.0.0",     
        port=port,
    )
