// Проверка js/backend-supabase.js на реальном REST-слое (PostgREST) поверх схемы supabase/schema.sql.
// Нужны: запущенный PostgREST (порт 3055, см. README), npm i @supabase/supabase-js. Запуск: node tests/supabase_scenario.mjs
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createSupabase } from '../js/backend-supabase.js';
import * as A from '../js/analytics.js';

const require = createRequire(process.env.SB_LIB_DIR ? process.env.SB_LIB_DIR + '/package.json' : import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const URL_ = 'http://localhost:3055', SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload); return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`; };
const users = JSON.parse(readFileSync(new URL('../data/users.json', import.meta.url)));
const uuid = (id) => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
const exp = Math.floor(Date.now() / 1000) + 3600;
const clientFor = (u) => createClient(URL_, jwt({ role: 'anon', exp }), { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, opts) => fetch(String(url).replace('/rest/v1', ''), opts), // PostgREST без префикса Supabase
    headers: { Authorization: 'Bearer ' + jwt(u ? { role: 'authenticated', sub: uuid(u.user_id), exp } : { role: 'anon', exp }) } } });

// «Прокси» клиента: from/rpc идут в текущего пользователя, auth подменён тестовым
let cur = null, inner = clientFor(null);
const proxy = { from: (...a) => inner.from(...a), rpc: (...a) => inner.rpc(...a),
  auth: { async signInWithPassword({ email }) { const u = users.find((x) => x.login === email.split('@')[0]); if (!u) return { error: { message: 'no user' } }; cur = u; inner = clientFor(u); return { error: null }; },
    async getSession() { return { data: { session: cur ? { user: { id: uuid(cur.user_id) } } : null } }; }, async signOut() { cur = null; inner = clientFor(null); } } };
const api = createSupabase({ __client: proxy, EMAIL_DOMAIN: 'x.app' });
const rejects = (p, re) => assert.rejects(p, re);
let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);
const today = new Date().toISOString().slice(0, 10);

let lots = await api.listLots(); assert.ok(lots.length >= 6); ok(`гость видит витрину: ${lots.length} лотов (v_lots через REST)`);
await rejects(api.facts(), /permission|denied|42501/i); ok('гость не читает факты дашборда');
await api.login('resp_5', 'x'); const me = await api.me(); assert.equal(me.org_id, 5); assert.equal(me.organization, 'Кофейня-киоск у библиотеки'); ok('вход ответственного, профиль и организация подтянуты');
const { report_id: rid } = await api.submitReport({ org_id: 5, report_date: today, items: [
  { product_id: 12, quantity_kg: 2, portions: 10, discount_reason: 'Срок годности истекает завтра', shelf_days_left: 1 }, { product_id: 9, quantity_kg: 0.8, portions: 10, discount_reason: 'Срок годности истекает сегодня', shelf_days_left: 0 }] });
assert.ok(rid > 0); ok(`отчёт отправлен через RPC (№${rid})`);
const mine = await api.myReports(); assert.ok(mine.every((r) => r.org_id === 5) && mine.find((r) => r.report_id === rid).items_count === 2); ok('«Мои отчёты»: только своя организация, embed count работает');
await rejects(api.submitReport({ org_id: 1, report_date: today, items: [{ product_id: 1, quantity_kg: 1, portions: 2, discount_reason: 'x', shelf_days_left: 0 }] }), /только своей/); ok('чужая организация отклонена на уровне БД');
const rep = await api.getReport(rid); assert.equal(rep.items.length, 2); assert.ok(rep.items[0].composition); ok('карточка отчёта с составом (embed products)');
await api.logout(); await api.login('student_1', 'x'); await rejects(api.reviewReport(rid, 'accepted'), /Нет прав/); ok('покупатель не может принять отчёт');
await rejects(api.getReport(rid), /не найден/); ok('RLS: покупатель не видит чужой отчёт');
await api.logout(); await api.login('reviewer_1', 'x');
assert.ok((await api.reviewQueue()).some((r) => r.report_id === rid)); ok('отчёт в очереди проверки');
await rejects(api.reviewReport(rid, 'returned', ''), /комментарий/); ok('возврат без комментария запрещён');
await api.takeReview(rid); assert.equal((await api.getReport(rid)).status, 'under_review'); ok('«взять на проверку»');
assert.deepEqual(await api.reviewReport(rid, 'accepted'), { listed: 2, skipped: 0 }); ok('принят, 2 лота');
await api.logout(); await api.login('student_1', 'x');
const yog = (await api.listLots()).filter((l) => l.product === 'Йогурт' && l.organization.includes('Кофейня')).sort((a, b) => b.item_id - a.item_id)[0]; assert.equal(yog.price_discount_kzt, 270); ok('цена 450 → 270 (−40%)');
const b1 = await api.createBooking(yog.item_id, 4); assert.equal(b1.pickup_code.length, 6); ok('бронь 4 порции, код ' + b1.pickup_code);
await api.logout(); await api.login('student_2', 'x'); await rejects(api.createBooking(yog.item_id, 7), /осталось 6/); ok('перепродажа отклонена (осталось 6)');
const my = await api.myBookings(); assert.ok(my.length > 0 && my.every((b) => b.user_id === 17) && !my.some((b) => b.booking_id === b1.booking_id)); ok('RLS: покупатель 2 видит только свои брони, чужая бронь недоступна');
await api.logout(); await api.login('student_1', 'x'); const mb = await api.myBookings(); assert.ok(mb.some((b) => b.booking_id === b1.booking_id && b.product === 'Йогурт')); ok('«Мои брони» через v_bookings');
await api.logout(); await api.login('resp_1', 'x'); await rejects(api.markBooking(b1.booking_id, 'collected'), /Нет прав/); ok('чужая организация не может выдать');
await api.logout(); await api.login('resp_5', 'x');
const ob = await api.orgBookings(); assert.ok(ob.every((b) => b.org_id === 5) && ob.some((b) => b.booking_id === b1.booking_id)); ok('выдача: только брони своей организации');
await api.markBooking(b1.booking_id, 'collected');
const f = (await api.facts()).find((x) => x.item_id === yog.item_id); assert.equal(f.sold_portions, 4); assert.equal(f.revenue_kzt, 1080); assert.equal(Number(f.wasted_kg), 1.2); ok('выдано: продано 4, выручка 1080 ₸, списано 1.2 кг');
await api.logout(); await api.login('student_1', 'x'); await api.addFeedback(b1.booking_id, 5, 'вкус', 'Вкусно');
await rejects(api.addFeedback(b1.booking_id, 4, 'вкус', 'ещё'), /уже оставлен/); ok('отзыв: один на бронь');
assert.ok((await api.listFeedback()).some((x) => x.booking_id === b1.booking_id && x.is_mine)); ok('покупатель видит свой отзыв (v_feedback)');
await api.logout(); await api.login('resp_5', 'x'); const fb = (await api.listFeedback()).find((x) => x.booking_id === b1.booking_id); await api.replyFeedback(fb.feedback_id, 'Спасибо!'); ok('организация ответила на отзыв');
assert.ok((await api.createTgCode()).length === 6); ok('код привязки Telegram создан');
await api.logout(); await api.login('head', 'x'); const facts = await api.facts(); assert.ok(facts.length > 500);
const k = A.kpis(A.filterFacts(facts, { to: '2026-10-31' })); assert.ok(Math.abs(k.sold - 730) < 1 && k.revenue === 1140900); ok(`дашборд на данных из БД: ${k.sold} кг, ${k.revenue} ₸ (как в презентации)`);
const rec = A.recommendations(facts); assert.ok(rec[0].product.includes('Плов')); ok('рекомендация про плов из БД');
assert.equal((await api.getSettings()).launch_date, '2026-09-15'); ok('настройки читаются');
console.log(`\nВсе проверки пройдены: ${n}`);
