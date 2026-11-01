#!/bin/sh
(
set -eu

: "${LINKFLOW_DB_USER:?LINKFLOW_DB_USER is required}"
: "${LINKFLOW_DB_NAME:?LINKFLOW_DB_NAME is required}"
: "${LINKFLOW_TEST_DB_NAME:?LINKFLOW_TEST_DB_NAME is required}"
: "${LINKFLOW_DB_PASSWORD_FILE:?LINKFLOW_DB_PASSWORD_FILE is required}"

[ "$LINKFLOW_DB_USER" != "$POSTGRES_USER" ] || {
    printf '%s\n' 'Application role must differ from the PostgreSQL administrator' >&2
    exit 1
}
[ "$LINKFLOW_DB_NAME" != "$LINKFLOW_TEST_DB_NAME" ] || {
    printf '%s\n' 'Application and test databases must differ' >&2
    exit 1
}

LINKFLOW_DB_PASSWORD=$(cat "$LINKFLOW_DB_PASSWORD_FILE")
[ -n "$LINKFLOW_DB_PASSWORD" ] || {
    printf '%s\n' 'Application database password must not be empty' >&2
    exit 1
}
export LINKFLOW_DB_USER LINKFLOW_DB_NAME LINKFLOW_TEST_DB_NAME LINKFLOW_DB_PASSWORD

psql -X --quiet --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_user LINKFLOW_DB_USER
\getenv app_db LINKFLOW_DB_NAME
\getenv test_db LINKFLOW_TEST_DB_NAME
\getenv app_password LINKFLOW_DB_PASSWORD
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', :'app_user') \gexec
SQL
unset LINKFLOW_DB_PASSWORD
)
