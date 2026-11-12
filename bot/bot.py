#!/usr/bin/env python3
"""
Telegram-бот FoodLoop АТУ (long polling). Запускается на ноутбуке/сервере во время демо.
Что делает:
  /start <код>  привязывает Telegram к аккаунту (код берётся на сайте: «Уведомления» -> «Получить код»)
  /lots         текущие лоты со скидкой
  /mybookings   последние брони
  /subscribe /unsubscribe   рассылка о новых лотах
И каждые несколько секунд отправляет сообщения из таблицы outbox (их кладут туда RPC-функции БД).
Переменные окружения: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY (service_role, только на вашей машине!).
"""
import os, sys, time, datetime as dt
import requests

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
SB_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
TG_BASE = os.environ.get("TELEGRAM_API_BASE", "https://api.telegram.org")
REST = os.environ.get("SUPABASE_REST_PATH", "/rest/v1")   # у PostgREST без Supabase: пустая строка

HELP = ("FoodLoop АТУ: остатки со скидкой в университете.\n"
        "/start <код> привязать аккаунт\n/lots лоты на сегодня\n/mybookings мои брони\n"
        "/subscribe или /unsubscribe рассылка о новых лотах")


def sb(method, path, **kw):
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}
    r = requests.request(method, f"{SB_URL}{REST}{path}", headers=headers, timeout=20, **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase {method} {path}: {r.status_code} {r.text[:200]}")
    return r.json() if r.text else None


def tg(method, **params):
    r = requests.post(f"{TG_BASE}/bot{TOKEN}/{method}", json=params, timeout=40)
    return r.json()


def send(chat_id, text):
    tg("sendMessage", chat_id=chat_id, text=text)


def link_by_chat(chat_id):
    rows = sb("GET", f"/telegram_links?chat_id=eq.{chat_id}&select=user_id,subscribed")
    return rows[0] if rows else None


def cmd_start(chat_id, arg):
    if not arg:
        return send(chat_id, "Откройте сайт FoodLoop, раздел «Уведомления», получите код и отправьте: /start КОД")
    rows = sb("GET", f"/telegram_links?link_code=eq.{arg}&select=user_id")
    if not rows:
        return send(chat_id, "Код не найден или уже использован. Получите новый на сайте.")
    uid = rows[0]["user_id"]
    sb("PATCH", f"/telegram_links?user_id=eq.{uid}", json={"chat_id": chat_id, "linked_at": dt.datetime.utcnow().isoformat(timespec="seconds"), "link_code": None, "subscribed": True})
    name = sb("GET", f"/users?user_id=eq.{uid}&select=full_name")[0]["full_name"]
    send(chat_id, f"Готово! Аккаунт «{name}» привязан. Вы будете получать уведомления о лотах и бронях.\n\n{HELP}")


def cmd_lots(chat_id):
    rows = sb("GET", "/v_lots?remaining=gt.0&order=discount_pct.desc&limit=10&select=product,organization,building,price_discount_kzt,price_full_kzt,discount_pct,remaining,pickup_from,pickup_to")
    if not rows:
        return send(chat_id, "Сейчас лотов нет. Загляните позже.")
    lines = [f"• {r['product']} — {r['price_discount_kzt']} ₸ (было {r['price_full_kzt']}, −{r['discount_pct']}%), осталось {r['remaining']}\n  {r['organization']}, {r.get('building') or ''}, выдача {r['pickup_from']}–{r['pickup_to']}" for r in rows]
    send(chat_id, "Лоты на сегодня:\n" + "\n".join(lines))


def cmd_mybookings(chat_id):
    link = link_by_chat(chat_id)
    if not link:
        return send(chat_id, "Сначала привяжите аккаунт: /start КОД")
    rows = sb("GET", f"/bookings?user_id=eq.{link['user_id']}&order=booked_at.desc&limit=5&select=portions,status,pickup_code,pickup_date,report_items(products(product))")
    if not rows:
        return send(chat_id, "Броней пока нет.")
    ru = {"booked": "забронировано", "collected": "выдано", "no_show": "не забрано", "cancelled": "отменено"}
    lines = []
    for r in rows:
        prod = ((r.get("report_items") or {}).get("products") or {}).get("product", "—")
        code = f", код {r['pickup_code']}" if r["status"] == "booked" else ""
        lines.append(f"• {prod} × {r['portions']} — {ru.get(r['status'], r['status'])}{code} ({r['pickup_date']})")
    send(chat_id, "Ваши брони:\n" + "\n".join(lines))


def cmd_subscribe(chat_id, on):
    link = link_by_chat(chat_id)
    if not link:
        return send(chat_id, "Сначала привяжите аккаунт: /start КОД")
    sb("PATCH", f"/telegram_links?user_id=eq.{link['user_id']}", json={"subscribed": on})
    send(chat_id, "Рассылка о новых лотах включена." if on else "Рассылка о новых лотах выключена.")


def handle_update(upd):
    msg = upd.get("message") or {}
    text = (msg.get("text") or "").strip()
    chat_id = (msg.get("chat") or {}).get("id")
    if not text or chat_id is None:
        return
    cmd, _, arg = text.partition(" ")
    cmd = cmd.split("@")[0].lower()
    try:
        if cmd == "/start": cmd_start(chat_id, arg.strip())
        elif cmd == "/lots": cmd_lots(chat_id)
        elif cmd == "/mybookings": cmd_mybookings(chat_id)
        elif cmd == "/subscribe": cmd_subscribe(chat_id, True)
        elif cmd == "/unsubscribe": cmd_subscribe(chat_id, False)
        else: send(chat_id, HELP)
    except Exception as e:  # бот не должен падать от одной ошибки
        print("handler error:", e, file=sys.stderr)
        send(chat_id, "Что-то пошло не так, попробуйте позже.")


def flush_outbox():
    rows = sb("GET", "/outbox?sent_at=is.null&order=id&limit=20")
    sent = 0
    for m in rows or []:
        res = tg("sendMessage", chat_id=m["chat_id"], text=m["text"])
        if res.get("ok"):
            sb("PATCH", f"/outbox?id=eq.{m['id']}", json={"sent_at": dt.datetime.utcnow().isoformat(timespec="seconds")})
            sent += 1
        else:
            print("send failed:", res, file=sys.stderr)
            sb("PATCH", f"/outbox?id=eq.{m['id']}", json={"sent_at": dt.datetime.utcnow().isoformat(timespec="seconds")})  # не зацикливаемся на «битых» чатах
    return sent


def main():
    if not (TOKEN and SB_URL and SB_KEY):
        sys.exit("Задайте TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY (см. .env.example)")
    print("FoodLoop bot запущен. Ctrl+C для остановки.")
    offset = 0
    while True:
        try:
            res = tg("getUpdates", offset=offset, timeout=5)
            for upd in res.get("result", []):
                offset = upd["update_id"] + 1
                handle_update(upd)
            flush_outbox()
        except KeyboardInterrupt:
            break
        except Exception as e:
            print("loop error:", e, file=sys.stderr)
            time.sleep(3)


if __name__ == "__main__":
    main()
