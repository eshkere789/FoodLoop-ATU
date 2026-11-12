// Демо-бэкенд: вся «БД» живёт в браузере (localStorage) и повторяет бизнес-логику supabase/schema.sql.
// Нужен, чтобы можно было попробовать платформу без регистрации в Supabase.
const KEY = 'foodloop_mock_v1';
const TABLES = ['organizations', 'users', 'products', 'reports', 'report_items', 'bookings', 'feedback'];
const DISCOUNT = { 'Срок годности истекает сегодня': 55, 'Срок годности истекает завтра': 40, 'Остаток после обеда': 45, 'Излишки поставки': 35, 'Нестандартный вид': 30 };
const RECYCLE = { 'хлебобулочные': 70, 'выпечка': 60, 'овощи и фрукты': 90, 'готовые блюда': 40, 'молочные продукты': 30 };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const fail = (m) => { throw new Error(m); };
const r2 = (n) => Math.round(n * 100) / 100;

export function createMock({ loadJson, storage, now = () => new Date(), config }) {
  let db = null, session = null, ready = null;
  const today = () => ymd(now());

  const persist = () => { try { storage.setItem(KEY, JSON.stringify({ db, session })); } catch (e) { console.warn('persist failed', e); } };
  const nextId = (t, k) => db[t].reduce((m, r) => Math.max(m, r[k]), 0) + 1;
  const cur = () => (session ? db.users.find((u) => u.user_id === session) : null);
  const need = (...roles) => { const u = cur(); if (!u || !roles.includes(u.role)) fail('Нет прав для этого действия'); return u; };
  const byId = (t, k, v) => db[t].find((r) => r[k] === v);
  const co2 = () => Number(db.settings.co2_factor);

  function enqueueUser(uid, text) { db.outbox.push({ id: nextId('outbox', 'id'), user_id: uid, text, created_at: stamp(now()) }); }
  function enqueueBroadcast(text) { db.outbox.push({ id: nextId('outbox', 'id'), user_id: null, text, created_at: stamp(now()) }); }

  function recalcItem(itemId) {
    const it = byId('report_items', 'item_id', itemId), p = byId('products', 'product_id', it.product_id);
    const sold = db.bookings.filter((b) => b.item_id === itemId && b.status === 'collected').reduce((a, b) => a + b.portions, 0);
    it.sold_portions = sold; it.sold_kg = r2(sold * p.portion_kg); it.revenue_kzt = sold * (it.price_discount_kzt || 0);
    it.wasted_kg = r2(it.quantity_kg - sold * p.portion_kg);
    it.co2e_avoided_kg = r2(sold * p.portion_kg * co2()); it.co2e_wasted_kg = r2(it.wasted_kg * co2());
  }

  function acceptReport(rid, reviewerId) {
    const r = byId('reports', 'report_id', rid), o = byId('organizations', 'org_id', r.org_id);
    r.status = 'accepted'; r.reviewed_by = reviewerId; r.reviewed_at = stamp(now()); r.reviewer_comment = null;
    let listed = 0, skipped = 0;
    for (const it of db.report_items.filter((i) => i.report_id === rid)) {
      const p = byId('products', 'product_id', it.product_id);
      const can = !!o.can_sell && !!p.is_sellable && p.price_full_kzt > 0 && (!o.is_lab || (o.permit_valid_until && o.permit_valid_until >= r.report_date));
      it.price_full_kzt = p.price_full_kzt;
      if (can) {
        let pct = o.is_lab ? (o.default_discount_pct ?? 55) : (DISCOUNT[it.discount_reason] ?? 30);
        const price = Math.round((p.price_full_kzt * (100 - pct)) / 1000) * 10; // целочисленно, как в SQL
        it.price_discount_kzt = price; it.discount_pct = Math.round((1 - price / p.price_full_kzt) * 100); listed++;
      } else { it.price_discount_kzt = null; it.discount_pct = null; skipped++; }
      it.is_listed = can ? 1 : 0;
      it.sold_portions = 0; it.sold_kg = 0; it.revenue_kzt = 0; it.wasted_kg = it.quantity_kg;
      it.recyclable_pct = !o.can_sell ? 100 : (RECYCLE[p.waste_type] ?? 50);
      it.co2e_wasted_kg = r2(it.quantity_kg * co2()); it.co2e_avoided_kg = 0;
    }
    if (listed > 0) enqueueBroadcast(`Новые лоты со скидкой: ${o.organization} (${listed} поз.). Откройте витрину FoodLoop.`);
    return { listed, skipped };
  }

  function seedToday() {
    const t = today();
    if (db.meta.seeded === t) return;
    const mk = (org, status, user, items) => {
      const rid = nextId('reports', 'report_id');
      db.reports.push({ report_id: rid, org_id: org, report_date: t, status, submitted_by: user, reviewed_by: null, submitted_at: status === 'draft' ? null : stamp(now()), reviewed_at: null, reviewer_comment: null });
      for (const [pid, kg, portions, reason, shelf] of items) {
        db.report_items.push({ item_id: nextId('report_items', 'item_id'), report_id: rid, product_id: pid, quantity_kg: kg, portions, discount_reason: reason, shelf_days_left: shelf,
          is_listed: 0, price_full_kzt: byId('products', 'product_id', pid).price_full_kzt, price_discount_kzt: null, discount_pct: null, sold_portions: null, sold_kg: null, revenue_kzt: null, wasted_kg: null, recyclable_pct: null, co2e_wasted_kg: null, co2e_avoided_kg: null });
      }
      return rid;
    };
    acceptReport(mk(1, 'submitted', 1, [[3, 4.2, 12, 'Остаток после обеда', 0], [1, 3.2, 8, 'Срок годности истекает сегодня', 0]]), 11);
    acceptReport(mk(2, 'submitted', 2, [[8, 1.8, 12, 'Срок годности истекает сегодня', 0], [10, 2.0, 8, 'Остаток после обеда', 1]]), 12);
    acceptReport(mk(4, 'submitted', 4, [[13, 3.0, 15, 'Лабораторная партия после дегустации', 3], [14, 2.5, 10, 'Лабораторная партия после дегустации', 2]]), 11);
    mk(6, 'submitted', 6, [[2, 4.5, 10, 'Остаток после обеда', 0], [6, 2.0, 8, 'Нестандартный вид', 1]]);
    mk(5, 'draft', 5, [[9, 0.8, 10, 'Срок годности истекает сегодня', 0]]);
    db.meta.seeded = t;
  }

  async function init() {
    if (ready) return ready;
    ready = (async () => {
      let saved = null;
      try { saved = JSON.parse(storage.getItem(KEY) || 'null'); } catch { saved = null; }
      if (saved && saved.db && saved.db.meta) { db = saved.db; session = saved.session; }
      else {
        db = { meta: {}, settings: { co2_factor: String(config.CO2_FACTOR), launch_date: config.LAUNCH_DATE }, outbox: [] };
        for (const t of TABLES) db[t] = await loadJson(`data/${t}.json`);
        session = null;
      }
      seedToday(); persist();
    })();
    return ready;
  }
  const W = (fn) => async (...a) => { await init(); const r = fn(...a); persist(); return r === undefined ? undefined : clone(r); };
  const RD = (fn) => async (...a) => { await init(); const r = fn(...a); return r === undefined ? undefined : clone(r); };

  // ---------- представления ----------
  function remaining(itemId) {
    const it = byId('report_items', 'item_id', itemId);
    return it.portions - db.bookings.filter((b) => b.item_id === itemId && (b.status === 'booked' || b.status === 'collected')).reduce((a, b) => a + b.portions, 0);
  }
  function lotRow(it) {
    const r = byId('reports', 'report_id', it.report_id), o = byId('organizations', 'org_id', r.org_id), p = byId('products', 'product_id', it.product_id);
    return { item_id: it.item_id, org_id: r.org_id, organization: o.organization, building: o.building, pickup_from: o.pickup_from, pickup_to: o.pickup_to, is_lab: !!o.is_lab,
      product: p.product, composition: p.composition, allergens: p.allergens, portion_kg: p.portion_kg, price_full_kzt: it.price_full_kzt, price_discount_kzt: it.price_discount_kzt,
      discount_pct: it.discount_pct, shelf_days_left: it.shelf_days_left, discount_reason: it.discount_reason, portions: it.portions, remaining: remaining(it.item_id), report_date: r.report_date };
  }
  const isLot = (it) => { const r = byId('reports', 'report_id', it.report_id); return r && r.status === 'accepted' && it.is_listed && r.report_date >= today(); };
  function bookingRow(b) {
    const it = byId('report_items', 'item_id', b.item_id), r = byId('reports', 'report_id', it.report_id), o = byId('organizations', 'org_id', r.org_id), p = byId('products', 'product_id', it.product_id), u = byId('users', 'user_id', b.user_id);
    return { ...b, buyer: u.full_name, product: p.product, organization: o.organization, building: o.building, pickup_from: o.pickup_from, pickup_to: o.pickup_to, org_id: r.org_id,
      price_discount_kzt: it.price_discount_kzt, has_feedback: db.feedback.some((f) => f.booking_id === b.booking_id) ? 1 : 0 };
  }
  function visibleBookings() {
    const u = cur(); if (!u) return [];
    return db.bookings.map(bookingRow).filter((b) => u.role === 'buyer' ? b.user_id === u.user_id : u.role === 'responsible' ? b.org_id === u.org_id : true);
  }
  function factRows() {
    const u = cur(); if (!u || !['reviewer', 'admin', 'management', 'responsible'].includes(u.role)) return [];
    const rows = [];
    for (const it of db.report_items) {
      const r = byId('reports', 'report_id', it.report_id); if (r.status !== 'accepted') continue;
      if (u.role === 'responsible' && r.org_id !== u.org_id) continue;
      const o = byId('organizations', 'org_id', r.org_id), p = byId('products', 'product_id', it.product_id);
      const wd = (new Date(r.report_date + 'T00:00:00Z').getUTCDay() + 6) % 7;
      rows.push({ item_id: it.item_id, report_id: r.report_id, report_date: r.report_date, month: r.report_date.slice(0, 7), weekday: wd, org_id: r.org_id, organization: o.organization, org_type: o.org_type,
        is_lab: !!o.is_lab, product: p.product, waste_type: p.waste_type, discount_reason: it.discount_reason, shelf_days_left: it.shelf_days_left, quantity_kg: it.quantity_kg, portions: it.portions,
        is_listed: !!it.is_listed, price_discount_kzt: it.price_discount_kzt, sold_portions: it.sold_portions, sold_kg: it.sold_kg, revenue_kzt: it.revenue_kzt, wasted_kg: it.wasted_kg,
        recyclable_pct: it.recyclable_pct, co2e_wasted_kg: it.co2e_wasted_kg, co2e_avoided_kg: it.co2e_avoided_kg, status: r.status });
    }
    return rows;
  }
  function reportRow(r) {
    const o = byId('organizations', 'org_id', r.org_id), su = byId('users', 'user_id', r.submitted_by), ru = r.reviewed_by ? byId('users', 'user_id', r.reviewed_by) : null;
    return { ...r, organization: o.organization, submitter: su ? su.full_name : null, reviewer: ru ? ru.full_name : null, items_count: db.report_items.filter((i) => i.report_id === r.report_id).length };
  }
  function ownReport(r) { const u = cur(); return u && (['reviewer', 'admin', 'management'].includes(u.role) || (u.role === 'responsible' && u.org_id === r.org_id)); }

  // ---------- API ----------
  const api = {
    mode: 'mock',
    init,
    async login(login, password) {
      await init();
      if (password !== config.DEMO_PASSWORD) fail('Неверный логин или пароль');
      const u = db.users.find((x) => x.login === String(login).trim()); if (!u) fail('Неверный логин или пароль');
      session = u.user_id; persist(); return api._profile(u);
    },
    _profile(u) { const o = u.org_id ? byId('organizations', 'org_id', u.org_id) : null; return clone({ ...u, organization: o ? o.organization : null, qr_slug: o ? o.qr_slug : null }); },
    async logout() { await init(); session = null; persist(); },
    async me() { await init(); const u = cur(); return u ? api._profile(u) : null; },
    async resetDemo() { storage.removeItem(KEY); db = null; session = null; ready = null; await init(); },
    listOrgs: RD(() => db.organizations),
    listProducts: RD(() => db.products),
    getSettings: RD(() => db.settings),

    listLots: RD(() => db.report_items.filter(isLot).map(lotRow).filter((l) => l.remaining > 0)),
    getLot: RD((id) => { const it = byId('report_items', 'item_id', Number(id)); if (!it || !isLot(it)) fail('Лот не найден или уже недоступен'); return lotRow(it); }),

    createBooking: W((itemId, portions) => {
      const u = need('buyer', 'admin'); portions = Number(portions);
      if (!Number.isInteger(portions) || portions < 1) fail('Укажите количество порций');
      const it = byId('report_items', 'item_id', Number(itemId)); if (!it || !isLot(it)) fail('Лот недоступен для брони');
      const rem = remaining(it.item_id); if (portions > rem) fail(`Недостаточно порций: осталось ${rem}`);
      const r = byId('reports', 'report_id', it.report_id), p = byId('products', 'product_id', it.product_id);
      const b = { booking_id: nextId('bookings', 'booking_id'), item_id: it.item_id, user_id: u.user_id, portions, status: 'booked', booked_at: stamp(now()), pickup_date: r.report_date, pickup_code: String(Math.floor(100000 + Math.random() * 900000)) };
      db.bookings.push(b); enqueueUser(u.user_id, `Бронь подтверждена: ${p.product} x${portions}. Код выдачи ${b.pickup_code}`); return b;
    }),
    myBookings: RD(() => visibleBookings().filter((b) => b.user_id === cur().user_id).sort((a, b) => (a.booked_at < b.booked_at ? 1 : -1))),
    orgBookings: RD(() => { need('responsible', 'admin'); return visibleBookings().sort((a, b) => (a.booked_at < b.booked_at ? 1 : -1)); }),
    cancelBooking: W((id) => { const u = cur(); const b = byId('bookings', 'booking_id', Number(id)); if (!b || b.user_id !== (u && u.user_id) || b.status !== 'booked') fail('Бронь не найдена или уже обработана'); b.status = 'cancelled'; }),
    markBooking: W((id, status) => {
      if (!['collected', 'no_show'].includes(status)) fail('Недопустимый статус');
      const u = need('responsible', 'admin'); const b = byId('bookings', 'booking_id', Number(id)); if (!b) fail('Бронь не найдена');
      const it = byId('report_items', 'item_id', b.item_id), r = byId('reports', 'report_id', it.report_id);
      if (u.role === 'responsible' && u.org_id !== r.org_id) fail('Нет прав');
      if (b.status !== 'booked') fail('Бронь уже обработана');
      b.status = status; recalcItem(it.item_id);
    }),

    myReports: RD(() => { const u = need('responsible', 'admin'); return db.reports.filter((r) => u.role === 'admin' || r.org_id === u.org_id).map(reportRow).sort((a, b) => (a.report_date < b.report_date ? 1 : a.report_id < b.report_id ? 1 : -1)); }),
    getReport: RD((id) => {
      const r = byId('reports', 'report_id', Number(id)); if (!r || !ownReport(r)) fail('Отчёт не найден');
      const items = db.report_items.filter((i) => i.report_id === r.report_id).map((i) => { const p = byId('products', 'product_id', i.product_id); return { ...i, product: p.product, composition: p.composition, allergens: p.allergens, waste_type: p.waste_type, portion_kg: p.portion_kg }; });
      return { ...reportRow(r), items };
    }),
    submitReport: W((payload) => {
      const u = need('responsible', 'admin'); const orgId = Number(payload.org_id);
      if (u.role === 'responsible' && orgId !== u.org_id) fail('Можно подавать отчёты только своей организации');
      if (!payload.items || !payload.items.length) fail('Добавьте хотя бы одну позицию');
      for (const x of payload.items) {
        if (!byId('products', 'product_id', Number(x.product_id))) fail('Выберите продукт в каждой позиции');
        if (!(Number(x.quantity_kg) > 0) || !(Number(x.portions) > 0) || !(Number(x.shelf_days_left) >= 0) || !x.discount_reason) fail('Проверьте массу, порции, срок и причину в каждой позиции');
      }
      const draft = !!payload.draft; let r;
      if (payload.report_id) {
        r = byId('reports', 'report_id', Number(payload.report_id)); if (!r || r.org_id !== orgId) fail('Отчёт не найден');
        if (!['draft', 'returned'].includes(r.status)) fail('Отчёт уже на проверке или принят');
        db.report_items = db.report_items.filter((i) => i.report_id !== r.report_id);
        Object.assign(r, { report_date: payload.report_date, status: draft ? 'draft' : 'submitted', submitted_by: u.user_id, submitted_at: draft ? null : stamp(now()), reviewed_by: null, reviewed_at: null, reviewer_comment: null });
      } else {
        r = { report_id: nextId('reports', 'report_id'), org_id: orgId, report_date: payload.report_date, status: draft ? 'draft' : 'submitted', submitted_by: u.user_id, reviewed_by: null, submitted_at: draft ? null : stamp(now()), reviewed_at: null, reviewer_comment: null };
        db.reports.push(r);
      }
      for (const x of payload.items) {
        const p = byId('products', 'product_id', Number(x.product_id));
        db.report_items.push({ item_id: nextId('report_items', 'item_id'), report_id: r.report_id, product_id: p.product_id, quantity_kg: Number(x.quantity_kg), portions: Number(x.portions), discount_reason: x.discount_reason,
          shelf_days_left: Number(x.shelf_days_left), is_listed: 0, price_full_kzt: p.price_full_kzt, price_discount_kzt: null, discount_pct: null, sold_portions: null, sold_kg: null, revenue_kzt: null, wasted_kg: null, recyclable_pct: null, co2e_wasted_kg: null, co2e_avoided_kg: null });
      }
      return { report_id: r.report_id };
    }),
    reviewQueue: RD(() => { need('reviewer', 'admin'); return db.reports.filter((r) => ['submitted', 'under_review'].includes(r.status)).map(reportRow).sort((a, b) => (a.report_date < b.report_date ? 1 : -1)); }),
    takeReview: W((id) => { need('reviewer', 'admin'); const r = byId('reports', 'report_id', Number(id)); if (r && r.status === 'submitted') r.status = 'under_review'; }),
    reviewReport: W((id, decision, comment) => {
      const u = need('reviewer', 'admin'); const r = byId('reports', 'report_id', Number(id)); if (!r) fail('Отчёт не найден');
      if (!['submitted', 'under_review'].includes(r.status)) fail('Отчёт уже обработан');
      if (decision === 'accepted') return acceptReport(r.report_id, u.user_id);
      if (decision === 'returned') {
        if (!String(comment || '').trim()) fail('Укажите комментарий при возврате');
        r.status = 'returned'; r.reviewed_by = u.user_id; r.reviewed_at = stamp(now()); r.reviewer_comment = comment;
        enqueueUser(r.submitted_by, `Отчёт №${r.report_id} возвращён: ${comment}`); return { returned: true };
      }
      fail('Неизвестное решение');
    }),

    facts: RD(() => factRows()),
    listFeedback: RD(() => {
      const u = cur(); if (!u) return [];
      return db.feedback.filter((f) => u.role === 'buyer' ? f.user_id === u.user_id : u.role === 'responsible' ? f.org_id === u.org_id : true).map((f) => {
        const it = byId('report_items', 'item_id', f.item_id), p = byId('products', 'product_id', it.product_id), o = byId('organizations', 'org_id', f.org_id);
        return { feedback_id: f.feedback_id, booking_id: f.booking_id, org_id: f.org_id, organization: o.organization, product: p.product, rating: f.rating, category: f.category, comment: f.comment, created_at: f.created_at, reply: f.reply, is_mine: f.user_id === u.user_id };
      }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }),
    addFeedback: W((bookingId, rating, category, comment) => {
      const u = cur(); const b = byId('bookings', 'booking_id', Number(bookingId)); if (!u || !b || b.user_id !== u.user_id) fail('Бронь не найдена');
      if (b.status !== 'collected') fail('Отзыв можно оставить после получения заказа');
      if (db.feedback.some((f) => f.booking_id === b.booking_id)) fail('Отзыв уже оставлен');
      rating = Number(rating); if (!(rating >= 1 && rating <= 5)) fail('Поставьте оценку от 1 до 5');
      const it = byId('report_items', 'item_id', b.item_id), r = byId('reports', 'report_id', it.report_id);
      db.feedback.push({ feedback_id: nextId('feedback', 'feedback_id'), booking_id: b.booking_id, user_id: u.user_id, org_id: r.org_id, item_id: b.item_id, rating, category, comment, created_at: stamp(now()), reply: null, replied_by: null });
    }),
    replyFeedback: W((id, reply) => {
      const u = need('responsible', 'admin'); const f = byId('feedback', 'feedback_id', Number(id)); if (!f) fail('Отзыв не найден');
      if (u.role === 'responsible' && u.org_id !== f.org_id) fail('Нет прав'); f.reply = reply; f.replied_by = u.user_id;
    }),
    // «бот» в демо-режиме: сообщения, которые Telegram-бот отправил бы пользователю
    notifications: RD(() => { const u = cur(); if (!u) return []; return db.outbox.filter((m) => m.user_id === null || m.user_id === u.user_id).sort((a, b) => b.id - a.id).slice(0, 50); }),
    createTgCode: W(() => { need('buyer', 'responsible', 'reviewer', 'admin', 'management'); return String(Math.floor(100000 + Math.random() * 900000)); }),
  };
  return api;
}

export function browserMock(config) {
  return createMock({ loadJson: (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('Не удалось загрузить ' + u); return r.json(); }), storage: window.localStorage, config });
}
