CREATE TABLE `genai-poc-424806.demo_mcp.Services`
(
  service_id INT64 NOT NULL,
  service_name STRING,
  tier STRING,
  monthly_fee NUMERIC,
  available BOOL
);

CREATE TABLE `genai-poc-424806.demo_mcp.Customer`
(
  customer_id INT64 NOT NULL,
  full_name STRING,
  email STRING,
  created_at TIMESTAMP,
  country STRING
);

CREATE TABLE `genai-poc-424806.demo_mcp.Product`
(
  product_id INT64 NOT NULL,
  product_name STRING,
  category STRING,
  price NUMERIC,
  is_active BOOL
);