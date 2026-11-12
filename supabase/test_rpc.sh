#!/usr/bin/env bash
# Сквозная проверка RPC и RLS на локальном Postgres (после test_local.sh)
export PGPORT=5544
P="psql -h /tmp -p $PGPORT -U postgres -d foodloop -At -q"
TODAY=$($P -c "select current_date")
rep() { echo "{\"org_id\":$1,\"report_date\":\"$TODAY\",\"items\":[$2]}"; }
item() { echo "{\"product_id\":$1,\"quantity_kg\":$2,\"portions\":$3,\"discount_reason\":\"$4\",\"shelf_days_left\":$5}"; }
$P -c "update users set auth_id = ('00000000-0000-0000-0000-' || lpad(user_id::text,12,'0'))::uuid"
as() { local uid=$1; shift; $P -c "set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-$(printf %012d $uid)'; $*" 2>&1 | grep -v '^SET$'; }
anon() { $P -c "set role anon; $*" 2>&1 | grep -v '^SET$'; }
ok() { echo "--- $1"; }
ok "1 responsible(5) подаёт отчёт"
RID=$(as 5 "select submit_report('$(rep 5 "$(item 12 2.0 10 'Срок годности истекает завтра' 1),$(item 9 0.8 10 'Срок годности истекает сегодня' 0)")'::jsonb)" | tail -1)
echo "report_id=$RID"; $P -c "select status from reports where report_id=$RID"
ok "2 responsible(5) не может подать за чужую организацию"
as 5 "select submit_report('$(rep 1 "$(item 1 1 2 x 0)")'::jsonb)"
ok "3 покупатель(16) не может принять отчёт"
as 16 "select review_report($RID,'accepted')"
ok "4 reviewer(11): вернуть без комментария"
as 11 "select review_report($RID,'returned','')"
ok "5 reviewer(11): принять"
as 11 "select review_report($RID,'accepted')"
$P -c "select item_id,is_listed,price_full_kzt,price_discount_kzt,discount_pct from report_items where report_id=$RID order by item_id"
ITEM=$($P -c "select min(item_id) from report_items where report_id=$RID")
ok "6 buyer(16) бронирует 4 из 10 (item $ITEM)"
as 16 "select booking_id,portions,status,length(pickup_code) from create_booking($ITEM,4)"
ok "7 buyer(17) пытается 7 при остатке 6 -> ок, затем ещё 1 -> ошибка"
as 17 "select portions,status from create_booking($ITEM,7)"
as 17 "select portions,status from create_booking($ITEM,1)"
ok "8 остаток в v_lots (anon)"
anon "select item_id,remaining from v_lots where item_id=$ITEM"
BID=$($P -c "select min(booking_id) from bookings where item_id=$ITEM")
ok "9 чужой responsible(1) не может выдать"
as 1 "select mark_booking($BID,'collected')"
ok "10 responsible(5) выдаёт"
as 5 "select mark_booking($BID,'collected')"
$P -c "select sold_portions,sold_kg,revenue_kzt,wasted_kg,co2e_avoided_kg from report_items where item_id=$ITEM"
ok "11 отзыв: чужой нельзя, свой можно, дубль нельзя"
as 17 "select add_feedback($BID,5,'вкус','ok')"
as 16 "select add_feedback($BID,5,'вкус','Вкусно')"
as 16 "select add_feedback($BID,4,'вкус','повтор')"
ok "12 ответ организации"
FID=$($P -c "select feedback_id from feedback where booking_id=$BID")
as 5 "select reply_feedback($FID,'Спасибо!')"
ok "13 RLS: покупатель видит 0 отчётов, 1 строку users, 0 фактов"
as 16 "select (select count(*) from reports),(select count(*) from users),(select count(*) from v_facts)"
ok "14 RLS: responsible(1) видит только свою организацию в v_facts"
as 1 "select count(distinct org_id), min(org_id) from v_facts"
ok "15 RLS: прямой insert запрещён"
as 16 "insert into bookings(item_id,user_id,portions,status) values ($ITEM,16,1,'booked')"
ok "16 RLS: anon не читает отчёты"
anon "select count(*) from reports"
ok "17 лаборатория с просроченным допуском: лот не создаётся"
$P -c "update organizations set permit_valid_until = current_date - 1 where org_id=8"
R2=$(as 8 "select submit_report('$(rep 8 "$(item 15 1 10 'Лабораторная партия после дегустации' 2)")'::jsonb)" | tail -1)
as 12 "select review_report($R2,'accepted')"
ok "18 Telegram: очередь уведомлений"
$P -c "insert into telegram_links(user_id,chat_id,subscribed,linked_at) values (16,111,true,now()),(17,222,false,now())"
ITEM2=$($P -c "select min(item_id) from v_lots where remaining>0 and item_id<>$ITEM")
as 16 "select portions from create_booking($ITEM2,1)"
R3=$(as 5 "select submit_report('$(rep 5 "$(item 11 1 4 'Нестандартный вид' 1)")'::jsonb)" | tail -1)
as 11 "select review_report($R3,'accepted')"
R4=$(as 6 "select submit_report('$(rep 6 "$(item 6 1 4 'Нестандартный вид' 1)")'::jsonb)" | tail -1)
as 11 "select review_report($R4,'returned','Не указан состав')"
$P -c "select chat_id, left(text,80) from outbox order by id"
ok "19 дашборд: v_monthly"
as 11 "select month, round(quantity_kg) q, round(sold_kg) s, round(wasted_kg) w from v_monthly order by month"
