-- Живые лоты на сегодня + отчёты для очереди проверки (чтобы витрина и проверка не были пустыми).
-- Запускать после импорта CSV и reset_sequences(). Можно запускать повторно в начале нового дня.
do $$
declare rid int;
begin
  -- Столовая главного корпуса: принят, два лота
  insert into reports(org_id, report_date, status, submitted_by, submitted_at) values (1, current_date, 'submitted', 1, now() - interval '2 hours') returning report_id into rid;
  insert into report_items(report_id, product_id, quantity_kg, portions, discount_reason, shelf_days_left, price_full_kzt) values
    (rid, 3, 4.2, 12, 'Остаток после обеда', 0, 1200), (rid, 1, 3.2, 8, 'Срок годности истекает сегодня', 0, 700);
  perform _accept_report(rid, 11);
  -- Буфет корпуса А: принят, два лота
  insert into reports(org_id, report_date, status, submitted_by, submitted_at) values (2, current_date, 'submitted', 2, now() - interval '2 hours') returning report_id into rid;
  insert into report_items(report_id, product_id, quantity_kg, portions, discount_reason, shelf_days_left, price_full_kzt) values
    (rid, 8, 1.8, 12, 'Срок годности истекает сегодня', 0, 450), (rid, 10, 2.0, 8, 'Остаток после обеда', 1, 900);
  perform _accept_report(rid, 12);
  -- Лаборатория технологии: принята, лабораторные лоты
  insert into reports(org_id, report_date, status, submitted_by, submitted_at) values (4, current_date, 'submitted', 4, now() - interval '3 hours') returning report_id into rid;
  insert into report_items(report_id, product_id, quantity_kg, portions, discount_reason, shelf_days_left, price_full_kzt) values
    (rid, 13, 3.0, 15, 'Лабораторная партия после дегустации', 3, 500), (rid, 14, 2.5, 10, 'Лабораторная партия после дегустации', 2, 600);
  perform _accept_report(rid, 11);
  -- Столовая корпуса Б: ждёт проверки
  insert into reports(org_id, report_date, status, submitted_by, submitted_at) values (6, current_date, 'submitted', 6, now() - interval '30 minutes') returning report_id into rid;
  insert into report_items(report_id, product_id, quantity_kg, portions, discount_reason, shelf_days_left, price_full_kzt) values
    (rid, 2, 4.5, 10, 'Остаток после обеда', 0, 1100), (rid, 6, 2.0, 8, 'Нестандартный вид', 1, 600);
  -- Кофейня: черновик
  insert into reports(org_id, report_date, status, submitted_by) values (5, current_date, 'draft', 5) returning report_id into rid;
  insert into report_items(report_id, product_id, quantity_kg, portions, discount_reason, shelf_days_left, price_full_kzt) values
    (rid, 9, 0.8, 10, 'Срок годности истекает сегодня', 0, 500);
end $$;
