import { esc, num, kzt, fmtDate, downloadXlsx, emptyHtml, WEEKDAYS } from '../util.js';
import { filterFacts } from '../analytics.js';

const PAGE = 25;
export default async function (root, ctx) {
  const facts = await ctx.api.facts();
  const uniq = (k) => [...new Set(facts.map((f) => f[k]))].sort();
  const dates = facts.map((f) => f.report_date).sort();
  root.innerHTML = `<h1>Реестр принятых отчётов</h1><p class="muted">Все принятые позиции учёта. Фильтры работают вместе.</p>
    <div class="card"><div class="row"><div><label>С</label><input type="date" id="from" value="${dates[0] || ''}"></div><div><label>По</label><input type="date" id="to" value="${dates[dates.length - 1] || ''}"></div>
    <div><label>Организация</label><select id="org"><option value="">Все</option>${[...new Map(facts.map((f) => [f.org_id, f.organization]))].map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></div>
    <div><label>Вид отходов</label><select id="wt"><option value="">Все</option>${uniq('waste_type').map((v) => `<option>${esc(v)}</option>`).join('')}</select></div>
    <div><label>Причина</label><select id="rs"><option value="">Все</option>${uniq('discount_reason').map((v) => `<option>${esc(v)}</option>`).join('')}</select></div></div>
    <p><button class="btn" id="xls">Выгрузить в Excel</button></p></div><div id="out"></div>`;
  let page = 0, rows = [];
  const $q = (s) => root.querySelector(s);
  const apply = () => {
    rows = filterFacts(facts, { from: $q('#from').value, to: $q('#to').value, org_id: $q('#org').value })
      .filter((f) => (!$q('#wt').value || f.waste_type === $q('#wt').value) && (!$q('#rs').value || f.discount_reason === $q('#rs').value))
      .sort((a, b) => (a.report_date < b.report_date ? 1 : -1));
    page = 0; draw();
  };
  const draw = () => {
    const t = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0), part = rows.slice(page * PAGE, (page + 1) * PAGE), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    $q('#out').innerHTML = rows.length ? `<div class="card tbl"><table><thead><tr><th>Дата</th><th>Орг.</th><th>Продукт</th><th>Вид</th><th>Причина</th><th>Масса, кг</th><th>Продано, кг</th><th>Списано, кг</th><th>Выручка</th></tr></thead><tbody>
      ${part.map((r) => `<tr><td class="nowrap">${fmtDate(r.report_date)} ${WEEKDAYS[r.weekday]}</td><td>${esc(r.organization)}</td><td>${esc(r.product)}</td><td>${esc(r.waste_type)}</td><td>${esc(r.discount_reason)}</td><td>${num(r.quantity_kg, 2)}</td><td>${num(r.sold_kg, 2)}</td><td>${num(r.wasted_kg, 2)}</td><td>${kzt(r.revenue_kzt)}</td></tr>`).join('')}
      <tr><th colspan="5">Итого по выборке (${rows.length} поз.)</th><th>${num(t('quantity_kg'))}</th><th>${num(t('sold_kg'))}</th><th>${num(t('wasted_kg'))}</th><th>${kzt(t('revenue_kzt'))}</th></tr></tbody></table>
      <div class="pager"><button class="btn sec sm" id="pv" ${page === 0 ? 'disabled' : ''}>←</button><span>${page + 1} / ${pages}</span><button class="btn sec sm" id="nx" ${page >= pages - 1 ? 'disabled' : ''}>→</button></div></div>` : emptyHtml('По выбранным фильтрам данных нет.');
    const pv = $q('#pv'), nx = $q('#nx'); if (pv) pv.onclick = () => { page--; draw(); }; if (nx) nx.onclick = () => { page++; draw(); };
  };
  root.querySelectorAll('select,input').forEach((e) => e.addEventListener('change', apply));
  $q('#xls').onclick = () => downloadXlsx({ 'Реестр': rows.map((r) => ({ 'Дата': fmtDate(r.report_date), 'Организация': r.organization, 'Тип организации': r.org_type, 'Продукт': r.product, 'Вид отходов': r.waste_type, 'Причина': r.discount_reason,
    'Масса, кг': r.quantity_kg, 'Порции': r.portions, 'Продано, кг': r.sold_kg, 'Списано, кг': r.wasted_kg, 'Выручка, ₸': r.revenue_kzt, 'CO2-экв. списано, кг': r.co2e_wasted_kg, 'CO2-экв. предотвращено, кг': r.co2e_avoided_kg })) }, 'registry.xlsx');
  apply();
}
