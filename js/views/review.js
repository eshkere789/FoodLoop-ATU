import { esc, badge, fmtDate, fmtDT, emptyHtml } from '../util.js';

export default async function (root, ctx) {
  const rows = await ctx.api.reviewQueue();
  const orgs = [...new Set(rows.map((r) => r.organization))].sort();
  root.innerHTML = `<h1>Проверка отчётов</h1><p class="muted">Очередь отчётов, ожидающих решения.</p>
    <div class="card"><label>Организация</label><select id="org"><option value="">Все</option>${orgs.map((o) => `<option>${esc(o)}</option>`).join('')}</select></div><div id="list"></div>`;
  const draw = () => {
    const sel = root.querySelector('#org').value; const list = rows.filter((r) => !sel || r.organization === sel);
    root.querySelector('#list').innerHTML = list.length ? `<div class="card tbl"><table><thead><tr><th>№</th><th>Дата</th><th>Организация</th><th>Позиций</th><th>Статус</th><th>Отправлен</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr><td>${r.report_id}</td><td>${fmtDate(r.report_date)}</td><td>${esc(r.organization)}</td><td>${r.items_count}</td><td>${badge(r.status)}</td><td>${fmtDT(r.submitted_at)}</td><td><a class="btn sm" href="#/report/${r.report_id}">Проверить</a></td></tr>`).join('')}</tbody></table></div>` : emptyHtml('Очередь пуста: все отчёты обработаны.');
  };
  root.querySelector('#org').onchange = draw; draw();
}
