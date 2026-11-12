// Агрегации для дашборда и отчётов. Работают по «фактам» (принятые позиции отчётов).
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const r1 = (n) => Math.round(n * 10) / 10;
const PHR = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];

export function filterFacts(rows, { from, to, org_id } = {}) {
  return rows.filter((r) => (!from || r.report_date >= from) && (!to || r.report_date <= to) && (!org_id || Number(r.org_id) === Number(org_id)));
}
export function kpis(rows) {
  const quantity = sum(rows, 'quantity_kg'), sold = sum(rows, 'sold_kg');
  return { items: rows.length, quantity: r1(quantity), sold: r1(sold), wasted: r1(sum(rows, 'wasted_kg')), revenue: Math.round(sum(rows, 'revenue_kzt')),
    co2avoided: r1(sum(rows, 'co2e_avoided_kg')), co2wasted: r1(sum(rows, 'co2e_wasted_kg')), shareSold: quantity ? Math.round((sold / quantity) * 100) : 0 };
}
function groupBy(rows, keyFn) { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }
export function monthly(rows) {
  return [...groupBy(rows, (r) => r.month)].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, g]) => ({ month, quantity: r1(sum(g, 'quantity_kg')), sold: r1(sum(g, 'sold_kg')), wasted: r1(sum(g, 'wasted_kg')), revenue: Math.round(sum(g, 'revenue_kzt')) }));
}
export function byOrg(rows) {
  return [...groupBy(rows, (r) => r.organization)].map(([organization, g]) => ({ organization, quantity: r1(sum(g, 'quantity_kg')), sold: r1(sum(g, 'sold_kg')), wasted: r1(sum(g, 'wasted_kg')), revenue: Math.round(sum(g, 'revenue_kzt')) })).sort((a, b) => b.wasted - a.wasted);
}
export function byReason(rows) {
  return [...groupBy(rows, (r) => r.discount_reason)].map(([reason, g]) => ({ reason, quantity: r1(sum(g, 'quantity_kg')), items: g.length })).sort((a, b) => b.quantity - a.quantity);
}
export function byWeekday(rows) {
  const out = [];
  for (let d = 0; d < 7; d++) { const g = rows.filter((r) => Number(r.weekday) === d); out.push({ weekday: d, avg: g.length ? r1(sum(g, 'quantity_kg') / g.length) : 0, items: g.length }); }
  return out.slice(0, 5);
}
export function recommendations(rows, top = 3) {
  const prodMean = new Map(); for (const [p, g] of groupBy(rows, (r) => r.product)) prodMean.set(p, sum(g, 'wasted_kg') / g.length);
  const res = [];
  for (const [, g] of groupBy(rows, (r) => `${r.org_id}|${r.product}|${r.weekday}`)) {
    if (g.length < 3) continue;
    const mean = sum(g, 'wasted_kg') / g.length, base = prodMean.get(g[0].product);
    if (mean >= 3 && mean >= 1.5 * base) {
      const ratio = r1(mean / base);
      res.push({ ratio, org: g[0].organization, product: g[0].product, weekday: g[0].weekday, mean: r1(mean), n: g.length,
        text: `${g[0].organization}: «${g[0].product}» по ${PHR[g[0].weekday]} в среднем ${r1(mean)} кг уходит в списание (в ${ratio} раза больше обычного). Готовьте меньше или выставляйте лот раньше.` });
    }
  }
  return res.sort((a, b) => b.ratio - a.ratio).slice(0, top);
}
export function prePost(rows, launch) {
  const part = (g) => { const days = new Set(g.map((r) => r.report_date)).size; return { days, wastedPerDay: days ? r1(sum(g, 'wasted_kg') / days) : 0, share: sum(g, 'quantity_kg') ? Math.round((sum(g, 'sold_kg') / sum(g, 'quantity_kg')) * 100) : 0 }; };
  const pre = part(rows.filter((r) => r.report_date < launch)), post = part(rows.filter((r) => r.report_date >= launch));
  const change = pre.wastedPerDay ? Math.round((1 - post.wastedPerDay / pre.wastedPerDay) * 100) : null;
  return { pre, post, change };
}
export function avgRating(fb) { return fb.length ? Math.round((fb.reduce((a, f) => a + f.rating, 0) / fb.length) * 10) / 10 : null; }
