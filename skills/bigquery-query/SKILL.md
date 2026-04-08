---
name: bigquery-query
description: Query Google BigQuery datasets using the bq CLI. Use when the user asks to query, explore, or extract data from BigQuery.
---

# bigquery-query – Google BigQuery CLI

Query BigQuery datasets using the `bq` CLI (part of Google Cloud SDK). Always use `--use_legacy_sql=false` for standard SQL.

## Prerequisites

- **Google Cloud SDK** installed with `bq` CLI available
- **Authentication** configured via `gcloud auth login` or a service account

## Projects

| Environment | Project ID              |
| ----------- | ----------------------- |
| Production  | `skilled-fulcrum-90207` |
| Development | `holistics-data-294707` |

**Before running any query**, check the current active project:

```bash
gcloud config get-value project
```

Switch project if needed:

```bash
gcloud config set project skilled-fulcrum-90207   # production
gcloud config set project holistics-data-294707   # development
```

## Workflow

1. **Check project** — `gcloud config get-value project` to confirm environment.
2. **Discover** — List datasets and tables, inspect schemas before writing queries.
3. **Query** — Run the query.

## Core Commands

### Run a Query

```bash
bq query --use_legacy_sql=false --project_id=PROJECT_ID \
  "SELECT * FROM dataset.table LIMIT 10"
```

### Dry Run (Cost Estimation)

Always run a dry run first on large or unfamiliar tables to check bytes processed:

```bash
bq query --use_legacy_sql=false --dry_run --project_id=PROJECT_ID \
  "SELECT * FROM dataset.table"
```

### List Datasets

```bash
bq ls --project_id=PROJECT_ID
```

### List Tables in a Dataset

```bash
bq ls --project_id=PROJECT_ID dataset_name
```

### Get Table Schema

```bash
bq show --format=json PROJECT_ID:dataset.table | jq '.schema.fields'
```

### Get Table Info (Row Count, Size)

```bash
bq show --format=json PROJECT_ID:dataset.table | jq '{rows: .numRows, bytes: .numBytes, type: .type}'
```

## Tips

- **Check your active project first** — run `gcloud config get-value project` before querying.
- **Always filter on partition columns** to avoid full table scans and reduce costs.
- **Use `--dry_run`** before running queries on large tables to check estimated bytes.
- **Use `LIMIT 10`** during exploration; remove it only for final queries.
- **Fully qualify table names** as `project.dataset.table` to avoid ambiguity.
- **Use `SAFE_` prefix functions** (e.g., `SAFE_DIVIDE`, `SAFE_CAST`) to avoid query failures on bad data.
- BigQuery charges by bytes scanned; `SELECT *` on wide tables is expensive. Select only needed columns.
- Use `bq show --format=json` to inspect table schemas before writing queries.
