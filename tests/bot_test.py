# Проверка bot/bot.py на поддельном Telegram API и локальном PostgREST+Postgres.
import os, sys, json, hmac, hashlib, base64, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
import requests
SECRET = b"super-secret-jwt-token-with-at-least-32-characters-long"
def jwt(payload):
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
    h, p = b({"alg": "HS256", "typ": "JWT"}), b(payload)
    s = base64.urlsafe_b64encode(hmac.new(SECRET, f"{h}.{p}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{h}.{p}.{s}"
exp = int(time.time()) + 3600
PG = "http://localhost:3055"
user_jwt = lambda uid: jwt({"role": "authenticated", "sub": f"00000000-0000-0000-0000-{uid:012d}", "exp": exp})
rpc = lambda name, uid, body: requests.post(f"{PG}/rpc/{name}", json=body, headers={"Authorization": "Bearer " + user_jwt(uid)})

sent = []
class Fake(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
        if self.path.endswith("/sendMessage"): sent.append(body)
        out = json.dumps({"ok": True, "result": []}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
srv = HTTPServer(("localhost", 9099), Fake); threading.Thread(target=srv.serve_forever, daemon=True).start()

os.environ.update(TELEGRAM_BOT_TOKEN="TEST", SUPABASE_URL=PG, SUPABASE_SERVICE_KEY=jwt({"role": "service_role", "exp": exp}), TELEGRAM_API_BASE="http://localhost:9099", SUPABASE_REST_PATH="")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bot"))
import bot
n = 0
def ok(c, m):
    global n; n += 1; print(("  ✓ " if c else "  ✗ ") + f"{n}. {m}")
    if not c: sys.exit(1)
def say(chat, text): bot.handle_update({"update_id": 1, "message": {"chat": {"id": chat}, "text": text}})
def last(): return sent[-1]["text"] if sent else ""

today = time.strftime("%Y-%m-%d", time.gmtime())
code = rpc("create_tg_code", 16, {}).json(); ok(len(code) == 6, f"код привязки с сайта: {code}")
say(777, "/start"); ok("код" in last().lower(), "/start без кода подсказывает, где взять код")
say(777, "/start 000000"); ok("не найден" in last(), "неверный код отклонён")
say(777, f"/start {code}"); ok("привязан" in last() and "Студент 01" in last(), "привязка аккаунта: " + last().split("\n")[0])
say(777, f"/start {code}"); ok("не найден" in last(), "код одноразовый")
say(777, "/lots"); ok("Лоты на сегодня" in last() and "₸" in last(), "/lots показывает лоты")
say(777, "/mybookings"); ok("Ваши брони" in last(), "/mybookings показывает историю")
# бронь на сайте -> сообщение в outbox -> бот отправляет
lots = requests.get(f"{PG}/v_lots?remaining=gt.0&order=item_id&limit=1", headers={"Authorization": "Bearer " + user_jwt(16)}).json()
b = rpc("create_booking", 16, {"p_item": lots[0]["item_id"], "p_portions": 2}).json(); ok("pickup_code" in b, "бронь создана на сайте, код " + b["pickup_code"])
sent.clear(); k = bot.flush_outbox(); ok(k >= 1 and "Бронь подтверждена" in sent[0]["text"] and b["pickup_code"] in sent[0]["text"], "бот отправил подтверждение брони с кодом")
sent.clear(); ok(bot.flush_outbox() == 0, "повторно ничего не отправляется (sent_at проставлен)")
say(777, "/mybookings"); ok("забронировано" in last() and b["pickup_code"] in last(), "/mybookings показывает активную бронь с кодом")
# рассылка о новых лотах
rid = rpc("submit_report", 5, {"p_report": {"org_id": 5, "report_date": today, "items": [{"product_id": 11, "quantity_kg": 1, "portions": 4, "discount_reason": "Нестандартный вид", "shelf_days_left": 1}]}}).json()
rpc("review_report", 11, {"p_report": rid, "p_decision": "accepted"}); sent.clear(); bot.flush_outbox()
ok(any("Новые лоты" in m["text"] and m["chat_id"] == 777 for m in sent), "подписчик получил рассылку о новых лотах")
say(777, "/unsubscribe"); ok("выключена" in last(), "/unsubscribe")
rid = rpc("submit_report", 5, {"p_report": {"org_id": 5, "report_date": today, "items": [{"product_id": 9, "quantity_kg": 1, "portions": 4, "discount_reason": "Нестандартный вид", "shelf_days_left": 1}]}}).json()
rpc("review_report", 11, {"p_report": rid, "p_decision": "accepted"}); sent.clear(); bot.flush_outbox()
ok(not any("Новые лоты" in m["text"] for m in sent), "после отписки рассылка не приходит")
say(777, "что-то"); ok("/start" in last(), "неизвестная команда выводит справку")
print(f"\nВсе проверки пройдены: {n}")
