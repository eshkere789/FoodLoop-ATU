import { esc, badge, fmtDate, fmtDT, kzt, num, act, toast, errorHtml } from '../util.js';

export default async function (root, ctx) {
  const draw = async () => {
    const r = await ctx.api.getReport(ctx.params.id);
    const orgs = await ctx.api.listOrgs(); const o = orgs.find((x) => x.org_id === r.org_id);
    const canReview = ['reviewer', 'admin'].includes(ctx.user.role) && ['submitted', 'under_review'].includes(r.status);
    const checks = [];
    for (const it of r.items) {
      const exp = it.portions * it.portion_kg, ratio = exp ? it.quantity_kg / exp : 1;
      checks.push([!!(it.composition && it.composition.trim()), `${it.product}: состав указан`], [!!(it.allergens && it.allergens.trim()), `${it.product}: аллергены указаны`],
        [Number(it.shelf_days_left) >= 0, `${it.product}: срок годности не просрочен (${it.shelf_days_left} дн.)`], [ratio > 0.5 && ratio < 2, `${it.product}: масса соответствует порциям (≈ ${num(exp, 2)} кг ожидается)`]);
    }
    if (o.is_lab) checks.push([!!(o.permit_valid_until && String(o.permit_valid_until).slice(0, 10) >= String(r.report_date).slice(0, 10)), `Допуск лаборатории действует до ${o.permit_valid_until ? fmtDate(o.permit_valid_until) : '—'}`]);
    root.innerHTML = `<p><a href="javascript:history.back()">← Назад</a></p><div class="card"><div class="row"><div><h1>Отчёт №${r.report_id} ${badge(r.status)}</h1>
      <p class="muted">${esc(r.organization)} · ${fmtDate(r.report_date)}${r.submitter ? ' · автор: ' + esc(r.submitter) : ''}${r.submitted_at ? ' · отправлен ' + fmtDT(r.submitted_at) : ''}</p></div>
      ${ctx.user.role !== 'reviewer' && ['draft', 'returned'].includes(r.status) ? `<div class="fix"><a class="btn" href="#/form/${r.report_id}">Исправить</a></div>` : ''}</div>
      ${r.reviewer_comment ? `<div class="warn"><b>Комментарий проверяющего:</b> ${esc(r.reviewer_comment)}</div>` : ''}
      <div class="tbl"><table><thead><tr><th>Продукт</th><th>Масса, кг</th><th>Порции</th><th>Причина</th><th>Срок, дн.</th><th>Состав</th><th>Аллергены</th>${r.status === 'accepted' ? '<th>Лот</th>' : ''}</tr></thead><tbody>
      ${r.items.map((i) => `<tr><td><b>${esc(i.product)}</b></td><td>${num(i.quantity_kg, 2)}</td><td>${i.portions}</td><td>${esc(i.discount_reason)}</td><td>${i.shelf_days_left}</td><td>${esc(i.composition || '—')}</td><td>${esc(i.allergens || '—')}</td>
      ${r.status === 'accepted' ? `<td>${i.is_listed ? `${kzt(i.price_discount_kzt)} (−${i.discount_pct}%)` : '<span class="muted">без лота</span>'}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>
      ${canReview ? `<div class="card"><h2>Автопроверки</h2>${checks.map(([ok, t]) => `<div class="chk"><span class="m ${ok ? 'ok' : 'no'}">${ok ? '✓' : '⚠'}</span><span>${esc(t)}</span></div>`).join('')}
      <label>Комментарий (обязателен при возврате)</label><textarea id="cm" rows="2" placeholder="Например: не указан состав"></textarea>
      <p>${r.status === 'submitted' ? '<button class="btn sec" id="take">Взять на проверку</button> ' : ''}<button class="btn" id="acc">Принять</button> <button class="btn red" id="ret">Вернуть</button></p></div>` : ''}`;
    const take = root.querySelector('#take'); if (take) take.onclick = async () => { await act(() => ctx.api.takeReview(r.report_id), 'Отчёт взят на проверку'); draw(); };
    const acc = root.querySelector('#acc'); if (acc) acc.onclick = async () => {
      const res = await act(() => ctx.api.reviewReport(r.report_id, 'accepted'));
      if (res) { toast(`Принято. Создано лотов: ${res.listed}${res.skipped ? ', без лота: ' + res.skipped : ''}`); ctx.nav('#/review'); }
    };
    const ret = root.querySelector('#ret'); if (ret) ret.onclick = async () => {
      const res = await act(() => ctx.api.reviewReport(r.report_id, 'returned', root.querySelector('#cm').value), 'Отчёт возвращён');
      if (res) ctx.nav('#/review');
    };
  };
  try { await draw(); } catch (e) { root.innerHTML = errorHtml(e); }
}
