import { esc, badge, fmtDate, fmtDT, emptyHtml } from '../util.js';

export default async function (root, ctx) {
  const rows = await ctx.api.myReports();
  root.innerHTML = `<div class="row"><div><h1>Мои отчёты</h1></div><div class="fix"><a class="btn" href="#/form">+ Новый отчёт</a></div></div>
    ${rows.length ? `<div class="card tbl"><table><thead><tr><th>№</th><th>Дата</th><th>Организация</th><th>Позиций</th><th>Статус</th><th>Комментарий проверяющего</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.report_id}</td><td>${fmtDate(r.report_date)}</td><td>${esc(r.organization)}</td><td>${r.items_count}</td><td>${badge(r.status)}</td>
      <td>${esc(r.reviewer_comment || '')}<div class="small muted">${r.submitted_at ? 'Отправлен ' + fmtDT(r.submitted_at) : ''}</div></td>
      <td class="nowrap"><a href="#/report/${r.report_id}">Открыть</a>${['draft', 'returned'].includes(r.status) ? ` · <a href="#/form/${r.report_id}">Исправить</a>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : emptyHtml('Отчётов пока нет.')}`;
}
