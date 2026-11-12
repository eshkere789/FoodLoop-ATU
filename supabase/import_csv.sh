#!/usr/bin/env bash
# Импорт демо-CSV в Supabase через psql.
# DATABASE_URL: Supabase -> Project Settings -> Database -> Connection string (URI), подставьте пароль БД.
# Использование: DATABASE_URL='postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres' ./import_csv.sh
set -euo pipefail
: "${DATABASE_URL:?Задайте DATABASE_URL}"
cd "$(dirname "$0")/seed"
for t in organizations users products reports report_items bookings feedback; do   # порядок важен (внешние ключи)
  cols=$(head -1 "$t.csv" | sed 's/^\xEF\xBB\xBF//' | tr -d '\r')
  echo "-> $t"
  sed '1s/^\xEF\xBB\xBF//' "$t.csv" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "\copy $t($cols) from stdin with (format csv, header true)"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "select reset_sequences()"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f ../seed_today.sql
echo "Готово: данные загружены, на сегодня созданы живые лоты."
