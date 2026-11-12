#!/usr/bin/env bash
# Локальная проверка схемы на обычном Postgres (эмулируем Supabase: роли anon/authenticated и auth.uid()).
set -e
export PGPORT=5544
DATA=/tmp/pgtest
[ -d $DATA ] && su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $DATA -m immediate stop" >/dev/null 2>&1 || true
rm -rf $DATA; mkdir -p $DATA; chown postgres $DATA
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $DATA -A trust >/dev/null"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $DATA -o '-p $PGPORT -k /tmp' -l /tmp/pg.log -w start >/dev/null"
P="psql -h /tmp -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database foodloop" >/dev/null
P="$P -d foodloop"
$P <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''))::uuid $$;
create role authenticator login noinherit password 'authpw'; grant anon, authenticated to authenticator;
create role service_role nologin bypassrls; grant service_role to authenticator;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
SQL
$P -f /home/claude/foodloop/supabase/schema.sql
$P -c "grant all on all tables in schema public to service_role; grant usage on schema public to service_role"
D=/home/claude/gen/demo_data
for t in organizations users products reports report_items bookings feedback; do
  cols=$(head -1 $D/$t.csv | sed 's/^\xEF\xBB\xBF//' | tr -d '\r')
  sed '1s/^\xEF\xBB\xBF//' $D/$t.csv | $P -c "\copy $t($cols) from stdin with (format csv, header true)"
done
$P -c "select reset_sequences()" >/dev/null
$P -f /home/claude/foodloop/supabase/seed_today.sql
echo "== counts =="; $P -At -c "select 'orgs',count(*) from organizations union all select 'items',count(*) from report_items union all select 'bookings',count(*) from bookings union all select 'lots_today',count(*) from v_lots"
