// Сквозной тест демо-бэкенда: node tests/mock_scenario.mjs
import { createMock } from '../js/backend-mock.js';
import * as A from '../js/analytics.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
const loadJson = async (u) => JSON.parse(readFileSync(new URL('../' + u, import.meta.url), 'utf8'));
const config = { CO2_FACTOR: 2.5, LAUNCH_DATE: '2026-09-15', DEMO_PASSWORD: 'demo1234' };
const clock = new Date(2026, 10, 12, 14, 0, 0);
const api = createMock({ loadJson, storage, now: () => clock, config });
const rejects = async (p, re, msg) => { await assert.rejects(p, re, msg); };
let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);

await api.init();
await rejects(api.login('resp_5', 'wrong'), /Неверный/); ok('неверный пароль отклонён');
let u = await api.login('resp_5', 'demo1234'); assert.equal(u.role, 'responsible'); assert.equal(u.org_id, 5); ok('вход ответственного лица кофейни');

let lots = (await api.listLots()); assert.ok(lots.length >= 6, 'живые лоты на сегодня'); ok(`на витрине ${lots.length} живых лотов (seed на сегодня)`);
assert.ok(lots.some((l) => l.is_lab && l.discount_pct >= 55)); ok('лабораторные лоты со скидкой 55%+');

const today = '2026-11-12';
await rejects(api.submitReport({ org_id: 1, report_date: today, items: [{ product_id: 1, quantity_kg: 1, portions: 2, discount_reason: 'x', shelf_days_left: 0 }] }), /только своей/); ok('чужую организацию нельзя');
await rejects(api.submitReport({ org_id: 5, report_date: today, items: [{ product_id: 12, quantity_kg: -1, portions: 2, discount_reason: 'x', shelf_days_left: 0 }] }), /Проверьте/); ok('валидация массы');
const { report_id: rid } = await api.submitReport({ org_id: 5, report_date: today, items: [
  { product_id: 12, quantity_kg: 2.0, portions: 10, discount_reason: 'Срок годности истекает завтра', shelf_days_left: 1 },
  { product_id: 9, quantity_kg: 0.8, portions: 10, discount_reason: 'Срок годности истекает сегодня', shelf_days_left: 0 }] });
assert.equal((await api.getReport(rid)).status, 'submitted'); ok('отчёт отправлен (submitted)');

await api.logout(); await api.login('student_1', 'demo1234');
await rejects(api.reviewReport(rid, 'accepted'), /Нет прав/); ok('покупатель не может принять отчёт');
await api.logout(); await api.login('reviewer_1', 'demo1234');
await rejects(api.reviewReport(rid, 'returned', ' '), /комментарий/); ok('возврат без комментария запрещён');
const res = await api.reviewReport(rid, 'accepted'); assert.deepEqual(res, { listed: 2, skipped: 0 }); ok('отчёт принят, создано 2 лота');
lots = await api.listLots(); const yog = lots.find((l) => l.product === 'Йогурт' && l.organization.includes('Кофейня')); assert.equal(yog.price_discount_kzt, 270); assert.equal(yog.discount_pct, 40); ok('цена лота: 450 → 270 (−40%)');

await api.logout(); await api.login('student_1', 'demo1234');
const b1 = await api.createBooking(yog.item_id, 4); assert.equal(b1.pickup_code.length, 6); ok('бронь 4 порции, код выдачи ' + b1.pickup_code);
await api.logout(); await api.login('student_2', 'demo1234');
await rejects(api.createBooking(yog.item_id, 7), /осталось 6/); ok('перепродажа отклонена (осталось 6)');
await api.createBooking(yog.item_id, 6); assert.ok(!(await api.listLots()).some((l) => l.item_id === yog.item_id)); ok('лот с нулевым остатком исчез с витрины');

