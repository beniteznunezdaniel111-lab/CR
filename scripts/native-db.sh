#!/usr/bin/env bash
# =============================================================================
# Postgres nativo + shim de Supabase para ejecutar tests/db SIN Docker.
# =============================================================================
# Uso (Linux con Postgres 16+ instalado):
#   scripts/native-db.sh start   # crea el clúster si no existe, aplica shim + migraciones
#   scripts/native-db.sh reset   # borra y recrea la base de datos de tests
#   scripts/native-db.sh stop
#
# Escucha en 127.0.0.1:54322 con usuario/contraseña postgres/postgres, igual que
# `supabase start`, así que `pnpm test:db` funciona contra cualquiera de los dos.
# Con Docker disponible, usa el stack oficial: `pnpm db:start`.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA_DIR="${NATIVE_PG_DATA:-/var/tmp/hrpilot-native-pg}"
PORT=54322
DB=postgres

as_pg() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

psql_db() {
  PGPASSWORD=postgres "$PG_BIN/psql" -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p "$PORT" -U postgres "$@"
}

start_cluster() {
  if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
    echo "→ Creando clúster en $DATA_DIR"
    mkdir -p "$DATA_DIR"
    [ "$(id -u)" = "0" ] && chown postgres:postgres "$DATA_DIR"
    local pwfile
    pwfile="$(mktemp)"
    echo "postgres" > "$pwfile"
    [ "$(id -u)" = "0" ] && chown postgres "$pwfile"
    as_pg "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --pwfile="$pwfile" -A scram-sha-256 \
      --locale=C.UTF-8 --encoding=UTF8 >/dev/null
    rm -f "$pwfile"
  fi
  if ! as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
    echo "→ Arrancando Postgres en el puerto $PORT"
    as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/server.log" -w \
      -o "-p $PORT -c listen_addresses=127.0.0.1" start >/dev/null
  fi
}

apply_schema() {
  echo "→ Recreando la base de datos de tests"
  PGPASSWORD=postgres "$PG_BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -d template1 \
    -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
  # Los roles son globales: el shim es idempotente.
  psql_db -d "$DB" -f "$ROOT/supabase/tests/shim/supabase-shim.sql" >/dev/null
  psql_db -d "$DB" -c "create extension if not exists pgcrypto with schema extensions" \
    -c "create extension if not exists citext with schema extensions" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "   · $(basename "$f")"
    psql_db -d "$DB" -f "$f" >/dev/null
  done
  echo "✓ Base de datos lista: postgresql://postgres:postgres@127.0.0.1:$PORT/$DB"
}

case "${1:-start}" in
  start)
    start_cluster
    apply_schema
    ;;
  reset)
    apply_schema
    ;;
  stop)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop -m fast
    ;;
  *)
    echo "Uso: $0 {start|reset|stop}" >&2
    exit 1
    ;;
esac
