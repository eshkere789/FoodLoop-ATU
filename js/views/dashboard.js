import { esc, num, kzt, fmtDate, downloadXlsx, WEEKDAYS, emptyHtml } from '../util.js';
import * as A from '../analytics.js';

export default async function (root, ctx) {
  const facts = await ctx.api.facts();
  const settings = await ctx.api.getSettings();
  const launch = settings.launch_date || ctx.config.LAUNCH_DATE;
  let feedback = []; try { feedback = await ctx.api.listFeedback(); } catch { /* optional */ }
  if (!facts.length) { root.innerHTML = '<h1>Дашборд</h1>' + emptyHtml('Нет принятых отчётов для расчёта.'); return; }
  const dates = facts.map((f) => f.report_date).sort();
  const orgs = [...new Map(facts.map((f) => [f.org_id, f.organization]))];
  root.innerHTML = `<div class="row"><div><h1>Дашборд <span class="demo">Демо-данные</span></h1><p class="muted">Считаются только принятые отчёты. Остаток, не выданный покупателям, учитывается как списание.</p></div>
    <div class="fix noprint"><button class="btn sec" id="print">Печать / PDF</button> <button class="btn" id="xls">Скачать Excel</button></div></div>
    <div class="card noprint"><div class="row"><div><label>С</label><input type="date" id="from" value="${dates[0]}"></div><div><label>По</label><input type="date" id="to" value="${dates[dates.length - 1]}"></div>
    ${orgs.length > 1 ? `<div><label>Организация</label><select id="org"><option value="">Все</option>${orgs.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></div>` : ''}</div></div>
    <div id="kpi" class="grid4"></div>
    <div class="grid2" style="margin-top:16px"><div class="card"><h3>Остатки по месяцам, кг</h3><div class="chart"><canvas id="c1"></canvas></div></div><div class="card"><h3>Списание по организациям, кг</h3><div class="chart"><canvas id="c2"></canvas></div></div>
    <div class="card"><h3>Причины остатков, кг</h3><div class="chart"><canvas id="c3"></canvas></div></div><div class="card"><h3>Средний остаток на позицию по дням недели, кг</h3><div class="chart"><canvas id="c4"></canvas></div></div></div>
    <div class="grid2"><div class="card"><h3>Рекомендации</h3><div id="recs"></div></div><div class="card"><h3>До и после запуска витрины (${fmtDate(launch)})</h3><div id="pp"></div></div></div>`;
  const charts = []; ctx.onLeave(() => charts.forEach((c) => c.destroy()));
  const $q = (s) => root.querySelector(s);
  const TEAL = '#0E7C76', AMBER = '#F59E0B', LTEAL = '#5EC4BB', NAVY = '#14202E';
  let rows = [];
  const ch = (id, cfg) => { const c = new window.Chart($q(id), cfg); charts.push(c); };
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

  const draw = () => {
    charts.splice(0).forEach((c) => c.destroy());
    rows = A.filterFacts(facts, { from: $q('#from').value, to: $q('#to').value, org_id: $q('#org') ? $q('#org').value : '' });
    const k = A.kpis(rows), m = A.monthly(rows), bo = A.byOrg(rows), br = A.byReason(rows), bw = A.byWeekday(rows);
    const avg = A.avgRating(feedback);
    $q('#kpi').innerHTML = [[num(k.sold) + ' кг', 'продано вместо списания'], [num(k.wasted) + ' кг', 'списано'], [kzt(k.revenue), 'выручка со скидочных лотов'], [num(k.co2avoided / 1000, 2) + ' т', `CO₂-экв. предотвращено (коэф. ${ctx.config.CO2_FACTOR})`],
      [k.shareSold + '%', 'доля проданного от остатков'], [num(k.quantity) + ' кг', 'всего учтено остатков'], [String(k.items), 'позиций в отчётах'], [avg ? avg + ' ★' : '—', 'средняя оценка покупателей']]
      .map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    ch('#c1', { type: 'bar', data: { labels: m.map((x) => x.month), datasets: [{ label: 'Списано', data: m.map((x) => x.wasted), backgroundColor: AMBER, stack: 's' }, { label: 'Продано', data: m.map((x) => x.sold), backgroundColor: LTEAL, stack: 's' }] }, options: { ...base, scales: { x: { stacked: true }, y: { stacked: true } } } });
    ch('#c2', { type: 'bar', data: { labels: bo.map((x) => x.organization), datasets: [{ label: 'Списано, кг', data: bo.map((x) => x.wasted), backgroundColor: AMBER }, { label: 'Продано, кг', data: bo.map((x) => x.sold), backgroundColor: TEAL }] }, options: { ...base, indexAxis: 'y' } });
    ch('#c3', { type: 'doughnut', data: { labels: br.map((x) => x.reason), datasets: [{ data: br.map((x) => x.quantity), backgroundColor: [TEAL, AMBER, '#2F7FC1', '#DC2626', '#9FB0C3', '#16A34A'] }] }, options: base });
    ch('#c4', { type: 'bar', data: { labels: bw.map((x) => WEEKDAYS[x.weekday]), datasets: [{ label: 'кг на позицию', data: bw.map((x) => x.avg), backgroundColor: NAVY }] }, options: { ...base, plugins: { legend: { display: false } } } });
    const recs = A.recommendations(rows);
    $q('#recs').innerHTML = recs.length ? recs.map((r) => `<div class="warn">${esc(r.text)}</div>`).join('') : '<p class="muted">При выбранных фильтрах устойчивых «проблемных» позиций не найдено.</p>';
    const pp = A.prePost(rows, launch);
    $q('#pp').innerHTML = pp.pre.days && pp.post.days ? `<div class="grid2"><div><div class="muted small">До запуска</div><div class="kpi"><div class="v">${pp.pre.wastedPerDay} кг/день</div><div class="l">списание в день, продано ${pp.pre.share}%</div></div></div>
      <div><div class="muted small">После запуска</div><div class="kpi"><div class="v">${pp.post.wastedPerDay} кг/день</div><div class="l">списание в день, продано ${pp.post.share}%</div></div></div></div>
      <p>${pp.change > 0 ? `Списание в день снизилось на <b>${pp.change}%</b>.` : 'Заметного снижения нет.'} <span class="small muted">Модельные данные: эффект частично заложен в демо-наборе.</span></p>` : '<p class="muted">Выберите период, который включает дни до и после запуска.</p>';
  };
  root.querySelectorAll('input,select').forEach((e) => e.addEventListener('change', draw));
  $q('#print').onclick = () => window.print();
  $q('#xls').onclick = () => {
    const k = A.kpis(rows), r = (x) => x;
    downloadXlsx({
      'Сводка': [{ 'Период': `${$q('#from').value} — ${$q('#to').value}`, 'Продано, кг': k.sold, 'Списано, кг': k.wasted, 'Всего остатков, кг': k.quantity, 'Выручка, ₸': k.revenue, 'CO2-экв. предотвращено, кг': k.co2avoided, 'Доля проданного, %': k.shareSold, 'Примечание': 'Демо-данные' }],
      'По организациям': A.byOrg(rows).map((x) => ({ 'Организация': x.organization, 'Остатки, кг': x.quantity, 'Продано, кг': x.sold, 'Списано, кг': x.wasted, 'Выручка, ₸': x.revenue })),
      'По месяцам': A.monthly(rows).map((x) => ({ 'Месяц': x.month, 'Остатки, кг': x.quantity, 'Продано, кг': x.sold, 'Списано, кг': x.wasted, 'Выручка, ₸': x.revenue })),
      'Реестр': rows.map((x) => r({ 'Дата': fmtDate(x.report_date), 'Организация': x.organization, 'Продукт': x.product, 'Вид отходов': x.waste_type, 'Причина': x.discount_reason, 'Масса, кг': x.quantity_kg, 'Продано, кг': x.sold_kg, 'Списано, кг': x.wasted_kg, 'Выручка, ₸': x.revenue_kzt })),
    }, 'dashboard_report.xlsx');
  };
  draw();
}
