#!/bin/bash
# Runs once, on first start of the Postgres container.
# - n8n gets its own database for its internal state.
# - the web app gets a READ-ONLY role. Only n8n writes lead data.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE DATABASE n8n OWNER "$POSTGRES_USER";
CREATE ROLE app_ro LOGIN PASSWORD '${APP_RO_PASSWORD}';
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/schema/init.sql

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO app_ro;
GRANT USAGE ON SCHEMA public TO app_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_ro;
SQL
