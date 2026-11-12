// Бэкенд на Supabase: чтение через таблицы/представления (RLS), запись только через RPC-функции.
const fail = (m) => { throw new Error(m); };

export function createSupabase(config) {
  if (!config.__client && !window.supabase) fail('Библиотека supabase-js не загружена');
  if (!config.__client && (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY)) fail('Заполните SUPABASE_URL и SUPABASE_ANON_KEY в js/config.js');
  const sb = config.__client || window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  let profile = null, orgCache = null;

  const ok = ({ data, error }) => { if (error) fail(error.message || 'Ошибка запроса'); return data; };
  const rpc = async (name, args) => ok(await sb.rpc(name, args));
  async function all(view, build) { // постраничное чтение (лимит PostgREST 1000 строк)
    const out = []; for (let from = 0; ; from += 1000) {
      const rows = ok(await build(sb.from(view).select('*')).range(from, from + 999)); out.push(...rows); if (rows.length < 1000) break;
    } return out;
  }
  const orgs = async () => (orgCache ||= ok(await sb.from('organizations').select('*').order('org_id')));
  const orgName = async (id) => (await orgs()).find((o) => o.org_id === id)?.organization;

  const api = {
    mode: 'supabase',
    async init() {},
    async login(login, password) {
      profile = null;
      const { error } = await sb.auth.signInWithPassword({ email: `${String(login).trim()}@${config.EMAIL_DOMAIN}`, password });
      if (error) fail('Неверный логин или пароль');
      return api.me();
    },
    async logout() { profile = null; await sb.auth.signOut(); },
    async me() {
      const { data: s } = await sb.auth.getSession(); if (!s.session) { profile = null; return null; }
      if (profile) return profile;
      const u = ok(await sb.from('users').select('*').eq('auth_id', s.session.user.id).maybeSingle()); if (!u) return null;
      const o = u.org_id ? (await orgs()).find((x) => x.org_id === u.org_id) : null;
      profile = { ...u, organization: o?.organization ?? null, qr_slug: o?.qr_slug ?? null }; return profile;
    },
    async resetDemo() { fail('Сброс доступен только в демо-режиме. В Supabase перезалейте данные из CSV.'); },
    listOrgs: orgs,
    async listProducts() { return ok(await sb.from('products').select('*').order('product_id')); },
    async getSettings() { const rows = ok(await sb.from('settings').select('*')); return Object.fromEntries(rows.map((r) => [r.key, r.value])); },

    async listLots() { return ok(await sb.from('v_lots').select('*').gt('remaining', 0).order('discount_pct', { ascending: false })); },
    async getLot(id) { const r = ok(await sb.from('v_lots').select('*').eq('item_id', Number(id)).maybeSingle()); if (!r) fail('Лот не найден или уже недоступен'); return r; },
    createBooking: (item, portions) => rpc('create_booking', { p_item: Number(item), p_portions: Number(portions) }),
    async myBookings() { const u = await api.me(); return ok(await sb.from('v_bookings').select('*').eq('user_id', u.user_id).order('booked_at', { ascending: false })); },
    async orgBookings() { return all('v_bookings', (q) => q.order('booked_at', { ascending: false })); },
    cancelBooking: (id) => rpc('cancel_booking', { p_booking: Number(id) }),
    markBooking: (id, status) => rpc('mark_booking', { p_booking: Number(id), p_status: status }),

    async myReports() {
      const rows = ok(await sb.from('reports').select('*, report_items(count)').order('report_date', { ascending: false }).order('report_id', { ascending: false }));
      const names = new Map((await orgs()).map((o) => [o.org_id, o.organization]));
      return rows.map((r) => ({ ...r, organization: names.get(r.org_id), items_count: r.report_items?.[0]?.count ?? 0 }));
    },
    async getReport(id) {
      const r = ok(await sb.from('reports').select('*').eq('report_id', Number(id)).maybeSingle()); if (!r) fail('Отчёт не найден');
      const items = ok(await sb.from('report_items').select('*, products(product, composition, allergens, waste_type, portion_kg)').eq('report_id', r.report_id).order('item_id'));
      return { ...r, organization: await orgName(r.org_id), items: items.map(({ products, ...i }) => ({ ...i, ...products })) };
    },
    async submitReport(payload) { return { report_id: await rpc('submit_report', { p_report: payload }) }; },
    async reviewQueue() {
      const rows = ok(await sb.from('reports').select('*, report_items(count)').in('status', ['submitted', 'under_review']).order('report_date', { ascending: false }));
      const names = new Map((await orgs()).map((o) => [o.org_id, o.organization]));
      return rows.map((r) => ({ ...r, organization: names.get(r.org_id), items_count: r.report_items?.[0]?.count ?? 0 }));
    },
    takeReview: (id) => rpc('take_review', { p_report: Number(id) }),
    reviewReport: (id, decision, comment) => rpc('review_report', { p_report: Number(id), p_decision: decision, p_comment: comment ?? null }),

    facts: () => all('v_facts', (q) => q.order('item_id')),
    async listFeedback() { return ok(await sb.from('v_feedback').select('*').order('created_at', { ascending: false })); },
    addFeedback: (b, rating, category, comment) => rpc('add_feedback', { p_booking: Number(b), p_rating: Number(rating), p_category: category, p_comment: comment }),
    replyFeedback: (id, reply) => rpc('reply_feedback', { p_feedback: Number(id), p_reply: reply }),
    async notifications() { return []; },
    createTgCode: () => rpc('create_tg_code', {}),
  };
  return api;
}
