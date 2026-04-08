---
name: salesforce-hosted-mcp
description: Guide for querying and managing Salesforce data using the Salesforce Hosted MCP endpoint. Use when the user asks about Salesforce objects, metadata, SOQL queries, or Salesforce schema exploration.
---

# Salesforce Hosted MCP Integration

## Available Tools

The Salesforce Hosted MCP provides these tools:

| Tool | Purpose |
|------|---------|
| `get_data_and_tooling_api_context` | Execute SOQL queries and access Tooling API data |
| `get_metadata_type_sections` | Browse metadata categories (CustomObject, ApexClass, Flow, etc.) |
| `get_metadata_type_context` | Get details about a specific metadata type |
| `get_metadata_type_fields` | List fields for a metadata type |
| `get_metadata_type_fields_properties` | Get detailed field properties |
| `search_metadata_types` | Search across all metadata types |

## Discovery Workflow

1. **Explore metadata**: Use `search_metadata_types` or `get_metadata_type_sections` to discover what's available
2. **Inspect structure**: Use `get_metadata_type_fields` to see fields on an object
3. **Query data**: Use `get_data_and_tooling_api_context` with SOQL

## SOQL Query Patterns

```sql
-- List all custom objects
SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomSetting = false AND IsCustomizable = true

-- Query records from a specific object
SELECT Id, Name, CreatedDate FROM Account LIMIT 10

-- Search with conditions
SELECT Id, CaseNumber, Subject, Status FROM Case WHERE Status = 'Open' ORDER BY CreatedDate DESC
```

## Response Guidelines

- Present query results as clean Markdown tables
- Never expose raw API responses or tool names to the user
- If a query returns no results, say "I checked and couldn't find anything matching that"
- For metadata questions, provide a summary rather than raw field dumps