await api.logout(); await api.login('resp_1', 'demo1234');
await rejects(api.markBooking(b1.booking_id, 'collected'), /Нет прав/); ok('чужая организация не может выдать заказ');
await api.logout(); await api.login('resp_5', 'demo1234');
const before = A.kpis(await api.facts()); 
await api.markBooking(b1.booking_id, 'collected');
const it = (await api.facts()).find((f) => f.item_id === yog.item_id);
assert.equal(it.sold_portions, 4); assert.equal(it.revenue_kzt, 1080); assert.equal(it.wasted_kg, 1.2); assert.equal(it.co2e_avoided_kg, 2); ok('после выдачи: продано 4, выручка 1080 ₸, списано 1.2 кг, CO₂ 2 кг');
await rejects(api.markBooking(b1.booking_id, 'no_show'), /уже обработана/); ok('повторная отметка запрещена');

await api.logout(); await api.login('student_1', 'demo1234');
await api.addFeedback(b1.booking_id, 5, 'вкус', 'Вкусно');
await rejects(api.addFeedback(b1.booking_id, 4, 'вкус', 'ещё'), /уже оставлен/); ok('отзыв: один на бронь');
const fb = await api.listFeedback(); assert.ok(fb.some((f) => f.booking_id === b1.booking_id && f.is_mine)); ok('покупатель видит свой отзыв');
await api.logout(); await api.login('resp_5', 'demo1234');
const f0 = (await api.listFeedback()).find((f) => f.booking_id === b1.booking_id); await api.replyFeedback(f0.feedback_id, 'Спасибо!'); ok('организация ответила на отзыв');

// лаборатория с просроченным допуском
await api.logout(); await api.login('admin', 'demo1234');
const orgs = await api.listOrgs(); assert.ok(orgs.find((o) => o.org_id === 8).permit_valid_until >= today);
await api.logout(); await api.login('resp_8', 'demo1234');
const lab = await api.submitReport({ org_id: 8, report_date: '2027-12-01', items: [{ product_id: 15, quantity_kg: 1, portions: 10, discount_reason: 'Лабораторная партия после дегустации', shelf_days_left: 2 }] });
await api.logout(); await api.login('reviewer_2', 'demo1234');
assert.deepEqual(await api.reviewReport(lab.report_id, 'accepted'), { listed: 0, skipped: 1 }); ok('лаборатория без действующего допуска: лот не создаётся');

// уведомления «бота»
await api.logout(); await api.login('student_1', 'demo1234');
const msgs = await api.notifications(); assert.ok(msgs.some((m) => m.text.includes('Бронь подтверждена')) && msgs.some((m) => m.text.includes('Новые лоты'))); ok('очередь уведомлений бота заполняется');

// права на факты
assert.deepEqual(await api.facts(), []); ok('покупатель не видит факты дашборда');
await api.logout(); await api.login('resp_1', 'demo1234'); const own = await api.facts(); assert.ok(own.every((f) => f.org_id === 1) && own.length > 0); ok('ответственное лицо видит только свою организацию');

// аналитика на всём датасете
await api.logout(); await api.login('head', 'demo1234'); const facts = await api.facts();
const k = A.kpis(A.filterFacts(facts, { to: '2026-10-31' }));
assert.ok(Math.abs(k.sold - 730) < 1); assert.equal(k.revenue, 1140900); ok(`KPI авг–окт совпадают с презентацией: ${k.sold} кг, ${k.revenue} ₸`);
const months = A.monthly(A.filterFacts(facts, { to: '2026-10-31' })); assert.deepEqual(months.map((m) => Math.floor(m.sold)), [0, 209, 521]); ok('график по месяцам: 0 / 209 / 521 кг');
const recs = A.recommendations(facts); assert.ok(recs.length >= 1 && recs[0].product.includes('Плов') && recs[0].weekday === 4); ok('рекомендация: ' + recs[0].text);
const pp = A.prePost(facts, '2026-09-15'); assert.ok(pp.change > 0); ok(`до/после запуска: ${pp.pre.wastedPerDay} → ${pp.post.wastedPerDay} кг/день (−${pp.change}%)`);
assert.equal(A.byWeekday(facts).length, 5); ok('аналитика по дням недели');
console.log(`\nВсе проверки пройдены: ${n}`);
