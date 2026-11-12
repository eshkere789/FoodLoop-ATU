# Подключение Supabase (режим «боевой» БД)

Демо-режим сайта работает и без этого. Supabase нужен, если вы хотите общую БД для нескольких людей, вход и бота.

1. Создайте бесплатный проект на supabase.com (условия бесплатного тарифа и «засыпание» проекта при простое проверьте на сайте сервиса).
2. SQL Editor → вставьте `schema.sql` → Run. Это создаёт таблицы, функции, представления и права (RLS).
3. Загрузите данные: `DATABASE_URL='postgresql://…' ./import_csv.sh` (строка подключения: Project Settings → Database). Скрипт загрузит CSV из `seed/`, выровняет счётчики и создаст живые лоты на сегодня (`seed_today.sql`; запускайте его заново в начале нового дня).
4. Учётки: `SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node supabase/create_demo_users.mjs` (создаёт пользователей Auth и связывает с таблицей `users`).
5. В `js/config.js`: `MODE: 'supabase'`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (публичный anon key). `service_role` key в сайт не вставляйте.
6. Authentication → URL Configuration: добавьте адрес сайта (например, `https://<логин>.github.io/<репозиторий>/`).

## Проверка схемы на своём компьютере
`test_local.sh` и `test_rpc.sh` разворачивают обычный Postgres 16, эмулируют роли Supabase (anon, authenticated, auth.uid()), грузят CSV и прогоняют сценарий (приём отчёта, лоты, бронь, права). Нужны Postgres 16 и права на запуск от пользователя postgres.
