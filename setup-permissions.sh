#!/bin/bash
# =============================================================
# DMV DB Connect — Permissions Setup
# =============================================================
# This script grants the Cloud Run service account the BigQuery Admin role.
# =============================================================

PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Using Project ID: $PROJECT_ID"
echo "Using Project Number: $PROJECT_NUMBER"
echo "Target Service Account: $SERVICE_ACCOUNT"

echo "Granting roles/bigquery.admin to $SERVICE_ACCOUNT..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/bigquery.admin"

echo "Done. Your BigQuery MCP server can now access BigQuery datasets and tables."
